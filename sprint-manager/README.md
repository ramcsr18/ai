# Sprint Board

Sprint Board is a React delivery board for teams that need a simple sprint cockpit with
sticky-note workflow tracking, inline task editing, Oracle SSO authentication, and
SQLite-backed persistence.

## Highlights

- Drag sticky notes between stages and automatically update task status.
- Stack tasks in each stage by priority and due date.
- Track multiple dated comments per task, showing the newest three first.
- Persist task data in SQLite through the built-in Node backend.
- Support Oracle IAM / IDCS sign-in with employee-only access checks.

## Data storage

Sprint Board now stores tasks in a SQLite database at
`server/data/sprint-board.sqlite`.

The backend is a lightweight Node HTTP server that exposes:

- `GET /api/health`
- `GET /api/tasks`
- `POST /api/tasks`
- `PUT /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `POST /api/tasks/reset`
- `POST /api/reports/open-tasks`

## Oracle SSO configuration

Create a `.env` file from `.env.example` and provide:

- `REACT_APP_ORACLE_DOMAIN_URL`
- `REACT_APP_ORACLE_CLIENT_ID`
- `REACT_APP_ORACLE_REDIRECT_URI`
- `REACT_APP_ORACLE_ALLOWED_EMAIL_DOMAINS`
- `REACT_APP_SPRINT_MANAGER_ADMIN_EMAILS`
- Optional temporary fallback control: `REACT_APP_ALLOW_DEMO_LOGIN=true|false`

This app starts an Oracle OAuth 2.0 / OpenID Connect authorization code flow with PKCE
for browser-based login and calls the standard Oracle identity domain authorize, token,
and user info endpoints.

Oracle SSO is considered active only when the Oracle domain URL, client ID, redirect URI,
and employee email domain allowlist are configured. Non-Oracle sign-in is temporarily enabled
by default and can be turned off explicitly with `REACT_APP_ALLOW_DEMO_LOGIN=false`.

## Email reports

Sprint Board can generate and send email reports for open tasks:

- Logged-in users can request an open-tasks report from the UI.
- Admin requests are grouped by owner.
- The backend can send daily emails to each resource for blocked, high-priority, and overdue
  tasks, with admins CC'd.

Configure SMTP in the server environment to enable actual delivery:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_STARTTLS`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM`
- `SPRINT_MANAGER_ADMIN_EMAILS`
- Optional schedule controls: `SPRINT_BOARD_DAILY_REPORT_HOUR` and
  `SPRINT_BOARD_DAILY_REPORT_MINUTE`

If SMTP is not configured, report generation still works, but the app will only generate the
report payload and will not deliver email.

## Available scripts

### `npm start`

Starts the React development server at `http://localhost:3000`.

### `npm run server`

Starts the SQLite-backed API server at `http://localhost:4000`.

Run `npm start` and `npm run server` together during local development.

### `npm test`

Runs the test suite with React Testing Library.

### `npm run build`

Creates a production build in the `build` directory.

### `npm run package:prod`

Builds the frontend and creates a deployable tarball at
`.deploy/sprint-board-production.tar.gz`.

The bundle includes:

- `build/` with the compiled React app
- `server/` with the Node + SQLite backend
- `.env.production.example`
- `DEPLOYMENT.md` with a short startup guide

### `npm run start:prod`

Starts the Node server, which serves the built frontend and the SQLite API together.

## Production deployment

Sprint Board can be deployed in two simple ways.

### Option 1: Node bundle deployment

Build the production package:

```bash
npm run package:prod
```

Extract the generated archive on the target host:

```bash
tar -xzf sprint-board-production.tar.gz
cd sprint-board
cp .env.production.example .env
```

Update `.env` with your production values, then start the app:

```bash
PORT=4000 node server/index.js
```

Notes:

- Use Node.js 22 or newer because the backend uses the built-in `node:sqlite` module.
- The UI and API are served from the same Node process on the same port.
- SQLite data is stored at `server/data/sprint-board.sqlite`.
- Set `REACT_APP_ALLOW_DEMO_LOGIN=false` in production.
- Build with the final production URL in `REACT_APP_ORACLE_REDIRECT_URI`.

### Option 2: Docker deployment

Build the container image:

```bash
docker build -t sprint-board:latest .
```

Run it with a persistent SQLite data directory and environment file:

```bash
docker run -d \
  --name sprint-board \
  -p 4000:4000 \
  --env-file .env \
  -v "$(pwd)/server-data:/app/server/data" \
  sprint-board:latest
```

Notes:

- The container serves the compiled UI and API on port `4000`.
- Mount `/app/server/data` so the SQLite database survives container restarts.
- Rebuild the image whenever you change React env vars such as Oracle SSO settings, because
  `REACT_APP_*` values are compiled into the frontend build.

### Recommended production checklist

- Set `REACT_APP_ALLOW_DEMO_LOGIN=false`.
- Configure Oracle SSO redirect URIs for the final HTTPS host.
- Configure `SPRINT_MANAGER_ADMIN_EMAILS` and `REACT_APP_SPRINT_MANAGER_ADMIN_EMAILS`.
- Configure SMTP values if you want report emails to be delivered.
- Back up `server/data/sprint-board.sqlite` regularly.

### `npm run import:confluence -- <csv-file> [--replace]`

Imports tasks from a CSV exported from a Confluence table into the local SQLite database.

- Without `--replace`, imported tasks are merged into the current database using task `id`
  when present, or generated ids when not present.
- With `--replace`, the current SQLite task rows are cleared first and then replaced with the
  imported tasks.
- A sample CSV is available at `scripts/examples/confluence-template.csv`.
- CSV comment values support `MM/DD` and `MM/DD/YY(YY)` prefixes and are converted into
  `createdAt` timestamps during import.
- For `MM/DD` comments without a year, the importer infers the current or previous year from
  the task dates and the comment order.

Example:

```bash
npm run import:confluence -- scripts/examples/confluence-template.csv
```

Replace all local tasks:

```bash
npm run import:confluence -- scripts/examples/confluence-template.csv --replace
```

Supported CSV headers include common Confluence-style variants such as:

- `Title`, `Task`, `Name`, `Summary`
- `Stage`, `Status`
- `Owner`, `Assignee`
- `Area`, `Squad`, `Team`
- `Start Date`
- `End Date`, `Due Date`
- `Effort`, `Estimate`, `Hours`
- `Priority`
- `Blocked`
- `Release`
- `Milestone`
- `Bug/Jira URL`
- `Comments`, `Notes`

### `npm run import:confluence:json -- <json-file> [--replace]`

Imports tasks from a JSON file into the local SQLite database.

- Accepts either a top-level task array or an object with a `tasks` array.
- Supports comments as strings, arrays of strings, or arrays of objects.
- If a comment contains a `MM/DD` or `MM/DD/YY(YY)` date, the importer converts it into a
  `createdAt` timestamp.
- For `MM/DD` comments without a year, the importer infers the year from the task dates and the
  comment order, using the current or previous year across year boundaries.
- Optional `commentsOrder` or `commentOrder` values of `newest-first` and `oldest-first` are
  supported when you want to override automatic comment-order detection.

Example:

```bash
npm run import:confluence:json -- scripts/examples/confluence-template.json
```

Replace all local tasks:

```bash
npm run import:confluence:json -- scripts/examples/confluence-template.json --replace
```

### `npm run import:jira -- --jql "<jql>" [--replace]`

Imports Jira issues directly into the local SQLite database.

- Requires `JIRA_BASE_URL`.
- Authenticate with either `JIRA_BEARER_TOKEN` or `JIRA_EMAIL`/`JIRA_USERNAME` plus
  `JIRA_API_TOKEN`.
- Uses JQL from `--jql` or `JIRA_JQL`.
- Paginates Jira search results and fetches all issue comments.
- Maps Jira status, priority, assignee, components, fix versions, comments, and browse URLs
  into the Sprint Board task model.
- Optional custom field env vars are supported:
  `JIRA_STAGE_FIELD`, `JIRA_AREA_FIELD`, `JIRA_RELEASE_FIELD`, `JIRA_START_FIELD`,
  `JIRA_END_FIELD`, `JIRA_EFFORT_FIELD`, `JIRA_BLOCKED_FIELD`, `JIRA_MILESTONE_FIELD`,
  `JIRA_ASSIGNEE_FIELD`, and `JIRA_PRIORITY_FIELD`.

Example:

```bash
npm run import:jira -- --jql "project = ABC ORDER BY updated DESC"
```

### `npm run import:bugdb -- --url "<bugdb-json-url>" [--replace]`

Imports BugDB records from a JSON endpoint into the local SQLite database.

- Uses `--url`, `BUGDB_API_URL`, or `BUGDB_URL` as the source.
- Authenticate with `BUGDB_BEARER_TOKEN` or `BUGDB_USERNAME` plus `BUGDB_PASSWORD`.
- Follows common paginated `next` links automatically.
- Supports env-based field overrides such as `BUGDB_ID_FIELD`, `BUGDB_TITLE_FIELD`,
  `BUGDB_STATUS_FIELD`, `BUGDB_OWNER_FIELD`, `BUGDB_AREA_FIELD`, `BUGDB_PRIORITY_FIELD`,
  `BUGDB_EFFORT_FIELD`, `BUGDB_START_FIELD`, `BUGDB_END_FIELD`, `BUGDB_RELEASE_FIELD`,
  `BUGDB_MILESTONE_FIELD`, `BUGDB_BLOCKED_FIELD`, `BUGDB_BUG_URL_FIELD`,
  `BUGDB_COMMENTS_FIELD`, `BUGDB_RECORDS_PATH`, and `BUGDB_NEXT_PATH`.
- If BugDB does not return a direct item URL, you can set `BUGDB_LINK_TEMPLATE` with an
  `{id}` placeholder to generate one.

Example:

```bash
npm run import:bugdb -- --url "https://bugdb.example.com/api/bugs?owner=alex"
```
