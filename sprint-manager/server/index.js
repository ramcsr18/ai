const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { listTasks, normalizeTask, resetTasks, saveTask, databasePath } = require('./taskStore');

const port = Number(process.env.PORT) || 4000;
const buildDirectory = path.join(__dirname, '..', 'build');

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
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
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;

      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error('Request body is too large.'));
      }
    });

    request.on('end', () => {
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

    request.on('error', reject);
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

    if (request.method === 'POST' && pathname === '/api/tasks') {
      const task = normalizeTask(await readJsonBody(request));
      const savedTask = saveTask(task);
      sendJson(response, 201, { task: savedTask });
      return;
    }

    if (request.method === 'PUT' && pathname.startsWith('/api/tasks/')) {
      const taskId = decodeURIComponent(pathname.replace('/api/tasks/', ''));
      const task = normalizeTask({ ...(await readJsonBody(request)), id: taskId });
      const savedTask = saveTask(task);
      sendJson(response, 200, { task: savedTask });
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
