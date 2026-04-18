import React from 'react';
import { Sprint, Task, Stats } from '../services/api';
import { Calendar, Users, Target, TrendingUp } from 'lucide-react';

interface SprintHeaderProps {
  sprint: Sprint;
  stats: Stats | null;
}

export default function SprintHeader({ sprint, stats }: SprintHeaderProps) {
  const totalTasks = stats?.total_tasks || 0;
  const completedTasks = stats?.completed_tasks || 0;
  const inProgressTasks = stats?.in_progress_tasks || 0;
  const highPriorityTasks = stats?.high_priority_tasks || 0;
  const completionRate = stats?.completion_rate || 0;
  
  const daysLeft = Math.max(0, Math.ceil((new Date(sprint.end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)));
  
  const stats = [
    { label: 'Total Tasks', value: totalTasks, icon: Target, color: 'text-blue-600' },
    { label: 'Completed', value: completedTasks, icon: TrendingUp, color: 'text-green-600' },
    { label: 'In Progress', value: inProgressTasks, icon: Users, color: 'text-orange-600' },
    { label: 'High Priority', value: highPriorityTasks, icon: Calendar, color: 'text-red-600' },
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{sprint.name}</h1>
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>
                {new Date(sprint.start_date).toLocaleDateString()} - {new Date(sprint.end_date).toLocaleDateString()}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className={`font-medium ${daysLeft <= 3 ? 'text-red-600' : 'text-gray-900'}`}>
                {daysLeft} days left
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="text-right mr-4">
            <div className="text-2xl font-bold text-gray-900">{completionRate}%</div>
            <div className="text-sm text-gray-600">Completion</div>
          </div>
          <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {stats_data.map((stat) => (
          <div key={stat.label} className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
              </div>
              <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}