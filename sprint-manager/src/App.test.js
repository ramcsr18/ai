import { fireEvent, render, screen, within } from '@testing-library/react';
import App from './App';

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

test('renders Oracle SSO login with a development fallback', () => {
  render(<App />);

  expect(screen.getByRole('heading', { name: /sprint board/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /continue with oracle sso/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: /enter demo workspace/i })).toBeInTheDocument();
});

test('loads the dashboard after demo login', () => {
  render(<App />);

  fireEvent.change(screen.getByLabelText(/display name/i), {
    target: { value: 'Avery Chen' },
  });
  fireEvent.click(screen.getByRole('button', { name: /enter demo workspace/i }));

  expect(
    screen.getByRole('heading', { name: /sprint board/i, level: 1 })
  ).toBeInTheDocument();
  expect(screen.getByLabelText(/sprint task board/i)).toBeInTheDocument();
  expect(screen.getByText(/SSO onboarding flow/i)).toBeInTheDocument();
});

test('contributors can edit task fields', () => {
  render(<App />);

  fireEvent.change(screen.getByLabelText(/display name/i), {
    target: { value: 'Avery Chen' },
  });
  fireEvent.click(screen.getByRole('button', { name: /enter demo workspace/i }));

  expect(screen.getAllByLabelText(/priority/i)[0]).toBeEnabled();
  expect(screen.getAllByLabelText(/status/i)[0]).toBeEnabled();
  expect(screen.getAllByLabelText(/effort/i)[0]).toBeEnabled();
  expect(screen.getAllByLabelText(/blocked status/i)[0]).toBeEnabled();
  expect(screen.getAllByLabelText(/start date/i)[0]).toBeEnabled();
  expect(screen.getAllByLabelText(/end date/i)[0]).toBeEnabled();
  expect(screen.queryByText(/Burndown dashboard refresh/i)).not.toBeInTheDocument();
});

test('contributors can rename title and area from the note header', () => {
  render(<App />);

  fireEvent.change(screen.getByLabelText(/display name/i), {
    target: { value: 'Avery Chen' },
  });
  fireEvent.click(screen.getByRole('button', { name: /enter demo workspace/i }));

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

  fireEvent.change(screen.getByLabelText(/display name/i), {
    target: { value: 'Avery Chen' },
  });
  fireEvent.click(screen.getByRole('button', { name: /enter demo workspace/i }));

  expect(screen.getByLabelText(/owner/i)).toHaveValue('Avery Chen');
  expect(screen.getByLabelText(/owner/i)).toBeDisabled();

  fireEvent.change(screen.getByLabelText(/title/i), {
    target: { value: 'My new contributor task' },
  });
  fireEvent.click(screen.getByRole('button', { name: /add task/i }));

  expect(await screen.findByText(/My new contributor task/i)).toBeInTheDocument();
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

  fireEvent.doubleClick(screen.getByRole('button', { name: /avery chen/i }));
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

test('milestone is enabled only in completed stage', () => {
  render(<App />);

  fireEvent.change(screen.getByLabelText(/display name/i), {
    target: { value: 'Avery Chen' },
  });
  fireEvent.click(screen.getByRole('button', { name: /enter demo workspace/i }));

  expect(screen.getByLabelText(/milestone/i, { selector: '#task-milestone' })).toBeDisabled();

  fireEvent.change(screen.getByLabelText(/^status$/i, { selector: 'select#task-status' }), {
    target: { value: 'Completed' },
  });

  expect(screen.getByLabelText(/milestone/i, { selector: '#task-milestone' })).toBeEnabled();
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

  fireEvent.doubleClick(screen.getByRole('button', { name: /released feature pack/i }));

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
  const visibleDates = screen.getAllByText(/04\/1[3-8]/i).map((node) => node.textContent);
  expect(visibleDates).toEqual(['04/15', '04/14', '04/13']);
  expect(screen.queryByText('Comment 1')).not.toBeInTheDocument();
  expect(screen.queryByText('Comment 2')).not.toBeInTheDocument();
  expect(screen.queryByText('Comment 3')).not.toBeInTheDocument();
  expect(screen.getByText('Comment 4')).toBeInTheDocument();
  expect(screen.getByText('Comment 5')).toBeInTheDocument();
  expect(screen.getByText('Comment 6')).toBeInTheDocument();

  fireEvent.click(screen.getByText(/show 3 older comments/i));

  expect(screen.getByText('Comment 1')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /hide older comments/i })).toBeInTheDocument();
});
