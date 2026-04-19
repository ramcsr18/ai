import { useEffect, useRef, useState } from 'react';
import './App.css';
import KanbanBoard from './components/KanbanBoard';
import { AuthProvider, useAuth } from './context/AuthContext';
import { STAGES } from './data/seedData';
import {
  canUserAccessTask,
  filterBoardTasks,
  getCurrentTimestamp,
  normalizeTask,
} from './utils/taskUtils';
import {
  createResource as createResourceRecord,
  createTask as createTaskRecord,
  deleteTask as deleteTaskRecord,
  deleteResource as deleteResourceRecord,
  fetchResources,
  fetchTasks,
  getInitialResourceSnapshot,
  getInitialTaskSnapshot,
  saveResource as saveResourceRecord,
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

function ResourceIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M10 10a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M3.8 17a6.2 6.2 0 0 1 12.4 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M10 4v12M4 10h12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M5.8 6.5h8.4l-.6 9a1.2 1.2 0 0 1-1.2 1.1H7.6a1.2 1.2 0 0 1-1.2-1.1l-.6-9Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M4.8 5.2h10.4M7.6 5.2V3.8h4.8v1.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M5 5l10 10M15 5 5 15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EyeIcon({ visible }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2.4 10s2.8-4.8 7.6-4.8S17.6 10 17.6 10 14.8 14.8 10 14.8 2.4 10 2.4 10Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="10"
        cy="10"
        r="2.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {visible ? null : (
        <path
          d="M4 16 16 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function PasswordIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M6.8 8V6.7a3.2 3.2 0 1 1 6.4 0V8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <rect
        x="4.3"
        y="8"
        width="11.4"
        height="8.4"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="10" cy="12.2" r="1.1" fill="currentColor" />
    </svg>
  );
}

function getDefaultAssignee(resources, fallbackAssignee = '') {
  return resources[0]?.name || fallbackAssignee;
}

function getResourceOptionLabel(resource) {
  return resource.email ? `${resource.name} - ${resource.email}` : resource.name;
}

function ResourceManager({
  resources,
  tasks,
  onCreateResource,
  onSaveResource,
  onDeleteResource,
  onClose,
}) {
  const [newResource, setNewResource] = useState({
    name: '',
    email: '',
    role: 'Contributor',
  });
  const [drafts, setDrafts] = useState({});
  const draftsRef = useRef({});

  useEffect(() => {
    const nextDrafts = resources.reduce((result, resource) => {
        result[resource.id] = {
          name: resource.name,
          email: resource.email,
          role: resource.role || 'Contributor',
        };
        return result;
      }, {});

    draftsRef.current = nextDrafts;
    setDrafts(nextDrafts);
  }, [resources]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const updateDraft = (resourceId, patch) => {
    setDrafts((current) => {
      const nextDrafts = {
        ...current,
        [resourceId]: {
          ...(current[resourceId] || {}),
          ...patch,
        },
      };

      draftsRef.current = nextDrafts;
      return nextDrafts;
    });
  };

  const resetDraft = (resource) => {
    setDrafts((current) => {
      const nextDrafts = {
        ...current,
        [resource.id]: {
          name: resource.name,
          email: resource.email,
          role: resource.role || 'Contributor',
        },
      };

      draftsRef.current = nextDrafts;
      return nextDrafts;
    });
  };

  const saveDraft = async (resource) => {
    const draft = draftsRef.current[resource.id] || {
      name: resource.name,
      email: resource.email,
      role: resource.role || 'Contributor',
    };
    const nextName = draft.name.trim();
    const nextEmail = draft.email.trim().toLowerCase();
    const nextRole = draft.role === 'Manager' ? 'Manager' : 'Contributor';

    if (!nextName || !nextEmail) {
      resetDraft(resource);
      return;
    }

    if (
      nextName === resource.name &&
      nextEmail === resource.email &&
      nextRole === (resource.role || 'Contributor')
    ) {
      return;
    }

    await onSaveResource({
      ...resource,
      name: nextName,
      email: nextEmail,
      role: nextRole,
    });
  };

  const handleAddResource = async (event) => {
    event.preventDefault();
    const name = newResource.name.trim();
    const email = newResource.email.trim().toLowerCase();
    const role = newResource.role === 'Manager' ? 'Manager' : 'Contributor';

    if (!name || !email) {
      return;
    }

    const wasCreated = await onCreateResource({ name, email, role });

    if (wasCreated) {
      setNewResource({
        name: '',
        email: '',
        role: 'Contributor',
      });
    }
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <section
        className="resources-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Resource management"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="resources-dialog-header">
          <div>
            <p className="eyebrow">Admin controls</p>
            <h2>Resources</h2>
          </div>
          <button
            type="button"
            className="ghost-button icon-button"
            onClick={onClose}
            aria-label="Close resource management"
            title="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <form className="resource-add-form" onSubmit={handleAddResource}>
          <input
            id="resource-name"
            type="text"
            value={newResource.name}
            onChange={(event) =>
              setNewResource((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="Name"
            aria-label="Resource name"
          />
          <input
            id="resource-email"
            type="email"
            value={newResource.email}
            onChange={(event) =>
              setNewResource((current) => ({ ...current, email: event.target.value }))
            }
            placeholder="Email"
            aria-label="Resource email"
          />
          <select
            id="resource-role"
            value={newResource.role}
            onChange={(event) =>
              setNewResource((current) => ({ ...current, role: event.target.value }))
            }
            aria-label="Resource role"
          >
            <option value="Contributor">Contributor</option>
            <option value="Manager">Manager</option>
          </select>
          <button
            type="submit"
            className="primary-button icon-button resource-add-button"
            aria-label="Add resource"
            title="Add resource"
          >
            <PlusIcon />
          </button>
        </form>

        <div className="resource-list" aria-label="Team resources">
          {resources.map((resource) => {
            const assignedTaskCount = tasks.filter((task) => task.assignee === resource.name).length;
            const draft = drafts[resource.id] || {
              name: resource.name,
              email: resource.email,
              role: resource.role || 'Contributor',
            };

            return (
              <article key={resource.id} className="resource-row">
                <div className="resource-row-fields">
                  <input
                    id={`resource-name-${resource.id}`}
                    type="text"
                    value={draft.name}
                    onChange={(event) => updateDraft(resource.id, { name: event.target.value })}
                    onBlur={() => void saveDraft(resource)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void saveDraft(resource);
                      }

                      if (event.key === 'Escape') {
                        event.preventDefault();
                        resetDraft(resource);
                      }
                    }}
                    placeholder="Name"
                    aria-label={`Resource name for ${resource.name}`}
                  />
                  <input
                    id={`resource-email-${resource.id}`}
                    type="email"
                    value={draft.email}
                    onChange={(event) => updateDraft(resource.id, { email: event.target.value })}
                    onBlur={() => void saveDraft(resource)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void saveDraft(resource);
                      }

                      if (event.key === 'Escape') {
                        event.preventDefault();
                        resetDraft(resource);
                      }
                    }}
                    placeholder="Email"
                    aria-label={`Resource email for ${resource.name}`}
                  />
                  <select
                    id={`resource-role-${resource.id}`}
                    value={draft.role}
                    onChange={(event) => updateDraft(resource.id, { role: event.target.value })}
                    onBlur={() => void saveDraft(resource)}
                    aria-label={`Resource role for ${resource.name}`}
                  >
                    <option value="Contributor">Contributor</option>
                    <option value="Manager">Manager</option>
                  </select>
                </div>

                <div className="resource-row-actions">
                  <span className="resource-task-count" title="Tasks currently assigned to this resource.">
                    {assignedTaskCount}
                  </span>
                  <button
                    type="button"
                    className="ghost-button icon-button"
                    onClick={() => onDeleteResource(resource.id)}
                    aria-label={`Delete ${resource.name}`}
                    title="Delete resource"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function TaskComposerDialog({
  isAdmin,
  resources,
  user,
  newTask,
  setNewTask,
  onSubmit,
  onClose,
}) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <section
        className="resources-dialog task-compose-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Create task"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="resources-dialog-header">
          <div>
            <p className="eyebrow">{isAdmin ? 'Admin controls' : 'My work'}</p>
            <h2>Create task</h2>
          </div>
          <button
            type="button"
            className="ghost-button icon-button"
            onClick={onClose}
            aria-label="Close create task dialog"
            title="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <p className="muted-text task-dialog-copy">
          {isAdmin
            ? 'Create a new task and assign it to a resource'
            : 'Create a new task and assign it to yourself'}
        </p>

        <form className="task-form task-form-wide task-form-compact" onSubmit={onSubmit}>
          <label htmlFor="task-title">Title</label>
          <input
            id="task-title"
            type="text"
            value={newTask.title}
            onChange={(event) =>
              setNewTask((current) => ({ ...current, title: event.target.value }))
            }
            placeholder="Sprint retro follow-ups"
            autoFocus
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
              {resources.length ? (
                resources.map((resource) => (
                  <option key={resource.id} value={resource.name}>
                    {getResourceOptionLabel(resource)}
                  </option>
                ))
              ) : (
                <option value={user.name}>{user.name}</option>
              )}
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

          <div className="task-dialog-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button">
              Add task
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function LoginScreen() {
  const {
    loginDemo,
    authError,
    isOracleConfigured,
    oracleConfigError,
    canUseDemoLogin,
  } = useAuth();
  const [credentials, setCredentials] = useState({
    email: '',
    password: '',
  });
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const handleSubmit = (event) => {
    event.preventDefault();
    void loginDemo(credentials);
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
            <strong>{isOracleConfigured ? 'Oracle SSO enabled' : 'Oracle SSO setup required'}</strong>
            <span>
              Uses Oracle IAM / IDCS OAuth endpoints with PKCE for employee browser sign-in.
            </span>
          </div>
          <div>
            <strong>SQLite persistence</strong>
            <span>Board edits, task metadata, and comment drafts persist in a shared database.</span>
          </div>
        </div>
      </section>

      <section className="login-card">
        <p className="eyebrow">Workspace access</p>
        <h2>Sign in with your resource account</h2>
        <p className="login-copy">
          Sprint Board access is currently available only through resource email and password
          accounts registered by a manager.
        </p>

        {authError ? <div className="status-banner error-banner">{authError}</div> : null}

        {!isOracleConfigured ? (
          <p className="muted-text">
            {oracleConfigError}
          </p>
        ) : null}

        {canUseDemoLogin ? (
          <form className="login-form demo-form" onSubmit={handleSubmit}>
            <p className="eyebrow">Development fallback</p>

            <label htmlFor="email">Resource email</label>
            <input
              id="email"
              type="email"
              value={credentials.email}
              onChange={(event) =>
                setCredentials((current) => ({ ...current, email: event.target.value }))
              }
              placeholder="avery.chen@example.com"
            />

            <label htmlFor="password">Password</label>
            <div className="password-input-row">
              <input
                id="password"
                type={isPasswordVisible ? 'text' : 'password'}
                value={credentials.password}
                onChange={(event) =>
                  setCredentials((current) => ({ ...current, password: event.target.value }))
                }
                placeholder="Temporary or saved password"
              />
              <button
                type="button"
                className="ghost-button icon-button password-visibility-toggle"
                onClick={() => setIsPasswordVisible((current) => !current)}
                aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
                title={isPasswordVisible ? 'Hide password' : 'Show password'}
              >
                <EyeIcon visible={isPasswordVisible} />
              </button>
            </div>

            <button type="submit" className="ghost-button">
              Sign in with email
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}

function PasswordDialog({ title, eyebrow, description, onClose, showSignOut = false }) {
  const { user, updatePassword, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!onClose) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (newPassword.trim().length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation must match.');
      return;
    }

    try {
      await updatePassword({ currentPassword, newPassword });
      setError('');
      setSuccess('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      if (onClose) {
        window.setTimeout(() => {
          onClose();
        }, 600);
      }
    } catch (passwordError) {
      setSuccess('');
      setError(passwordError.message || 'Unable to update the password.');
    }
  };

  const content = (
    <>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p className="login-copy">{description || `${user?.name}, update your Sprint Board password.`}</p>

      {error ? <div className="status-banner error-banner">{error}</div> : null}
      {success ? <div className="status-banner info-banner">{success}</div> : null}

      <form className="login-form demo-form" onSubmit={handleSubmit}>
        <label htmlFor="current-password">Current password</label>
        <input
          id="current-password"
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />

        <label htmlFor="new-password">New password</label>
        <input
          id="new-password"
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />

        <label htmlFor="confirm-password">Confirm new password</label>
        <input
          id="confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />

        <div className="password-dialog-actions">
          {onClose ? (
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancel
            </button>
          ) : null}
          <button type="submit" className="primary-button">
            Update password
          </button>
          {showSignOut ? (
            <button type="button" className="ghost-button" onClick={logout}>
              Sign out
            </button>
          ) : null}
        </div>
      </form>
    </>
  );

  if (!onClose) {
    return (
      <main className="app-shell login-shell">
        <section className="login-card">{content}</section>
      </main>
    );
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <section
        className="resources-dialog password-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Change password"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="resources-dialog-header">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
          </div>
          <button
            type="button"
            className="ghost-button icon-button"
            onClick={onClose}
            aria-label="Close change password dialog"
            title="Close"
          >
            <CloseIcon />
          </button>
        </div>
        <p className="login-copy password-dialog-copy">
          {description || `${user?.name}, update your Sprint Board password.`}
        </p>

        {error ? <div className="status-banner error-banner">{error}</div> : null}
        {success ? <div className="status-banner info-banner">{success}</div> : null}

        <form className="login-form demo-form password-dialog-form" onSubmit={handleSubmit}>
          <label htmlFor="current-password">Current password</label>
          <input
            id="current-password"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoFocus
          />

          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />

          <label htmlFor="confirm-password">Confirm new password</label>
          <input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />

          <div className="password-dialog-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button">
              Update password
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function PasswordChangeScreen() {
  const { user } = useAuth();

  return (
    <PasswordDialog
      title="Change your temporary password"
      eyebrow="Password update required"
      description={`${user?.name}, your resource account requires a password change before you can use Sprint Board.`}
      showSignOut
    />
  );
}

function Dashboard() {
  const { user, logout } = useAuth();
  const isAdmin = user.role === 'admin';
  const [tasks, setTasks] = useState(getInitialTaskSnapshot);
  const tasksRef = useRef(tasks);
  const [resources, setResources] = useState(getInitialResourceSnapshot);
  const resourcesRef = useRef(resources);
  const [isLoadingTasks, setIsLoadingTasks] = useState(process.env.NODE_ENV !== 'test');
  const [taskError, setTaskError] = useState('');
  const [reportMessage, setReportMessage] = useState('');
  const [isResourceDialogOpen, setIsResourceDialogOpen] = useState(false);
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [newTask, setNewTask] = useState({
    title: '',
    assignee: isAdmin ? getDefaultAssignee(getInitialResourceSnapshot(), user.name) : user.name,
    status: STAGES[0],
    effort: 8,
    start: '2026-04-20',
    end: '2026-04-24',
    squad: 'BUILD',
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
    resourcesRef.current = resources;
  }, [resources]);

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
        const loadedResources = await fetchResources();

        if (!isCancelled) {
          setTasks(loadedTasks);
          setResources(loadedResources);
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

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const defaultAssignee = getDefaultAssignee(resources, user.name);

    setNewTask((current) => {
      if (!defaultAssignee) {
        return current;
      }

      const hasCurrentAssignee = resources.some((resource) => resource.name === current.assignee);

      if (hasCurrentAssignee) {
        return current;
      }

      return {
        ...current,
        assignee: defaultAssignee,
      };
    });
  }, [isAdmin, resources, user.name]);

  const accessibleTasks = tasks.filter((task) => canUserAccessTask(user, task));
  const filteredTasks = filterBoardTasks(accessibleTasks, {
    searchTerm,
    assigneeFilter,
    stageFilter,
  });
  const availableAssignees = isAdmin
    ? [
        ...new Set(
          [...resources.map((resource) => resource.name), ...accessibleTasks.map((task) => task.assignee)]
            .filter(Boolean)
        ),
      ]
    : [user.name].filter(Boolean);

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

    const nextPatch =
      patch.status === 'Completed' && currentTask.status !== 'Completed'
        ? { ...patch, end: getCurrentTimestamp() }
        : patch;

    const nextTask = prepareTask({ ...currentTask, ...nextPatch });

    setTasks((currentTasks) =>
      currentTasks.map((task) => (task.id === taskId ? nextTask : task))
    );
    setTaskError('');
    setReportMessage('');

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

  const updateComment = (taskId, commentId, nextText) => {
    const currentTask = tasksRef.current.find((task) => task.id === taskId);

    if (!currentTask || !canUserAccessTask(user, currentTask)) {
      return;
    }

    const trimmedText = nextText.trim();

    if (!trimmedText) {
      return;
    }

    const nextComments = currentTask.comments.map((comment) =>
      comment.id === commentId ? { ...comment, text: trimmedText } : comment
    );

    void updateTask(taskId, {
      comments: nextComments,
    });
  };

  const addTask = async (event) => {
    event.preventDefault();

    const title = newTask.title.trim();

    if (!title) {
      return false;
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
        squad: 'BUILD',
        bugUrl: '',
        comments: [],
        draftComment: '',
        effort: 8,
        blocked: false,
        status: STAGES[0],
        release: '',
        milestone: false,
        priority: 'Medium',
        assignee: isAdmin ? getDefaultAssignee(resourcesRef.current, user.name) : user.name,
      }));
      return true;
    } catch (error) {
      setTaskError(error.message || 'Unable to create the task in SQLite.');
      return false;
    }
  };

  const handleTaskDialogSubmit = async (event) => {
    const wasCreated = await addTask(event);

    if (wasCreated) {
      setIsTaskDialogOpen(false);
    }
  };

  const deleteTask = async (taskId) => {
    if (!isAdmin) {
      return;
    }

    const currentTask = tasksRef.current.find((task) => String(task.id) === String(taskId));

    if (!currentTask) {
      return;
    }

    if (!window.confirm(`Delete task "${currentTask.title}"?`)) {
      return;
    }

    try {
      const nextTasks = await deleteTaskRecord(taskId);
      setTasks(nextTasks);
      setTaskError('');
      setReportMessage('');
    } catch (error) {
      setTaskError(error.message || 'Unable to delete the task.');
    }
  };

  const createResource = async (resource) => {
    if (!isAdmin) {
      return false;
    }

    const name = resource.name.trim();
    const email = resource.email.trim().toLowerCase();

    if (!name || !email) {
      setTaskError('Resource name and email are required.');
      return false;
    }

    if (
      resourcesRef.current.some(
        (currentResource) =>
          currentResource.name.toLowerCase() === name.toLowerCase() ||
          currentResource.email.toLowerCase() === email.toLowerCase()
      )
    ) {
      setTaskError('Resource name and email must be unique.');
      return false;
    }

    try {
      const createdResource = await createResourceRecord({
        name,
        email,
        role: resource.role === 'Manager' ? 'Manager' : 'Contributor',
      });
      const nextResources = [...resourcesRef.current, createdResource].sort((left, right) =>
        left.name.localeCompare(right.name)
      );
      setResources(nextResources);
      setTaskError('');
      setReportMessage(
        createdResource.temporaryPassword
          ? `Temporary password for ${createdResource.name}: ${createdResource.temporaryPassword}`
          : ''
      );
      setNewTask((current) => ({
        ...current,
        assignee: current.assignee || getDefaultAssignee(nextResources, user.name),
      }));
      return true;
    } catch (error) {
      setTaskError(error.message || 'Unable to create the resource.');
      return false;
    }
  };

  const updateResource = async (resource) => {
    if (!isAdmin) {
      return;
    }

    const existingResource = resourcesRef.current.find(
      (currentResource) => String(currentResource.id) === String(resource.id)
    );
    const name = resource.name.trim();
    const email = resource.email.trim().toLowerCase();

    if (!existingResource || !name || !email) {
      setTaskError('Resource name and email are required.');
      return;
    }

    if (
      resourcesRef.current.some(
        (currentResource) =>
          String(currentResource.id) !== String(resource.id) &&
          (currentResource.name.toLowerCase() === name.toLowerCase() ||
            currentResource.email.toLowerCase() === email.toLowerCase())
      )
    ) {
      setTaskError('Resource name and email must be unique.');
      return;
    }

    try {
      const savedResource = await saveResourceRecord({
        ...resource,
        name,
        email,
        role: resource.role === 'Manager' ? 'Manager' : 'Contributor',
      });
      const nextResources = resourcesRef.current
        .map((currentResource) =>
          String(currentResource.id) === String(savedResource.id) ? savedResource : currentResource
        )
        .sort((left, right) => left.name.localeCompare(right.name));
      setResources(nextResources);
      setTasks((currentTasks) =>
        existingResource.name === savedResource.name
          ? currentTasks
          : currentTasks.map((task) =>
              task.assignee === existingResource.name
                ? { ...task, assignee: savedResource.name }
                : task
            )
      );
      setNewTask((current) => ({
        ...current,
        assignee: current.assignee === existingResource.name ? savedResource.name : current.assignee,
      }));
      setTaskError('');
      setReportMessage('');
    } catch (error) {
      setTaskError(error.message || 'Unable to save the resource.');
    }
  };

  const removeResource = async (resourceId) => {
    if (!isAdmin) {
      return;
    }

    try {
      const nextResources = await deleteResourceRecord(resourceId);
      setResources(nextResources);
      setTaskError('');
      setNewTask((current) => ({
        ...current,
        assignee:
          current.assignee &&
          nextResources.some((resource) => resource.name === current.assignee)
            ? current.assignee
            : getDefaultAssignee(nextResources, user.name),
      }));
    } catch (error) {
      setTaskError(error.message || 'Unable to delete the resource.');
    }
  };

  const totalEffort = filteredTasks.reduce((sum, task) => sum + task.effort, 0);
  const productionCount = filteredTasks.filter((task) => task.status === 'Production').length;
  const blockedCount = filteredTasks.filter((task) => task.blocked).length;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">FRE Delivery Workspace</p>
          <h1>FRE Sprint Board</h1>
          <p className="topbar-copy">
            Manage your tasks and prioritize them effectively.
          </p>
        </div>

        <div className="user-card">
          <span className="user-chip">{user.registrationRole || (user.role === 'admin' ? 'Manager' : 'Contributor')}</span>
          <span className="user-name">{user.name}</span>
          <div className="topbar-actions">
            {isAdmin ? (
              <button
                type="button"
                className="ghost-button icon-button"
                onClick={() => setIsResourceDialogOpen(true)}
                aria-label="Manage resources"
                title="Manage resources"
              >
                <ResourceIcon />
              </button>
            ) : null}
            <button
              type="button"
              className="ghost-button icon-button"
              onClick={() => setIsPasswordDialogOpen(true)}
              aria-label="Change password"
              title="Change password"
            >
              <PasswordIcon />
            </button>
            <button type="button" className="ghost-button" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      {taskError ? <div className="status-banner error-banner">{taskError}</div> : null}
      {reportMessage ? <div className="status-banner info-banner">{reportMessage}</div> : null}
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

          {isAdmin ? (
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
          ) : null}

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

        </div>
      </section>

      <section className="summary-grid" aria-label="Sprint summary">
        <article
          className="summary-card"
          title="Total tasks matching the current filters."
        >
          <p className="eyebrow">Total tasks</p>
          <strong>{filteredTasks.length}</strong>
        </article>
        <article
          className="summary-card"
          title="Total planned effort across tasks matching the current filters."
        >
          <p className="eyebrow">Planned effort</p>
          <strong>{totalEffort}h</strong>
        </article>
        <article
          className="summary-card"
          title="Production tasks matching the current filters."
        >
          <p className="eyebrow">Production ready</p>
          <strong className="summary-value-green">{productionCount}</strong>
        </article>
        <article
          className="summary-card"
          title="Blocked tasks matching the current filters."
        >
          <p className="eyebrow">Risks</p>
          <strong className="summary-value-red">{blockedCount}</strong>
        </article>
        <button
          type="button"
          className="summary-card summary-card-action"
          onClick={() => setIsTaskDialogOpen(true)}
          aria-label="Create task"
          title="Create task"
        >
          <p className="eyebrow">Create Task</p>
          <strong>
            <PlusIcon />
          </strong>
        </button>
      </section>

      <section className="board-panel">
        <KanbanBoard
          tasks={accessibleTasks}
          user={user}
          teamMembers={resources}
          searchTerm={searchTerm}
          assigneeFilter={assigneeFilter}
          stageFilter={stageFilter}
          onTaskUpdate={updateTask}
          onCommentDraftChange={updateCommentDraft}
          onCommentAdd={addComment}
          onCommentUpdate={updateComment}
          onTaskDelete={deleteTask}
        />
      </section>

      {isAdmin && isResourceDialogOpen ? (
        <ResourceManager
          resources={resources}
          tasks={tasks}
          onCreateResource={createResource}
          onSaveResource={updateResource}
          onDeleteResource={removeResource}
          onClose={() => setIsResourceDialogOpen(false)}
        />
      ) : null}

      {isTaskDialogOpen ? (
        <TaskComposerDialog
          isAdmin={isAdmin}
          resources={resources}
          user={user}
          newTask={newTask}
          setNewTask={setNewTask}
          onSubmit={handleTaskDialogSubmit}
          onClose={() => setIsTaskDialogOpen(false)}
        />
      ) : null}

      {isPasswordDialogOpen ? (
        <PasswordDialog
          title="Change password"
          eyebrow="Account security"
          description="Update your Sprint Board password."
          onClose={() => setIsPasswordDialogOpen(false)}
        />
      ) : null}
    </main>
  );
}

function AppShell() {
  const { user } = useAuth();

  if (!user) {
    return <LoginScreen />;
  }

  if (user.mustChangePassword) {
    return <PasswordChangeScreen />;
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
