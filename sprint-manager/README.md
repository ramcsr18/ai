# Sprint Board

Sprint Board is a React delivery board for teams that need a simple sprint cockpit with
sticky-note workflow tracking, inline task editing, Oracle SSO-ready authentication,
and SQLite-backed persistence.

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
- `POST /api/tasks/reset`

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

Starts the React development server at `http://localhost:3000`.

### `npm run server`

Starts the SQLite-backed API server at `http://localhost:4000`.

Run `npm start` and `npm run server` together during local development.

### `npm test`

Runs the test suite with React Testing Library.

### `npm run build`

Creates a production build in the `build` directory.

### `npm run start:prod`

Starts the Node server, which serves the built frontend and the SQLite API together.

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
