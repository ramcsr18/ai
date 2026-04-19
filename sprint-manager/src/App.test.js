import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';

const ORIGINAL_ENV = { ...process.env };
const CONTRIBUTOR_DEFAULT_PASSWORD = 'Welcome1';

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  jest.useRealTimers();
  process.env.REACT_APP_ALLOW_DEMO_LOGIN = 'true';
  delete process.env.REACT_APP_ORACLE_DOMAIN_URL;
  delete process.env.REACT_APP_ORACLE_CLIENT_ID;
  delete process.env.REACT_APP_ORACLE_REDIRECT_URI;
  delete process.env.REACT_APP_ORACLE_ALLOWED_EMAIL_DOMAINS;
  delete process.env.REACT_APP_SPRINT_MANAGER_ADMIN_EMAILS;
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

async function loginAsResource(email = 'avery.chen@example.com') {
  fireEvent.change(screen.getByLabelText(/resource email/i), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText(/^password$/i), {
    target: { value: CONTRIBUTOR_DEFAULT_PASSWORD },
  });
  fireEvent.click(screen.getByRole('button', { name: /sign in with email/i }));
  await waitFor(() => {
    expect(screen.getByText(/change your temporary password/i)).toBeInTheDocument();
  });
  fireEvent.change(screen.getByLabelText(/current password/i), {
    target: { value: CONTRIBUTOR_DEFAULT_PASSWORD },
  });
  fireEvent.change(screen.getByLabelText(/^new password$/i), {
    target: { value: 'Changed@123' },
  });
  fireEvent.change(screen.getByLabelText(/confirm new password/i), {
    target: { value: 'Changed@123' },
  });
  fireEvent.click(screen.getByRole('button', { name: /update password/i }));
  await waitFor(() => {
    expect(screen.getByLabelText(/sprint task board/i)).toBeInTheDocument();
  });
}

async function signInWithPassword(email, password) {
  fireEvent.change(screen.getByLabelText(/resource email/i), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText(/^password$/i), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole('button', { name: /sign in with email/i }));
}

function expectSummaryValue(label, value) {
  const card = screen.getByText(label).closest('article');
  expect(card).not.toBeNull();
  expect(within(card).getByText(value)).toBeInTheDocument();
}

test('renders Oracle SSO login with a development fallback', () => {
  render(<App />);

  expect(screen.getByRole('heading', { name: /sprint board/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /sign in with email/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /continue with oracle sso/i })).not.toBeInTheDocument();
  expect(screen.getByText(/oracle sso is temporarily disabled\./i)).toBeInTheDocument();
});

test('keeps Oracle SSO hidden even when configuration is present', () => {
  process.env.REACT_APP_ALLOW_DEMO_LOGIN = 'false';
  process.env.REACT_APP_ORACLE_DOMAIN_URL = 'https://example.identity.oraclecloud.com';
  process.env.REACT_APP_ORACLE_CLIENT_ID = 'oracle-client-id';
  process.env.REACT_APP_ORACLE_REDIRECT_URI = 'http://localhost:3000';
  process.env.REACT_APP_ORACLE_ALLOWED_EMAIL_DOMAINS = 'oracle.com';
  process.env.REACT_APP_SPRINT_MANAGER_ADMIN_EMAILS = 'admin@oracle.com';

  render(<App />);

  expect(screen.queryByRole('button', { name: /sign in with email/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /continue with oracle sso/i })).not.toBeInTheDocument();
  expect(screen.getByText(/oracle sso is temporarily disabled\./i)).toBeInTheDocument();
});

test('loads the dashboard after demo login', async () => {
  render(<App />);

  await loginAsResource();

  expect(
    screen.getByRole('heading', { name: /sprint board/i, level: 1 })
  ).toBeInTheDocument();
  expect(screen.getByLabelText(/sprint task board/i)).toBeInTheDocument();
  expect(screen.getByText(/SSO onboarding flow/i)).toBeInTheDocument();
});

test('first-login password change allows sign in with the new password', async () => {
  render(<App />);

  await signInWithPassword('avery.chen@example.com', CONTRIBUTOR_DEFAULT_PASSWORD);
  expect(await screen.findByText(/change your temporary password/i)).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/current password/i), {
    target: { value: CONTRIBUTOR_DEFAULT_PASSWORD },
  });
  fireEvent.change(screen.getByLabelText(/^new password$/i), {
    target: { value: 'Changed@123' },
  });
  fireEvent.change(screen.getByLabelText(/confirm new password/i), {
    target: { value: 'Changed@123' },
  });
  fireEvent.click(screen.getByRole('button', { name: /update password/i }));

  await waitFor(() => {
    expect(screen.getByLabelText(/sprint task board/i)).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

  await signInWithPassword('avery.chen@example.com', 'Changed@123');

  await waitFor(() => {
    expect(screen.getByLabelText(/sprint task board/i)).toBeInTheDocument();
  });
  expect(screen.queryByText(/change your temporary password/i)).not.toBeInTheDocument();
});

test('logged in users can change password from the top panel', async () => {
  render(<App />);

  await loginAsResource();

  fireEvent.click(screen.getByRole('button', { name: /change password/i }));

  const passwordDialog = screen.getByRole('dialog', { name: /change password/i });
  fireEvent.change(within(passwordDialog).getByLabelText(/current password/i), {
    target: { value: 'Changed@123' },
  });
  fireEvent.change(within(passwordDialog).getByLabelText(/^new password$/i), {
    target: { value: 'Again@123' },
  });
  fireEvent.change(within(passwordDialog).getByLabelText(/confirm new password/i), {
    target: { value: 'Again@123' },
  });
  fireEvent.click(within(passwordDialog).getByRole('button', { name: /update password/i }));

  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: /change password/i })).not.toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

  await signInWithPassword('avery.chen@example.com', 'Again@123');

  await waitFor(() => {
    expect(screen.getByLabelText(/sprint task board/i)).toBeInTheDocument();
  });
});

test('contributors can edit task fields', async () => {
  render(<App />);

  await loginAsResource();

  expect(screen.getAllByLabelText(/priority/i)[0]).toBeEnabled();
  expect(screen.getAllByLabelText(/status/i)[0]).toBeEnabled();
  expect(screen.getAllByLabelText(/effort/i)[0]).toBeEnabled();
  expect(screen.getAllByLabelText(/blocked status/i)[0]).toBeEnabled();
  expect(screen.getAllByLabelText(/start date/i)[0]).toBeEnabled();
  expect(screen.getAllByLabelText(/end date/i)[0]).toBeEnabled();
  expect(screen.queryByText(/Burndown dashboard refresh/i)).not.toBeInTheDocument();
});

test('dashboard summary cards reflect the active filters', () => {
  window.localStorage.setItem(
    'sprint-manager-user',
    JSON.stringify({
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      authProvider: 'demo',
    })
  );

  window.localStorage.setItem(
    'sprint-manager-tasks',
    JSON.stringify([
      {
        id: 'task-alpha',
        title: 'Alpha integration',
        status: 'Implementation',
        effort: 5,
        start: '2026-04-18',
        end: '2026-04-22',
        assignee: 'Avery Chen',
        squad: 'BUILD',
        release: '',
        milestone: false,
        priority: 'High',
        blocked: false,
        bugUrl: '',
        draftComment: '',
        comments: [],
      },
      {
        id: 'task-beta',
        title: 'Beta release',
        status: 'Production',
        effort: 8,
        start: '2026-04-17',
        end: '2026-04-20',
        assignee: 'Jordan Lee',
        squad: 'BUILD',
        release: '',
        milestone: false,
        priority: 'Medium',
        blocked: true,
        bugUrl: '',
        draftComment: '',
        comments: [],
      },
      {
        id: 'task-gamma',
        title: 'Gamma rollout',
        status: 'Production',
        effort: 3,
        start: '2026-04-17',
        end: '2026-04-21',
        assignee: 'Jordan Lee',
        squad: 'BUILD',
        release: '',
        milestone: false,
        priority: 'Low',
        blocked: false,
        bugUrl: '',
        draftComment: '',
        comments: [],
      },
    ])
  );

  render(<App />);

  expectSummaryValue('Total tasks', '3');
  expectSummaryValue('Planned effort', '16h');
  expectSummaryValue('Production ready', '2');
  expectSummaryValue('Risks', '1');

  fireEvent.change(screen.getByLabelText(/filter by stage/i), {
    target: { value: 'Production' },
  });

  expectSummaryValue('Total tasks', '2');
  expectSummaryValue('Planned effort', '11h');
  expectSummaryValue('Production ready', '2');
  expectSummaryValue('Risks', '1');

  fireEvent.change(screen.getByLabelText(/search tasks/i), {
    target: { value: 'gamma' },
  });

  expectSummaryValue('Total tasks', '1');
  expectSummaryValue('Planned effort', '3h');
  expectSummaryValue('Production ready', '1');
  expectSummaryValue('Risks', '0');
});

test('uses a red header gradient for blocked or overdue tasks', () => {
  window.localStorage.setItem(
    'sprint-manager-user',
    JSON.stringify({
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      authProvider: 'demo',
    })
  );

  window.localStorage.setItem(
    'sprint-manager-tasks',
    JSON.stringify([
      {
        id: 'task-risk-overdue',
        title: 'Overdue task',
        status: 'Implementation',
        effort: 5,
        start: '2026-04-10',
        end: '2026-04-01',
        assignee: 'Avery Chen',
        squad: 'Platform',
        release: '',
        milestone: false,
        priority: 'Medium',
        blocked: false,
        bugUrl: '',
        draftComment: '',
        comments: [],
      },
      {
        id: 'task-risk-blocked',
        title: 'Blocked task',
        status: 'Testing',
        effort: 3,
        start: '2026-04-16',
        end: '2026-04-25',
        assignee: 'Jordan Lee',
        squad: 'Platform',
        release: '',
        milestone: false,
        priority: 'Low',
        blocked: true,
        bugUrl: '',
        draftComment: '',
        comments: [],
      },
    ])
  );

  render(<App />);

  const overdueHeader = screen
    .getByLabelText(/overdue task task card/i)
    .querySelector('.note-panel-meta');
  const blockedHeader = screen
    .getByLabelText(/blocked task task card/i)
    .querySelector('.note-panel-meta');

  expect(overdueHeader).toHaveStyle({
    background: 'linear-gradient(135deg, #ffd7d7, #b42318)',
  });
  expect(blockedHeader).toHaveStyle({
    background: 'linear-gradient(135deg, #ffd7d7, #b42318)',
  });
});

test('admins see a distinct header gradient for unassigned ingestion tasks', () => {
  window.localStorage.setItem(
    'sprint-manager-user',
    JSON.stringify({
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      authProvider: 'demo',
    })
  );

  window.localStorage.setItem(
    'sprint-manager-tasks',
    JSON.stringify([
      {
        id: 'task-unassigned-ingestion',
        title: 'Unassigned intake task',
        status: 'Ingestion',
        effort: 2,
        start: '2026-04-19',
        end: '2026-04-22',
        assignee: '',
        squad: 'Operations',
        release: '',
        milestone: false,
        priority: 'Low',
        blocked: false,
        bugUrl: '',
        draftComment: '',
        comments: [],
      },
    ])
  );

  render(<App />);

  const header = screen
    .getByLabelText(/unassigned intake task task card/i)
    .querySelector('.note-panel-meta');

  expect(header).toHaveStyle({
    background: 'linear-gradient(135deg, #e2e8f0, #64748b)',
  });
});

test('contributors can rename title and area from the note header', async () => {
  render(<App />);

  await loginAsResource();

  fireEvent.doubleClick(screen.getByRole('button', { name: 'Platform' }));
  fireEvent.change(screen.getByLabelText(/area for sso onboarding flow/i), {
    target: { value: 'Security' },
  });
  fireEvent.blur(screen.getByLabelText(/area for sso onboarding flow/i));

  fireEvent.doubleClick(screen.getByRole('button', { name: /^SSO onboarding flow$/i }));
  fireEvent.change(screen.getByLabelText(/title for sso onboarding flow/i), {
    target: { value: 'Oracle SSO onboarding' },
  });
  fireEvent.blur(screen.getByLabelText(/title for sso onboarding flow/i));

  expect(screen.getByRole('button', { name: 'Security' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Oracle SSO onboarding$/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Avery Chen$/i })).not.toBeInTheDocument();
});

test('contributors can create tasks only for themselves', async () => {
  render(<App />);

  await loginAsResource();

  fireEvent.click(screen.getByRole('button', { name: /create task/i }));

  expect(screen.getByLabelText(/owner/i)).toHaveValue('Avery Chen');
  expect(screen.getByLabelText(/owner/i)).toBeDisabled();

  fireEvent.change(screen.getByLabelText(/title/i), {
    target: { value: 'My new contributor task' },
  });
  fireEvent.click(screen.getByRole('button', { name: /add task/i }));

  expect(await screen.findByText(/My new contributor task/i)).toBeInTheDocument();
});

test('contributors cannot filter or search across other users tasks', async () => {
  render(<App />);

  await loginAsResource();

  expect(screen.queryByLabelText(/assignee/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/Burndown dashboard refresh/i)).not.toBeInTheDocument();
});

test('logged in users do not see the open tasks report action', async () => {
  render(<App />);

  await loginAsResource();
  expect(screen.queryByRole('button', { name: /email open tasks report/i })).not.toBeInTheDocument();
});

test('admins can add, edit, and delete team resources', async () => {
  window.localStorage.setItem(
    'sprint-manager-user',
    JSON.stringify({
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      authProvider: 'demo',
    })
  );

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /manage resources/i }));

  fireEvent.change(screen.getByLabelText(/^resource name$/i), {
    target: { value: 'Taylor Kim' },
  });
  fireEvent.change(screen.getByLabelText(/^resource email$/i), {
    target: { value: 'taylor.kim@example.com' },
  });
  fireEvent.click(screen.getByRole('button', { name: /add resource/i }));
  fireEvent.click(screen.getByRole('button', { name: /create task/i }));

  expect(
    await screen.findByRole('option', { name: /Taylor Kim - taylor.kim@example.com/i })
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

  const averyNameInput = screen.getByLabelText(/resource name for avery chen/i);

  fireEvent.change(averyNameInput, {
    target: { value: 'Avery Chen Updated' },
  });
  fireEvent.blur(averyNameInput);

  await waitFor(() => {
    expect(
      within(screen.getByLabelText(/sso onboarding flow task card/i)).getByRole('button', {
        name: /^Avery Chen Updated$/i,
      })
    ).toBeInTheDocument();
  });

  const averyEmailInput = screen.getByLabelText(/resource email for avery chen updated/i);
  fireEvent.change(averyEmailInput, {
    target: { value: 'avery.updated@example.com' },
  });
  fireEvent.blur(averyEmailInput);

  await waitFor(() => {
    expect(
      screen.getByLabelText(/resource email for avery chen updated/i)
    ).toHaveValue('avery.updated@example.com');
  });

  fireEvent.click(screen.getByRole('button', { name: /close resource management/i }));
  fireEvent.click(screen.getByRole('button', { name: /manage resources/i }));

  expect(
    screen.getByLabelText(/resource email for avery chen updated/i)
  ).toHaveValue('avery.updated@example.com');

  fireEvent.click(screen.getByRole('button', { name: /delete taylor kim/i }));
  fireEvent.click(screen.getByRole('button', { name: /create task/i }));

  await waitFor(() => {
    expect(
      screen.queryByRole('option', { name: /Taylor Kim - taylor.kim@example.com/i })
    ).not.toBeInTheDocument();
  });
});

test('admins can reassign task owner from the metadata row', () => {
  window.localStorage.setItem(
    'sprint-manager-user',
    JSON.stringify({
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      authProvider: 'demo',
    })
  );

  render(<App />);

  fireEvent.doubleClick(
    within(screen.getByLabelText(/sso onboarding flow task card/i)).getByRole('button', {
      name: /^avery chen$/i,
    })
  );
  const ownerInput = screen.getByLabelText(/owner for sso onboarding flow/i);
  fireEvent.change(ownerInput, {
    target: { value: 'Jordan Lee' },
  });
  fireEvent.blur(ownerInput);

  expect(screen.queryByLabelText(/owner for sso onboarding flow/i)).not.toBeInTheDocument();
  expect(
    within(screen.getByLabelText(/sso onboarding flow task card/i)).getByRole('button', {
      name: /^Jordan Lee$/i,
    })
  ).toBeInTheDocument();
});

test('admins can delete tasks with confirmation', async () => {
  window.localStorage.setItem(
    'sprint-manager-user',
    JSON.stringify({
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      authProvider: 'demo',
    })
  );

  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: /delete sso onboarding flow/i }));

  await waitFor(() => {
    expect(screen.queryByText(/sso onboarding flow/i)).not.toBeInTheDocument();
  });

  confirmSpy.mockRestore();
});

test('milestone is enabled only in completed stage', async () => {
  render(<App />);

  await loginAsResource();
  fireEvent.click(screen.getByRole('button', { name: /create task/i }));
  const createTaskDialog = screen.getByRole('dialog', { name: /create task/i });

  expect(within(createTaskDialog).getByRole('checkbox', { name: /milestone/i })).toBeDisabled();

  fireEvent.change(
    within(createTaskDialog).getByLabelText(/^status$/i, { selector: 'select#task-status' }),
    {
      target: { value: 'Completed' },
    }
  );

  expect(within(createTaskDialog).getByRole('checkbox', { name: /milestone/i })).toBeEnabled();
});

test('moving a task to completed stamps the end date to today', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-05-01T09:30:00.000Z'));

  render(<App />);

  await loginAsResource();

  fireEvent.change(
    within(screen.getByLabelText(/sso onboarding flow task card/i)).getByLabelText(
      /^Status for SSO onboarding flow$/i,
      {
        selector: 'select',
      }
    ),
    {
      target: { value: 'Completed' },
    }
  );

  await waitFor(() => {
    expect(
      within(screen.getByLabelText(/sso onboarding flow task card/i)).getByLabelText(
        /^End date for SSO onboarding flow$/i,
        { selector: 'input[type="date"]' }
      )
    ).toHaveValue('2026-05-01');
  });
});

test('displays task start and end dates in mm/dd/yy format', async () => {
  render(<App />);

  await loginAsResource();

  const taskCard = screen.getByLabelText(/sso onboarding flow task card/i);

  expect(
    within(taskCard).getByLabelText(/^Start date for SSO onboarding flow$/i, {
      selector: 'input[type="date"]',
    })
  ).toHaveValue('2026-04-13');
  expect(
    within(taskCard).getByLabelText(/^End date for SSO onboarding flow$/i, {
      selector: 'input[type="date"]',
    })
  ).toHaveValue('2026-04-19');
});

test('task title is not editable in completed stage', () => {
  window.localStorage.setItem(
    'sprint-manager-user',
    JSON.stringify({
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      authProvider: 'demo',
    })
  );

  window.localStorage.setItem(
    'sprint-manager-tasks',
    JSON.stringify([
      {
        id: 'task-complete',
        title: 'Released feature pack',
        status: 'Completed',
        effort: 5,
        start: '2026-04-10',
        end: '2026-04-18',
        assignee: 'Avery Chen',
        squad: 'Platform',
        release: '24.4',
        milestone: true,
        priority: 'High',
        blocked: false,
        bugUrl: '',
        draftComment: '',
        comments: [],
      },
    ])
  );

  render(<App />);

  fireEvent.doubleClick(screen.getByRole('button', { name: /^released feature pack$/i }));

  expect(screen.queryByLabelText(/title for released feature pack/i)).not.toBeInTheDocument();
});

test('shows only the newest three comments until expanded', () => {
  window.localStorage.setItem(
    'sprint-manager-user',
    JSON.stringify({
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      authProvider: 'demo',
    })
  );

  window.localStorage.setItem(
    'sprint-manager-tasks',
    JSON.stringify([
      {
        id: 'task-comments',
        title: 'Comment heavy task',
        status: 'Ingestion',
        effort: 5,
        start: '2026-04-10',
        end: '2026-04-20',
        assignee: 'Avery Chen',
        squad: 'Platform',
        priority: 'High',
        blocked: false,
        bugUrl: '',
        draftComment: '',
        comments: Array.from({ length: 6 }, (_, index) => ({
          id: `comment-${index}`,
          text: `Comment ${index + 1}`,
          createdAt: `2026-04-${10 + index}T10:00:00.000Z`,
        })),
      },
    ])
  );

  render(<App />);

  expect(screen.getByText(/show 3 older comments/i)).toBeInTheDocument();
  const recentComments = screen.getByLabelText(/comment heavy task recent comments/i);
  const visibleDates = within(recentComments)
    .getAllByText(/04\/1[3-8]/i)
    .map((node) => node.textContent);
  expect(visibleDates).toEqual(['04/15', '04/14', '04/13']);
  expect(screen.queryByText('Comment 1')).not.toBeInTheDocument();
  expect(screen.queryByText('Comment 2')).not.toBeInTheDocument();
  expect(screen.queryByText('Comment 3')).not.toBeInTheDocument();
  expect(within(recentComments).getByText('Comment 4')).toBeInTheDocument();
  expect(within(recentComments).getByText('Comment 5')).toBeInTheDocument();
  expect(within(recentComments).getByText('Comment 6')).toBeInTheDocument();

  fireEvent.click(screen.getByText(/show 3 older comments/i));

  expect(screen.getByLabelText(/comment heavy task comment history/i)).toBeInTheDocument();
  expect(screen.getByText('Comment 1')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /hide older comments/i })).toBeInTheDocument();
});

test('edits an existing comment inline without changing its timestamp', async () => {
  window.localStorage.setItem(
    'sprint-manager-user',
    JSON.stringify({
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      authProvider: 'demo',
    })
  );

  window.localStorage.setItem(
    'sprint-manager-tasks',
    JSON.stringify([
      {
        id: 'task-comments-edit',
        title: 'Editable comment task',
        status: 'Ingestion',
        effort: 5,
        start: '2026-04-10',
        end: '2026-04-20',
        assignee: 'Avery Chen',
        squad: 'Platform',
        priority: 'High',
        blocked: false,
        bugUrl: '',
        draftComment: '',
        comments: Array.from({ length: 5 }, (_, index) => ({
          id: `comment-${index + 1}`,
          text: `Comment ${index + 1}`,
          createdAt: `2026-04-${10 + index}T10:00:00.000Z`,
        })),
      },
    ])
  );

  render(<App />);

  fireEvent.click(screen.getByText(/show 2 older comments/i));
  fireEvent.doubleClick(screen.getByText('Comment 2'));

  const editor = screen.getByLabelText(/edit comment for editable comment task/i);
  fireEvent.change(editor, {
    target: { value: 'Comment 2 updated without changing date' },
  });
  fireEvent.blur(editor);

  await waitFor(() => {
    expect(screen.getByText('Comment 2 updated without changing date')).toBeInTheDocument();
  });

  const storedTasks = JSON.parse(window.localStorage.getItem('sprint-manager-tasks'));
  const storedComment = storedTasks[0].comments.find((comment) => comment.id === 'comment-2');

  expect(storedComment.text).toBe('Comment 2 updated without changing date');
  expect(storedComment.createdAt).toBe('2026-04-11T10:00:00.000Z');
});

test('contributors cannot inline edit existing comments', () => {
  window.localStorage.setItem(
    'sprint-manager-user',
    JSON.stringify({
      name: 'Avery Chen',
      email: 'avery.chen@example.com',
      role: 'user',
      authProvider: 'demo',
    })
  );

  window.localStorage.setItem(
    'sprint-manager-tasks',
    JSON.stringify([
      {
        id: 'task-comment-permissions',
        title: 'Contributor comment permissions',
        status: 'Ingestion',
        effort: 5,
        start: '2026-04-10',
        end: '2026-04-20',
        assignee: 'Avery Chen',
        squad: 'Platform',
        priority: 'High',
        blocked: false,
        bugUrl: '',
        draftComment: '',
        comments: [
          {
            id: 'comment-1',
            text: 'Contributor visible comment',
            createdAt: '2026-04-15T10:00:00.000Z',
          },
        ],
      },
    ])
  );

  render(<App />);

  fireEvent.doubleClick(screen.getByText('Contributor visible comment'));

  expect(
    screen.queryByLabelText(/edit comment for contributor comment permissions/i)
  ).not.toBeInTheDocument();
});

test('adds a new comment on enter without an add comment button', async () => {
  render(<App />);

  await loginAsResource();

  expect(screen.queryByRole('button', { name: /add comment/i })).not.toBeInTheDocument();

  const commentInput = within(
    screen.getByLabelText(/sso onboarding flow comments/i)
  ).getByLabelText(/add comment for sso onboarding flow/i);

  fireEvent.change(commentInput, {
    target: { value: 'Keyboard submitted comment' },
  });
  fireEvent.keyDown(commentInput, {
    key: 'Enter',
    code: 'Enter',
    charCode: 13,
  });

  await waitFor(() => {
    expect(screen.getByText('Keyboard submitted comment')).toBeInTheDocument();
  });
});

test('hides completed tasks that are older than ten days', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-04-18T09:30:00.000Z'));

  window.localStorage.setItem(
    'sprint-manager-user',
    JSON.stringify({
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      authProvider: 'demo',
    })
  );

  window.localStorage.setItem(
    'sprint-manager-tasks',
    JSON.stringify([
      {
        id: 'task-completed-old',
        title: 'Old completed task',
        status: 'Completed',
        effort: 3,
        start: '2026-03-20',
        end: '2026-04-01T08:00:00.000Z',
        assignee: 'Avery Chen',
        squad: 'Platform',
        release: '',
        milestone: true,
        priority: 'Medium',
        blocked: false,
        bugUrl: '',
        draftComment: '',
        comments: [],
      },
      {
        id: 'task-completed-recent',
        title: 'Recent completed task',
        status: 'Completed',
        effort: 2,
        start: '2026-04-05',
        end: '2026-04-14T08:00:00.000Z',
        assignee: 'Jordan Lee',
        squad: 'Platform',
        release: '',
        milestone: true,
        priority: 'Low',
        blocked: false,
        bugUrl: '',
        draftComment: '',
        comments: [],
      },
    ])
  );

  render(<App />);

  expect(screen.queryByText(/old completed task/i)).not.toBeInTheDocument();
  expect(screen.getByText(/recent completed task/i)).toBeInTheDocument();
});

test('switches the active task in a stage pile on click', () => {
  window.localStorage.setItem(
    'sprint-manager-user',
    JSON.stringify({
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      authProvider: 'demo',
    })
  );

  window.localStorage.setItem(
    'sprint-manager-tasks',
    JSON.stringify([
      {
        id: 'task-pile-1',
        title: 'First piled task',
        status: 'Implementation',
        effort: 5,
        start: '2026-04-10',
        end: '2026-04-20',
        assignee: 'Avery Chen',
        squad: 'Platform',
        release: '',
        milestone: false,
        priority: 'High',
        blocked: false,
        bugUrl: '',
        draftComment: '',
        comments: [],
      },
      {
        id: 'task-pile-2',
        title: 'Second piled task',
        status: 'Implementation',
        effort: 5,
        start: '2026-04-11',
        end: '2026-04-21',
        assignee: 'Jordan Lee',
        squad: 'Platform',
        release: '',
        milestone: false,
        priority: 'Medium',
        blocked: false,
        bugUrl: '',
        draftComment: '',
        comments: [],
      },
    ])
  );

  render(<App />);

  const firstCard = screen.getByLabelText(/first piled task task card/i);
  const secondCard = screen.getByLabelText(/second piled task task card/i);

  expect(firstCard).toHaveClass('sticky-note-active');
  expect(secondCard).not.toHaveClass('sticky-note-active');

  fireEvent.click(secondCard);

  expect(secondCard).toHaveClass('sticky-note-active');
  expect(firstCard).not.toHaveClass('sticky-note-active');
});

test('enables drag only from the task header', async () => {
  render(<App />);

  await loginAsResource();

  const taskCard = screen.getByLabelText(/sso onboarding flow task card/i);
  const dragHeader = taskCard.querySelector('.sticky-note-drag-header');

  expect(taskCard).not.toHaveAttribute('draggable', 'true');
  expect(dragHeader).toHaveAttribute('draggable', 'true');
});

test('demo login rejects emails that are not registered resources', async () => {
  render(<App />);

  fireEvent.change(screen.getByLabelText(/resource email/i), {
    target: { value: 'unknown.person@example.com' },
  });
  fireEvent.change(screen.getByLabelText(/^password$/i), {
    target: { value: CONTRIBUTOR_DEFAULT_PASSWORD },
  });
  fireEvent.click(screen.getByRole('button', { name: /sign in with email/i }));

  expect(
    await screen.findByText(/invalid email or password\./i)
  ).toBeInTheDocument();
  expect(screen.queryByLabelText(/sprint task board/i)).not.toBeInTheDocument();
});
