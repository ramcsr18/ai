const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { INITIAL_RESOURCES, INITIAL_TASKS } = require('./seedData');

const dataDirectory = path.join(__dirname, 'data');
const databasePath = path.join(dataDirectory, 'sprint-board.sqlite');

fs.mkdirSync(dataDirectory, { recursive: true });

const database = new DatabaseSync(databasePath);

database.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    effort INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    assignee TEXT NOT NULL,
    squad TEXT NOT NULL,
    release_name TEXT NOT NULL DEFAULT '',
    milestone INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL,
    blocked INTEGER NOT NULL DEFAULT 0,
    bug_url TEXT NOT NULL DEFAULT '',
    draft_comment TEXT NOT NULL DEFAULT '',
    comments_json TEXT NOT NULL DEFAULT '[]'
  )
`);

database.exec(`
  CREATE TABLE IF NOT EXISTS app_sequences (
    name TEXT PRIMARY KEY,
    next_value INTEGER NOT NULL
  )
`);

database.exec(`
  CREATE TABLE IF NOT EXISTS resources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'Contributor',
    password_hash TEXT NOT NULL DEFAULT '',
    require_password_change INTEGER NOT NULL DEFAULT 1
  )
`);

function listTableColumns(tableName) {
  return database
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .map((column) => column.name);
}

function ensureColumnExists(tableName, columnName, columnDefinition) {
  const existingColumns = listTableColumns(tableName);

  if (existingColumns.includes(columnName)) {
    return;
  }

  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
}

ensureColumnExists('resources', 'email', "TEXT NOT NULL DEFAULT ''");
ensureColumnExists('resources', 'role', "TEXT NOT NULL DEFAULT 'Contributor'");
ensureColumnExists('resources', 'password_hash', "TEXT NOT NULL DEFAULT ''");
ensureColumnExists('resources', 'require_password_change', 'INTEGER NOT NULL DEFAULT 1');

const DEFAULT_MANAGER_BOOTSTRAP_PASSWORD = 'Welcome@123';
const DEFAULT_CONTRIBUTOR_BOOTSTRAP_PASSWORD = 'Welcome1';
const REQUIRED_MANAGER_EMAIL = 'ram.mohan.yaratapally@oracle.com';
const REQUIRED_MANAGER_NAME = 'Ram Mohan Yaratapally';

const upsertTaskStatement = database.prepare(`
  INSERT INTO tasks (
    id,
    title,
    status,
    effort,
    start_date,
    end_date,
    assignee,
    squad,
    release_name,
    milestone,
    priority,
    blocked,
    bug_url,
    draft_comment,
    comments_json
  ) VALUES (
    @id,
    @title,
    @status,
    @effort,
    @start_date,
    @end_date,
    @assignee,
    @squad,
    @release_name,
    @milestone,
    @priority,
    @blocked,
    @bug_url,
    @draft_comment,
    @comments_json
  )
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    status = excluded.status,
    effort = excluded.effort,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    assignee = excluded.assignee,
    squad = excluded.squad,
    release_name = excluded.release_name,
    milestone = excluded.milestone,
    priority = excluded.priority,
    blocked = excluded.blocked,
    bug_url = excluded.bug_url,
    draft_comment = excluded.draft_comment,
    comments_json = excluded.comments_json
`);

const selectAllTasksStatement = database.prepare(`
  SELECT
    id,
    title,
    status,
    effort,
    start_date,
    end_date,
    assignee,
    squad,
    release_name,
    milestone,
    priority,
    blocked,
    bug_url,
    draft_comment,
    comments_json
  FROM tasks
`);

const selectTaskStatement = database.prepare(`
  SELECT
    id,
    title,
    status,
    effort,
    start_date,
    end_date,
    assignee,
    squad,
    release_name,
    milestone,
    priority,
    blocked,
    bug_url,
    draft_comment,
    comments_json
  FROM tasks
  WHERE id = ?
`);

const countTasksStatement = database.prepare('SELECT COUNT(*) AS count FROM tasks');
const deleteAllTasksStatement = database.prepare('DELETE FROM tasks');
const deleteTaskStatement = database.prepare('DELETE FROM tasks WHERE id = ?');
const selectAllResourcesStatement = database.prepare(`
  SELECT
    id,
    name,
    email,
    role,
    require_password_change
  FROM resources
  ORDER BY LOWER(name), LOWER(email), id
`);
const selectResourceStatement = database.prepare(`
  SELECT
    id,
    name,
    email,
    role,
    password_hash,
    require_password_change
  FROM resources
  WHERE id = ?
`);
const selectResourceByEmailForAuthStatement = database.prepare(`
  SELECT
    id,
    name,
    email,
    role,
    password_hash,
    require_password_change
  FROM resources
  WHERE LOWER(email) = LOWER(?)
  LIMIT 1
`);
const countResourcesStatement = database.prepare('SELECT COUNT(*) AS count FROM resources');
const deleteAllResourcesStatement = database.prepare('DELETE FROM resources');
const selectResourceByNameStatement = database.prepare(`
  SELECT id
  FROM resources
  WHERE LOWER(name) = LOWER(?)
    AND id != ?
  LIMIT 1
`);
const selectResourceByEmailStatement = database.prepare(`
  SELECT id
  FROM resources
  WHERE LOWER(email) = LOWER(?)
    AND id != ?
  LIMIT 1
`);
const upsertResourceStatement = database.prepare(`
  INSERT INTO resources (
    id,
    name,
    email,
    role,
    password_hash,
    require_password_change
  ) VALUES (
    @id,
    @name,
    @email,
    @role,
    @password_hash,
    @require_password_change
  )
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    email = excluded.email,
    role = excluded.role,
    password_hash = excluded.password_hash,
    require_password_change = excluded.require_password_change
`);
const deleteResourceStatement = database.prepare('DELETE FROM resources WHERE id = ?');
const updateResourcePasswordStatement = database.prepare(`
  UPDATE resources
  SET password_hash = ?,
      require_password_change = 0
  WHERE id = ?
`);
const renameAssignedTasksStatement = database.prepare(`
  UPDATE tasks
  SET assignee = ?
  WHERE assignee = ?
`);
const selectSequenceStatement = database.prepare(`
  SELECT next_value
  FROM app_sequences
  WHERE name = ?
`);
const upsertSequenceStatement = database.prepare(`
  INSERT INTO app_sequences (name, next_value)
  VALUES (?, ?)
  ON CONFLICT(name) DO UPDATE SET next_value = excluded.next_value
`);

function parseStrictNumericId(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  const rawValue = String(value || '').trim();

  if (!rawValue) {
    return null;
  }

  return /^\d+$/.test(rawValue) ? Number(rawValue) : null;
}

function extractNumericSeed(value) {
  const strictValue = parseStrictNumericId(value);

  if (strictValue) {
    return strictValue;
  }

  const rawValue = String(value || '').trim();
  const match = rawValue.match(/\d+/);

  return match ? Number(match[0]) : null;
}

function initializeSequence(name, nextValue) {
  const existing = selectSequenceStatement.get(name);

  if (!existing) {
    upsertSequenceStatement.run(name, nextValue);
    return;
  }

  if (existing.next_value < nextValue) {
    upsertSequenceStatement.run(name, nextValue);
  }
}

function getNextSequenceValue(name) {
  const current = selectSequenceStatement.get(name);

  if (!current) {
    initializeSequence(name, 1);
    return getNextSequenceValue(name);
  }

  const value = Number(current.next_value);
  upsertSequenceStatement.run(name, value + 1);
  return value;
}

function reserveSequenceValue(name, value) {
  const numericValue = parseStrictNumericId(value);

  if (!numericValue) {
    return null;
  }

  const current = selectSequenceStatement.get(name);

  if (!current || Number(current.next_value) <= numericValue) {
    upsertSequenceStatement.run(name, numericValue + 1);
  }

  return numericValue;
}

function initializeSequencesFromData() {
  const rows = selectAllTasksStatement.all();
  let maxTaskId = 0;
  let maxCommentId = 0;
  let maxResourceId = 0;

  rows.forEach((row) => {
    maxTaskId = Math.max(maxTaskId, extractNumericSeed(row.id) || 0);

    try {
      const comments = JSON.parse(row.comments_json || '[]');

      if (Array.isArray(comments)) {
        comments.forEach((comment) => {
          maxCommentId = Math.max(maxCommentId, extractNumericSeed(comment?.id) || 0);
        });
      }
    } catch {
      // Ignore malformed comment payloads while establishing future sequences.
    }
  });

  selectAllResourcesStatement.all().forEach((resource) => {
    maxResourceId = Math.max(maxResourceId, extractNumericSeed(resource.id) || 0);
  });

  initializeSequence('task_id', maxTaskId + 1 || 1);
  initializeSequence('comment_id', maxCommentId + 1 || 1);
  initializeSequence('resource_id', maxResourceId + 1 || 1);
}

function normalizeComment(comment, index, taskId) {
  if (!comment || typeof comment !== 'object') {
    return null;
  }

  const text = String(comment.text || '').trim();

  if (!text) {
    return null;
  }

  const normalizedCommentId =
    reserveSequenceValue('comment_id', comment.id) ??
    (comment.id !== undefined && comment.id !== null && String(comment.id).trim()
      ? String(comment.id).trim()
      : getNextSequenceValue('comment_id'));

  return {
    id: normalizedCommentId,
    text,
    createdAt: String(comment.createdAt || new Date().toISOString()),
  };
}

function normalizeTask(task) {
  const normalizedTaskId =
    reserveSequenceValue('task_id', task.id) ??
    (task.id !== undefined && task.id !== null && String(task.id).trim()
      ? String(task.id).trim()
      : getNextSequenceValue('task_id'));
  const comments = Array.isArray(task.comments)
    ? task.comments
        .map((comment, index) => normalizeComment(comment, index, normalizedTaskId))
        .filter(Boolean)
    : [];

  return {
    id: normalizedTaskId,
    title: String(task.title || '').trim(),
    status: String(task.status || 'Ingestion'),
    effort: Number(task.effort) || 1,
    start: String(task.start || ''),
    end: String(task.end || ''),
    assignee: String(task.assignee || ''),
    squad: String(task.squad || ''),
    release: String(task.release || ''),
    milestone: task.status === 'Completed' ? Boolean(task.milestone) : false,
    priority: String(task.priority || 'Medium'),
    blocked: Boolean(task.blocked),
    bugUrl: String(task.bugUrl || ''),
    draftComment: String(task.draftComment || ''),
    comments,
  };
}

function normalizeResourceRole(value) {
  return String(value || '').trim().toLowerCase() === 'manager' ? 'Manager' : 'Contributor';
}

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');

  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, passwordHash) {
  const [algorithm, salt, storedHash] = String(passwordHash || '').split('$');

  if (algorithm !== 'scrypt' || !salt || !storedHash) {
    return false;
  }

  const candidateHash = crypto.scryptSync(String(password), salt, 64).toString('hex');

  return crypto.timingSafeEqual(Buffer.from(candidateHash, 'hex'), Buffer.from(storedHash, 'hex'));
}

function generateTemporaryPassword(length = 12) {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = crypto.randomBytes(length);

  return Array.from(bytes, (value) => characters[value % characters.length]).join('');
}

function getDefaultPasswordForRole(role, mode = 'create') {
  const normalizedRole = normalizeResourceRole(role);

  if (normalizedRole === 'Contributor') {
    return DEFAULT_CONTRIBUTOR_BOOTSTRAP_PASSWORD;
  }

  return mode === 'bootstrap'
    ? DEFAULT_MANAGER_BOOTSTRAP_PASSWORD
    : generateTemporaryPassword();
}

function buildRoleAwareUser(resource) {
  const registrationRole = normalizeResourceRole(resource?.role);

  return {
    id: resource.id,
    name: resource.name,
    email: resource.email,
    role: registrationRole === 'Manager' ? 'admin' : 'user',
    registrationRole,
  };
}

function sanitizeResource(resource) {
  if (!resource) {
    return null;
  }

  const { passwordHash, ...safeResource } = resource;
  return safeResource;
}

function normalizeResource(resource) {
  const normalizedResourceId =
    reserveSequenceValue('resource_id', resource.id) ??
    (resource.id !== undefined && resource.id !== null && String(resource.id).trim()
      ? String(resource.id).trim()
      : getNextSequenceValue('resource_id'));
  const name = String(resource.name || '').trim();
  const email = String(resource.email || '').trim().toLowerCase();
  const role = normalizeResourceRole(resource.role);
  const passwordHash = String(resource.passwordHash || resource.password_hash || '').trim();
  const requiresPasswordChange =
    resource.requiresPasswordChange !== undefined
      ? Boolean(resource.requiresPasswordChange)
      : resource.require_password_change !== undefined
        ? Boolean(resource.require_password_change)
        : true;

  return {
    id: normalizedResourceId,
    name,
    email,
    role,
    passwordHash,
    requiresPasswordChange,
  };
}

function rowToTask(row) {
  if (!row) {
    return null;
  }

  let comments = [];

  try {
    comments = JSON.parse(row.comments_json || '[]');
  } catch {
    comments = [];
  }

  return normalizeTask({
    id: row.id,
    title: row.title,
    status: row.status,
    effort: row.effort,
    start: row.start_date,
    end: row.end_date,
    assignee: row.assignee,
    squad: row.squad,
    release: row.release_name,
    milestone: Boolean(row.milestone),
    priority: row.priority,
    blocked: Boolean(row.blocked),
    bugUrl: row.bug_url,
    draftComment: row.draft_comment,
    comments,
  });
}

function rowToResource(row) {
  if (!row) {
    return null;
  }

  return normalizeResource({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    passwordHash: row.password_hash,
    requiresPasswordChange: Boolean(row.require_password_change),
  });
}

function taskToRow(task) {
  const normalizedTask = normalizeTask(task);

  if (!normalizedTask.title) {
    throw new Error('Task title is required.');
  }

  return {
    id: String(normalizedTask.id),
    title: normalizedTask.title,
    status: normalizedTask.status,
    effort: normalizedTask.effort,
    start_date: normalizedTask.start,
    end_date: normalizedTask.end,
    assignee: normalizedTask.assignee,
    squad: normalizedTask.squad,
    release_name: normalizedTask.release,
    milestone: normalizedTask.milestone ? 1 : 0,
    priority: normalizedTask.priority,
    blocked: normalizedTask.blocked ? 1 : 0,
    bug_url: normalizedTask.bugUrl,
    draft_comment: normalizedTask.draftComment,
    comments_json: JSON.stringify(normalizedTask.comments),
  };
}

function resourceToRow(resource) {
  const normalizedResource = normalizeResource(resource);

  if (!normalizedResource.name) {
    throw new Error('Resource name is required.');
  }

  if (!normalizedResource.email) {
    throw new Error('Resource email is required.');
  }

  return {
    id: String(normalizedResource.id),
    name: normalizedResource.name,
    email: normalizedResource.email,
    role: normalizedResource.role,
    password_hash: normalizedResource.passwordHash,
    require_password_change: normalizedResource.requiresPasswordChange ? 1 : 0,
  };
}

function buildResourceWithPassword(resource, temporaryPassword, mode = 'create') {
  const passwordToUse = temporaryPassword || getDefaultPasswordForRole(resource?.role, mode);

  return {
    ...resource,
    passwordHash: createPasswordHash(passwordToUse),
    requiresPasswordChange: true,
    temporaryPassword: passwordToUse,
  };
}

function normalizeContributorBootstrapPasswords() {
  const resources = selectAllResourcesStatement.all().map((resource) => getResourceById(resource.id));

  resources.forEach((resource) => {
    if (!resource || normalizeResourceRole(resource.role) !== 'Contributor') {
      return;
    }

    if (!resource.requiresPasswordChange) {
      return;
    }

    if (verifyPassword(DEFAULT_CONTRIBUTOR_BOOTSTRAP_PASSWORD, resource.passwordHash)) {
      return;
    }

    upsertResourceStatement.run(
      resourceToRow(
        buildResourceWithPassword(
          resource,
          DEFAULT_CONTRIBUTOR_BOOTSTRAP_PASSWORD,
          'bootstrap'
        )
      )
    );
  });
}

function seedIfEmpty() {
  const { count: taskCount } = countTasksStatement.get();
  const { count: resourceCount } = countResourcesStatement.get();

  if (taskCount > 0 && resourceCount > 0) {
    return;
  }

  database.exec('BEGIN');

  try {
    if (resourceCount === 0) {
      INITIAL_RESOURCES.forEach((resource) => {
        upsertResourceStatement.run(resourceToRow(resource));
      });
    }

    if (taskCount === 0) {
      INITIAL_TASKS.forEach((task) => {
        upsertTaskStatement.run(taskToRow(task));
      });
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function listTasks() {
  return selectAllTasksStatement.all().map(rowToTask);
}

function listResources() {
  return selectAllResourcesStatement.all().map((row) => sanitizeResource(getResourceById(row.id)));
}

function getTaskById(id) {
  return rowToTask(selectTaskStatement.get(String(id)));
}

function getResourceById(id) {
  return rowToResource(selectResourceStatement.get(String(id)));
}

function saveTask(task) {
  const row = taskToRow(task);
  upsertTaskStatement.run(row);

  return getTaskById(row.id);
}

function deleteTask(id) {
  deleteTaskStatement.run(String(id));
  return listTasks();
}

function saveResource(resource) {
  const existingResource =
    resource?.id !== undefined && resource?.id !== null
      ? getResourceById(String(resource.id))
      : null;
  const resourceWithCredentials = existingResource
    ? {
        ...resource,
        passwordHash: resource.passwordHash || existingResource.passwordHash,
        requiresPasswordChange:
          resource.requiresPasswordChange !== undefined
            ? resource.requiresPasswordChange
            : existingResource.requiresPasswordChange,
      }
    : buildResourceWithPassword(resource);
  const row = resourceToRow(resourceWithCredentials);
  const conflictingNameResource = selectResourceByNameStatement.get(row.name, row.id);
  const conflictingEmailResource = selectResourceByEmailStatement.get(row.email, row.id);

  if (conflictingNameResource) {
    throw new Error('A resource with this name already exists.');
  }

  if (conflictingEmailResource) {
    throw new Error('A resource with this email already exists.');
  }

  database.exec('BEGIN');

  try {
    upsertResourceStatement.run(row);

    if (
      existingResource &&
      existingResource.name &&
      existingResource.name !== row.name
    ) {
      renameAssignedTasksStatement.run(row.name, existingResource.name);
    }

    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }

  const savedResource = sanitizeResource(getResourceById(row.id));

  if (resourceWithCredentials.temporaryPassword) {
    return {
      ...savedResource,
      temporaryPassword: resourceWithCredentials.temporaryPassword,
    };
  }

  return savedResource;
}

function authenticateResource(email, password) {
  const resource = rowToResource(selectResourceByEmailForAuthStatement.get(String(email || '').trim()));

  if (!resource) {
    throw new Error('Invalid email or password.');
  }

  if (!verifyPassword(password, resource.passwordHash)) {
    throw new Error('Invalid email or password.');
  }

  return {
    user: {
      ...buildRoleAwareUser(resource),
      mustChangePassword: resource.requiresPasswordChange,
      authProvider: 'local',
    },
  };
}

function changeResourcePassword(email, currentPassword, nextPassword) {
  const resource = rowToResource(selectResourceByEmailForAuthStatement.get(String(email || '').trim()));

  if (!resource) {
    throw new Error('Unable to update the password for this resource.');
  }

  if (!verifyPassword(currentPassword, resource.passwordHash)) {
    throw new Error('Current password is incorrect.');
  }

  const trimmedNextPassword = String(nextPassword || '').trim();

  if (trimmedNextPassword.length < 8) {
    throw new Error('New password must be at least 8 characters long.');
  }

  updateResourcePasswordStatement.run(createPasswordHash(trimmedNextPassword), String(resource.id));
  const updatedResource = getResourceById(resource.id);

  return {
    user: {
      ...buildRoleAwareUser(updatedResource),
      mustChangePassword: false,
      authProvider: 'local',
    },
  };
}

function deleteResource(id) {
  deleteResourceStatement.run(String(id));
  return listResources();
}

function replaceTasks(tasks) {
  database.exec('BEGIN');

  try {
    deleteAllTasksStatement.run();
    tasks.forEach((task) => {
      upsertTaskStatement.run(taskToRow(task));
    });
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }

  return listTasks();
}

function resetTasks() {
  database.exec('BEGIN');

  try {
    deleteAllTasksStatement.run();
    INITIAL_TASKS.forEach((task) => {
      upsertTaskStatement.run(taskToRow(task));
    });
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }

  return listTasks();
}

function resetResources() {
  database.exec('BEGIN');

  try {
    deleteAllResourcesStatement.run();
    INITIAL_RESOURCES.forEach((resource) => {
      upsertResourceStatement.run(resourceToRow(resource));
    });
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }

  return listResources();
}

function ensureRequiredManagerResource() {
  const existingManager = rowToResource(
    selectResourceByEmailForAuthStatement.get(REQUIRED_MANAGER_EMAIL)
  );

  if (existingManager) {
    if (existingManager.role === 'Manager') {
      return;
    }

    saveResource({
      ...existingManager,
      role: 'Manager',
      passwordHash: existingManager.passwordHash,
      requiresPasswordChange: existingManager.requiresPasswordChange,
    });
    return;
  }

  upsertResourceStatement.run(
    resourceToRow(
      buildResourceWithPassword(
        {
          name: REQUIRED_MANAGER_NAME,
          email: REQUIRED_MANAGER_EMAIL,
          role: 'Manager',
        },
        DEFAULT_MANAGER_BOOTSTRAP_PASSWORD,
        'bootstrap'
      )
    )
  );
}

function initializeResourcePasswords() {
  const resources = selectAllResourcesStatement.all().map((resource) => getResourceById(resource.id));

  resources.forEach((resource) => {
    if (resource.passwordHash) {
      return;
    }

    upsertResourceStatement.run(
      resourceToRow(buildResourceWithPassword(resource, null, 'bootstrap'))
    );
  });
}

seedIfEmpty();
initializeResourcePasswords();
normalizeContributorBootstrapPasswords();
ensureRequiredManagerResource();
initializeSequencesFromData();

module.exports = {
  authenticateResource,
  changeResourcePassword,
  databasePath,
  deleteTask,
  deleteResource,
  listResources,
  listTasks,
  normalizeTask,
  normalizeResource,
  replaceTasks,
  resetResources,
  resetTasks,
  saveResource,
  saveTask,
};
