const fs = require('node:fs');
const path = require('node:path');
const { normalizeTask, replaceTasks, saveTask } = require('../server/taskStore');
const { createComments } = require('./import-confluence-json');
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

const HEADER_ALIASES = {
  id: 'id',
  key: 'id',
  'task id': 'id',
  'task key': 'id',
  title: 'title',
  task: 'title',
  name: 'title',
  summary: 'title',
  status: 'status',
  stage: 'status',
  effort: 'effort',
  estimate: 'effort',
  estimates: 'effort',
  hours: 'effort',
  owner: 'assignee',
  assignee: 'assignee',
  squad: 'squad',
  area: 'squad',
  team: 'squad',
  release: 'release',
  'release name': 'release',
  milestone: 'milestone',
  priority: 'priority',
  blocked: 'blocked',
  blocker: 'blocked',
  'blocked status': 'blocked',
  'bug url': 'bugUrl',
  'jira url': 'bugUrl',
  'bug/jira url': 'bugUrl',
  url: 'bugUrl',
  link: 'bugUrl',
  comments: 'comments',
  comment: 'comments',
  notes: 'comments',
  start: 'start',
  'start date': 'start',
  end: 'end',
  'end date': 'end',
  due: 'end',
  'due date': 'end',
};

function normalizeHeader(header) {
  return String(header || '')
    .trim()
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function mapHeaders(headers) {
  return headers.map((header) => HEADER_ALIASES[normalizeHeader(header)] || null);
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const nextCharacter = content[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (character === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1;
      }

      row.push(cell);
      cell = '';

      if (row.some((value) => value.trim() !== '')) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    cell += character;
  }

  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim() !== '')) {
      rows.push(row);
    }
  }

  return rows;
}

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

function toRowObject(headers, row) {
  return headers.reduce((result, header, index) => {
    if (!header) {
      return result;
    }

    result[header] = String(row[index] || '').trim();
    return result;
  }, {});
}

function buildTask(rowData, rowNumber, importedAt) {
  const title = rowData.title;

  if (!title) {
    throw new Error(`Row ${rowNumber} is missing a task title.`);
  }

  const status = normalizeStatus(rowData.status);
  const start = normalizeDate(rowData.start);
  const normalizedEndDate = normalizeDate(rowData.end);
  const end =
    status === 'Completed' ? normalizedEndDate || importedAt.toISOString().slice(0, 10) : normalizedEndDate;
  const commentContext = {
    start,
    end,
    commentOrder: 'newest-first',
  };
  const task = normalizeTask({
    title,
    status,
    effort: normalizeEffort(rowData.effort),
    start,
    end,
    assignee: rowData.assignee || '',
    squad: rowData.squad || '',
    release: rowData.release || '',
    milestone:
      status === 'Completed' ? normalizeBoolean(rowData.milestone) : false,
    priority: normalizePriority(rowData.priority),
    blocked: normalizeBoolean(rowData.blocked),
    bugUrl: rowData.bugUrl || '',
    draftComment: '',
    comments: createComments(rowData.comments, commentContext, importedAt),
  });

  return task;
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
      'Usage: npm run import:confluence -- <path-to-csv> [--replace]'
    );
  }

  return {
    filePath,
    shouldReplace,
  };
}

function importTasksFromCsv(filePath, shouldReplace) {
  const absolutePath = path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`CSV file not found: ${absolutePath}`);
  }

  const csvContent = fs.readFileSync(absolutePath, 'utf8');
  const rows = parseCsv(csvContent);

  if (rows.length < 2) {
    throw new Error('CSV must include a header row and at least one task row.');
  }

  const [headerRow, ...dataRows] = rows;
  const mappedHeaders = mapHeaders(headerRow);
  const importedAt = new Date();

  if (!mappedHeaders.includes('title')) {
    throw new Error('CSV must include a Title or Task column.');
  }

  const tasks = dataRows.map((row, index) =>
    buildTask(toRowObject(mappedHeaders, row), index + 2, importedAt)
  );

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
  const result = importTasksFromCsv(filePath, shouldReplace);

  console.log(
    `Imported ${result.count} tasks from ${result.absolutePath} using ${result.mode} mode.`
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || 'Unable to import Confluence CSV.');
    process.exitCode = 1;
  }
}

module.exports = {
  buildTask,
  importTasksFromCsv,
  mapHeaders,
  parseCsv,
};
