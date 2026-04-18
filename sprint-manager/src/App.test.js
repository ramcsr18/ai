import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  jest.useRealTimers();
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

test('moving a task to completed stamps the end date to today', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-05-01T09:30:00.000Z'));

  render(<App />);

  fireEvent.change(screen.getByLabelText(/display name/i), {
    target: { value: 'Avery Chen' },
  });
  fireEvent.click(screen.getByRole('button', { name: /enter demo workspace/i }));

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

test('displays task start and end dates in mm/dd/yy format', () => {
  render(<App />);

  fireEvent.change(screen.getByLabelText(/display name/i), {
    target: { value: 'Avery Chen' },
  });
  fireEvent.click(screen.getByRole('button', { name: /enter demo workspace/i }));

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

  fireEvent.change(screen.getByLabelText(/display name/i), {
    target: { value: 'Avery Chen' },
  });
  fireEvent.click(screen.getByRole('button', { name: /enter demo workspace/i }));

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

test('enables drag only from the task header', () => {
  render(<App />);

  fireEvent.change(screen.getByLabelText(/display name/i), {
    target: { value: 'Avery Chen' },
  });
  fireEvent.click(screen.getByRole('button', { name: /enter demo workspace/i }));

  const taskCard = screen.getByLabelText(/sso onboarding flow task card/i);
  const dragHeader = taskCard.querySelector('.sticky-note-drag-header');

  expect(taskCard).not.toHaveAttribute('draggable', 'true');
  expect(dragHeader).toHaveAttribute('draggable', 'true');
});
