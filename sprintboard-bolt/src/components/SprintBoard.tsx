import React, { useState } from 'react';
import { Task } from '../services/api';
import TaskCard from './TaskCard';
import { Plus } from 'lucide-react';

interface SprintBoardProps {
  tasks: Task[];
  onTaskEdit: (task: Task) => void;
  onTaskDelete: (taskId: number) => void;
  onTaskCreate: () => void;
}

const columns = [
  { id: 'Backlog', title: 'Backlog', bgColor: 'bg-gray-50', borderColor: 'border-gray-200' },
  { id: 'In Progress', title: 'In Progress', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
  { id: 'Review', title: 'Review', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200' },
  { id: 'Done', title: 'Done', bgColor: 'bg-green-50', borderColor: 'border-green-200' },
] as const;

export default function SprintBoard({ tasks, onTaskEdit, onTaskDelete, onTaskCreate }: SprintBoardProps) {
  const [draggedTask, setDraggedTask] = useState<number | null>(null);

  const getTasksByStatus = (status: Task['status']) => {
    return tasks.filter(task => task.status === status);
  };

  const handleDragStart = (e: React.DragEvent, taskId: number) => {
    setDraggedTask(taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, status: Task['status']) => {
    e.preventDefault();
    if (draggedTask) {
      const task = tasks.find(t => t.id === draggedTask);
      if (task && task.status !== status) {
        onTaskEdit({ ...task, status });
      }
    }
    setDraggedTask(null);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 h-full">
      {columns.map((column) => {
        const columnTasks = getTasksByStatus(column.id as Task['status']);
        
        return (
          <div
            key={column.id}
            className={`${column.bgColor} rounded-lg border-2 ${column.borderColor} p-4`}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, column.id as Task['status'])}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-900">{column.title}</h3>
                <span className="bg-white text-gray-600 text-sm px-2 py-1 rounded-full">
                  {columnTasks.length}
                </span>
              </div>
              {column.id === 'Backlog' && (
                <button
                  onClick={onTaskCreate}
                  className="p-1 text-gray-500 hover:text-blue-600 hover:bg-white rounded transition-colors"
                  title="Add new task"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
            
            <div className="space-y-3 min-h-[200px]">
              {columnTasks.map((task) => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, task.id!)}
                  className={`cursor-move ${draggedTask === task.id ? 'opacity-50' : ''}`}
                >
                  <TaskCard
                    task={task}
                    onEdit={onTaskEdit}
                    onDelete={onTaskDelete}
                  />
                </div>
              ))}
              
              {columnTasks.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  <div className="text-4xl mb-2">📝</div>
                  <p className="text-sm">No tasks in {column.title.toLowerCase()}</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}