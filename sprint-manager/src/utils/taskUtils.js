const PRIORITY_RANK = {
  High: 0,
  Medium: 1,
  Low: 2,
};

const TEN_DAYS_IN_MS = 10 * 24 * 60 * 60 * 1000;

function normalizeComment(taskId, comment, index) {
  if (!comment) {
    return null;
  }

  if (typeof comment === 'string') {
    return {
      id: `${taskId}-legacy-comment-${index}`,
      text: comment.trim(),
      createdAt: new Date().toISOString(),
    };
  }

  return {
    id: comment.id || `${taskId}-comment-${index}`,
    text: (comment.text || '').trim(),
    createdAt: comment.createdAt || new Date().toISOString(),
  };
}

export function normalizeResource(resource) {
  if (!resource || typeof resource !== 'object') {
    return null;
  }

  const name = String(resource.name || '').trim();
  const email = String(resource.email || '').trim().toLowerCase();
  const role = String(resource.role || 'Contributor').trim() === 'Manager' ? 'Manager' : 'Contributor';
  const requiresPasswordChange = Boolean(
    resource.requiresPasswordChange ?? resource.require_password_change ?? true
  );
  const temporaryPassword = String(resource.temporaryPassword || '').trim();

  if (!name) {
    return null;
  }

  return {
    id: resource.id || `resource-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name,
    email,
    role,
    requiresPasswordChange,
    temporaryPassword,
  };
}

export function normalizeResources(resources) {
  return (Array.isArray(resources) ? resources : [])
    .map((resource) => normalizeResource(resource))
    .filter(Boolean);
}

export function normalizeTask(task) {
  const comments = Array.isArray(task.comments)
    ? task.comments
        .map((comment, index) => normalizeComment(task.id, comment, index))
        .filter((comment) => comment && comment.text)
    : task.comments
      ? [normalizeComment(task.id, task.comments, 0)].filter(Boolean)
      : [];

  return {
    ...task,
    priority: task.priority || 'Medium',
    bugUrl: task.bugUrl || '',
    comments,
    draftComment: task.draftComment || '',
  };
}

export function normalizeTasks(tasks) {
  return (Array.isArray(tasks) ? tasks : []).map(normalizeTask);
}

function parseDate(value) {
  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

export function getCurrentTimestamp() {
  return new Date().toISOString();
}

export function getDateInputValue(value) {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    const trimmedValue = value.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
      return trimmedValue;
    }
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString().slice(0, 10);
}

export function formatShortDate(dateString) {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
  }).format(date);
}

export function parseDisplayDate(value) {
  const rawValue = String(value || '').trim();

  if (!rawValue) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    return rawValue;
  }

  const shortMatch = rawValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);

  if (shortMatch) {
    const month = Number(shortMatch[1]);
    const day = Number(shortMatch[2]);
    const yearValue = shortMatch[3];
    const year = yearValue.length === 2 ? 2000 + Number(yearValue) : Number(yearValue);

    const parsedDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

    if (
      parsedDate.getUTCFullYear() === year &&
      parsedDate.getUTCMonth() === month - 1 &&
      parsedDate.getUTCDate() === day
    ) {
      return parsedDate.toISOString().slice(0, 10);
    }
  }

  const parsedDate = new Date(rawValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  return parsedDate.toISOString().slice(0, 10);
}

export function shouldDisplayTask(task, now = new Date()) {
  if (!task || task.status !== 'Completed') {
    return true;
  }

  const endTime = Date.parse(task.end);

  if (Number.isNaN(endTime)) {
    return true;
  }

  return now.getTime() - endTime <= TEN_DAYS_IN_MS;
}

export function sortTasksForStage(tasks) {
  return [...tasks].sort((left, right) => {
    const priorityDifference =
      (PRIORITY_RANK[left.priority] ?? 99) - (PRIORITY_RANK[right.priority] ?? 99);

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    const dueDateDifference = parseDate(left.end) - parseDate(right.end);

    if (dueDateDifference !== 0) {
      return dueDateDifference;
    }

    const startDateDifference = parseDate(left.start) - parseDate(right.start);

    if (startDateDifference !== 0) {
      return startDateDifference;
    }

    return left.title.localeCompare(right.title);
  });
}

export function createComment(text) {
  return {
    id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: text.trim(),
    createdAt: new Date().toISOString(),
  };
}

export function formatCommentDate(dateString) {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatFullDate(dateString) {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function isTaskOverdue(task, now = new Date()) {
  if (!task?.end) {
    return false;
  }

  const dueTime = Date.parse(task.end);

  if (Number.isNaN(dueTime)) {
    return false;
  }

  return dueTime < now.getTime();
}

export function getTaskTitleTone(task) {
  const now = new Date();
  const dueDate = new Date(task.end);
  const dueTime = dueDate.getTime();

  if (!Number.isNaN(dueTime)) {
    const daysUntilDue = Math.ceil((dueTime - now.getTime()) / (1000 * 60 * 60 * 24));

    if (isTaskOverdue(task, now)) {
      return 'title-overdue';
    }

    if (daysUntilDue <= 2 || task.priority === 'High') {
      return 'title-urgent';
    }
  }

  if (task.priority === 'Medium') {
    return 'title-watch';
  }

  return 'title-stable';
}

function normalizeIdentity(value) {
  return (value || '').trim().toLowerCase();
}

export function canUserAccessTask(user, task) {
  if (!user || !task) {
    return false;
  }

  if (user.role === 'admin') {
    return true;
  }

  const userName = normalizeIdentity(user.name);
  const userEmail = normalizeIdentity(user.email);
  const assignee = normalizeIdentity(task.assignee);

  return assignee === userName || assignee === userEmail;
}
