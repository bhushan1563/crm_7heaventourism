// PM2 process file for the server:  pm2 start deploy/ecosystem.config.cjs
// One Node process serves the API *and* the built web app (frontend/dist). Settings (PORT, MONGODB_URI, JWT_SECRET...)
// come from backend/.env; values set below win over that file.
const path = require('path');

module.exports = {
  apps: [
    {
      name: '7heaven-crm',
      cwd: path.resolve(__dirname, '../backend'),
      script: 'src/server.js',
      // A single instance on purpose: the login rate limiter keeps its counters in memory and OCR is memory-hungry.
      exec_mode: 'fork',
      instances: 1,

      // Restart automatically, but give up loudly instead of crash-looping forever.
      autorestart: true,
      min_uptime: '15s',
      max_restarts: 10,
      restart_delay: 3000,

      // Tesseract (card scanner) can balloon; restart gracefully before the kernel's OOM killer does it abruptly.
      max_memory_restart: '900M',

      // The server drains in-flight requests for up to 10s on SIGTERM/SIGINT (see server.js); give it time to finish.
      kill_timeout: 12000,

      time: true, // timestamp every log line
      env: {
        NODE_ENV: 'production',
        // Listen only on localhost: Nginx is the single public entry point (and HTTPS terminator).
        HOST: '127.0.0.1'
      }
    }
  ]
};
