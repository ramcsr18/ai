import { useMemo, useState } from 'react';
import {
  createComment,
  formatCommentDate,
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
};

const priorityOptions = ['High', 'Medium', 'Low'];

export default function StickyNote({
  task,
  stackIndex,
  stackDepth,
  onUpdate,
  onCommentDraftChange,
  onCommentAdd,
  onDragStart,
  canEdit,
  stageOptions,
}) {
  const [showAllComments, setShowAllComments] = useState(false);
  const titleToneClass = getTaskTitleTone(task);

  const sortedComments = useMemo(
    () =>
      [...task.comments].sort(
        (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      ),
    [task.comments]
  );

  const visibleComments = showAllComments ? sortedComments : sortedComments.slice(0, 5);
  const hiddenCommentCount = Math.max(sortedComments.length - 5, 0);

  const submitComment = () => {
    const trimmedDraft = task.draftComment.trim();

    if (!trimmedDraft) {
      return;
    }

    onCommentAdd(task.id, createComment(trimmedDraft));
  };

  return (
    <article
      className={`sticky-note ${canEdit ? 'sticky-note-draggable' : ''}`}
      style={{
        backgroundColor: statusColors[task.status],
        zIndex: Math.max(stackDepth - stackIndex, 1),
      }}
      aria-label={`${task.title} task card`}
      draggable={canEdit}
      onDragStart={canEdit ? onDragStart : undefined}
    >
      <div className="note-meta note-meta-top">
        <span className="mini-date note-pill" title="Due date">
          Due {task.end}
        </span>
        <span className={`tag tag-${task.priority.toLowerCase()}`}>{task.priority}</span>
        {task.blocked ? <span className="tag tag-alert">Blocked</span> : <span className="tag">On track</span>}
      </div>

      <div className="note-header">
        <div>
          <p className="note-squad">{task.squad}</p>
          <h4
            className={`note-title ${titleToneClass}`}
            title={`Due ${task.end} • Priority ${task.priority}`}
          >
            {task.title}
          </h4>
        </div>
        <div className="note-header-meta">
          <span className="effort">{task.effort}h</span>
          {canEdit ? <span className="drag-pill">Drag</span> : null}
        </div>
      </div>

      <div className="task-edit-grid compact-grid">
        <select
          id={`task-priority-${task.id}`}
          className="note-select"
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

        <select
          id={`task-status-${task.id}`}
          className="note-select"
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
          id={`task-start-${task.id}`}
          type="date"
          value={task.start}
          onChange={(event) => onUpdate(task.id, { start: event.target.value })}
          disabled={!canEdit}
          aria-label={`Start date for ${task.title}`}
          title="Start date"
        />

        <input
          id={`task-end-${task.id}`}
          type="date"
          value={task.end}
          onChange={(event) => onUpdate(task.id, { end: event.target.value })}
          disabled={!canEdit}
          aria-label={`End date for ${task.title}`}
          title="End date"
        />
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
      {task.bugUrl ? (
        <a className="task-link" href={task.bugUrl} target="_blank" rel="noreferrer">
          Open linked ticket
        </a>
      ) : null}

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

      <div className="note-footer">
        <span>Owner: {task.assignee}</span>
        <span>{canEdit ? 'Live task edits enabled' : 'View-only access'}</span>
      </div>
    </article>
  );
}
