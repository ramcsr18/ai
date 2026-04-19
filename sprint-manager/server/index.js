const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {
  authenticateResource,
  changeResourcePassword,
  deleteTask,
  deleteResource,
  listResources,
  listTasks,
  normalizeResource,
  normalizeTask,
  resetTasks,
  saveResource,
  saveTask,
  databasePath,
} = require('./taskStore');
const { sendOpenTasksReport, startDailySummaryScheduler } = require('./reporting');

const port = Number(process.env.PORT) || 4000;
const buildDirectory = path.join(__dirname, '..', 'build');
const MAX_JSON_BODY_BYTES = 1_000_000;

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
  });
  response.end(message);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let totalBytes = 0;
    let isComplete = false;
    const bodyChunks = [];

    request.on('data', (chunk) => {
      if (isComplete) {
        return;
      }

      totalBytes += chunk.length;

      if (totalBytes > MAX_JSON_BODY_BYTES) {
        isComplete = true;
        request.destroy();
        reject(new Error('Request body is too large.'));
        return;
      }

      bodyChunks.push(chunk);
    });

    request.on('end', () => {
      if (isComplete) {
        return;
      }

      isComplete = true;
      const body = Buffer.concat(bodyChunks).toString('utf8');

      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Request body must be valid JSON.'));
      }
    });

    request.on('error', (error) => {
      if (isComplete) {
        return;
      }

      isComplete = true;
      reject(error);
    });
  });
}

function serveStaticAsset(response, requestPath) {
  const safePath = requestPath === '/' ? '/index.html' : requestPath;
  const resolvedPath = path.join(buildDirectory, safePath);

  if (!resolvedPath.startsWith(buildDirectory) || !fs.existsSync(resolvedPath)) {
    return false;
  }

  const extension = path.extname(resolvedPath);
  const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
  };

  response.writeHead(200, {
    'Content-Type': contentTypes[extension] || 'application/octet-stream',
  });
  fs.createReadStream(resolvedPath).pipe(response);
  return true;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {});
    return;
  }

  try {
    if (request.method === 'GET' && pathname === '/api/health') {
      sendJson(response, 200, {
        ok: true,
        database: 'sqlite',
        databasePath,
      });
      return;
    }

    if (request.method === 'GET' && pathname === '/api/tasks') {
      sendJson(response, 200, { tasks: listTasks() });
      return;
    }

    if (request.method === 'GET' && pathname === '/api/resources') {
      sendJson(response, 200, { resources: listResources() });
      return;
    }

    if (request.method === 'POST' && pathname === '/api/auth/login') {
      const payload = await readJsonBody(request);
      const authResult = authenticateResource(payload.email, payload.password);
      sendJson(response, 200, authResult);
      return;
    }

    if (request.method === 'POST' && pathname === '/api/auth/change-password') {
      const payload = await readJsonBody(request);
      const authResult = changeResourcePassword(
        payload.email,
        payload.currentPassword,
        payload.newPassword
      );
      sendJson(response, 200, authResult);
      return;
    }

    if (request.method === 'POST' && pathname === '/api/tasks') {
      const task = normalizeTask(await readJsonBody(request));
      const savedTask = saveTask(task);
      sendJson(response, 201, { task: savedTask });
      return;
    }

    if (request.method === 'POST' && pathname === '/api/resources') {
      const resource = normalizeResource(await readJsonBody(request));
      const savedResource = saveResource(resource);
      sendJson(response, 201, { resource: savedResource });
      return;
    }

    if (request.method === 'POST' && pathname === '/api/reports/open-tasks') {
      const payload = await readJsonBody(request);
      const requester = payload && payload.requester ? payload.requester : {};
      const report = await sendOpenTasksReport(requester);
      sendJson(response, 200, report);
      return;
    }

    if (request.method === 'PUT' && pathname.startsWith('/api/tasks/')) {
      const taskId = decodeURIComponent(pathname.replace('/api/tasks/', ''));
      const task = normalizeTask({ ...(await readJsonBody(request)), id: taskId });
      const savedTask = saveTask(task);
      sendJson(response, 200, { task: savedTask });
      return;
    }

    if (request.method === 'PUT' && pathname.startsWith('/api/resources/')) {
      const resourceId = decodeURIComponent(pathname.replace('/api/resources/', ''));
      const resource = normalizeResource({ ...(await readJsonBody(request)), id: resourceId });
      const savedResource = saveResource(resource);
      sendJson(response, 200, { resource: savedResource });
      return;
    }

    if (request.method === 'DELETE' && pathname.startsWith('/api/resources/')) {
      const resourceId = decodeURIComponent(pathname.replace('/api/resources/', ''));
      sendJson(response, 200, { resources: deleteResource(resourceId) });
      return;
    }

    if (request.method === 'DELETE' && pathname.startsWith('/api/tasks/')) {
      const taskId = decodeURIComponent(pathname.replace('/api/tasks/', ''));
      sendJson(response, 200, { tasks: deleteTask(taskId) });
      return;
    }

    if (request.method === 'POST' && pathname === '/api/tasks/reset') {
      sendJson(response, 200, { tasks: resetTasks() });
      return;
    }

    if (fs.existsSync(buildDirectory)) {
      if (serveStaticAsset(response, pathname)) {
        return;
      }

      const indexPath = path.join(buildDirectory, 'index.html');

      if (fs.existsSync(indexPath)) {
        response.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
        });
        fs.createReadStream(indexPath).pipe(response);
        return;
      }
    }

    sendText(
      response,
      404,
      'Sprint Board API is running. Build the frontend or use the React dev server on port 3000.'
    );
  } catch (error) {
    sendJson(response, 500, {
      error: error.message || 'Unexpected server error.',
    });
  }
});

server.listen(port, () => {
  console.log(`Sprint Board server listening on http://localhost:${port}`);
  console.log(`SQLite database: ${databasePath}`);
});

startDailySummaryScheduler();
