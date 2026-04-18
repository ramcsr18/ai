// components/Dashboard/SprintBoard.js
import React, { useContext } from 'react';
import { TaskContext } from '../../context/TaskContext';
import { TASK_STATUSES } from '../../utils/constants';
import StickyNote from '../Common/StickyNote';

function SprintBoard() {
  const { tasks, moveTask, isAdmin } = useContext(TaskContext);

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      {TASK_STATUSES.map(status => (
        <div key={status} style={{ flex: 1 }}>
          <h3>{status}</h3>
          {tasks.filter(task => task.status === status).map(task =>
            <StickyNote
              key={task.id}
              task={task}
              isEditable={isAdmin || task.owner === currentUser}
              onUpdate={() => moveTask(task.id)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
export default SprintBoard;