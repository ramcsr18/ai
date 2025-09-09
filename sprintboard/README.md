
# Sprint Dashboard

A modern, interactive Sprint Dashboard for agile teams with drag-and-drop functionality, real-time updates, and team collaboration features.

## Features

- **Kanban Board**: Drag and drop tasks between To Do, In Progress, Review, and Done columns
- **Team Management**: Filter tasks by team members with color-coded assignments
- **Priority System**: Visual priority indicators (Low, Medium, High, Critical)
- **ETA Tracking**: Due date management with overdue notifications
- **External Links**: Direct links to Jira tickets and bug reports
- **Real-time Updates**: Live synchronization across all connected users
- **Responsive Design**: Works on desktop, tablet, and mobile devices

## Installation

1. Clone or create the project directory
2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```
   Or for production:
   ```bash
   npm start
   ```

4. Open your browser and navigate to `http://localhost:3000`

## File Structure

```
sprint-dashboard/
├── package.json
├── server.js
├── public/
│   ├── index.html
│   ├── style.css
│   └── script.js
└── README.md
```

## Usage

### Adding Tasks
1. Click the "Add Task" button in the header
2. Fill in the task details:
   - Title (required)
   - Description
   - Assign to team member (required)
   - Status (To Do, In Progress, Review, Done)
   - Priority (Low, Medium, High, Critical)
   - ETA (due date)
   - Jira link
   - Bug report link
3. Click "Save Task"

### Managing Tasks
- **Move Tasks**: Drag and drop tasks between columns
- **Edit Tasks**: Click the edit icon on any task
- **Delete Tasks**: Click the trash icon on any task
- **Filter by Team Member**: Use the filter buttons at the top

### Team Collaboration
- All changes are synchronized in real-time across all connected users
- Each team member has a unique color for easy identification
- Task counts are updated automatically for each column

## Customization

### Adding Team Members
Edit the `teamMembers` array in `server.js`:

```javascript
let teamMembers = [
  { id: 1, name: 'Your Name', color: '#FF6B6B' },
  // Add more team members...
];
```

### Styling
Modify `public/style.css` to change colors, fonts, or layout.

### Database Integration
For production use, replace the in-memory storage with a proper database:
- MongoDB with Mongoose
- PostgreSQL with Sequelize
- MySQL with Sequelize

## Production Deployment

1. Set the PORT environment variable
2. Use a process manager like PM2:
   ```bash
   npm install -g pm2
   pm2 start server.js --name "sprint-dashboard"
   ```
3. Configure a reverse proxy with Nginx
4. Use a proper database instead of in-memory storage

## Browser Support

- Chrome 70+
- Firefox 65+
- Safari 12+
- Edge 79+

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - feel free to use this project for personal or commercial purposes.