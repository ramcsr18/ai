import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createComment,
  formatCommentDate,
  formatFullDate,
  getDateInputValue,
  isTaskOverdue,
  getTaskTitleTone,
} from '../utils/taskUtils';

const statusColors = {
  Ingestion: '#ffe8aa',
  Analysis: '#c5f6fa',
  Design: '#eebefa',
  Implementation: '#c3fae8',
  Testing: '#ffc9c9',
  'QA/UAT': '#ffd8a8',
  Production: '#d3f9d8',
  Completed: '#dbeafe',
};

const statusHeaderColors = {
  Ingestion: 'linear-gradient(135deg, #fff1be, #e1bf5e)',
  Analysis: 'linear-gradient(135deg, #daf8fb, #7ac8d1)',
  Design: 'linear-gradient(135deg, #f6ddfd, #c18ad9)',
  Implementation: 'linear-gradient(135deg, #e8fff4, #7fcda8)',
  Testing: 'linear-gradient(135deg, #ffe3e3, #d88484)',
  'QA/UAT': 'linear-gradient(135deg, #ffedd6, #e0a660)',
  Production: 'linear-gradient(135deg, #e7fbe9, #79be86)',
  Completed: 'linear-gradient(135deg, #e6f7ff, #4c9fd1)',
};
const alertHeaderGradient = 'linear-gradient(135deg, #ffd7d7, #b42318)';
const unassignedIngestionGradient = 'linear-gradient(135deg, #e2e8f0, #64748b)';

const priorityOptions = ['High', 'Medium', 'Low'];
const DEFAULT_VISIBLE_COMMENTS = 3;

function getCommentTimestamp(comment) {
  const timestamp = Date.parse(comment?.createdAt || '');

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

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

function OwnerIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M4 17a6 6 0 0 1 12 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronIcon({ expanded }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
      className={`comment-toggle-icon ${expanded ? 'comment-toggle-icon-expanded' : ''}`}
    >
      <path
        d="M5 8l5 5 5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
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

function EditIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 14.8 4.8 11l7.8-7.8a1.4 1.4 0 0 1 2 0l1.2 1.2a1.4 1.4 0 0 1 0 2L8 14.2 4 14.8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.6 4.2 15.8 8.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function StickyNote({
  task,
  isActive,
  sequenceNumber,
  stackIndex,
  stackDepth,
  isAdmin,
  teamMembers,
  onUpdate,
  onCommentDraftChange,
  onCommentAdd,
  onCommentUpdate,
  onDelete,
  onDragStart,
  onActivate,
  canEdit,
  stageOptions,
}) {
  const [showAllComments, setShowAllComments] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingArea, setIsEditingArea] = useState(false);
  const [isEditingOwner, setIsEditingOwner] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState('');
  const [draftCommentText, setDraftCommentText] = useState('');
  const [draftTitle, setDraftTitle] = useState(task.title);
  const [draftArea, setDraftArea] = useState(task.squad);
  const [draftOwner, setDraftOwner] = useState(task.assignee);
  const commentHistoryRef = useRef(null);

  useEffect(() => {
    setDraftTitle(task.title);
  }, [task.title]);

  useEffect(() => {
    setDraftArea(task.squad);
  }, [task.squad]);

  useEffect(() => {
    setDraftOwner(task.assignee);
  }, [task.assignee]);

  useEffect(() => {
    setShowAllComments(false);
  }, [task.id, task.comments.length]);

  useEffect(() => {
    setEditingCommentId('');
    setDraftCommentText('');
  }, [task.id]);

  useEffect(() => {
    if (
      !showAllComments ||
      !commentHistoryRef.current ||
      typeof commentHistoryRef.current.scrollIntoView !== 'function'
    ) {
      return;
    }

    commentHistoryRef.current.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [showAllComments]);

  const sortedComments = useMemo(() => {
    const normalizedComments = Array.isArray(task.comments) ? task.comments : [];

    return normalizedComments
      .map((comment, index) => ({
        ...comment,
        _originalIndex: index,
      }))
      .sort((left, right) => {
        const timestampDifference = getCommentTimestamp(right) - getCommentTimestamp(left);

        if (timestampDifference !== 0) {
          return timestampDifference;
        }

        return left._originalIndex - right._originalIndex;
      })
      .map(({ _originalIndex, ...comment }) => comment);
  }, [task.comments]);

  const recentComments = sortedComments.slice(0, DEFAULT_VISIBLE_COMMENTS);
  const historyComments = sortedComments.slice(DEFAULT_VISIBLE_COMMENTS);
  const hiddenCommentCount = historyComments.length;
  const ownerOptions = useMemo(() => {
    const normalizedMembers = Array.isArray(teamMembers) ? teamMembers : [];
    const options = normalizedMembers.map((member) => ({
      key: member.id || member.name || member.email,
      value: member.name || '',
      label: member.email || '',
    }));

    if (task.assignee && !options.some((option) => option.value === task.assignee)) {
      options.unshift({
        key: `current-${task.assignee}`,
        value: task.assignee,
        label: '',
      });
    }

    return options.filter((option) => option.value);
  }, [task.assignee, teamMembers]);

  const submitComment = () => {
    const trimmedDraft = task.draftComment.trim();

    if (!trimmedDraft) {
      return;
    }

    setShowAllComments(false);
    onCommentAdd(task.id, createComment(trimmedDraft));
  };

  const startEditingComment = (comment) => {
    if (!canEditComments) {
      return;
    }

    setEditingCommentId(comment.id);
    setDraftCommentText(comment.text);
  };

  const stopEditingComment = () => {
    setEditingCommentId('');
    setDraftCommentText('');
  };

  const submitEditedComment = (comment) => {
    const trimmedText = draftCommentText.trim();

    if (!trimmedText || trimmedText === comment.text) {
      stopEditingComment();
      return;
    }

    onCommentUpdate(task.id, comment.id, trimmedText);
    stopEditingComment();
  };

  const submitTitle = () => {
    const nextTitle = draftTitle.trim();

    setIsEditingTitle(false);

    if (!nextTitle || nextTitle === task.title) {
      setDraftTitle(task.title);
      return;
    }

    onUpdate(task.id, { title: nextTitle });
  };

  const submitArea = () => {
    const nextArea = draftArea.trim();

    setIsEditingArea(false);

    if (!nextArea || nextArea === task.squad) {
      setDraftArea(task.squad);
      return;
    }

    onUpdate(task.id, { squad: nextArea });
  };

  const submitOwner = () => {
    const nextOwner = draftOwner.trim();

    setIsEditingOwner(false);

    if (!nextOwner || nextOwner === task.assignee) {
      setDraftOwner(task.assignee);
      return;
    }

    onUpdate(task.id, { assignee: nextOwner });
  };

  const canEditTitle = canEdit && task.status !== 'Completed';
  const canEditOwner = canEdit && isAdmin;
  const canEditComments = canEdit && isAdmin;
  const titleToneClass = getTaskTitleTone(task);
  const isUnassignedIngestion = isAdmin && task.status === 'Ingestion' && !String(task.assignee || '').trim();
  const headerBackground = task.status === 'Completed'
    ? statusHeaderColors.Completed
    : task.blocked || isTaskOverdue(task)
    ? alertHeaderGradient
    : isUnassignedIngestion
      ? unassignedIngestionGradient
    : statusHeaderColors[task.status];

  const renderComment = (comment, isHistory = false) => {
    const isEditingComment = editingCommentId === comment.id;

    return (
      <article
        key={comment.id}
        className={`comment-item ${isHistory ? 'comment-item-history' : ''} ${canEditComments ? 'comment-item-editable' : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="comment-item-header">
          <div className="comment-date">{formatCommentDate(comment.createdAt)}</div>
          {canEditComments && !isEditingComment ? (
            <button
              type="button"
              className="ghost-button icon-button comment-edit-trigger"
              onClick={(event) => {
                event.stopPropagation();
                startEditingComment(comment);
              }}
              onMouseDown={(event) => event.stopPropagation()}
              aria-label={`Edit comment dated ${formatCommentDate(comment.createdAt)} for ${task.title}`}
              title="Edit comment"
            >
              <EditIcon />
            </button>
          ) : null}
        </div>
        {isEditingComment ? (
          <div
            className="comment-edit-shell"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <textarea
              className="comment-edit-input"
              value={draftCommentText}
              onChange={(event) => setDraftCommentText(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onBlur={() => submitEditedComment(comment)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submitEditedComment(comment);
                }

                if (event.key === 'Escape') {
                  event.preventDefault();
                  stopEditingComment();
                }
              }}
              aria-label={`Edit comment for ${task.title}`}
              title="Edit comment"
              autoFocus
              rows={2}
            />
            <div className="comment-edit-actions">
              <button
                type="button"
                className="ghost-button comment-edit-action"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => submitEditedComment(comment)}
              >
                Save
              </button>
              <button
                type="button"
                className="ghost-button comment-edit-action"
                onMouseDown={(event) => event.preventDefault()}
                onClick={stopEditingComment}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p
            onDoubleClick={(event) => {
              event.stopPropagation();
              startEditingComment(comment);
            }}
            title={canEditComments ? 'Double-click to edit comment' : undefined}
          >
            {comment.text}
          </p>
        )}
      </article>
    );
  };

  return (
    <article
      className={`sticky-note ${isActive ? 'sticky-note-active' : ''}`}
      style={{
        backgroundColor: statusColors[task.status],
        zIndex: isActive ? stackDepth + 2 : Math.max(stackDepth - stackIndex, 1),
      }}
      aria-label={`${task.title} task card`}
      onClick={onActivate}
    >
      <div
        className={`sticky-note-drag-header ${canEdit ? 'sticky-note-drag-header-enabled' : ''}`}
        draggable={canEdit && !isEditingTitle && !isEditingArea && !isEditingOwner}
        onDragStart={canEdit ? onDragStart : undefined}
      >
        <div
          className="note-panel-meta note-panel-meta-decorated"
          style={{ background: headerBackground }}
        >
          <div className="note-panel-meta-left">
            <span className="note-sequence-badge" title={`Task ${sequenceNumber} in ${task.status}`}>
              #{sequenceNumber}
            </span>
            {isEditingArea ? (
              <input
                id={`task-area-${task.id}`}
                className="header-edit-input header-edit-input-meta"
                type="text"
                value={draftArea}
                onChange={(event) => setDraftArea(event.target.value)}
                onBlur={submitArea}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    submitArea();
                  }

                  if (event.key === 'Escape') {
                    setDraftArea(task.squad);
                    setIsEditingArea(false);
                  }
                }}
                autoFocus
                aria-label={`Area for ${task.title}`}
                title="Area"
              />
            ) : (
              <button
                type="button"
                className="header-editable note-squad note-squad-meta"
                onDoubleClick={() => {
                  if (canEdit) {
                    setIsEditingArea(true);
                  }
                }}
                disabled={!canEdit}
                title={canEdit ? 'Double-click to edit area' : 'Area'}
              >
                {task.squad}
              </button>
            )}
          </div>
          {isAdmin ? (
            <div className="note-panel-meta-right">
              {isEditingOwner ? (
                <label className="note-owner note-owner-editor" htmlFor={`task-owner-${task.id}`}>
                  <OwnerIcon />
                  <>
                    <input
                      id={`task-owner-${task.id}`}
                      className="header-edit-input header-edit-input-meta owner-edit-input"
                      type="text"
                      list={`task-owner-options-${task.id}`}
                      value={draftOwner}
                      onChange={(event) => setDraftOwner(event.target.value)}
                      onBlur={submitOwner}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          submitOwner();
                        }

                        if (event.key === 'Escape') {
                          setDraftOwner(task.assignee);
                          setIsEditingOwner(false);
                        }
                      }}
                      autoFocus
                      aria-label={`Owner for ${task.title}`}
                      title="Owner"
                    />
                    <datalist id={`task-owner-options-${task.id}`}>
                      {ownerOptions.map((member) => (
                        <option
                          key={member.key}
                          value={member.value}
                          label={member.label}
                        />
                      ))}
                    </datalist>
                  </>
                </label>
              ) : (
                <>
                  <button
                    type="button"
                    className="header-editable note-owner note-owner-button"
                    onDoubleClick={() => {
                      if (canEditOwner) {
                        setIsEditingOwner(true);
                      }
                    }}
                    disabled={!canEditOwner}
                    title={canEditOwner ? 'Double-click to edit owner' : 'Owner'}
                  >
                    <OwnerIcon />
                    <span>{task.assignee || 'Unassigned'}</span>
                  </button>
                  <button
                    type="button"
                    className="ghost-button icon-button task-delete-button"
                    onClick={() => onDelete?.(task.id)}
                    aria-label={`Delete ${task.title}`}
                    title="Delete task"
                  >
                    <TrashIcon />
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
        <div className="note-title-band">
          <div className="note-title-content">
            {isEditingTitle ? (
              <textarea
                id={`task-title-${task.id}`}
                className="header-edit-input header-edit-input-title"
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                onBlur={submitTitle}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    submitTitle();
                  }

                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setDraftTitle(task.title);
                    setIsEditingTitle(false);
                  }
                }}
                autoFocus
                aria-label={`Title for ${task.title}`}
                title="Task title"
                rows={4}
              />
            ) : (
              <button
                type="button"
                className={`header-editable note-title ${titleToneClass}`}
                onDoubleClick={() => {
                  if (canEditTitle) {
                    setIsEditingTitle(true);
                  }
                }}
                disabled={!canEditTitle}
                title={
                  canEditTitle
                    ? `Due ${formatFullDate(task.end)} • Priority ${task.priority} • Double-click to edit title`
                    : `Due ${formatFullDate(task.end)} • Priority ${task.priority}`
                }
              >
                {task.title}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="note-meta note-meta-top">
        <select
          id={`task-status-${task.id}`}
          className="tag-select tag-select-status"
          value={task.status}
          onChange={(event) => onUpdate(task.id, { status: event.target.value })}
          disabled={!canEdit}
          aria-label={`Status for ${task.title}`}
          title="Status"
        >
          {stageOptions.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </select>
        <input
          id={`task-end-${task.id}`}
          className="inline-end-date"
          type="date"
          value={getDateInputValue(task.end)}
          onChange={(event) => onUpdate(task.id, { end: event.target.value })}
          disabled={!canEdit}
          aria-label={`End date for ${task.title}`}
          title="End date"
        />
        <select
          id={`task-priority-${task.id}`}
          className={`tag-select tag-select-priority tag-${task.priority.toLowerCase()}`}
          value={task.priority}
          onChange={(event) => onUpdate(task.id, { priority: event.target.value })}
          disabled={!canEdit}
          aria-label={`Priority for ${task.title}`}
          title="Priority"
        >
          {priorityOptions.map((priority) => (
            <option key={priority} value={priority}>
              {priority}
            </option>
          ))}
        </select>
        <div className="effort-inline-group" title="Effort in hours">
          <input
            id={`task-effort-${task.id}`}
            className="effort-input effort-input-inline"
            type="number"
            min="1"
            value={task.effort}
            onChange={(event) =>
              onUpdate(task.id, { effort: Number(event.target.value) || 1 })
            }
            disabled={!canEdit}
            aria-label={`Effort for ${task.title}`}
          />
          <span className="effort-suffix">hrs</span>
        </div>
        <label className={`checkbox-row blocked-toggle ${task.blocked ? 'blocked-toggle-active' : ''}`} htmlFor={`task-blocked-${task.id}`}>
          <input
            id={`task-blocked-${task.id}`}
            type="checkbox"
            checked={Boolean(task.blocked)}
            disabled={!canEdit}
            onChange={(event) => onUpdate(task.id, { blocked: event.target.checked })}
            aria-label={`Blocked status for ${task.title}`}
          />
          Blocked
        </label>
        <label className="checkbox-row milestone-checkbox" htmlFor={`task-milestone-${task.id}`}>
          <input
            id={`task-milestone-${task.id}`}
            type="checkbox"
            checked={Boolean(task.milestone)}
            disabled={!canEdit || task.status !== 'Completed'}
            onChange={(event) => onUpdate(task.id, { milestone: event.target.checked })}
          />
          Milestone
        </label>
      </div>

      <div className="task-edit-grid compact-grid">
        <div className="date-field">
          <span className="mini-date">Start Date</span>
          <input
            id={`task-start-${task.id}`}
            type="date"
            value={getDateInputValue(task.start)}
            onChange={(event) => onUpdate(task.id, { start: event.target.value })}
            disabled={!canEdit}
            aria-label={`Start date for ${task.title}`}
            title="Start date"
          />
        </div>

        <div className="date-field">
          <span className="mini-date">Release</span>
          <input
            id={`task-release-${task.id}`}
            type="text"
            value={task.release || ''}
            onChange={(event) => onUpdate(task.id, { release: event.target.value })}
            disabled={!canEdit}
            aria-label={`Release for ${task.title}`}
            title="Release"
          />
        </div>
      </div>

      <div className="task-link-row task-link-row-inline">
        <input
          id={`task-bug-url-${task.id}`}
          type="url"
          value={task.bugUrl || ''}
          onChange={(event) => onUpdate(task.id, { bugUrl: event.target.value })}
          disabled={!canEdit}
          placeholder="Bug or Jira URL"
          aria-label={`Bug or Jira URL for ${task.title}`}
          title="Bug or Jira URL"
        />
        {task.bugUrl ? (
          <button
            type="button"
            className="ghost-button task-link-button"
            onClick={() => window.open(task.bugUrl, '_blank', 'noopener,noreferrer')}
            aria-label={`Open linked ticket for ${task.title} in a new tab`}
            title="Open linked ticket in a new tab"
          >
            <ExternalLinkIcon />
          </button>
        ) : null}
      </div>

      <section className="comments-panel" aria-label={`${task.title} comments`}>
        <div className="comments-header">
          <strong>Comments</strong>
          <span>{sortedComments.length}</span>
        </div>

        <textarea
          id={`task-comment-draft-${task.id}`}
          value={task.draftComment || ''}
          onChange={(event) => onCommentDraftChange(task.id, event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submitComment();
            }
          }}
          placeholder="Type an update and press Enter to add it."
          aria-label={`Add comment for ${task.title}`}
          title="Add comment"
        />

        <div className="comments-list" aria-label={`${task.title} recent comments`}>
          {recentComments.length ? (
            recentComments.map((comment) => renderComment(comment))
          ) : (
            <p className="muted-text">No comments yet.</p>
          )}
        </div>

        {hiddenCommentCount > 0 ? (
          <>
            <button
              type="button"
              className="text-button comment-history-toggle"
              onClick={() => setShowAllComments((current) => !current)}
              aria-expanded={showAllComments}
              aria-controls={`comment-history-${task.id}`}
            >
              <ChevronIcon expanded={showAllComments} />
              {showAllComments
                ? 'Hide older comments'
                : `Show ${hiddenCommentCount} older comment${hiddenCommentCount > 1 ? 's' : ''}`}
            </button>

            {showAllComments ? (
              <div
                id={`comment-history-${task.id}`}
                className="comments-history"
                aria-label={`${task.title} comment history`}
                ref={commentHistoryRef}
              >
                <div className="comments-history-heading">Comment history</div>
                {historyComments.map((comment) => renderComment(comment, true))}
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </article>
  );
}
