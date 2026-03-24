#!/bin/bash
# 快速更新脚本（代码更新后在服务器上执行）
# 用法: bash deploy/update.sh

set -e
cd /opt/bilibili-parser

echo "⬇️  拉取最新代码..."
git pull origin main

echo "📦 安装依赖..."
npm install --production=false

echo "🔨 构建前端..."
npm run build

echo "🔄 重启服务..."
pm2 restart bilibili-parser

echo "✅ 更新完成！"
pm2 status
