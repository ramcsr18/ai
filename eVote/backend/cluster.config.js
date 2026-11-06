const cluster = require('cluster');
const os = require('os');
const http = require('http');

const numWorkers = Number(process.env.WORKER_CONCURRENCY || Math.max(1, os.cpus().length - 1));

if (cluster.isMaster) {
  console.log(`Starting ${numWorkers} worker processes`);

  for (let i = 0; i < numWorkers; i += 1) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.error(`Worker ${worker.process.pid} exited (${code || signal}). Restarting...`);
    cluster.fork();
  });
} else {
  require('./src/index');
}
