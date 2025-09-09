class SprintDashboard {
    constructor() {
        this.socket = io();
        this.notes = [];
        this.teamMembers = [];
        this.currentFilter = 'all';
        this.editingNote = null;
        
        this.init();
    }

    async init() {
        await this.loadTeamMembers();
        await this.loadNotes();
        this.setupEventListeners();
        this.setupSocketListeners();
        this.populateTeamFilter();
        this.populateAssigneeSelect();
        this.updateTaskCounts();
    }

    async loadTeamMembers() {
        try {
            const response = await fetch('/api/team');
            this.teamMembers = await response.json();
        } catch (error) {
            console.error('Error loading team members:', error);
        }
    }

    async loadNotes() {
        try {
            const response = await fetch('/api/notes');
            this.notes = await response.json();
            this.renderNotes();
        } catch (error) {
            console.error('Error loading notes:', error);
        }
    }

    setupEventListeners() {
        // Add note button
        document.getElementById('add-note-btn').addEventListener('click', () => {
            this.openNoteModal();
        });

        // Modal controls
        document.querySelector('.close').addEventListener('click', () => {
            this.closeNoteModal();
        });

        document.getElementById('cancel-btn').addEventListener('click', () => {
            this.closeNoteModal();
        });

        // Form submission
        document.getElementById('note-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveNote();
        });

        // Filter buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('filter-btn')) {
                this.setFilter(e.target.dataset.member);
            }
        });

        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            const modal = document.getElementById('note-modal');
            if (e.target === modal) {
                this.closeNoteModal();
            }
        });
    }

    setupSocketListeners() {
        this.socket.on('noteCreated', (note) => {
            this.notes.push(note);
            this.renderNotes();
            this.updateTaskCounts();
        });

        this.socket.on('noteUpdated', (note) => {
            const index = this.notes.findIndex(n => n.id === note.id);
            if (index !== -1) {
                this.notes[index] = note;
                this.renderNotes();
                this.updateTaskCounts();
            }
        });

        this.socket.on('noteDeleted', (noteId) => {
            this.notes = this.notes.filter(n => n.id !== noteId);
            this.renderNotes();
            this.updateTaskCounts();
        });

        this.socket.on('noteMoved', (data) => {
            const note = this.notes.find(n => n.id === data.id);
            if (note) {
                note.x = data.x;
                note.y = data.y;
            }
        });
    }

    populateTeamFilter() {
        const container = document.getElementById('team-filters');
        container.innerHTML = '';

        this.teamMembers.forEach(member => {
            const btn = document.createElement('button');
            btn.className = 'filter-btn';
            btn.dataset.member = member.id;
            btn.style.borderColor = member.color;
            btn.innerHTML = `<span style="background: ${member.color}; width: 12px; height: 12px; border-radius: 50%; display: inline-block; margin-right: 0.5rem;"></span>${member.name}`;
            container.appendChild(btn);
        });
    }

    populateAssigneeSelect() {
        const select = document.getElementById('assigned-to');
        select.innerHTML = '<option value="">Select team member</option>';

        this.teamMembers.forEach(member => {
            const option = document.createElement('option');
            option.value = member.id;
            option.textContent = member.name;
            select.appendChild(option);
        });
    }

    setFilter(memberId) {
        this.currentFilter = memberId;
        
        // Update active filter button
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const activeBtn = document.querySelector(`[data-member="${memberId}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }

        this.renderNotes();
    }

    renderNotes() {
        // Clear all columns
        const columns = ['todo', 'in-progress', 'review', 'done'];
        columns.forEach(status => {
            document.getElementById(`${status}-column`).innerHTML = '';
        });

        // Filter and render notes
        const filteredNotes = this.currentFilter === 'all' 
            ? this.notes 
            : this.notes.filter(note => note.assignedTo == this.currentFilter);

        filteredNotes.forEach(note => {
            const noteElement = this.createNoteElement(note);
            const column = document.getElementById(`${note.status}-column`);
            if (column) {
                column.appendChild(noteElement);
            }
        });

        this.updateTaskCounts();
    }

    createNoteElement(note) {
        const member = this.teamMembers.find(m => m.id == note.assignedTo);
        const noteDiv = document.createElement('div');
        noteDiv.className = 'sticky-note';
        noteDiv.dataset.noteId = note.id;
        noteDiv.style.borderLeftColor = member ? member.color : '#ffeaa7';
        noteDiv.style.borderLeftWidth = '4px';

        // Format ETA
        let etaHtml = '';
        if (note.eta) {
            const etaDate = new Date(note.eta);
            const today = new Date();
            const isOverdue = etaDate < today;
            const etaClass = isOverdue ? 'eta-overdue' : '';
            
            etaHtml = `
                <span class="eta-badge ${etaClass}">
                    <i class="fas fa-calendar"></i>
                    ${etaDate.toLocaleDateString()}
                    ${isOverdue ? '(Overdue)' : ''}
                </span>
            `;
        }

        // Format links
        let linksHtml = '';
        if (note.jiraLink || note.bugLink) {
            linksHtml = '<div class="note-links">';
            if (note.jiraLink) {
                linksHtml += `<a href="${note.jiraLink}" target="_blank" class="link-btn jira-link"><i class="fab fa-jira"></i> Jira</a>`;
            }
            if (note.bugLink) {
                linksHtml += `<a href="${note.bugLink}" target="_blank" class="link-btn bug-link"><i class="fas fa-bug"></i> Bug</a>`;
            }
            linksHtml += '</div>';
        }

        noteDiv.innerHTML = `
            <div class="note-header">
                <div class="note-title">${note.title}</div>
                <div class="note-actions">
                    <button class="note-action edit-note" data-note-id="${note.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="note-action delete-note" data-note-id="${note.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            ${note.description ? `<div class="note-description">${note.description}</div>` : ''}
            <div class="note-meta">
                ${member ? `
                    <div class="note-assignee">
                        <div class="assignee-avatar" style="background: ${member.color}">
                            ${member.name.charAt(0)}
                        </div>
                        ${member.name}
                    </div>
                ` : ''}
                <span class="priority-badge priority-${note.priority}">${note.priority}</span>
                ${etaHtml}
            </div>
            ${linksHtml}
        `;

        // Add event listeners
        noteDiv.querySelector('.edit-note').addEventListener('click', () => {
            this.editNote(note.id);
        });

        noteDiv.querySelector('.delete-note').addEventListener('click', () => {
            this.deleteNote(note.id);
        });

        // Make draggable
        this.makeDraggable(noteDiv);

        return noteDiv;
    }

    makeDraggable(element) {
        let isDragging = false;
        let startX, startY, initialMouseX, initialMouseY;

        element.addEventListener('mousedown', (e) => {
            if (e.target.closest('.note-action')) return;
            
            isDragging = true;
            element.classList.add('dragging');
            
            const rect = element.getBoundingClientRect();
            startX = rect.left;
            startY = rect.top;
            initialMouseX = e.clientX;
            initialMouseY = e.clientY;

            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const deltaX = e.clientX - initialMouseX;
            const deltaY = e.clientY - initialMouseY;
            
            element.style.position = 'fixed';
            element.style.left = (startX + deltaX) + 'px';
            element.style.top = (startY + deltaY) + 'px';
            element.style.zIndex = '1000';
        });

        document.addEventListener('mouseup', (e) => {
            if (!isDragging) return;

            isDragging = false;
            element.classList.remove('dragging');
            
            // Find the column we're dropping into
            const columns = document.querySelectorAll('.column');
            let targetColumn = null;
            
            columns.forEach(column => {
                const rect = column.getBoundingClientRect();
                if (e.clientX >= rect.left && e.clientX <= rect.right &&
                    e.clientY >= rect.top && e.clientY <= rect.bottom) {
                    targetColumn = column;
                }
            });

            // Reset position styles
            element.style.position = '';
            element.style.left = '';
            element.style.top = '';
            element.style.zIndex = '';

            if (targetColumn) {
                const newStatus = targetColumn.dataset.status;
                const noteId = element.dataset.noteId;
                this.updateNoteStatus(noteId, newStatus);
                
                // Move element to target column
                targetColumn.querySelector('.column-content').appendChild(element);
            }
        });
    }

    async updateNoteStatus(noteId, newStatus) {
        try {
            const note = this.notes.find(n => n.id === noteId);
            if (note && note.status !== newStatus) {
                const response = await fetch(`/api/notes/${noteId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ ...note, status: newStatus })
                });

                if (response.ok) {
                    const updatedNote = await response.json();
                    const index = this.notes.findIndex(n => n.id === noteId);
                    if (index !== -1) {
                        this.notes[index] = updatedNote;
                    }
                    this.updateTaskCounts();
                }
            }
        } catch (error) {
            console.error('Error updating note status:', error);
        }
    }

    updateTaskCounts() {
        const statusCounts = {
            'todo': 0,
            'in-progress': 0,
            'review': 0,
            'done': 0
        };

        const filteredNotes = this.currentFilter === 'all' 
            ? this.notes 
            : this.notes.filter(note => note.assignedTo == this.currentFilter);

        filteredNotes.forEach(note => {
            if (statusCounts.hasOwnProperty(note.status)) {
                statusCounts[note.status]++;
            }
        });

        Object.keys(statusCounts).forEach(status => {
            const countElement = document.querySelector(`[data-status="${status}"] .task-count`);
            if (countElement) {
                countElement.textContent = statusCounts[status];
            }
        });
    }

    openNoteModal(note = null) {
        this.editingNote = note;
        const modal = document.getElementById('note-modal');
        const form = document.getElementById('note-form');
        const title = document.getElementById('modal-title');

        // Reset form
        form.reset();

        if (note) {
            title.textContent = 'Edit Task';
            document.getElementById('task-title').value = note.title || '';
            document.getElementById('task-description').value = note.description || '';
            document.getElementById('assigned-to').value = note.assignedTo || '';
            document.getElementById('task-status').value = note.status || 'todo';
            document.getElementById('task-priority').value = note.priority || 'medium';
            document.getElementById('task-eta').value = note.eta || '';
            document.getElementById('jira-link').value = note.jiraLink || '';
            document.getElementById('bug-link').value = note.bugLink || '';
        } else {
            title.textContent = 'Add New Task';
            document.getElementById('task-priority').value = 'medium';
            document.getElementById('task-status').value = 'todo';
        }

        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    closeNoteModal() {
        const modal = document.getElementById('note-modal');
        modal.style.display = 'none';
        document.body.style.overflow = '';
        this.editingNote = null;
    }

    async saveNote() {
        const formData = {
            title: document.getElementById('task-title').value,
            description: document.getElementById('task-description').value,
            assignedTo: document.getElementById('assigned-to').value,
            status: document.getElementById('task-status').value,
            priority: document.getElementById('task-priority').value,
            eta: document.getElementById('task-eta').value,
            jiraLink: document.getElementById('jira-link').value,
            bugLink: document.getElementById('bug-link').value
        };

        try {
            let response;
            if (this.editingNote) {
                response = await fetch(`/api/notes/${this.editingNote.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ ...this.editingNote, ...formData })
                });
            } else {
                response = await fetch('/api/notes', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(formData)
                });
            }

            if (response.ok) {
                const note = await response.json();
                if (this.editingNote) {
                    const index = this.notes.findIndex(n => n.id === this.editingNote.id);
                    if (index !== -1) {
                        this.notes[index] = note;
                    }
                } else {
                    this.notes.push(note);
                }
                this.renderNotes();
                this.closeNoteModal();
            }
        } catch (error) {
            console.error('Error saving note:', error);
            alert('Error saving task. Please try again.');
        }
    }

    editNote(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        if (note) {
            this.openNoteModal(note);
        }
    }

    async deleteNote(noteId) {
        if (confirm('Are you sure you want to delete this task?')) {
            try {
                const response = await fetch(`/api/notes/${noteId}`, {
                    method: 'DELETE'
                });

                if (response.ok) {
                    this.notes = this.notes.filter(n => n.id !== noteId);
                    this.renderNotes();
                }
            } catch (error) {
                console.error('Error deleting note:', error);
                alert('Error deleting task. Please try again.');
            }
        }
    }
}

// Initialize the dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SprintDashboard();
});
