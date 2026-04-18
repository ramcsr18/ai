import { INITIAL_TASKS } from '../data/seedData';
import { normalizeTask, normalizeTasks } from '../utils/taskUtils';

const TASK_STORAGE_KEY = 'sprint-manager-tasks';

function normalizeApiBase(url) {
  return (url || '').trim().replace(/\/+$/, '');
}

function getApiBaseUrl() {
  const configuredUrl = normalizeApiBase(process.env.REACT_APP_API_BASE_URL);

  if (configuredUrl) {
    return configuredUrl;
  }

  if (typeof window !== 'undefined' && window.location.port === '3000') {
    return 'http://localhost:4000';
  }

  return '';
}

function isTestEnvironment() {
  return process.env.NODE_ENV === 'test';
}

function readTestTasks() {
  if (typeof window === 'undefined') {
    return normalizeTasks(INITIAL_TASKS);
  }

  const storedTasks = window.localStorage.getItem(TASK_STORAGE_KEY);

  if (!storedTasks) {
    return normalizeTasks(INITIAL_TASKS);
  }

  try {
    const parsedTasks = JSON.parse(storedTasks);
    const normalized = normalizeTasks(parsedTasks);

    return normalized.length ? normalized : normalizeTasks(INITIAL_TASKS);
  } catch {
    return normalizeTasks(INITIAL_TASKS);
  }
}

function writeTestTasks(tasks) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks));
  }
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || 'Task service request failed.');
  }

  return payload;
}

export function getInitialTaskSnapshot() {
  if (isTestEnvironment()) {
    return readTestTasks();
  }

  return [];
}

export async function fetchTasks() {
  if (isTestEnvironment()) {
    return readTestTasks();
  }

  const payload = await requestJson('/api/tasks');
  return normalizeTasks(payload.tasks);
}

export async function createTask(task) {
  if (isTestEnvironment()) {
    const nextTask = normalizeTask(task);
    const currentTasks = readTestTasks();
    const nextTasks = [nextTask, ...currentTasks];
    writeTestTasks(nextTasks);
    return nextTask;
  }

  const payload = await requestJson('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(task),
  });

  return normalizeTask(payload.task);
}

export async function saveTask(task) {
  if (isTestEnvironment()) {
    const nextTask = normalizeTask(task);
    const nextTasks = readTestTasks().map((currentTask) =>
      currentTask.id === nextTask.id ? nextTask : currentTask
    );
    writeTestTasks(nextTasks);
    return nextTask;
  }

  const payload = await requestJson(`/api/tasks/${encodeURIComponent(task.id)}`, {
    method: 'PUT',
    body: JSON.stringify(task),
  });

  return normalizeTask(payload.task);
}

export async function resetTasks() {
  if (isTestEnvironment()) {
    const nextTasks = normalizeTasks(INITIAL_TASKS);
    writeTestTasks(nextTasks);
    return nextTasks;
  }

  const payload = await requestJson('/api/tasks/reset', {
    method: 'POST',
  });

  return normalizeTasks(payload.tasks);
}
