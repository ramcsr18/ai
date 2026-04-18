# Sprint Manager

Sprint Manager is a React delivery board for teams that need a simple sprint cockpit with
sticky-note workflow tracking, inline task editing, and Oracle SSO-ready authentication.

## Highlights

- Drag sticky notes between stages and automatically update task status.
- Stack tasks in each stage by priority and due date.
- Track multiple dated comments per task, showing the newest five first.
- Autosave task edits and comment drafts in browser storage.
- Support Oracle IAM / IDCS sign-in with employee-only access checks.

## Oracle SSO configuration

Create a `.env` file from `.env.example` and provide:

- `REACT_APP_ORACLE_DOMAIN_URL`
- `REACT_APP_ORACLE_CLIENT_ID`
- `REACT_APP_ORACLE_REDIRECT_URI`
- `REACT_APP_ORACLE_ALLOWED_EMAIL_DOMAINS`
- `REACT_APP_SPRINT_MANAGER_ADMIN_EMAILS`

This app starts an Oracle OAuth 2.0 / OpenID Connect authorization code flow with PKCE
for browser-based login and calls the standard Oracle identity domain authorize, token,
and user info endpoints.

If Oracle SSO is not configured, a demo login remains available outside production so the
board can still be developed locally.

## Available scripts

### `npm start`

Starts the development server at `http://localhost:3000`.

### `npm test`

Runs the test suite with React Testing Library.

### `npm run build`

Creates a production build in the `build` directory.
