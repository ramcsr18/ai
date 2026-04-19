const { spawn } = require('node:child_process');

function forwardSignal(child) {
  return (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };
}

const children = [];
let shuttingDown = false;

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  children.forEach((child) => {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  });

  setTimeout(() => {
    children.forEach((child) => {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    });
    process.exit(exitCode);
  }, 1500).unref();
}

function startProcess(label, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }

    if (signal) {
      console.log(`${label} stopped with signal ${signal}.`);
      shutdown(0);
      return;
    }

    if (code !== 0) {
      console.error(`${label} exited with code ${code}.`);
      shutdown(code || 1);
      return;
    }

    console.log(`${label} exited.`);
    shutdown(0);
  });

  children.push(child);
  return child;
}

const server = startProcess('Sprint Board API', 'node', ['server/index.js'], {
  PORT: process.env.PORT || '4000',
});
const client = startProcess('Sprint Board UI', 'npx', ['react-scripts', 'start'], {
  BROWSER: process.env.BROWSER || 'none',
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('SIGHUP', () => shutdown(0));

process.on('uncaughtException', (error) => {
  console.error(error);
  shutdown(1);
});

process.on('unhandledRejection', (error) => {
  console.error(error);
  shutdown(1);
});

forwardSignal(server);
forwardSignal(client);
