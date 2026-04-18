import { useEffect, useMemo, useState } from 'react';
import {
  createComment,
  formatCommentDate,
  formatFullDate,
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
  Completed: 'linear-gradient(135deg, #eef6ff, #8db1e6)',
};

const priorityOptions = ['High', 'Medium', 'Low'];

export default function StickyNote({
  task,
  stackIndex,
  stackDepth,
  isAdmin,
  onUpdate,
  onCommentDraftChange,
  onCommentAdd,
  onDragStart,
  canEdit,
  stageOptions,
}) {
  const [showAllComments, setShowAllComments] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingArea, setIsEditingArea] = useState(false);
  const [draftTitle, setDraftTitle] = useState(task.title);
  const [draftArea, setDraftArea] = useState(task.squad);

  useEffect(() => {
    setDraftTitle(task.title);
  }, [task.title]);

  useEffect(() => {
    setDraftArea(task.squad);
  }, [task.squad]);

  const sortedComments = useMemo(
    () =>
      [...task.comments].sort(
        (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      ),
    [task.comments]
  );

  const visibleComments = showAllComments ? sortedComments : sortedComments.slice(0, 3);
  const hiddenCommentCount = Math.max(sortedComments.length - 3, 0);

  const submitComment = () => {
    const trimmedDraft = task.draftComment.trim();

    if (!trimmedDraft) {
      return;
    }

    onCommentAdd(task.id, createComment(trimmedDraft));
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

  const canEditTitle = canEdit && task.status !== 'Completed';
  const titleToneClass = getTaskTitleTone(task);

  return (
    <article
      className={`sticky-note ${canEdit ? 'sticky-note-draggable' : ''}`}
      style={{
        backgroundColor: statusColors[task.status],
        zIndex: Math.max(stackDepth - stackIndex, 1),
      }}
      aria-label={`${task.title} task card`}
      draggable={canEdit && !isEditingTitle && !isEditingArea}
      onDragStart={canEdit ? onDragStart : undefined}
    >
      <div
        className="note-title-band"
        style={{ background: statusHeaderColors[task.status] }}
      >
        <div>
          {isAdmin ? <p className="note-owner">Owner: {task.assignee}</p> : null}
          {isEditingArea ? (
            <input
              id={`task-area-${task.id}`}
              className="header-edit-input"
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
              className="header-editable note-squad"
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
          {isEditingTitle ? (
            <input
              id={`task-title-${task.id}`}
              className="header-edit-input header-edit-input-title"
              type="text"
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onBlur={submitTitle}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  submitTitle();
                }

                if (event.key === 'Escape') {
                  setDraftTitle(task.title);
                  setIsEditingTitle(false);
                }
              }}
              autoFocus
              aria-label={`Title for ${task.title}`}
              title="Task title"
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
        <div className="note-header-meta">
          {task.release ? <span className="release-pill">R {task.release}</span> : null}
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
          value={task.end}
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
          title="Effort in hours"
        />
        {task.blocked ? <span className="tag tag-alert">Blocked</span> : null}
        <label className="checkbox-row milestone-checkbox" htmlFor={`task-milestone-${task.id}`}>
          <input
            id={`task-milestone-${task.id}`}
            type="checkbox"
            checked={task.milestone}
            disabled={!canEdit || task.status !== 'Completed'}
            onChange={(event) => onUpdate(task.id, { milestone: event.target.checked })}
          />
          Milestone
        </label>
      </div>

      <div className="task-edit-grid compact-grid">
        <div className="date-field">
          <span className="mini-date">{formatFullDate(task.start)}</span>
          <input
            id={`task-start-${task.id}`}
            type="date"
            value={task.start}
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
            value={task.release}
            onChange={(event) => onUpdate(task.id, { release: event.target.value })}
            disabled={!canEdit}
            aria-label={`Release for ${task.title}`}
            title="Release"
            placeholder="24.4"
          />
        </div>
      </div>

      <input
        id={`task-bug-url-${task.id}`}
        type="url"
        value={task.bugUrl}
        onChange={(event) => onUpdate(task.id, { bugUrl: event.target.value })}
        disabled={!canEdit}
        placeholder="Bug or Jira URL"
        aria-label={`Bug or Jira URL for ${task.title}`}
        title="Bug or Jira URL"
      />
      <div className="task-link-row">
        {task.bugUrl ? (
          <button
            type="button"
            className="ghost-button task-link-button"
            onClick={() => window.open(task.bugUrl, '_blank', 'noopener,noreferrer')}
            aria-label={`Open linked ticket for ${task.title} in a new tab`}
            title="Open linked ticket in a new tab"
          >
            Open
          </button>
        ) : null}
      </div>

      <section className="comments-panel" aria-label={`${task.title} comments`}>
        <div className="comments-header">
          <strong>Comments</strong>
          <span>{sortedComments.length}</span>
        </div>

        <div className="comments-list">
          {visibleComments.length ? (
            visibleComments.map((comment) => (
              <article key={comment.id} className="comment-item">
                <div className="comment-date">{formatCommentDate(comment.createdAt)}</div>
                <p>{comment.text}</p>
              </article>
            ))
          ) : (
            <p className="muted-text">No comments yet.</p>
          )}
        </div>

        {hiddenCommentCount > 0 ? (
          <button
            type="button"
            className="text-button"
            onClick={() => setShowAllComments((current) => !current)}
          >
            {showAllComments
              ? 'Hide older comments'
              : `Show ${hiddenCommentCount} older comment${hiddenCommentCount > 1 ? 's' : ''}`}
          </button>
        ) : null}

        <textarea
          id={`task-comment-draft-${task.id}`}
          value={task.draftComment}
          onChange={(event) => onCommentDraftChange(task.id, event.target.value)}
          placeholder="Type an update and it will autosave while you write."
          aria-label={`Add comment for ${task.title}`}
          title="Add comment"
        />
        <button type="button" className="ghost-button" onClick={submitComment}>
          Add comment
        </button>
      </section>
    </article>
  );
}
