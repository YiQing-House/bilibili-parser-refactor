#!/bin/bash
# ============================================================
# bilibili-parser 一键部署脚本（Ubuntu 24.04）
# 用法: sudo bash deploy/setup.sh
# ============================================================

set -e

APP_DIR="/opt/bilibili-parser"
REPO_URL="https://github.com/YiQing-House/bilibili-parser-refactor.git"
DOMAIN=""  # 在执行前设置你的域名

echo "=========================================="
echo "  bilibili-parser 部署脚本"
echo "=========================================="

# 检测是否 root
if [ "$EUID" -ne 0 ]; then
  echo "请使用 sudo 运行此脚本"
  exit 1
fi

# ==================== 1. 系统更新 ====================
echo "[1/7] 更新系统..."
apt update && apt upgrade -y

# ==================== 2. 安装依赖 ====================
echo "[2/7] 安装 Node.js 22、Nginx、ffmpeg、yt-dlp..."

# Node.js 22 LTS
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt install -y nodejs
fi
echo "  Node.js: $(node -v)"
echo "  npm: $(npm -v)"

# Nginx
apt install -y nginx

# ffmpeg（视频合并用）
apt install -y ffmpeg

# yt-dlp
if ! command -v yt-dlp &> /dev/null; then
  curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
  chmod a+rx /usr/local/bin/yt-dlp
fi
echo "  yt-dlp: $(yt-dlp --version)"

# PM2
npm install -g pm2

# ==================== 3. 克隆/更新项目 ====================
echo "[3/7] 部署项目代码..."
if [ -d "$APP_DIR" ]; then
  cd "$APP_DIR"
  git pull origin main
else
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# ==================== 4. 安装依赖并构建 ====================
echo "[4/7] 安装依赖并构建前端..."
npm install --production=false
npm run build

# ==================== 5. 环境变量 ====================
echo "[5/7] 配置环境变量..."
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  echo "⚠️  请编辑 $APP_DIR/.env 填写你的配置"
  echo "  必填: GLM_API_KEY, ADMIN_PWD, NETEASE_COOKIE"
  echo "  可选: CORS_ORIGIN（你的域名）"
fi

# ==================== 6. PM2 启动 ====================
echo "[6/7] 启动应用..."
mkdir -p /var/log/bilibili-parser
pm2 delete bilibili-parser 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup

# ==================== 7. Nginx ====================
echo "[7/7] 配置 Nginx..."
if [ -n "$DOMAIN" ]; then
  sed "s/your-domain.com/$DOMAIN/g" deploy/nginx.conf > /etc/nginx/sites-available/bilibili-parser
  ln -sf /etc/nginx/sites-available/bilibili-parser /etc/nginx/sites-enabled/
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
  
  # SSL 证书
  apt install -y certbot python3-certbot-nginx
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email admin@$DOMAIN
  echo "✅ SSL 证书已配置"
else
  echo "⚠️  未设置域名，跳过 Nginx 配置"
  echo "  请手动设置: 编辑 deploy/nginx.conf 后复制到 /etc/nginx/sites-available/"
fi

echo ""
echo "=========================================="
echo "  ✅ 部署完成！"
echo "=========================================="
echo "  应用地址: http://localhost:7621"
if [ -n "$DOMAIN" ]; then
  echo "  域名地址: https://$DOMAIN"
fi
echo "  管理面板: /admin (密码在 .env 中)"
echo "  PM2 状态: pm2 status"
echo "  PM2 日志: pm2 logs bilibili-parser"
echo "=========================================="
