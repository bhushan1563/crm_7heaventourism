// PM2 process file for the VPS:  pm2 start deploy/ecosystem.config.cjs
// One Node process serves the API *and* the built web app (frontend/dist) on PORT from backend/.env.
const path = require('path');

module.exports = {
  apps: [
    {
      name: '7heaven-crm',
      // The API must run from backend/: .env, eng.traineddata (OCR) and ./uploads are resolved from the working directory.
      cwd: path.resolve(__dirname, '../backend'),
      script: 'src/server.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
