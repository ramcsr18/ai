import React, { useState } from 'react';
import { Task } from './services/api';
import { useTasks, useTeamMembers, useSprint, useStats } from './hooks/useApi';
import SprintHeader from './components/SprintHeader';
import SprintBoard from './components/SprintBoard';
import TaskModal from './components/TaskModal';
import { Sparkles, Loader2, AlertCircle } from 'lucide-react';

function App() {
  const { tasks, loading: tasksLoading, error: tasksError, createTask, updateTask, deleteTask } = useTasks();
  const { teamMembers, loading: teamLoading, error: teamError } = useTeamMembers();
  const { sprint, loading: sprintLoading, error: sprintError } = useSprint();
  const { stats, loading: statsLoading, error: statsError, refetch: refetchStats } = useStats();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const handleTaskCreate = () => {
    setEditingTask(null);
    setIsModalOpen(true);
  };

  const handleTaskEdit = (task: Task) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const handleTaskSave = async (taskData: Partial<Task>) => {
    try {
      if (editingTask && editingTask.id) {
      // Update existing task
        await updateTask(editingTask.id, taskData as Omit<Task, 'id' | 'created_at' | 'updated_at'>);
      } else {
      // Create new task
        await createTask(taskData as Omit<Task, 'id' | 'created_at' | 'updated_at'>);
    }
      refetchStats();
    } catch (error) {
      console.error('Failed to save task:', error);
    }
  };

  const handleTaskDelete = async (taskId: number) => {
    if (window.confirm('Are you sure you want to delete this task?')) {
      try {
        await deleteTask(taskId);
        refetchStats();
      } catch (error) {
        console.error('Failed to delete task:', error);
      }
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingTask(null);
  };

  const loading = tasksLoading || teamLoading || sprintLoading || statsLoading;
  const error = tasksError || teamError || sprintError || statsError;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="flex items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          <span className="text-gray-600">Loading sprint dashboard...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="w-6 h-6" />
          <span>Error: {error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-2">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Sprint Dashboard</h1>
            <p className="text-gray-600">Track progress, manage priorities, and coordinate your team</p>
          </div>
        </div>

        {/* Sprint Overview */}
        {sprint && <SprintHeader sprint={sprint} stats={stats} />}

        {/* Sprint Board */}
        <div className="min-h-[600px]">
          <SprintBoard
            tasks={tasks}
            onTaskEdit={handleTaskEdit}
            onTaskDelete={handleTaskDelete}
            onTaskCreate={handleTaskCreate}
          />
        </div>

        {/* Task Modal */}
        <TaskModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          onSave={handleTaskSave}
          task={editingTask}
          teamMembers={teamMembers || []}
        />
      </div>
    </div>
  );
}

export default App;