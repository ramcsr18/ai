const { replaceTasks, saveTask } = require('../server/taskStore');
const { buildTask } = require('./import-confluence-json');
const { normalizeImportedDate } = require('./import-date-utils');

function ensureArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === null || value === undefined || value === '') {
    return [];
  }

  return [value];
}

function getByPath(object, path) {
  if (!object || !path) {
    return undefined;
  }

  return String(path)
    .split('.')
    .reduce((current, part) => {
      if (current === null || current === undefined) {
        return undefined;
      }

      return current[part];
    }, object);
}

function pickFirstValue(object, paths = []) {
  for (const path of ensureArray(paths)) {
    const value = getByPath(object, path);

    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return undefined;
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

function mapExternalStatus(value) {
  const rawValue = String(value || '').trim();

  if (!rawValue) {
    return 'Ingestion';
  }

  const normalizedValue = rawValue.toLowerCase();

  if (
    normalizedValue.includes('complete') ||
    normalizedValue.includes('closed') ||
    normalizedValue.includes('resolved') ||
    normalizedValue.includes('done') ||
    normalizedValue.includes('fixed')
  ) {
    return 'Completed';
  }

  if (
    normalizedValue.includes('production') ||
    normalizedValue.includes('released') ||
    normalizedValue.includes('deploy')
  ) {
    return 'Production';
  }

  if (
    normalizedValue.includes('qa') ||
    normalizedValue.includes('uat') ||
    normalizedValue.includes('verification')
  ) {
    return 'QA/UAT';
  }

  if (
    normalizedValue.includes('test') ||
    normalizedValue.includes('verify')
  ) {
    return 'Testing';
  }

  if (
    normalizedValue.includes('design') ||
    normalizedValue.includes('spec') ||
    normalizedValue.includes('prototype')
  ) {
    return 'Design';
  }

  if (
    normalizedValue.includes('analysis') ||
    normalizedValue.includes('triage') ||
    normalizedValue.includes('refine') ||
    normalizedValue.includes('groom')
  ) {
    return 'Analysis';
  }

  if (
    normalizedValue.includes('implementation') ||
    normalizedValue.includes('development') ||
    normalizedValue.includes('dev') ||
    normalizedValue.includes('in progress') ||
    normalizedValue.includes('coding') ||
    normalizedValue.includes('doing')
  ) {
    return 'Implementation';
  }

  if (
    normalizedValue.includes('open') ||
    normalizedValue.includes('new') ||
    normalizedValue.includes('backlog') ||
    normalizedValue.includes('todo') ||
    normalizedValue.includes('ingestion')
  ) {
    return 'Ingestion';
  }

  return rawValue;
}

function mapExternalPriority(value) {
  const rawValue = String(value || '').trim();

  if (!rawValue) {
    return 'Medium';
  }

  const normalizedValue = rawValue.toLowerCase();

  if (
    normalizedValue.includes('highest') ||
    normalizedValue.includes('high') ||
    normalizedValue.includes('critical') ||
    normalizedValue.includes('blocker') ||
    normalizedValue.includes('urgent')
  ) {
    return 'High';
  }

  if (
    normalizedValue.includes('lowest') ||
    normalizedValue.includes('low') ||
    normalizedValue.includes('minor') ||
    normalizedValue.includes('trivial')
  ) {
    return 'Low';
  }

  return 'Medium';
}

function normalizePerson(value) {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return String(
    value.displayName ||
      value.fullName ||
      value.name ||
      value.emailAddress ||
      value.email ||
      value.username ||
      ''
  ).trim();
}

function normalizeStringList(value) {
  return ensureArray(value)
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry.trim();
      }

      return String(entry?.name || entry?.value || entry?.key || '').trim();
    })
    .filter(Boolean);
}

function normalizeDateString(value) {
  return normalizeImportedDate(value);
}

function persistTasks(tasks, shouldReplace) {
  if (shouldReplace) {
    replaceTasks(tasks);
    return;
  }

  tasks.forEach((task) => {
    saveTask(task);
  });
}

function buildImportedTask(taskLike, index, importedAt) {
  return buildTask(taskLike, index, importedAt);
}

function extractArrayPayload(payload, candidatePaths = []) {
  if (Array.isArray(payload)) {
    return payload;
  }

  for (const path of candidatePaths) {
    const value = getByPath(payload, path);

    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function resolveNextLink(payload, candidatePaths = []) {
  for (const path of candidatePaths) {
    const value = getByPath(payload, path);

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

module.exports = {
  buildImportedTask,
  ensureArray,
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
};
