import StickyNote from './StickyNote';
import { STAGES } from '../data/seedData';
import { sortTasksForStage } from '../utils/taskUtils';

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
}) {
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const visibleTasks = tasks.filter((task) => {
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

  return (
    <div className="kanban-container" aria-label="Sprint task board">
      {STAGES.map((stage) => {
        const stageTasks = sortTasksForStage(
          visibleTasks.filter((task) => task.status === stage)
        );

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
              <div>
                <h3 id={`column-${stage}`}>{stage}</h3>
              </div>
              <span className="column-count">{stageTasks.length}</span>
            </header>

            <div className="kanban-cards">
              {stageTasks.length ? (
                stageTasks.map((task, index) => (
                  <StickyNote
                    key={task.id}
                    task={task}
                    stackIndex={index}
                    stackDepth={stageTasks.length}
                    isAdmin={user?.role === 'admin'}
                    teamMembers={teamMembers}
                    canEdit={allowTaskEditing}
                    onUpdate={onTaskUpdate}
                    onCommentDraftChange={onCommentDraftChange}
                    onCommentAdd={onCommentAdd}
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/plain', task.id);
                      event.dataTransfer.effectAllowed = 'move';
                    }}
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
