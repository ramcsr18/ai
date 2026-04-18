import { useEffect, useRef, useState } from 'react';
import './App.css';
import KanbanBoard from './components/KanbanBoard';
import { AuthProvider, useAuth } from './context/AuthContext';
import { STAGES, TEAM_MEMBERS } from './data/seedData';
import { canUserAccessTask, normalizeTask } from './utils/taskUtils';
import {
  createTask as createTaskRecord,
  fetchTasks,
  getInitialTaskSnapshot,
  resetTasks as resetTaskRecords,
  saveTask,
} from './services/taskApi';

function ExternalLinkIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M11 3h6v6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 11l8-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17 11v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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
        <h1>Sprint Board</h1>
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
            <strong>SQLite persistence</strong>
            <span>Board edits, task metadata, and comment drafts persist in a shared database.</span>
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
  const isAdmin = user.role === 'admin';
  const [tasks, setTasks] = useState(getInitialTaskSnapshot);
  const tasksRef = useRef(tasks);
  const [isLoadingTasks, setIsLoadingTasks] = useState(process.env.NODE_ENV !== 'test');
  const [taskError, setTaskError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [newTask, setNewTask] = useState({
    title: '',
    assignee: isAdmin ? TEAM_MEMBERS[0] : user.name,
    status: STAGES[0],
    effort: 8,
    start: '2026-04-20',
    end: '2026-04-24',
    squad: 'Platform',
    release: '',
    milestone: false,
    priority: 'Medium',
    blocked: false,
    bugUrl: '',
    comments: [],
    draftComment: '',
  });

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'test') {
      setIsLoadingTasks(false);
      return undefined;
    }

    let isCancelled = false;

    const loadTasks = async () => {
      try {
        setIsLoadingTasks(true);
        const loadedTasks = await fetchTasks();

        if (!isCancelled) {
          setTasks(loadedTasks);
          setTaskError('');
        }
      } catch (error) {
        if (!isCancelled) {
          setTaskError(error.message || 'Unable to load tasks from SQLite.');
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingTasks(false);
        }
      }
    };

    void loadTasks();

    return () => {
      isCancelled = true;
    };
  }, []);

  const accessibleTasks = tasks.filter((task) => canUserAccessTask(user, task));
  const availableAssignees = [...new Set(accessibleTasks.map((task) => task.assignee))];

  const prepareTask = (task) =>
    normalizeTask({
      ...task,
      milestone: task.status === 'Completed' ? task.milestone : false,
    });

  const updateTask = async (taskId, patch) => {
    const currentTask = tasksRef.current.find((task) => task.id === taskId);

    if (!currentTask || !canUserAccessTask(user, currentTask)) {
      return;
    }

    const nextTask = prepareTask({ ...currentTask, ...patch });

    setTasks((currentTasks) =>
      currentTasks.map((task) => (task.id === taskId ? nextTask : task))
    );
    setTaskError('');

    try {
      if (process.env.NODE_ENV === 'test') {
        await saveTask(nextTask);
        return;
      }

      const persistedTask = await saveTask(nextTask);
      setTasks((currentTasks) =>
        currentTasks.map((task) => (task.id === taskId ? persistedTask : task))
      );
    } catch (error) {
      setTasks((currentTasks) =>
        currentTasks.map((task) => (task.id === taskId ? currentTask : task))
      );
      setTaskError(error.message || 'Unable to save task changes to SQLite.');
    }
  };

  const updateCommentDraft = (taskId, draftComment) => {
    void updateTask(taskId, { draftComment });
  };

  const addComment = (taskId, comment) => {
    const currentTask = tasksRef.current.find((task) => task.id === taskId);

    if (!currentTask || !canUserAccessTask(user, currentTask)) {
      return;
    }

    void updateTask(taskId, {
      comments: [comment, ...currentTask.comments],
      draftComment: '',
    });
  };

  const addTask = async (event) => {
    event.preventDefault();

    const title = newTask.title.trim();

    if (!title) {
      return;
    }

    const taskToCreate = prepareTask({
      ...newTask,
      assignee: isAdmin ? newTask.assignee : user.name,
      title,
      effort: Number(newTask.effort),
      id: `task-${Date.now()}`,
    });

    try {
      const createdTask = await createTaskRecord(taskToCreate);
      setTasks((currentTasks) => [createdTask, ...currentTasks]);
      setTaskError('');
      setNewTask((current) => ({
        ...current,
        title: '',
        bugUrl: '',
        comments: [],
        draftComment: '',
        effort: 8,
        blocked: false,
        status: STAGES[0],
        release: '',
        milestone: false,
        priority: 'Medium',
        assignee: isAdmin ? TEAM_MEMBERS[0] : user.name,
      }));
    } catch (error) {
      setTaskError(error.message || 'Unable to create the task in SQLite.');
    }
  };

  const resetBoard = async () => {
    try {
      const resetTasks = await resetTaskRecords();
      setTasks(resetTasks);
      setTaskError('');
    } catch (error) {
      setTaskError(error.message || 'Unable to reset the task board.');
    }
  };

  const totalEffort = accessibleTasks.reduce((sum, task) => sum + task.effort, 0);
  const productionCount = accessibleTasks.filter((task) => task.status === 'Production').length;
  const blockedCount = accessibleTasks.filter((task) => task.blocked).length;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Employee delivery workspace</p>
          <h1>Sprint Board</h1>
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

      {taskError ? <div className="status-banner error-banner">{taskError}</div> : null}
      {isLoadingTasks ? (
        <div className="status-banner info-banner">Loading tasks from SQLite...</div>
      ) : null}

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
              {availableAssignees.map((member) => (
                <option key={member} value={member}>
                  {member}
                </option>
              ))}
            </select>
          </div>

          <div className="toolbar-field">
            <label htmlFor="stage">Stage</label>
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
              Reset
            </button>
          </div>
        </div>
      </section>

      <section className="summary-grid" aria-label="Sprint summary">
        <article
          className="summary-card"
          title="Total tasks available to you in the current workspace."
        >
          <p className="eyebrow">Total tasks</p>
          <strong>{accessibleTasks.length}</strong>
        </article>
        <article
          className="summary-card"
          title="Total planned effort across all tasks you can access."
        >
          <p className="eyebrow">Planned effort</p>
          <strong>{totalEffort}h</strong>
        </article>
        <article
          className="summary-card"
          title="Tasks already delivered to production."
        >
          <p className="eyebrow">Production ready</p>
          <strong className="summary-value-green">{productionCount}</strong>
        </article>
        <article
          className="summary-card"
          title="Blocked tasks currently needing attention."
        >
          <p className="eyebrow">Risks</p>
          <strong className="summary-value-red">{blockedCount}</strong>
        </article>
      </section>

      <section className="composer-card">
        <div className="composer-header">
          <div>
            <p className="eyebrow">{isAdmin ? 'Admin controls' : 'My work'}</p>
            <h2>Create task</h2>
          </div>
          <p className="muted-text">
            {isAdmin
              ? 'New tasks join the board immediately and autosave.'
              : 'New tasks are automatically assigned to you.'}
          </p>
        </div>

        <form className="task-form task-form-wide task-form-compact" onSubmit={addTask}>
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

          <label htmlFor="task-squad">Area</label>
          <input
            id="task-squad"
            type="text"
            value={newTask.squad}
            onChange={(event) =>
              setNewTask((current) => ({ ...current, squad: event.target.value }))
            }
          />

          <label htmlFor="task-owner">Owner</label>
          {isAdmin ? (
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
          ) : (
            <input id="task-owner" type="text" value={user.name} disabled />
          )}

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

          <label htmlFor="task-release">Release</label>
          <input
            id="task-release"
            type="text"
            value={newTask.release}
            onChange={(event) =>
              setNewTask((current) => ({ ...current, release: event.target.value }))
            }
            placeholder="24.4"
          />

          <label htmlFor="task-bug-url">Bug or Jira URL</label>
          <div className="task-link-row task-link-row-inline">
            <input
              id="task-bug-url"
              type="url"
              value={newTask.bugUrl}
              onChange={(event) =>
                setNewTask((current) => ({ ...current, bugUrl: event.target.value }))
              }
              placeholder="https://jira.example.com/browse/ABC-123"
            />
            {newTask.bugUrl ? (
              <button
                type="button"
                className="ghost-button task-link-button"
                onClick={() => window.open(newTask.bugUrl, '_blank', 'noopener,noreferrer')}
                aria-label="Open task bug or Jira URL in a new tab"
                title="Open in a new tab"
              >
                <ExternalLinkIcon />
              </button>
            ) : null}
          </div>

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

          <label className="checkbox-row" htmlFor="task-milestone">
            <input
              id="task-milestone"
              type="checkbox"
              checked={newTask.milestone}
              disabled={newTask.status !== 'Completed'}
              onChange={(event) =>
                setNewTask((current) => ({ ...current, milestone: event.target.checked }))
              }
            />
            Milestone
          </label>

          <button type="submit" className="primary-button">
            Add task
          </button>
        </form>
      </section>

      <section className="board-panel">
        <KanbanBoard
          tasks={accessibleTasks}
          user={user}
          teamMembers={TEAM_MEMBERS}
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
