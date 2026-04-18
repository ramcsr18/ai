// components/Common/StickyNote.js
import React from 'react';
import { STATUS_COLORS } from '../../utils/constants';

function StickyNote({ task, onUpdate, isEditable }) {
  const color = STATUS_COLORS[task.status] || "#bdc3c7";
  return (
    <div style={{
      background: color, padding: 10, margin: 8, borderRadius: 8, minWidth: 180
    }}>
      <div><strong>{task.title}</strong></div>
      <div>Status: {task.status}</div>
      <div>Start: {task.start}</div>
      <div>End: {task.end}</div>
      <div>Effort: {task.effort}h</div>
      <div>Comments: {task.comments}</div>
      {isEditable &&
        <button onClick={() => onUpdate(task.id)}>Update</button>
      }
    </div>
  );
}
export default StickyNote;