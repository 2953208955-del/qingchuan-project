// PM2 生产配置。复制/克隆仓库到 /opt/qingchuan 后：
//   pm2 start deploy/ecosystem.config.cjs
//   pm2 save && pm2 startup
// SQLite 为单文件数据库，必须保持单实例运行。
module.exports = {
  apps: [{
    name: 'qingchuan',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -H 127.0.0.1 -p 3000',
    cwd: '/opt/qingchuan',
    env: { NODE_ENV: 'production', DATA_DIR: '/opt/qingchuan/data' },
    instances: 1,
    autorestart: true,
    max_memory_restart: '1G',
    time: true,
  }],
}
