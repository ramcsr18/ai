const fs = require('node:fs');
const path = require('node:path');
const { normalizeTask, replaceTasks, saveTask } = require('../server/taskStore');
const { normalizeImportedDate } = require('./import-date-utils');

const STAGES = new Set([
  'Ingestion',
  'Analysis',
  'Design',
  'Implementation',
  'Testing',
  'QA/UAT',
  'Production',
  'Completed',
]);

const STAGE_ALIASES = {
  ingestion: 'Ingestion',
  intake: 'Ingestion',
  analysis: 'Analysis',
  design: 'Design',
  implementation: 'Implementation',
  development: 'Implementation',
  dev: 'Implementation',
  testing: 'Testing',
  test: 'Testing',
  qa: 'QA/UAT',
  uat: 'QA/UAT',
  'qa/uat': 'QA/UAT',
  'qa uat': 'QA/UAT',
  production: 'Production',
  prod: 'Production',
  completed: 'Completed',
  complete: 'Completed',
  compled: 'Completed',
  done: 'Completed',
};

const PRIORITY_ALIASES = {
  high: 'High',
  medium: 'Medium',
  med: 'Medium',
  low: 'Low',
};

const COMMENT_DATE_PATTERN = /(?:^|\b)(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\b)/;

function normalizeDate(value) {
  return normalizeImportedDate(value);
}

function normalizeStatus(value) {
  const rawValue = String(value || '').trim();

  if (!rawValue) {
    return 'Ingestion';
  }

  if (STAGES.has(rawValue)) {
    return rawValue;
  }

  return STAGE_ALIASES[rawValue.toLowerCase()] || 'Ingestion';
}

function normalizePriority(value) {
  const rawValue = String(value || '').trim();

  if (!rawValue) {
    return 'Medium';
  }

  return PRIORITY_ALIASES[rawValue.toLowerCase()] || 'Medium';
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  const rawValue = String(value || '').trim().toLowerCase();

  if (!rawValue) {
    return false;
  }

  return ['true', 'yes', 'y', '1', 'blocked', 'x', 'checked'].includes(rawValue);
}

function normalizeEffort(value) {
  const numericValue = Number(String(value || '').trim());

  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 1;
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toFourDigitYear(year) {
  const numericYear = Number(year);

  if (numericYear >= 100) {
    return numericYear;
  }

  return numericYear >= 70 ? 1900 + numericYear : 2000 + numericYear;
}

function createUtcDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function parseCommentDateHint(text) {
  const match = String(text || '').match(COMMENT_DATE_PATTERN);

  if (!match) {
    return null;
  }

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = match[3] ? toFourDigitYear(match[3]) : null;

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return {
    month,
    day,
    year,
  };
}

function stripLeadingCommentDate(text) {
  return String(text || '')
    .replace(
      /^\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?:\s*[-:|]\s*|\s+)/,
      ''
    )
    .trim();
}

function parseExplicitTimestamp(value) {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
}

function getTaskAnchorDate(task, importedAt) {
  const endDate = parseExplicitTimestamp(task.end);
  const startDate = parseExplicitTimestamp(task.start);

  if (endDate) {
    return endDate;
  }

  if (startDate) {
    return startDate;
  }

  return importedAt;
}

function getClosestCandidateDate(month, day, anchorDate) {
  const anchorYear = anchorDate.getUTCFullYear();
  const candidates = [anchorYear, anchorYear - 1]
    .map((year) => createUtcDate(year, month, day))
    .filter((candidate) => candidate.getTime() <= anchorDate.getTime() + 24 * 60 * 60 * 1000);

  if (!candidates.length) {
    return createUtcDate(anchorYear - 1, month, day);
  }

  return candidates.reduce((bestCandidate, candidate) => {
    const bestDistance = Math.abs(anchorDate.getTime() - bestCandidate.getTime());
    const candidateDistance = Math.abs(anchorDate.getTime() - candidate.getTime());

    return candidateDistance < bestDistance ? candidate : bestCandidate;
  });
}

function getHintDistanceFromAnchor(comment, anchorDate) {
  if (comment.explicitTimestamp) {
    return Math.abs(anchorDate.getTime() - comment.explicitTimestamp.getTime());
  }

  if (!comment.dateHint) {
    return Number.POSITIVE_INFINITY;
  }

  const candidate = comment.dateHint.year
    ? createUtcDate(comment.dateHint.year, comment.dateHint.month, comment.dateHint.day)
    : getClosestCandidateDate(comment.dateHint.month, comment.dateHint.day, anchorDate);

  return Math.abs(anchorDate.getTime() - candidate.getTime());
}

function detectRecentDirection(comments, anchorDate, requestedOrder) {
  if (requestedOrder === 'oldest-first') {
    return 'reverse';
  }

  if (requestedOrder === 'newest-first') {
    return 'forward';
  }

  const firstDatedIndex = comments.findIndex(
    (comment) => comment.explicitTimestamp || comment.dateHint
  );
  const lastDatedIndex = [...comments]
    .reverse()
    .findIndex((comment) => comment.explicitTimestamp || comment.dateHint);

  if (firstDatedIndex === -1 || lastDatedIndex === -1) {
    return 'forward';
  }

  const normalizedLastDatedIndex = comments.length - 1 - lastDatedIndex;

  if (firstDatedIndex === normalizedLastDatedIndex) {
    return 'forward';
  }

  const firstDistance = getHintDistanceFromAnchor(comments[firstDatedIndex], anchorDate);
  const lastDistance = getHintDistanceFromAnchor(
    comments[normalizedLastDatedIndex],
    anchorDate
  );

  return lastDistance < firstDistance ? 'reverse' : 'forward';
}

function resolveCommentBaseDate(comment, referenceDate) {
  if (comment.explicitTimestamp) {
    return comment.explicitTimestamp;
  }

  if (!comment.dateHint) {
    return new Date(referenceDate.getTime() - 1000);
  }

  if (comment.dateHint.year) {
    return createUtcDate(comment.dateHint.year, comment.dateHint.month, comment.dateHint.day);
  }

  const referenceYear = referenceDate.getUTCFullYear();
  const candidates = [referenceYear, referenceYear - 1].map((year) =>
    createUtcDate(year, comment.dateHint.month, comment.dateHint.day)
  );
  const eligibleCandidates = candidates.filter(
    (candidate) => candidate.getTime() <= referenceDate.getTime() + 24 * 60 * 60 * 1000
  );

  if (eligibleCandidates.length) {
    return eligibleCandidates.reduce((bestCandidate, candidate) => {
      return candidate.getTime() > bestCandidate.getTime() ? candidate : bestCandidate;
    });
  }

  return candidates[candidates.length - 1];
}

function normalizeRawComments(rawComments) {
  if (!rawComments) {
    return [];
  }

  if (Array.isArray(rawComments)) {
    return rawComments.flatMap((comment) => normalizeRawComments(comment));
  }

  if (typeof rawComments === 'string') {
    return rawComments
      .split(/\r?\n|\s*\|\|\s*/)
      .map((comment) => comment.trim())
      .filter(Boolean)
      .map((comment) => ({ text: comment }));
  }

  if (typeof rawComments === 'object') {
    const text = String(
      rawComments.text ||
        rawComments.comment ||
        rawComments.body ||
        rawComments.message ||
        rawComments.note ||
        ''
    ).trim();

    if (!text) {
      return [];
    }

    return [
      {
        text,
        createdAt:
          rawComments.createdAt ||
          rawComments.date ||
          rawComments.timestamp ||
          rawComments.created_at ||
          '',
      },
    ];
  }

  return [];
}

function createComments(rawComments, task, importedAt) {
  const normalizedComments = normalizeRawComments(rawComments).map((comment, index) => {
    const explicitTimestamp = parseExplicitTimestamp(comment.createdAt);
    const dateHint = explicitTimestamp ? null : parseCommentDateHint(comment.text);

    return {
      originalIndex: index,
      originalText: comment.text,
      text: dateHint ? stripLeadingCommentDate(comment.text) || comment.text.trim() : comment.text.trim(),
      explicitTimestamp,
      dateHint,
    };
  });

  if (!normalizedComments.length) {
    return [];
  }

  const anchorDate = getTaskAnchorDate(task, importedAt);
  const recentDirection = detectRecentDirection(
    normalizedComments,
    anchorDate,
    task.commentOrder || task.commentsOrder || task.comment_order || 'auto'
  );
  const traversal = recentDirection === 'forward'
    ? normalizedComments.map((_, index) => index)
    : normalizedComments.map((_, index) => normalizedComments.length - 1 - index);

  let referenceDate = anchorDate;
  const timestampsByIndex = new Map();

  traversal.forEach((commentIndex) => {
    const comment = normalizedComments[commentIndex];
    const resolvedBaseDate = resolveCommentBaseDate(comment, referenceDate);
    const resolvedTimestamp = new Date(
      resolvedBaseDate.getTime() - (comment.originalIndex % 1000) * 1000
    );

    timestampsByIndex.set(commentIndex, resolvedTimestamp);
    referenceDate = new Date(resolvedTimestamp.getTime() - 1000);
  });

  return normalizedComments.map((comment, index) => ({
    text: comment.text,
    createdAt: (timestampsByIndex.get(index) || new Date(importedAt.getTime() - index * 1000)).toISOString(),
  }));
}

function buildTask(rawTask, rowNumber, importedAt) {
  const task = rawTask && typeof rawTask === 'object' ? rawTask : {};
  const title = String(task.title || task.task || task.name || task.summary || '').trim();

  if (!title) {
    throw new Error(`Task ${rowNumber} is missing a title.`);
  }

  const status = normalizeStatus(task.status || task.stage);
  const end = normalizeDate(task.end || task.endDate || task.due || task.dueDate);
  const normalizedTask = normalizeTask({
    title,
    status,
    effort: normalizeEffort(task.effort || task.estimate || task.hours),
    start: normalizeDate(task.start || task.startDate),
    end,
    assignee: String(task.assignee || task.owner || '').trim(),
    squad: String(task.squad || task.area || task.team || '').trim(),
    release: String(task.release || task.releaseName || '').trim(),
    milestone: status === 'Completed' ? normalizeBoolean(task.milestone) : false,
    priority: normalizePriority(task.priority),
    blocked: normalizeBoolean(task.blocked),
    bugUrl: String(task.bugUrl || task.jiraUrl || task.url || '').trim(),
    draftComment: '',
    comments: createComments(task.comments || task.notes, task, importedAt),
  });

  return normalizedTask;
}

function parseArguments(argv) {
  const argumentsList = argv.slice(2);
  let filePath = '';
  let shouldReplace = false;

  argumentsList.forEach((argument) => {
    if (argument === '--replace') {
      shouldReplace = true;
      return;
    }

    if (!filePath) {
      filePath = argument;
    }
  });

  if (!filePath) {
    throw new Error(
      'Usage: npm run import:confluence:json -- <path-to-json> [--replace]'
    );
  }

  return {
    filePath,
    shouldReplace,
  };
}

function parseTasksDocument(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && Array.isArray(payload.tasks)) {
    return payload.tasks;
  }

  throw new Error('JSON import file must contain an array of tasks or an object with a tasks array.');
}

function importTasksFromJson(filePath, shouldReplace) {
  const absolutePath = path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`JSON file not found: ${absolutePath}`);
  }

  const payload = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  const rawTasks = parseTasksDocument(payload);
  const importedAt = new Date();
  const tasks = rawTasks.map((task, index) => buildTask(task, index + 1, importedAt));

  if (shouldReplace) {
    replaceTasks(tasks);
  } else {
    tasks.forEach((task) => {
      saveTask(task);
    });
  }

  return {
    absolutePath,
    count: tasks.length,
    mode: shouldReplace ? 'replace' : 'merge',
  };
}

function main() {
  const { filePath, shouldReplace } = parseArguments(process.argv);
  const result = importTasksFromJson(filePath, shouldReplace);

  console.log(
    `Imported ${result.count} tasks from ${result.absolutePath} using ${result.mode} mode.`
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || 'Unable to import Confluence JSON.');
    process.exitCode = 1;
  }
}

module.exports = {
  buildTask,
  createComments,
  detectRecentDirection,
  importTasksFromJson,
  parseCommentDateHint,
  stripLeadingCommentDate,
};
