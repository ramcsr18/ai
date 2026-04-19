import { INITIAL_RESOURCES, INITIAL_TASKS } from '../data/seedData';
import {
  normalizeResource,
  normalizeResources,
  normalizeTask,
  normalizeTasks,
} from '../utils/taskUtils';

const TASK_STORAGE_KEY = 'sprint-manager-tasks';
const RESOURCE_STORAGE_KEY = 'sprint-manager-resources';
const RESOURCE_AUTH_STORAGE_KEY = 'sprint-manager-resource-auth';
const TEST_CONTRIBUTOR_PASSWORD = 'Welcome1';
const TEST_MANAGER_PASSWORD = 'Welcome@123';

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

function readCachedTasks() {
  if (typeof window === 'undefined') {
    return [];
  }

  const storedTasks = window.localStorage.getItem(TASK_STORAGE_KEY);

  if (!storedTasks) {
    return [];
  }

  try {
    return normalizeTasks(JSON.parse(storedTasks));
  } catch {
    return [];
  }
}

function readTestResources() {
  if (typeof window === 'undefined') {
    return normalizeResources(INITIAL_RESOURCES);
  }

  const storedResources = window.localStorage.getItem(RESOURCE_STORAGE_KEY);

  if (!storedResources) {
    return normalizeResources(INITIAL_RESOURCES);
  }

  try {
    const parsedResources = JSON.parse(storedResources);
    const normalized = normalizeResources(parsedResources);

    return normalized.length ? normalized : normalizeResources(INITIAL_RESOURCES);
  } catch {
    return normalizeResources(INITIAL_RESOURCES);
  }
}

function writeTestResources(resources) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(RESOURCE_STORAGE_KEY, JSON.stringify(resources));
  }
}

function readCachedResources() {
  if (typeof window === 'undefined') {
    return [];
  }

  const storedResources = window.localStorage.getItem(RESOURCE_STORAGE_KEY);

  if (!storedResources) {
    return [];
  }

  try {
    return normalizeResources(JSON.parse(storedResources));
  } catch {
    return [];
  }
}

function readCachedResourceAuth() {
  if (typeof window === 'undefined') {
    return {};
  }

  const storedAuth = window.localStorage.getItem(RESOURCE_AUTH_STORAGE_KEY);

  if (!storedAuth) {
    return {};
  }

  try {
    const parsedAuth = JSON.parse(storedAuth);
    return parsedAuth && typeof parsedAuth === 'object' ? parsedAuth : {};
  } catch {
    return {};
  }
}

function writeResourceCache(resources) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(RESOURCE_STORAGE_KEY, JSON.stringify(resources));
  }
}

function writeResourceAuthCache(resourceAuth) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(RESOURCE_AUTH_STORAGE_KEY, JSON.stringify(resourceAuth));
  }
}

function writeTaskCache(tasks) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks));
  }
}

function hashPassword(password) {
  let hash = 5381;
  const normalized = String(password || '');

  for (let index = 0; index < normalized.length; index += 1) {
    hash = ((hash << 5) + hash) ^ normalized.charCodeAt(index);
  }

  return `local-${(hash >>> 0).toString(16)}`;
}

function getDefaultTestPasswordForResource(resource) {
  return resource?.role === 'Manager' ? TEST_MANAGER_PASSWORD : TEST_CONTRIBUTOR_PASSWORD;
}

function buildCachedAuthEntry(resource, password = getDefaultTestPasswordForResource(resource)) {
  return {
    email: normalizeIdentity(resource.email),
    name: resource.name || '',
    role: resource.role === 'Manager' ? 'Manager' : 'Contributor',
    passwordHash: hashPassword(password),
    requiresPasswordChange:
      resource.requiresPasswordChange !== undefined
        ? Boolean(resource.requiresPasswordChange)
        : true,
  };
}

function syncResourceAuthCache(resources, options = {}) {
  const currentAuth = readCachedResourceAuth();
  const nextAuth = {};
  const normalizedResources = normalizeResources(resources);

  normalizedResources.forEach((resource) => {
    const email = normalizeIdentity(resource.email);

    if (!email) {
      return;
    }

    const currentEntry = currentAuth[email];
    const providedPassword = options.passwordsByEmail?.[email];
    nextAuth[email] = {
      ...(currentEntry || buildCachedAuthEntry(resource, providedPassword)),
      email,
      name: resource.name || '',
      role: resource.role === 'Manager' ? 'Manager' : 'Contributor',
      requiresPasswordChange:
        resource.requiresPasswordChange !== undefined
          ? Boolean(resource.requiresPasswordChange)
          : currentEntry?.requiresPasswordChange ?? true,
    };

    if (providedPassword) {
      nextAuth[email].passwordHash = hashPassword(providedPassword);
      nextAuth[email].requiresPasswordChange =
        resource.requiresPasswordChange !== undefined
          ? Boolean(resource.requiresPasswordChange)
          : true;
    }
  });

  writeResourceAuthCache(nextAuth);
  return nextAuth;
}

function upsertCachedResourceAuth(resource, password) {
  const email = normalizeIdentity(resource.email);

  if (!email) {
    return;
  }

  const currentAuth = readCachedResourceAuth();
  const currentEntry = currentAuth[email];
  const nextAuth = {
    ...currentAuth,
    [email]: {
      ...(currentEntry || buildCachedAuthEntry(resource, password)),
      email,
      name: resource.name || '',
      role: resource.role === 'Manager' ? 'Manager' : 'Contributor',
      requiresPasswordChange:
        resource.requiresPasswordChange !== undefined
          ? Boolean(resource.requiresPasswordChange)
          : currentEntry?.requiresPasswordChange ?? true,
      passwordHash: password ? hashPassword(password) : currentEntry?.passwordHash,
    },
  };

  if (!nextAuth[email].passwordHash) {
    nextAuth[email].passwordHash = hashPassword(getDefaultTestPasswordForResource(resource));
  }

  writeResourceAuthCache(nextAuth);
}

function removeCachedResourceAuth(resource) {
  const email = normalizeIdentity(resource?.email);

  if (!email) {
    return;
  }

  const currentAuth = readCachedResourceAuth();
  const { [email]: _removed, ...nextAuth } = currentAuth;
  writeResourceAuthCache(nextAuth);
}

function renameCachedResourceAuth(previousResource, nextResource) {
  const previousEmail = normalizeIdentity(previousResource?.email);
  const nextEmail = normalizeIdentity(nextResource?.email);
  const currentAuth = readCachedResourceAuth();

  if (!nextEmail) {
    return;
  }

  const carriedEntry = (previousEmail && currentAuth[previousEmail]) || currentAuth[nextEmail];
  const nextAuth = { ...currentAuth };

  if (previousEmail && previousEmail !== nextEmail) {
    delete nextAuth[previousEmail];
  }

  nextAuth[nextEmail] = {
    ...(carriedEntry || buildCachedAuthEntry(nextResource)),
    email: nextEmail,
    name: nextResource.name || '',
    role: nextResource.role === 'Manager' ? 'Manager' : 'Contributor',
    requiresPasswordChange:
      nextResource.requiresPasswordChange !== undefined
        ? Boolean(nextResource.requiresPasswordChange)
        : carriedEntry?.requiresPasswordChange ?? true,
  };

  if (!nextAuth[nextEmail].passwordHash) {
    nextAuth[nextEmail].passwordHash = hashPassword(getDefaultTestPasswordForResource(nextResource));
  }

  writeResourceAuthCache(nextAuth);
}

function buildLocalUser(resource, requiresPasswordChange) {
  return {
    name: resource.name,
    email: resource.email,
    role: resource.role === 'Manager' ? 'admin' : 'user',
    registrationRole: resource.role === 'Manager' ? 'Manager' : 'Contributor',
    mustChangePassword: Boolean(requiresPasswordChange),
    authProvider: 'local',
  };
}

function mergeTaskIntoCache(task) {
  const cachedTasks = readCachedTasks();
  const hasCachedTask = cachedTasks.some(
    (cachedTask) => String(cachedTask.id) === String(task.id)
  );
  const nextTasks = hasCachedTask
    ? cachedTasks.map((cachedTask) =>
        String(cachedTask.id) === String(task.id) ? task : cachedTask
      )
    : [task, ...cachedTasks];
  writeTaskCache(nextTasks);
}

function mergeResourceIntoCache(resource) {
  const cachedResources = readCachedResources();
  const hasCachedResource = cachedResources.some(
    (cachedResource) => String(cachedResource.id) === String(resource.id)
  );
  const nextResources = hasCachedResource
    ? cachedResources.map((cachedResource) =>
        String(cachedResource.id) === String(resource.id) ? resource : cachedResource
      )
    : [...cachedResources, resource];
  writeResourceCache(nextResources.sort((left, right) => left.name.localeCompare(right.name)));
}

function normalizeIdentity(value) {
  return String(value || '').trim().toLowerCase();
}

function canRequesterAccessTask(requester, task) {
  if (!requester || !task) {
    return false;
  }

  if (requester.role === 'admin') {
    return true;
  }

  const assignee = normalizeIdentity(task.assignee);
  const requesterName = normalizeIdentity(requester.name);
  const requesterEmail = normalizeIdentity(requester.email);

  return assignee === requesterName || assignee === requesterEmail;
}

function buildLocalOpenTasksReport(requester, tasks) {
  const now = new Date();
  const normalizedRequester = requester || {};
  const visibleTasks = normalizeTasks(tasks).filter(
    (task) => task.status !== 'Completed' && canRequesterAccessTask(normalizedRequester, task)
  );

  const groupedBody = normalizedRequester.role === 'admin'
    ? [...visibleTasks.reduce((groups, task) => {
        const owner = task.assignee || 'Unassigned';
        const ownerTasks = groups.get(owner) || [];
        ownerTasks.push(task);
        groups.set(owner, ownerTasks);
        return groups;
      }, new Map()).entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([owner, ownerTasks]) => {
          const lines = ownerTasks.map(
            (task) => `- ${task.title} | ${task.status} | Due: ${task.end || 'N/A'}`
          );

          return `${owner}:\n${lines.join('\n')}`;
        })
        .join('\n\n')
    : visibleTasks
        .map((task) => `- ${task.title} | ${task.status} | Due: ${task.end || 'N/A'}`)
        .join('\n');

  return {
    sent: false,
    skipped: true,
    subject:
      normalizedRequester.role === 'admin'
        ? `Sprint Board open tasks report - ${now.toISOString().slice(0, 10)}`
        : `Sprint Board open tasks for ${normalizedRequester.name || 'user'} - ${now
            .toISOString()
            .slice(0, 10)}`,
    body:
      groupedBody ||
      (normalizedRequester.role === 'admin' ? 'No open tasks across the board.' : 'No open tasks.'),
    tasks: visibleTasks,
  };
}

async function requestJson(path, options = {}) {
  let response;

  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch (error) {
    throw new Error('Unable to reach the Sprint Board API.');
  }

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

export function getInitialResourceSnapshot() {
  if (isTestEnvironment()) {
    return readTestResources();
  }

  return [];
}

export async function fetchTasks() {
  if (isTestEnvironment()) {
    return readTestTasks();
  }

  const payload = await requestJson('/api/tasks');
  const tasks = normalizeTasks(payload.tasks);
  writeTaskCache(tasks);
  return tasks;
}

export async function fetchResources() {
  if (isTestEnvironment()) {
    return readTestResources();
  }

  const payload = await requestJson('/api/resources');
  const resources = normalizeResources(payload.resources);
  writeResourceCache(resources);
  syncResourceAuthCache(resources);
  return resources;
}

export async function loginWithPassword(email, password) {
  if (isTestEnvironment()) {
    const normalizedEmail = normalizeIdentity(email);
    const resource = readTestResources().find(
      (currentResource) => normalizeIdentity(currentResource.email) === normalizedEmail
    );

    if (!resource) {
      throw new Error('Invalid email or password.');
    }

    const currentAuth = readCachedResourceAuth();
    const authEntry =
      currentAuth[normalizedEmail] ||
      syncResourceAuthCache(readTestResources())[normalizedEmail];

    if (!authEntry || authEntry.passwordHash !== hashPassword(password)) {
      throw new Error('Invalid email or password.');
    }

    return {
      user: buildLocalUser(resource, authEntry.requiresPasswordChange),
    };
  }

  const payload = await requestJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  upsertCachedResourceAuth(
    {
      name: payload.user.name,
      email: payload.user.email,
      role: payload.user.registrationRole,
      requiresPasswordChange: payload.user.mustChangePassword,
    },
    password
  );
  return payload;
}

export async function changePassword(email, currentPassword, newPassword) {
  if (isTestEnvironment()) {
    const normalizedEmail = normalizeIdentity(email);
    const resources = readTestResources();
    const resource = resources.find(
      (currentResource) => normalizeIdentity(currentResource.email) === normalizedEmail
    );

    if (!resource) {
      throw new Error('Current password is incorrect.');
    }

    const currentAuth = readCachedResourceAuth();
    const authEntry =
      currentAuth[normalizedEmail] || syncResourceAuthCache(resources)[normalizedEmail];
    const currentPasswordHash = hashPassword(currentPassword);
    const expectedPasswordHash =
      authEntry?.passwordHash ||
      hashPassword(resource.temporaryPassword || getDefaultTestPasswordForResource(resource));

    if (currentPasswordHash !== expectedPasswordHash) {
      throw new Error('Current password is incorrect.');
    }

    const updatedResource = {
      ...resource,
      requiresPasswordChange: false,
      temporaryPassword: '',
    };
    writeTestResources(
      readTestResources().map((currentResource) =>
        String(currentResource.id) === String(updatedResource.id) ? updatedResource : currentResource
      )
    );
    upsertCachedResourceAuth(updatedResource, newPassword);

    return {
      user: buildLocalUser(updatedResource, false),
    };
  }

  const payload = await requestJson('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ email, currentPassword, newPassword }),
  });
  upsertCachedResourceAuth(
    {
      name: payload.user.name,
      email: payload.user.email,
      role: payload.user.registrationRole,
      requiresPasswordChange: false,
    },
    newPassword
  );
  return payload;
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

  const nextTask = normalizeTask(payload.task);
  mergeTaskIntoCache(nextTask);
  return nextTask;
}

export async function requestOpenTasksReport(requester, tasks = []) {
  if (isTestEnvironment()) {
    return buildLocalOpenTasksReport(requester, readTestTasks());
  }

  try {
    return await requestJson('/api/reports/open-tasks', {
      method: 'POST',
      body: JSON.stringify({ requester }),
    });
  } catch {
    return buildLocalOpenTasksReport(requester, tasks);
  }
}

export async function createResource(resource) {
  if (isTestEnvironment()) {
    const nextResource = normalizeResource({
      ...resource,
      temporaryPassword: getDefaultTestPasswordForResource(resource),
      requiresPasswordChange: true,
    });
    const currentResources = readTestResources();
    const nextResources = [...currentResources, nextResource];
    writeTestResources(nextResources);
    upsertCachedResourceAuth(nextResource, nextResource.temporaryPassword);
    return nextResource;
  }

  const payload = await requestJson('/api/resources', {
    method: 'POST',
    body: JSON.stringify(resource),
  });

  const nextResource = normalizeResource(payload.resource);
  mergeResourceIntoCache(nextResource);
  upsertCachedResourceAuth(nextResource, nextResource.temporaryPassword);
  return nextResource;
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

  const nextTask = normalizeTask(payload.task);
  mergeTaskIntoCache(nextTask);
  return nextTask;
}

export async function deleteTask(taskId) {
  if (isTestEnvironment()) {
    const nextTasks = readTestTasks().filter((task) => String(task.id) !== String(taskId));
    writeTestTasks(nextTasks);
    return nextTasks;
  }

  const payload = await requestJson(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
  });

  const nextTasks = normalizeTasks(payload.tasks);
  writeTaskCache(nextTasks);
  return nextTasks;
}

export async function saveResource(resource) {
  if (isTestEnvironment()) {
    const nextResource = normalizeResource(resource);
    const currentResources = readTestResources();
    const previousResource = currentResources.find(
      (currentResource) => String(currentResource.id) === String(nextResource.id)
    );
    const nextResources = currentResources.map((currentResource) =>
      String(currentResource.id) === String(nextResource.id) ? nextResource : currentResource
    );
    writeTestResources(nextResources);
    renameCachedResourceAuth(previousResource, nextResource);

    const currentTasks = readTestTasks();

    if (previousResource && previousResource.name !== nextResource.name) {
      const nextTasks = currentTasks.map((task) =>
        task.assignee === previousResource.name ? { ...task, assignee: nextResource.name } : task
      );
      writeTestTasks(nextTasks);
    }

    return nextResource;
  }

  const previousResource = readCachedResources().find(
    (currentResource) => String(currentResource.id) === String(resource.id)
  );
  const payload = await requestJson(`/api/resources/${encodeURIComponent(resource.id)}`, {
    method: 'PUT',
    body: JSON.stringify(resource),
  });

  const nextResource = normalizeResource(payload.resource);
  mergeResourceIntoCache(nextResource);
  renameCachedResourceAuth(previousResource, nextResource);
  return nextResource;
}

export async function deleteResource(resourceId) {
  if (isTestEnvironment()) {
    const currentResources = readTestResources();
    const deletedResource = currentResources.find(
      (resource) => String(resource.id) === String(resourceId)
    );
    const nextResources = currentResources.filter(
      (resource) => String(resource.id) !== String(resourceId)
    );
    writeTestResources(nextResources);
    removeCachedResourceAuth(deletedResource);
    return nextResources;
  }

  const payload = await requestJson(`/api/resources/${encodeURIComponent(resourceId)}`, {
    method: 'DELETE',
  });

  const nextResources = normalizeResources(payload.resources);
  writeResourceCache(nextResources);
  syncResourceAuthCache(nextResources);
  return nextResources;
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

  const nextTasks = normalizeTasks(payload.tasks);
  writeTaskCache(nextTasks);
  return nextTasks;
}
