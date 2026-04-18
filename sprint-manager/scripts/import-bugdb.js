const {
  buildImportedTask,
  extractArrayPayload,
  getByPath,
  mapExternalPriority,
  mapExternalStatus,
  normalizeBoolean,
  normalizeDateString,
  normalizePerson,
  normalizeStringList,
  persistTasks,
  pickFirstValue,
  resolveNextLink,
} = require('./import-remote-utils');

const DEFAULT_RECORD_PATHS = [
  'bugs',
  'items',
  'issues',
  'records',
  'results',
  'data',
  'data.items',
  'data.records',
];

const DEFAULT_NEXT_PATHS = [
  'next',
  'nextPage',
  'pagination.next',
  'links.next',
  'data.next',
];

const DEFAULT_FIELD_PATHS = {
  id: ['id', 'bugId', 'bugNumber', 'bugno', 'number', 'key'],
  title: ['title', 'summary', 'subject', 'synopsis', 'abstract'],
  status: ['status', 'state', 'phase'],
  owner: ['owner', 'assignee', 'responsibleEngineer', 'responsible', 'assignedTo', 'contact'],
  area: ['area', 'component', 'product', 'team', 'category'],
  priority: ['priority', 'severity'],
  effort: ['effort', 'estimate', 'hours'],
  start: ['start', 'startDate', 'created'],
  end: ['end', 'endDate', 'dueDate', 'closed', 'resolved', 'updated'],
  release: ['release', 'releaseName', 'fixVersion', 'targetRelease'],
  milestone: ['milestone'],
  blocked: ['blocked'],
  bugUrl: ['url', 'bugUrl', 'link', 'self'],
  comments: ['comments', 'notes', 'activity', 'updates'],
};

function parseArguments(argv) {
  const args = argv.slice(2);
  let shouldReplace = false;
  let url = process.env.BUGDB_API_URL || process.env.BUGDB_URL || '';

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--replace') {
      shouldReplace = true;
      continue;
    }

    if (arg === '--url') {
      url = args[index + 1] || '';
      index += 1;
    }
  }

  if (!url) {
    throw new Error('Provide BugDB URL with --url or set BUGDB_API_URL / BUGDB_URL.');
  }

  return {
    shouldReplace,
    url,
  };
}

function buildBugDbHeaders() {
  const headers = {
    Accept: 'application/json',
  };

  if (process.env.BUGDB_BEARER_TOKEN) {
    headers.Authorization = `Bearer ${process.env.BUGDB_BEARER_TOKEN}`;
    return headers;
  }

  if (process.env.BUGDB_USERNAME && process.env.BUGDB_PASSWORD) {
    headers.Authorization = `Basic ${Buffer.from(
      `${process.env.BUGDB_USERNAME}:${process.env.BUGDB_PASSWORD}`
    ).toString('base64')}`;
  }

  return headers;
}

async function requestJson(url, headers) {
  const response = await fetch(url, { headers });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || payload.error || `Request failed: ${response.status}`);
  }

  return payload;
}

function getConfiguredPaths(baseName, fallbackPaths) {
  const configuredPath = process.env[baseName];

  if (configuredPath) {
    return [configuredPath];
  }

  return fallbackPaths;
}

function buildBugUrl(record, id) {
  const explicitUrl = pickFirstValue(record, getConfiguredPaths('BUGDB_BUG_URL_FIELD', DEFAULT_FIELD_PATHS.bugUrl));

  if (explicitUrl) {
    return String(explicitUrl).trim();
  }

  const linkTemplate = process.env.BUGDB_LINK_TEMPLATE;

  if (linkTemplate && id) {
    return linkTemplate.replace(/\{id\}/g, String(id));
  }

  return '';
}

function pickField(record, envName, fallbackPaths) {
  return pickFirstValue(record, getConfiguredPaths(envName, fallbackPaths));
}

async function fetchBugDbRecords(initialUrl, headers) {
  const records = [];
  const seenUrls = new Set();
  let nextUrl = initialUrl;

  while (nextUrl && !seenUrls.has(nextUrl)) {
    seenUrls.add(nextUrl);
    const payload = await requestJson(nextUrl, headers);
    const pageRecords = extractArrayPayload(
      payload,
      getConfiguredPaths('BUGDB_RECORDS_PATH', DEFAULT_RECORD_PATHS)
    );

    if (!pageRecords.length && Array.isArray(payload)) {
      records.push(...payload);
    } else {
      records.push(...pageRecords);
    }

    const resolvedNext = process.env.BUGDB_NEXT_PATH
      ? String(getByPath(payload, process.env.BUGDB_NEXT_PATH) || '').trim()
      : resolveNextLink(payload, DEFAULT_NEXT_PATHS);

    nextUrl = resolvedNext ? new URL(resolvedNext, nextUrl).toString() : '';
  }

  return records;
}

function bugDbRecordToTask(record, index, importedAt) {
  const id = pickField(record, 'BUGDB_ID_FIELD', DEFAULT_FIELD_PATHS.id);
  const title = pickField(record, 'BUGDB_TITLE_FIELD', DEFAULT_FIELD_PATHS.title);

  if (!title) {
    throw new Error(`BugDB record ${index} is missing a title/summary field.`);
  }

  const status = mapExternalStatus(
    pickField(record, 'BUGDB_STATUS_FIELD', DEFAULT_FIELD_PATHS.status)
  );
  const start = normalizeDateString(
    pickField(record, 'BUGDB_START_FIELD', DEFAULT_FIELD_PATHS.start)
  );
  const end = normalizeDateString(
    pickField(record, 'BUGDB_END_FIELD', DEFAULT_FIELD_PATHS.end)
  );

  const taskLike = {
    id: `bugdb-${id || index}`,
    title: String(title).trim(),
    status,
    owner: normalizePerson(
      pickField(record, 'BUGDB_OWNER_FIELD', DEFAULT_FIELD_PATHS.owner)
    ),
    area: normalizeStringList(
      pickField(record, 'BUGDB_AREA_FIELD', DEFAULT_FIELD_PATHS.area)
    ).join(' | '),
    priority: mapExternalPriority(
      pickField(record, 'BUGDB_PRIORITY_FIELD', DEFAULT_FIELD_PATHS.priority)
    ),
    effort: pickField(record, 'BUGDB_EFFORT_FIELD', DEFAULT_FIELD_PATHS.effort),
    startDate: start,
    dueDate: end,
    releaseName: String(
      pickField(record, 'BUGDB_RELEASE_FIELD', DEFAULT_FIELD_PATHS.release) || ''
    ).trim(),
    milestone: normalizeBoolean(
      pickField(record, 'BUGDB_MILESTONE_FIELD', DEFAULT_FIELD_PATHS.milestone)
    ),
    blocked: normalizeBoolean(
      pickField(record, 'BUGDB_BLOCKED_FIELD', DEFAULT_FIELD_PATHS.blocked)
    ),
    bugUrl: buildBugUrl(record, id),
    comments:
      pickField(record, 'BUGDB_COMMENTS_FIELD', DEFAULT_FIELD_PATHS.comments) || [],
  };

  return buildImportedTask(taskLike, index, importedAt);
}

async function importBugDbRecords({ shouldReplace, url }) {
  const headers = buildBugDbHeaders();
  const importedAt = new Date();
  const records = await fetchBugDbRecords(url, headers);
  const tasks = records.map((record, index) => bugDbRecordToTask(record, index + 1, importedAt));

  persistTasks(tasks, shouldReplace);

  return {
    count: tasks.length,
    source: url,
    mode: shouldReplace ? 'replace' : 'merge',
  };
}

async function main() {
  const options = parseArguments(process.argv);
  const result = await importBugDbRecords(options);

  console.log(
    `Imported ${result.count} BugDB records from ${result.source} using ${result.mode} mode.`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || 'Unable to import BugDB records.');
    process.exitCode = 1;
  });
}

module.exports = {
  bugDbRecordToTask,
  fetchBugDbRecords,
  importBugDbRecords,
};
