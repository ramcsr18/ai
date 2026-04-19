const { listResources, listTasks } = require('./taskStore');
const { getEmailConfig, normalizeList, sendEmail } = require('./emailService');

const DAILY_REPORT_HOUR = Number(process.env.SPRINT_BOARD_DAILY_REPORT_HOUR || 8);
const DAILY_REPORT_MINUTE = Number(process.env.SPRINT_BOARD_DAILY_REPORT_MINUTE || 0);

function normalizeIdentity(value) {
  return String(value || '').trim().toLowerCase();
}

function isTaskOverdue(task, now = new Date()) {
  const dueTime = Date.parse(task?.end || '');

  if (Number.isNaN(dueTime)) {
    return false;
  }

  return dueTime < now.getTime();
}

function canUserAccessTask(user, task) {
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

function formatTaskLine(task, now = new Date()) {
  const markers = [];

  if (task.blocked) {
    markers.push('Blocked');
  }

  if (task.priority === 'High') {
    markers.push('High priority');
  }

  if (isTaskOverdue(task, now)) {
    markers.push('Overdue');
  }

  const markerText = markers.length ? ` [${markers.join(', ')}]` : '';

  return `- ${task.title} | ${task.status} | Owner: ${task.assignee || 'Unassigned'} | Due: ${task.end || 'N/A'}${markerText}`;
}

function buildGroupedTaskSections(tasks, now = new Date()) {
  const groups = new Map();

  tasks.forEach((task) => {
    const key = task.assignee || 'Unassigned';

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(task);
  });

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([owner, ownerTasks]) => [`${owner}:`, ...ownerTasks.map((task) => formatTaskLine(task, now))].join('\n'))
    .join('\n\n');
}

function buildOpenTasksReport(user, tasks, now = new Date()) {
  const openTasks = tasks
    .filter((task) => task.status !== 'Completed')
    .filter((task) => canUserAccessTask(user, task));

  const subject =
    user.role === 'admin'
      ? `Sprint Board open tasks report - ${now.toISOString().slice(0, 10)}`
      : `Sprint Board open tasks for ${user.name} - ${now.toISOString().slice(0, 10)}`;
  const body = user.role === 'admin'
    ? buildGroupedTaskSections(openTasks, now) || 'No open tasks.'
    : openTasks.map((task) => formatTaskLine(task, now)).join('\n') || 'No open tasks.';

  return {
    subject,
    body: `Hello ${user.name},\n\nHere is your requested Sprint Board report.\n\n${body}\n`,
    tasks: openTasks,
  };
}

function getAdminEmails() {
  const config = getEmailConfig();
  const direct = normalizeList(process.env.SPRINT_MANAGER_ADMIN_EMAILS);
  const legacy = normalizeList(process.env.REACT_APP_SPRINT_MANAGER_ADMIN_EMAILS);

  return [...new Set([...(config.adminEmails || []), ...direct, ...legacy])];
}

async function sendOpenTasksReport(requester) {
  const report = buildOpenTasksReport(requester, listTasks());
  const mailResult = await sendEmail({
    to: [requester.email],
    cc: requester.role === 'admin' ? getAdminEmails().filter((email) => email !== requester.email) : [],
    subject: report.subject,
    text: report.body,
  });

  return {
    ...report,
    ...mailResult,
  };
}

function buildDailyDigest(resource, tasks, now = new Date()) {
  const riskyTasks = tasks.filter(
    (task) =>
      task.status !== 'Completed' &&
      task.assignee === resource.name &&
      (task.blocked || task.priority === 'High' || isTaskOverdue(task, now))
  );

  return {
    riskyTasks,
    subject: `Sprint Board daily focus items - ${resource.name} - ${now.toISOString().slice(0, 10)}`,
    body: `Hello ${resource.name},\n\nHere are your blocked, high priority, or overdue tasks.\n\n${
      riskyTasks.map((task) => formatTaskLine(task, now)).join('\n') || 'No items today.'
    }\n`,
  };
}

async function sendDailyTaskSummaryReports(now = new Date()) {
  const tasks = listTasks();
  const resources = listResources().filter((resource) => resource.email);
  const adminEmails = getAdminEmails();
  const results = [];

  for (const resource of resources) {
    const digest = buildDailyDigest(resource, tasks, now);

    if (!digest.riskyTasks.length) {
      results.push({
        email: resource.email,
        sent: false,
        skipped: true,
        reason: 'No blocked, high priority, or overdue tasks.',
      });
      continue;
    }

    const mailResult = await sendEmail({
      to: [resource.email],
      cc: adminEmails.filter((email) => email !== resource.email),
      subject: digest.subject,
      text: digest.body,
    });

    results.push({
      email: resource.email,
      ...mailResult,
    });
  }

  return results;
}

function scheduleNextDailyRun() {
  const now = new Date();
  const nextRun = new Date(now);

  nextRun.setHours(DAILY_REPORT_HOUR, DAILY_REPORT_MINUTE, 0, 0);

  if (nextRun.getTime() <= now.getTime()) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  return nextRun.getTime() - now.getTime();
}

function startDailySummaryScheduler() {
  const run = async () => {
    try {
      await sendDailyTaskSummaryReports(new Date());
    } catch (error) {
      console.error('Unable to send daily task summary reports:', error.message);
    } finally {
      setTimeout(run, scheduleNextDailyRun());
    }
  };

  setTimeout(run, scheduleNextDailyRun());
}

module.exports = {
  buildOpenTasksReport,
  sendDailyTaskSummaryReports,
  sendOpenTasksReport,
  startDailySummaryScheduler,
};
