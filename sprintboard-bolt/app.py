from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import json
from datetime import datetime
import os

app = Flask(__name__)
CORS(app)

DATABASE = 'sprint_dashboard.db'

def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    
    # Create tasks table
    conn.execute('''
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            priority TEXT NOT NULL DEFAULT 'Medium',
            status TEXT NOT NULL DEFAULT 'Backlog',
            assignee TEXT NOT NULL,
            eta DATE NOT NULL,
            jira_url TEXT,
            bug_url TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create team_members table
    conn.execute('''
        CREATE TABLE IF NOT EXISTS team_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            avatar TEXT NOT NULL,
            role TEXT NOT NULL
        )
    ''')
    
    # Create sprints table
    conn.execute('''
        CREATE TABLE IF NOT EXISTS sprints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Insert sample team members if table is empty
    team_count = conn.execute('SELECT COUNT(*) FROM team_members').fetchone()[0]
    if team_count == 0:
        team_members = [
            ('Alex Johnson', 'AJ', 'Frontend Developer'),
            ('Sarah Chen', 'SC', 'Backend Developer'),
            ('Mike Rodriguez', 'MR', 'DevOps Engineer'),
            ('Emily Davis', 'ED', 'QA Engineer'),
            ('James Wilson', 'JW', 'Product Manager')
        ]
        
        for name, avatar, role in team_members:
            conn.execute(
                'INSERT INTO team_members (name, avatar, role) VALUES (?, ?, ?)',
                (name, avatar, role)
            )
    
    # Insert sample sprint if table is empty
    sprint_count = conn.execute('SELECT COUNT(*) FROM sprints').fetchone()[0]
    if sprint_count == 0:
        conn.execute(
            'INSERT INTO sprints (name, start_date, end_date) VALUES (?, ?, ?)',
            ('Sprint 24.1 - Authentication & Performance', '2025-01-15', '2025-01-29')
        )
    
    # Insert sample tasks if table is empty
    task_count = conn.execute('SELECT COUNT(*) FROM tasks').fetchone()[0]
    if task_count == 0:
        sample_tasks = [
            ('Implement user authentication', 'Add login and registration functionality with JWT tokens', 'High', 'In Progress', 'Alex Johnson', '2025-01-25', 'https://company.atlassian.net/browse/PROJ-123', ''),
            ('Fix dashboard loading issue', 'Dashboard takes too long to load, optimize queries', 'High', 'Backlog', 'Sarah Chen', '2025-01-22', 'https://company.atlassian.net/browse/PROJ-124', 'https://company.atlassian.net/browse/BUG-456'),
            ('Setup CI/CD pipeline', 'Configure automated deployment pipeline with Docker', 'Medium', 'Review', 'Mike Rodriguez', '2025-01-28', 'https://company.atlassian.net/browse/PROJ-125', ''),
            ('Write unit tests', 'Add comprehensive test coverage for API endpoints', 'Medium', 'Done', 'Emily Davis', '2025-01-20', 'https://company.atlassian.net/browse/PROJ-126', ''),
            ('Update user documentation', 'Revise API documentation and user guides', 'Low', 'Backlog', 'James Wilson', '2025-01-30', 'https://company.atlassian.net/browse/PROJ-127', '')
        ]
        
        for title, desc, priority, status, assignee, eta, jira, bug in sample_tasks:
            conn.execute(
                'INSERT INTO tasks (title, description, priority, status, assignee, eta, jira_url, bug_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                (title, desc, priority, status, assignee, eta, jira, bug)
            )
    
    conn.commit()
    conn.close()

# API Routes

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    conn = get_db_connection()
    tasks = conn.execute('SELECT * FROM tasks ORDER BY created_at DESC').fetchall()
    conn.close()
    
    return jsonify([dict(task) for task in tasks])

@app.route('/api/tasks', methods=['POST'])
def create_task():
    data = request.json
    
    conn = get_db_connection()
    cursor = conn.execute(
        'INSERT INTO tasks (title, description, priority, status, assignee, eta, jira_url, bug_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        (data['title'], data.get('description', ''), data['priority'], data['status'], 
         data['assignee'], data['eta'], data.get('jira_url', ''), data.get('bug_url', ''))
    )
    
    task_id = cursor.lastrowid
    conn.commit()
    
    # Get the created task
    task = conn.execute('SELECT * FROM tasks WHERE id = ?', (task_id,)).fetchone()
    conn.close()
    
    return jsonify(dict(task)), 201

@app.route('/api/tasks/<int:task_id>', methods=['PUT'])
def update_task(task_id):
    data = request.json
    
    conn = get_db_connection()
    conn.execute(
        'UPDATE tasks SET title = ?, description = ?, priority = ?, status = ?, assignee = ?, eta = ?, jira_url = ?, bug_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        (data['title'], data.get('description', ''), data['priority'], data['status'],
         data['assignee'], data['eta'], data.get('jira_url', ''), data.get('bug_url', ''), task_id)
    )
    
    # Get the updated task
    task = conn.execute('SELECT * FROM tasks WHERE id = ?', (task_id,)).fetchone()
    conn.commit()
    conn.close()
    
    if task:
        return jsonify(dict(task))
    else:
        return jsonify({'error': 'Task not found'}), 404

@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    conn = get_db_connection()
    cursor = conn.execute('DELETE FROM tasks WHERE id = ?', (task_id,))
    conn.commit()
    conn.close()
    
    if cursor.rowcount > 0:
        return jsonify({'message': 'Task deleted successfully'})
    else:
        return jsonify({'error': 'Task not found'}), 404

@app.route('/api/team-members', methods=['GET'])
def get_team_members():
    conn = get_db_connection()
    members = conn.execute('SELECT * FROM team_members ORDER BY name').fetchall()
    conn.close()
    
    return jsonify([dict(member) for member in members])

@app.route('/api/sprints/current', methods=['GET'])
def get_current_sprint():
    conn = get_db_connection()
    sprint = conn.execute('SELECT * FROM sprints ORDER BY created_at DESC LIMIT 1').fetchone()
    conn.close()
    
    if sprint:
        return jsonify(dict(sprint))
    else:
        return jsonify({'error': 'No sprint found'}), 404

@app.route('/api/stats', methods=['GET'])
def get_stats():
    conn = get_db_connection()
    
    total_tasks = conn.execute('SELECT COUNT(*) as count FROM tasks').fetchone()['count']
    completed_tasks = conn.execute('SELECT COUNT(*) as count FROM tasks WHERE status = "Done"').fetchone()['count']
    in_progress_tasks = conn.execute('SELECT COUNT(*) as count FROM tasks WHERE status = "In Progress"').fetchone()['count']
    high_priority_tasks = conn.execute('SELECT COUNT(*) as count FROM tasks WHERE priority = "High"').fetchone()['count']
    
    conn.close()
    
    completion_rate = round((completed_tasks / total_tasks) * 100) if total_tasks > 0 else 0
    
    return jsonify({
        'total_tasks': total_tasks,
        'completed_tasks': completed_tasks,
        'in_progress_tasks': in_progress_tasks,
        'high_priority_tasks': high_priority_tasks,
        'completion_rate': completion_rate
    })

if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=5000)