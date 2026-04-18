import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

test('renders Oracle SSO login with a development fallback', () => {
  render(<App />);

  expect(screen.getByRole('heading', { name: /sprint manager/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /continue with oracle sso/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: /enter demo workspace/i })).toBeInTheDocument();
});

test('loads the dashboard after demo login', () => {
  render(<App />);

  fireEvent.change(screen.getByLabelText(/display name/i), {
    target: { value: 'Alex Morgan' },
  });
  fireEvent.click(screen.getByRole('button', { name: /enter demo workspace/i }));

  expect(
    screen.getByRole('heading', { name: /sprint manager/i, level: 1 })
  ).toBeInTheDocument();
  expect(screen.getByLabelText(/sprint task board/i)).toBeInTheDocument();
  expect(screen.getByText(/SSO onboarding flow/i)).toBeInTheDocument();
});

test('contributors can edit task fields', () => {
  render(<App />);

  fireEvent.change(screen.getByLabelText(/display name/i), {
    target: { value: 'Alex Morgan' },
  });
  fireEvent.click(screen.getByRole('button', { name: /enter demo workspace/i }));

  expect(screen.getAllByLabelText(/priority/i)[0]).toBeEnabled();
  expect(screen.getAllByLabelText(/status/i)[0]).toBeEnabled();
  expect(screen.getAllByLabelText(/start date/i)[0]).toBeEnabled();
  expect(screen.getAllByLabelText(/end date/i)[0]).toBeEnabled();
});

test('shows only the newest five comments until expanded', () => {
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

  expect(screen.getByText(/show 1 older comment/i)).toBeInTheDocument();
  expect(screen.queryByText('Comment 1')).not.toBeInTheDocument();

  fireEvent.click(screen.getByText(/show 1 older comment/i));

  expect(screen.getByText('Comment 1')).toBeInTheDocument();
});
