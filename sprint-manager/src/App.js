import { useEffect, useState } from 'react';
import './App.css';
import KanbanBoard from './components/KanbanBoard';
import { AuthProvider, useAuth } from './context/AuthContext';
import { INITIAL_TASKS, STAGES, TEAM_MEMBERS } from './data/seedData';
import { normalizeTasks, normalizeTask } from './utils/taskUtils';

const TASK_STORAGE_KEY = 'sprint-manager-tasks';

function readStoredTasks() {
  if (typeof window === 'undefined') {
    return normalizeTasks(INITIAL_TASKS);
  }

  const storedTasks = window.localStorage.getItem(TASK_STORAGE_KEY);

  if (!storedTasks) {
    return normalizeTasks(INITIAL_TASKS);
  }

  try {
    const parsedTasks = JSON.parse(storedTasks);

    return normalizeTasks(parsedTasks).length
      ? normalizeTasks(parsedTasks)
      : normalizeTasks(INITIAL_TASKS);
  } catch {
    return normalizeTasks(INITIAL_TASKS);
  }
}

function LoginScreen() {
  const {
    loginDemo,
    startOracleLogin,
    authStatus,
    authError,
    isOracleConfigured,
    canUseDemoLogin,
  } = useAuth();
  const [credentials, setCredentials] = useState({
    name: '',
    role: 'user',
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    loginDemo(credentials);
  };

  return (
    <main className="app-shell login-shell">
      <section className="hero-card">
        <p className="eyebrow">Sprint Intelligence</p>
        <h1>Sprint Manager</h1>
        <p className="hero-copy">
          Move sticky notes across delivery stages, triage work by priority and due date,
          and keep a dated activity trail on every task.
        </p>

        <div className="hero-highlights">
          <div>
            <strong>Oracle SSO-ready</strong>
            <span>Uses Oracle IAM / IDCS OAuth endpoints with PKCE for browser sign-in.</span>
          </div>
          <div>
            <strong>Autosaved task board</strong>
            <span>Board edits, task metadata, and comment drafts persist automatically.</span>
          </div>
        </div>
      </section>

      <section className="login-card">
        <p className="eyebrow">Workspace access</p>
        <h2>Sign in with Oracle SSO</h2>
        <p className="login-copy">
          Employee access is validated from the Oracle profile email before the workspace is
          unlocked.
        </p>

        {authError ? <div className="status-banner error-banner">{authError}</div> : null}

        <button
          type="button"
          className="primary-button"
          onClick={startOracleLogin}
          disabled={!isOracleConfigured || authStatus === 'redirecting' || authStatus === 'authenticating'}
        >
          {authStatus === 'redirecting'
            ? 'Redirecting to Oracle'
            : authStatus === 'authenticating'
              ? 'Completing sign-in'
              : 'Continue with Oracle SSO'}
        </button>

        {!isOracleConfigured ? (
          <p className="muted-text">
            Configure the Oracle environment variables to enable enterprise SSO.
          </p>
        ) : null}

        {canUseDemoLogin ? (
          <form className="login-form demo-form" onSubmit={handleSubmit}>
            <p className="eyebrow">Development fallback</p>

            <label htmlFor="name">Display name</label>
            <input
              id="name"
              type="text"
              value={credentials.name}
              onChange={(event) =>
                setCredentials((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Alex Morgan"
            />

            <label htmlFor="role">Role</label>
            <select
              id="role"
              value={credentials.role}
              onChange={(event) =>
                setCredentials((current) => ({ ...current, role: event.target.value }))
              }
            >
              <option value="user">Contributor</option>
              <option value="admin">Admin</option>
            </select>

            <button type="submit" className="ghost-button">
              Enter demo workspace
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}

function Dashboard() {
  const { user, logout } = useAuth();
  const [tasks, setTasks] = useState(readStoredTasks);
  const [searchTerm, setSearchTerm] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [newTask, setNewTask] = useState({
    title: '',
    assignee: TEAM_MEMBERS[0],
    status: STAGES[0],
    effort: 8,
    start: '2026-04-20',
    end: '2026-04-24',
    squad: 'Platform',
    priority: 'Medium',
    blocked: false,
    bugUrl: '',
    comments: [],
    draftComment: '',
  });

  useEffect(() => {
    window.localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  const updateTask = (taskId, patch) => {
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === taskId ? normalizeTask({ ...task, ...patch }) : task
      )
    );
  };

  const updateCommentDraft = (taskId, draftComment) => {
    updateTask(taskId, { draftComment });
  };

  const addComment = (taskId, comment) => {
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === taskId
          ? normalizeTask({
              ...task,
              comments: [comment, ...task.comments],
              draftComment: '',
            })
          : task
      )
    );
  };

  const addTask = (event) => {
    event.preventDefault();

    const title = newTask.title.trim();

    if (!title) {
      return;
    }

    setTasks((currentTasks) => [
      normalizeTask({
        ...newTask,
        title,
        effort: Number(newTask.effort),
        id: `task-${Date.now()}`,
      }),
      ...currentTasks,
    ]);

    setNewTask((current) => ({
      ...current,
      title: '',
      bugUrl: '',
      comments: [],
      draftComment: '',
      effort: 8,
      blocked: false,
      status: STAGES[0],
      priority: 'Medium',
    }));
  };

  const resetBoard = () => {
    setTasks(normalizeTasks(INITIAL_TASKS));
  };

  const visibleTasks = tasks.filter((task) => {
    const normalizedSearchTerm = searchTerm.trim().toLowerCase();
    const commentText = task.comments.map((comment) => comment.text).join(' ').toLowerCase();
    const matchesSearch =
      !normalizedSearchTerm ||
      task.title.toLowerCase().includes(normalizedSearchTerm) ||
      task.squad.toLowerCase().includes(normalizedSearchTerm) ||
      commentText.includes(normalizedSearchTerm);

    const matchesAssignee =
      assigneeFilter === 'all' || task.assignee === assigneeFilter;

    const matchesStage = stageFilter === 'all' || task.status === stageFilter;

    return matchesSearch && matchesAssignee && matchesStage;
  });

  const totalEffort = tasks.reduce((sum, task) => sum + task.effort, 0);
  const productionCount = tasks.filter((task) => task.status === 'Production').length;
  const blockedCount = tasks.filter((task) => task.blocked).length;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Employee delivery workspace</p>
          <h1>Sprint Manager</h1>
          <p className="topbar-copy">
            Sticky notes can be dragged between stages, and cards stack automatically by
            priority and due date.
          </p>
        </div>

        <div className="user-card">
          <span className="user-chip">{user.role === 'admin' ? 'Admin' : 'Contributor'}</span>
          <span className="user-name">{user.name}</span>
          <span className="muted-text">{user.email}</span>
          <button type="button" className="ghost-button" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <section className="summary-grid" aria-label="Sprint summary">
        <article className="summary-card">
          <p className="eyebrow">Total tasks</p>
          <strong>{tasks.length}</strong>
          <span>{visibleTasks.length} visible with current filters</span>
        </article>
        <article className="summary-card">
          <p className="eyebrow">Planned effort</p>
          <strong>{totalEffort}h</strong>
          <span>Across all active sprint work items</span>
        </article>
        <article className="summary-card">
          <p className="eyebrow">Production ready</p>
          <strong>{productionCount}</strong>
          <span>Items delivered to production</span>
        </article>
        <article className="summary-card">
          <p className="eyebrow">Risks</p>
          <strong>{blockedCount}</strong>
          <span>Blocked items needing attention</span>
        </article>
      </section>

      <section className="toolbar-card">
        <div className="toolbar-grid">
          <div className="toolbar-field">
            <label htmlFor="search">Search tasks</label>
            <input
              id="search"
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search title, squad, or comments"
            />
          </div>

          <div className="toolbar-field">
            <label htmlFor="assignee">Assignee</label>
            <select
              id="assignee"
              value={assigneeFilter}
              onChange={(event) => setAssigneeFilter(event.target.value)}
            >
              <option value="all">All owners</option>
              {TEAM_MEMBERS.map((member) => (
                <option key={member} value={member}>
                  {member}
                </option>
              ))}
            </select>
          </div>

          <div className="toolbar-field">
            <select
              id="stage"
              value={stageFilter}
              onChange={(event) => setStageFilter(event.target.value)}
              aria-label="Filter by stage"
              title="Filter by stage"
            >
              <option value="all">All stages</option>
              {STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </div>

          <div className="toolbar-actions">
            <button type="button" className="ghost-button" onClick={resetBoard}>
              Reset sample data
            </button>
          </div>
        </div>
      </section>

      {user.role === 'admin' ? (
        <section className="composer-card">
          <div className="composer-header">
            <div>
              <p className="eyebrow">Admin controls</p>
              <h2>Create task</h2>
            </div>
            <p className="muted-text">New tasks join the board immediately and autosave.</p>
          </div>

          <form className="task-form task-form-wide" onSubmit={addTask}>
            <label htmlFor="task-title">Title</label>
            <input
              id="task-title"
              type="text"
              value={newTask.title}
              onChange={(event) =>
                setNewTask((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="Sprint retro follow-ups"
            />

            <label htmlFor="task-squad">Squad</label>
            <input
              id="task-squad"
              type="text"
              value={newTask.squad}
              onChange={(event) =>
                setNewTask((current) => ({ ...current, squad: event.target.value }))
              }
            />

            <label htmlFor="task-owner">Owner</label>
            <select
              id="task-owner"
              value={newTask.assignee}
              onChange={(event) =>
                setNewTask((current) => ({ ...current, assignee: event.target.value }))
              }
            >
              {TEAM_MEMBERS.map((member) => (
                <option key={member} value={member}>
                  {member}
                </option>
              ))}
            </select>

            <label htmlFor="task-status">Status</label>
            <select
              id="task-status"
              value={newTask.status}
              onChange={(event) =>
                setNewTask((current) => ({ ...current, status: event.target.value }))
              }
            >
              {STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>

            <label htmlFor="task-priority">Priority</label>
            <select
              id="task-priority"
              value={newTask.priority}
              onChange={(event) =>
                setNewTask((current) => ({ ...current, priority: event.target.value }))
              }
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>

            <label htmlFor="task-effort">Effort (hours)</label>
            <input
              id="task-effort"
              type="number"
              min="1"
              value={newTask.effort}
              onChange={(event) =>
                setNewTask((current) => ({ ...current, effort: event.target.value }))
              }
            />

            <label htmlFor="task-start">Start date</label>
            <input
              id="task-start"
              type="date"
              value={newTask.start}
              onChange={(event) =>
                setNewTask((current) => ({ ...current, start: event.target.value }))
              }
            />

            <label htmlFor="task-end">End date</label>
            <input
              id="task-end"
              type="date"
              value={newTask.end}
              onChange={(event) =>
                setNewTask((current) => ({ ...current, end: event.target.value }))
              }
            />

            <label htmlFor="task-bug-url">Bug or Jira URL</label>
            <input
              id="task-bug-url"
              type="url"
              value={newTask.bugUrl}
              onChange={(event) =>
                setNewTask((current) => ({ ...current, bugUrl: event.target.value }))
              }
              placeholder="https://jira.example.com/browse/ABC-123"
            />

            <label className="checkbox-row" htmlFor="task-blocked">
              <input
                id="task-blocked"
                type="checkbox"
                checked={newTask.blocked}
                onChange={(event) =>
                  setNewTask((current) => ({ ...current, blocked: event.target.checked }))
                }
              />
              Mark as blocked
            </label>

            <button type="submit" className="primary-button">
              Add task
            </button>
          </form>
        </section>
      ) : null}

      <section className="board-panel">
        <KanbanBoard
          tasks={tasks}
          user={user}
          searchTerm={searchTerm}
          assigneeFilter={assigneeFilter}
          stageFilter={stageFilter}
          onTaskUpdate={updateTask}
          onCommentDraftChange={updateCommentDraft}
          onCommentAdd={addComment}
        />
      </section>
    </main>
  );
}

function AppShell() {
  const { user } = useAuth();

  if (!user) {
    return <LoginScreen />;
  }

  return <Dashboard />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
