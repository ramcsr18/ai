const API_BASE_URL = 'http://localhost:5000/api';

export interface Task {
  id?: number;
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  status: 'Backlog' | 'In Progress' | 'Review' | 'Done';
  assignee: string;
  eta: string;
  jira_url?: string;
  bug_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface TeamMember {
  id: number;
  name: string;
  avatar: string;
  role: string;
}

export interface Sprint {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  created_at?: string;
}

export interface Stats {
  total_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
  high_priority_tasks: number;
  completion_rate: number;
}

class ApiService {
  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }

    return response.json();
  }

  // Task operations
  async getTasks(): Promise<Task[]> {
    return this.request<Task[]>('/tasks');
  }

  async createTask(task: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<Task> {
    return this.request<Task>('/tasks', {
      method: 'POST',
      body: JSON.stringify(task),
    });
  }

  async updateTask(id: number, task: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<Task> {
    return this.request<Task>(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(task),
    });
  }

  async deleteTask(id: number): Promise<void> {
    await this.request(`/tasks/${id}`, {
      method: 'DELETE',
    });
  }

  // Team operations
  async getTeamMembers(): Promise<TeamMember[]> {
    return this.request<TeamMember[]>('/team-members');
  }

  // Sprint operations
  async getCurrentSprint(): Promise<Sprint> {
    return this.request<Sprint>('/sprints/current');
  }

  // Stats operations
  async getStats(): Promise<Stats> {
    return this.request<Stats>('/stats');
  }
}

export const apiService = new ApiService();