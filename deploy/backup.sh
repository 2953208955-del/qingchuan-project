#!/usr/bin/env bash
# 清川数据备份：SQLite 一致性快照 + uploads 打包。
#
# 用法：
#   ./deploy/backup.sh
#   DATA_DIR=/opt/qingchuan/data BACKUP_DIR=/var/backups/qingchuan RETENTION_DAYS=30 ./deploy/backup.sh
#
# 约定了默认值，因此 crontab 里无需写任何 % 或环境变量：
#   15 3 * * * /opt/qingchuan/deploy/backup.sh >> /var/backups/qingchuan/backup.log 2>&1
set -euo pipefail

DATA_DIR="${DATA_DIR:-/opt/qingchuan/data}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/qingchuan}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DB_PATH="$DATA_DIR/qingchuan.db"

if [ ! -f "$DB_PATH" ]; then
  echo "找不到数据库：$DB_PATH" >&2
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "缺少 sqlite3，请先安装：sudo apt install -y sqlite3" >&2
  exit 1
fi

if ! mkdir -p "$BACKUP_DIR"; then
  echo "无法创建备份目录：$BACKUP_DIR" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
DB_BACKUP="$BACKUP_DIR/qingchuan-$STAMP.db"
UPLOADS_BACKUP="$BACKUP_DIR/uploads-$STAMP.tar.gz"

# .backup 会在 SQLite 内部做一致性快照，包含已提交的 WAL 内容；
# 不要直接 cp 正在写入的 qingchuan.db。
sqlite3 "$DB_PATH" ".backup '$DB_BACKUP'"
echo "已备份数据库：$DB_BACKUP"

if [ -d "$DATA_DIR/uploads" ]; then
  tar czf "$UPLOADS_BACKUP" -C "$DATA_DIR" uploads
  echo "已备份上传图片：$UPLOADS_BACKUP"
else
  echo "提示：$DATA_DIR/uploads 不存在，跳过上传图片备份" >&2
fi

# 只清理本脚本命名规则下的过期文件，不碰目录中的其他内容。
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'qingchuan-*.db' -mtime "+$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'uploads-*.tar.gz' -mtime "+$RETENTION_DAYS" -delete
