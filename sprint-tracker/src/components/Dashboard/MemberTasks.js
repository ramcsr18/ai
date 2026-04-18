// components/Dashboard/MemberTasks.js
import React, { useContext } from 'react';
import { TaskContext } from '../../context/TaskContext';
import StickyNote from '../Common/StickyNote';

function MemberTasks() {
  const { teamTasks, currentUser, updateTask } = useContext(TaskContext);

  return (
    <div style={{ display: "flex", flexWrap: "wrap" }}>
      {teamTasks.filter(t => t.owner === currentUser).map(task =>
        <StickyNote
          key={task.id}
          task={task}
          onUpdate={() => {/* open modal or inline update */}}
          isEditable={true}
        />
      )}
    </div>
  );
}
export default MemberTasks;