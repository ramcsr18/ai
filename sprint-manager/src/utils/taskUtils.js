const PRIORITY_RANK = {
  High: 0,
  Medium: 1,
  Low: 2,
};

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

export function getTaskTitleTone(task) {
  const now = new Date();
  const dueDate = new Date(task.end);
  const dueTime = dueDate.getTime();

  if (!Number.isNaN(dueTime)) {
    const daysUntilDue = Math.ceil((dueTime - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilDue < 0) {
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
