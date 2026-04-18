const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { INITIAL_TASKS } = require('./seedData');

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

  initializeSequence('task_id', maxTaskId + 1 || 1);
  initializeSequence('comment_id', maxCommentId + 1 || 1);
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

function seedIfEmpty() {
  const { count } = countTasksStatement.get();

  if (count > 0) {
    return;
  }

  database.exec('BEGIN');

  try {
    INITIAL_TASKS.forEach((task) => {
      upsertTaskStatement.run(taskToRow(task));
    });
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function listTasks() {
  return selectAllTasksStatement.all().map(rowToTask);
}

function getTaskById(id) {
  return rowToTask(selectTaskStatement.get(id));
}

function saveTask(task) {
  const row = taskToRow(task);
  upsertTaskStatement.run(row);

  return getTaskById(row.id);
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

seedIfEmpty();
initializeSequencesFromData();

module.exports = {
  databasePath,
  listTasks,
  normalizeTask,
  replaceTasks,
  resetTasks,
  saveTask,
};
