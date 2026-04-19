import { useEffect, useState } from 'react';
import StickyNote from './StickyNote';
import { STAGES } from '../data/seedData';
import { filterBoardTasks, sortTasksForStage } from '../utils/taskUtils';

export default function KanbanBoard({
  tasks,
  user,
  teamMembers,
  searchTerm,
  assigneeFilter,
  stageFilter,
  onTaskUpdate,
  onCommentDraftChange,
  onCommentAdd,
  onCommentUpdate,
  onTaskDelete,
}) {
  const [activeTaskIds, setActiveTaskIds] = useState({});
  const visibleTasks = filterBoardTasks(tasks, {
    searchTerm,
    assigneeFilter,
    stageFilter,
  });

  const allowTaskEditing = Boolean(user);

  const handleDrop = (event, stage) => {
    if (!allowTaskEditing) {
      return;
    }

    event.preventDefault();
    const taskId = event.dataTransfer.getData('text/plain');

    if (taskId) {
      onTaskUpdate(taskId, { status: stage });
    }
  };

  useEffect(() => {
    setActiveTaskIds((current) => {
      const next = {};
      let hasChanges = false;

      STAGES.forEach((stage) => {
        const stageTasks = sortTasksForStage(
          visibleTasks.filter((task) => task.status === stage)
        );
        const currentActiveTaskId = current[stage];
        const hasCurrentActiveTask = stageTasks.some((task) => task.id === currentActiveTaskId);
        const nextActiveTaskId = hasCurrentActiveTask
          ? currentActiveTaskId
          : stageTasks[0]?.id || null;

        next[stage] = nextActiveTaskId;

        if (nextActiveTaskId !== currentActiveTaskId) {
          hasChanges = true;
        }
      });

      return hasChanges ? next : current;
    });
  }, [visibleTasks]);

  return (
    <div className="kanban-container" aria-label="Sprint task board">
      {STAGES.map((stage) => {
        const stageTasks = sortTasksForStage(
          visibleTasks.filter((task) => task.status === stage)
        );
        const activeTaskId = activeTaskIds[stage] || stageTasks[0]?.id || null;

        return (
          <section
            key={stage}
            className="kanban-column"
            aria-labelledby={`column-${stage}`}
            onDragOver={(event) => {
              if (allowTaskEditing) {
                event.preventDefault();
              }
            }}
            onDrop={(event) => handleDrop(event, stage)}
          >
            <header className="kanban-column-header">
              <div className="kanban-column-heading">
                <h3 id={`column-${stage}`}>{stage}</h3>
                <span className="column-count">{stageTasks.length}</span>
              </div>
            </header>

            <div className="kanban-cards">
              {stageTasks.length ? (
                stageTasks.map((task, index) => (
                  <StickyNote
                    key={task.id}
                    task={task}
                    isActive={task.id === activeTaskId}
                    sequenceNumber={index + 1}
                    stackIndex={index}
                    stackDepth={stageTasks.length}
                    isAdmin={user?.role === 'admin'}
                    teamMembers={teamMembers}
                    canEdit={allowTaskEditing}
                    onUpdate={onTaskUpdate}
                    onCommentDraftChange={onCommentDraftChange}
                    onCommentAdd={onCommentAdd}
                    onCommentUpdate={onCommentUpdate}
                    onDelete={onTaskDelete}
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/plain', task.id);
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                    onActivate={() =>
                      setActiveTaskIds((current) => ({
                        ...current,
                        [stage]: task.id,
                      }))
                    }
                    stageOptions={STAGES}
                  />
                ))
              ) : (
                <div className="empty-column">
                  <p>No tasks match this stage.</p>
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
