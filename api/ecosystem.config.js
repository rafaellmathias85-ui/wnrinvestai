module.exports = {
  apps: [{
    name: 'investai-api',
    script: 'server.js',
    cwd: '/var/www/wnrinvestai/api',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',
    error_file: '/var/www/wnrinvestai/logs/api-error.log',
    out_file: '/var/www/wnrinvestai/logs/api-out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    env: {
      NODE_ENV: 'production',
    },
  }],
};
