# 清川部署指南（Linux + PM2 + Nginx）

目标环境：一台普通 Linux 云服务器（2C4G 即可），无 GPU、无需 Docker 或 WSL。
运行时组成：Node.js 20 LTS + PM2 + Nginx + 一个 SQLite 文件，所有 AI 推理走云端 API。

以下命令默认以具有 sudo 权限的部署用户执行，应用目录为 `/opt/qingchuan`。

## 1. 安装系统依赖

```bash
# Ubuntu 22.04/24.04 示例
sudo apt update
sudo apt install -y curl git nginx sqlite3

# Node.js 20 LTS（NodeSource）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # 应为 v20.x
sudo npm install -g pm2
```

## 2. 获取代码并安装依赖

```bash
sudo mkdir -p /opt/qingchuan
sudo chown "$USER":"$USER" /opt/qingchuan
git clone <仓库地址> /opt/qingchuan
cd /opt/qingchuan

# 使用 lockfile 做可复现安装
npm ci
```

## 3. 配置环境变量

```bash
cp .env.example .env
chmod 600 .env
```

编辑 `.env`，至少填写：

```bash
DEEPSEEK_API_KEY=...
DASHSCOPE_API_KEY=...
DATA_DIR=/opt/qingchuan/data
APP_BASE_URL=https://your-domain.example.com
RUN_BUDGET_CNY=1.0
DAILY_BUDGET_CNY=20
```

- `.env` 只放在服务器上，权限 600，绝不提交到 Git。
- `DATA_DIR` 必须是持久化目录（不要放在容器临时层或 `/tmp`），数据库与上传图片都在这里。
- Next.js 在 `next start` 时会自动读取项目根目录的 `.env` / `.env.local`。
- 用 `tsx` 运行的脚本（`ingest`、`seed`、`eval:*`、`mcp`）不会自动读取 `.env`，需要先导出：

```bash
set -a; . ./.env; set +a
```

## 4. 初始化数据库与知识库

```bash
cd /opt/qingchuan

# 建表。drizzle.config.ts 固定使用项目根目录下的 ./data/qingchuan.db，
# 请在项目根目录执行；如需自定义 DATA_DIR，请保证它就是 ./data 对应的绝对路径。
npm run db:push

# 知识库入库（需要 DASHSCOPE_API_KEY，会调用 Embedding API）
set -a; . ./.env; set +a
npm run ingest
```

数据库结构有变更时重复执行 `npm run db:push`；请先备份 `data/qingchuan.db`。

## 5. 构建并启动

```bash
cd /opt/qingchuan
npm run build

pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup   # 按提示执行输出的命令，配置开机自启
```

`ecosystem.config.cjs` 的关键配置：

- `cwd: /opt/qingchuan`
- `next start -H 127.0.0.1 -p 3000`（只绑定回环地址，公网流量必须经 Nginx）
- `NODE_ENV=production`、`DATA_DIR=/opt/qingchuan/data`
- `instances: 1`（SQLite 单写者，不要开多实例）
- `max_memory_restart: 1G`

常用运维命令：

```bash
pm2 status
pm2 logs qingchuan
pm2 restart qingchuan
curl -I http://127.0.0.1:3000/
```

## 6. 配置 Nginx 与 TLS

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/qingchuan
sudo ln -s /etc/nginx/sites-available/qingchuan /etc/nginx/sites-enabled/qingchuan
sudo nano /etc/nginx/sites-available/qingchuan   # 替换 server_name
sudo nginx -t
sudo systemctl reload nginx
```

示例配置已包含：

- `client_max_body_size 20m`（应用单图上限 15MB）
- `proxy_buffering off` + `proxy_read_timeout 300s`（SSE 分析流不被缓冲/截断）
- `X-Forwarded-For` 覆盖为 `$remote_addr`、`X-Real-IP`（应用的限流器取 XFF 第一跳，缺少时所有用户会被当成同一个 `local`）。
  这假设 Nginx 是唯一入口（可信代理）；若前面还有 CDN/负载均衡，应改用
  `$proxy_add_x_forwarded_for`，并只信任该上游，否则客户端可伪造 XFF 绕过限流。

申请 HTTPS 证书（自动续期）：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example.com
sudo certbot renew --dry-run
```

服务器安全组/防火墙只放行 22、80、443；Next.js 通过 `-H 127.0.0.1` 只监听回环地址，
3000 端口不暴露公网，所有外部流量必须经 Nginx。

## 7. 数据备份与恢复

`DATA_DIR` 下有 `qingchuan.db`（含 WAL）和 `uploads/`。仓库提供 `deploy/backup.sh`：
用 SQLite `.backup` 做一致性快照（不要直接 `cp` 正在写入的数据库），并把上传目录打包；
默认保留 30 天，只清理脚本自己命名规则下的过期文件。

```bash
chmod +x /opt/qingchuan/deploy/backup.sh
sudo mkdir -p /var/backups/qingchuan
sudo chown "$USER":"$USER" /var/backups/qingchuan

# 手动执行一次（脚本默认 DATA_DIR=/opt/qingchuan/data）
/opt/qingchuan/deploy/backup.sh
```

以应用运行用户加入 crontab（每天 03:15）。脚本内部处理日期，**crontab 行中不要写 `%`**：

```cron
15 3 * * * /opt/qingchuan/deploy/backup.sh >> /var/backups/qingchuan/backup.log 2>&1
```

可用环境变量覆盖默认值，例如
`DATA_DIR=/data/qingchuan BACKUP_DIR=/backup RETENTION_DAYS=14 /opt/qingchuan/deploy/backup.sh`。
建议定期把备份同步到另一台机器或对象存储。

### 恢复步骤

1. 选择**同一时间戳**的 `qingchuan-*.db` 与 `uploads-*.tar.gz`（两者来自同一次备份）。
2. 停止应用：`pm2 stop qingchuan`。
3. 移走当前库并清理 WAL/SHM，再复制备份：
   ```bash
   cd /opt/qingchuan/data
   mv qingchuan.db qingchuan.db.before-restore
   rm -f qingchuan.db-wal qingchuan.db-shm
   cp /var/backups/qingchuan/qingchuan-YYYYMMDD-HHMMSS.db qingchuan.db
   ```
4. 恢复上传目录：
   ```bash
   rm -rf /opt/qingchuan/data/uploads
   tar xzf /var/backups/qingchuan/uploads-YYYYMMDD-HHMMSS.tar.gz -C /opt/qingchuan/data
   ```
5. 启动并检查：`pm2 start qingchuan`，然后确认任务列表与图片接口正常。

数据库结构变更、升级版本、迁移服务器之前都要先手动执行一次备份。

## 8. MCP Server（stdio）

MCP 服务复用应用内的分析/检索/严重度工具，通过 stdio 与本地 MCP 客户端通信：

```bash
cd /opt/qingchuan
set -a; . ./.env; set +a
npx tsx scripts/run-mcp.ts
# 等价于 npm run mcp
```

在 MCP 客户端中配置命令为 `npx`、参数为 `tsx scripts/run-mcp.ts`，工作目录设为 `/opt/qingchuan`，
并注入同样的环境变量（`DATA_DIR`、`DASHSCOPE_API_KEY` 等）。stdio 模式下日志输出到 stderr，
不要向 stdout 打印调试信息。

## 9. 演示数据（可选）

```bash
set -a; . ./.env; set +a
npm run seed
```

需要先把 3 张真实样例图放到 `public/samples/sample-1.jpg` … `sample-3.jpg`，
详见 `public/samples/README.md`。脚本会校验图片存在、复制到 `$DATA_DIR/uploads/`、
计算真实 SHA-256 并写入演示任务/识别/报告；`demo-run-001` 已存在时直接跳过。

## 10. 上线检查

- [ ] `curl -I https://your-domain.example.com/` 返回 200
- [ ] 上传一张图片能正常分析并收到 SSE 进度
- [ ] 报告页能打开、图片可显示（`/api/images/[id]` 返回 200）
- [ ] `pm2 status` 显示 online，`pm2 logs` 无报错循环
- [ ] 每日备份任务已生效，且能从备份恢复
- [ ] `.env` 权限为 600，仓库中无真实密钥
