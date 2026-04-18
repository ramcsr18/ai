import React from 'react';
import { Task } from '../services/api';
import { Calendar, ExternalLink, User, AlertCircle } from 'lucide-react';

interface TaskCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (taskId: number) => void;
}

const priorityColors = {
  High: 'bg-red-100 border-red-300 text-red-800',
  Medium: 'bg-orange-100 border-orange-300 text-orange-800',
  Low: 'bg-green-100 border-green-300 text-green-800',
};

const priorityDots = {
  High: 'bg-red-500',
  Medium: 'bg-orange-500',
  Low: 'bg-green-500',
};

export default function TaskCard({ task, onEdit, onDelete }: TaskCardProps) {
  const isOverdue = new Date(task.eta) < new Date() && task.status !== 'Done';
  
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${priorityDots[task.priority]}`}></div>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityColors[task.priority]}`}>
            {task.priority}
          </span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => onEdit(task)}
            className="text-gray-400 hover:text-blue-600 transition-colors"
            title="Edit task"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="text-gray-400 hover:text-red-600 transition-colors"
            title="Delete task"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9zM4 5a2 2 0 012-2h8a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 112 0v4a1 1 0 11-2 0V9zm4 0a1 1 0 112 0v4a1 1 0 11-2 0V9z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
      
      <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">{task.title}</h3>
      <p className="text-sm text-gray-600 mb-3 line-clamp-3">{task.description}</p>
      
      <div className="flex items-center gap-2 mb-3">
        <User className="w-4 h-4 text-gray-400" />
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-xs font-medium text-white">
            {task.assignee.split(' ').map(n => n[0]).join('')}
          </div>
          <span className="text-sm text-gray-700">{task.assignee}</span>
        </div>
      </div>
      
      <div className={`flex items-center gap-2 mb-3 ${isOverdue ? 'text-red-600' : 'text-gray-600'}`}>
        <Calendar className="w-4 h-4" />
        <span className="text-sm">Due: {new Date(task.eta).toLocaleDateString()}</span>
        {isOverdue && <AlertCircle className="w-4 h-4 text-red-500" />}
      </div>
      
      {(task.jira_url || task.bug_url) && (
        <div className="flex gap-2 pt-3 border-t border-gray-100">
          {task.jira_url && (
            <a
              href={task.jira_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Jira
            </a>
          )}
          {task.bug_url && (
            <a
              href={task.bug_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Bug
            </a>
          )}
        </div>
      )}
    </div>
  );
}