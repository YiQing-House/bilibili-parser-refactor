module.exports = {
  apps: [{
    name: 'bilibili-parser',
    script: 'server/index.js',
    cwd: '/opt/bilibili-parser',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: 7621,
    },
    // 日志配置
    error_file: '/var/log/bilibili-parser/error.log',
    out_file: '/var/log/bilibili-parser/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
  }]
}
