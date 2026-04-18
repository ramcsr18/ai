const {
  buildImportedTask,
  ensureArray,
  getByPath,
  mapExternalPriority,
  mapExternalStatus,
  normalizeBoolean,
  normalizeDateString,
  normalizePerson,
  normalizeStringList,
  persistTasks,
  pickFirstValue,
} = require('./import-remote-utils');

const DEFAULT_JIRA_FIELDS = [
  'summary',
  'status',
  'assignee',
  'priority',
  'comment',
  'components',
  'fixVersions',
  'labels',
  'duedate',
  'resolutiondate',
  'created',
  'updated',
  'project',
  'timeoriginalestimate',
  'timespent',
];

function parseArguments(argv) {
  const args = argv.slice(2);
  let shouldReplace = false;
  let jql = process.env.JIRA_JQL || '';
  let maxResults = Number(process.env.JIRA_MAX_RESULTS || 100);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--replace') {
      shouldReplace = true;
      continue;
    }

    if (arg === '--jql') {
      jql = args[index + 1] || '';
      index += 1;
      continue;
    }

    if (arg === '--max-results') {
      maxResults = Number(args[index + 1] || maxResults);
      index += 1;
    }
  }

  if (!jql) {
    throw new Error('Provide Jira JQL with --jql or set JIRA_JQL.');
  }

  return {
    shouldReplace,
    jql,
    maxResults: Number.isFinite(maxResults) && maxResults > 0 ? maxResults : 100,
  };
}

function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }

  return value;
}

function buildJiraHeaders() {
  const headers = {
    Accept: 'application/json',
  };

  if (process.env.JIRA_BEARER_TOKEN) {
    headers.Authorization = `Bearer ${process.env.JIRA_BEARER_TOKEN}`;
    return headers;
  }

  const username = process.env.JIRA_EMAIL || process.env.JIRA_USERNAME;
  const apiToken = process.env.JIRA_API_TOKEN;

  if (!username || !apiToken) {
    throw new Error(
      'Set JIRA_BEARER_TOKEN or both JIRA_EMAIL/JIRA_USERNAME and JIRA_API_TOKEN.'
    );
  }

  headers.Authorization = `Basic ${Buffer.from(`${username}:${apiToken}`).toString('base64')}`;
  return headers;
}

function buildFieldList() {
  const customFields = [
    process.env.JIRA_STAGE_FIELD,
    process.env.JIRA_AREA_FIELD,
    process.env.JIRA_RELEASE_FIELD,
    process.env.JIRA_START_FIELD,
    process.env.JIRA_END_FIELD,
    process.env.JIRA_EFFORT_FIELD,
    process.env.JIRA_BLOCKED_FIELD,
    process.env.JIRA_MILESTONE_FIELD,
    process.env.JIRA_ASSIGNEE_FIELD,
    process.env.JIRA_PRIORITY_FIELD,
  ]
    .filter(Boolean)
    .map((path) => String(path).replace(/^fields\./, ''));

  return [...new Set([...DEFAULT_JIRA_FIELDS, ...customFields])];
}

async function requestJson(url, headers) {
  const response = await fetch(url, { headers });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.errorMessages?.join(', ') || payload.message || `Request failed: ${response.status}`);
  }

  return payload;
}

async function fetchAllJiraIssues(baseUrl, headers, jql, maxResults, fields) {
  const issues = [];
  let startAt = 0;
  let total = 0;

  do {
    const url = new URL('/rest/api/3/search', baseUrl);
    url.searchParams.set('jql', jql);
    url.searchParams.set('startAt', String(startAt));
    url.searchParams.set('maxResults', String(maxResults));
    url.searchParams.set('fields', fields.join(','));

    const payload = await requestJson(url, headers);

    issues.push(...(payload.issues || []));
    total = Number(payload.total || issues.length);
    startAt += Number(payload.maxResults || maxResults);
  } while (issues.length < total);

  return issues;
}

function extractAtlassianText(node) {
  if (!node) {
    return '';
  }

  if (typeof node === 'string') {
    return node;
  }

  if (Array.isArray(node)) {
    return node
      .map((entry) => extractAtlassianText(entry))
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  if (node.type === 'text') {
    return node.text || '';
  }

  const childText = ensureArray(node.content)
    .map((entry) => extractAtlassianText(entry))
    .filter(Boolean)
    .join(node.type === 'paragraph' ? '' : '\n')
    .trim();

  if (node.type === 'hardBreak') {
    return '\n';
  }

  if (node.type === 'paragraph') {
    return childText;
  }

  if (node.type === 'bulletList' || node.type === 'orderedList') {
    return ensureArray(node.content)
      .map((entry) => extractAtlassianText(entry))
      .filter(Boolean)
      .join('\n');
  }

  if (node.type === 'listItem') {
    return childText;
  }

  return childText;
}

async function fetchIssueComments(baseUrl, headers, issueKey, initialCommentField) {
  const initialComments = ensureArray(initialCommentField?.comments);
  const total = Number(initialCommentField?.total || initialComments.length);

  if (initialComments.length >= total) {
    return initialComments;
  }

  const comments = [...initialComments];
  let startAt = comments.length;

  while (comments.length < total) {
    const url = new URL(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, baseUrl);
    url.searchParams.set('startAt', String(startAt));
    url.searchParams.set('maxResults', '100');

    const payload = await requestJson(url, headers);
    comments.push(...ensureArray(payload.comments));
    startAt += Number(payload.maxResults || 100);
  }

  return comments;
}

function isIssueBlocked(issue) {
  const issueLinks = ensureArray(issue?.fields?.issuelinks);

  return issueLinks.some((link) => {
    const inward = String(link?.type?.inward || '').toLowerCase();
    const outward = String(link?.type?.outward || '').toLowerCase();

    return inward.includes('block') || outward.includes('block');
  });
}

function getCustomField(issue, envName) {
  const configuredPath = process.env[envName];

  if (!configuredPath) {
    return undefined;
  }

  return getByPath(issue, configuredPath);
}

async function jiraIssueToTask(issue, index, importedAt, baseUrl, headers) {
  const issueKey = issue.key;
  const fields = issue.fields || {};
  const comments = await fetchIssueComments(baseUrl, headers, issueKey, fields.comment);
  const customStage = getCustomField(issue, 'JIRA_STAGE_FIELD');
  const customArea = getCustomField(issue, 'JIRA_AREA_FIELD');
  const customRelease = getCustomField(issue, 'JIRA_RELEASE_FIELD');
  const customStart = getCustomField(issue, 'JIRA_START_FIELD');
  const customEnd = getCustomField(issue, 'JIRA_END_FIELD');
  const customEffort = getCustomField(issue, 'JIRA_EFFORT_FIELD');
  const customBlocked = getCustomField(issue, 'JIRA_BLOCKED_FIELD');
  const customMilestone = getCustomField(issue, 'JIRA_MILESTONE_FIELD');
  const customAssignee = getCustomField(issue, 'JIRA_ASSIGNEE_FIELD');
  const customPriority = getCustomField(issue, 'JIRA_PRIORITY_FIELD');

  const taskLike = {
    id: `jira-${issueKey}`,
    key: issueKey,
    title: fields.summary || issueKey,
    status: mapExternalStatus(customStage || fields.status?.name),
    owner: normalizePerson(customAssignee || fields.assignee),
    area:
      String(customArea || '').trim() ||
      normalizeStringList(fields.components).join(' | ') ||
      String(fields.project?.name || fields.project?.key || '').trim(),
    releaseName:
      String(customRelease || '').trim() ||
      normalizeStringList(fields.fixVersions).join(' | '),
    priority: mapExternalPriority(customPriority || fields.priority?.name),
    effort:
      customEffort ||
      (Number(fields.timeoriginalestimate || 0) > 0
        ? Math.ceil(Number(fields.timeoriginalestimate) / 3600)
        : ''),
    startDate: normalizeDateString(customStart),
    dueDate:
      normalizeDateString(customEnd) ||
      normalizeDateString(fields.duedate) ||
      normalizeDateString(fields.resolutiondate),
    blocked: normalizeBoolean(customBlocked) || isIssueBlocked(issue),
    milestone: normalizeBoolean(customMilestone),
    bugUrl: new URL(`/browse/${issueKey}`, baseUrl).toString(),
    comments: comments
      .map((comment) => ({
        text: extractAtlassianText(comment.body).trim(),
        createdAt: comment.created,
      }))
      .filter((comment) => comment.text),
  };

  return buildImportedTask(taskLike, index, importedAt);
}

async function importJiraIssues({ shouldReplace, jql, maxResults }) {
  const baseUrl = new URL(getRequiredEnv('JIRA_BASE_URL'));
  const headers = buildJiraHeaders();
  const fields = buildFieldList();
  const importedAt = new Date();
  const issues = await fetchAllJiraIssues(baseUrl, headers, jql, maxResults, fields);
  const tasks = [];

  for (let index = 0; index < issues.length; index += 1) {
    // Keep comment pagination simple and reliable.
    tasks.push(await jiraIssueToTask(issues[index], index + 1, importedAt, baseUrl, headers));
  }

  persistTasks(tasks, shouldReplace);

  return {
    count: tasks.length,
    jql,
    mode: shouldReplace ? 'replace' : 'merge',
  };
}

async function main() {
  const options = parseArguments(process.argv);
  const result = await importJiraIssues(options);

  console.log(
    `Imported ${result.count} Jira issues for JQL "${result.jql}" using ${result.mode} mode.`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || 'Unable to import Jira issues.');
    process.exitCode = 1;
  });
}

module.exports = {
  extractAtlassianText,
  importJiraIssues,
  jiraIssueToTask,
};
