# 🐧 宝塔面板部署指南

> 适用于 Ubuntu 22.04 / 24.04 + 宝塔面板 8.x

---

## 一、安装宝塔面板

```bash
# SSH 登录服务器后执行
apt update && apt install -y wget
wget -O install_panel.sh https://download.bt.cn/install/install_panel.sh && sudo bash install_panel.sh ed8484bec
```

安装完成后记下面板地址、用户名、密码。

---

## 二、宝塔面板内安装软件

登录宝塔面板 → **软件商店** → 安装以下软件：

| 软件 | 版本 | 必装 |
|------|------|------|
| **Nginx** | 1.24+ | ✅ |
| **PM2 管理器** | 最新版 | ✅ |
| **Node.js 版本管理器** | — | ✅ |

### 安装 Node.js

1. 宝塔面板 → **软件商店** → **Node.js 版本管理器** → **设置**
2. 选择 **v22.x**（LTS）→ 点击 **安装**

### 安装 FFmpeg 和 yt-dlp

SSH 终端执行：

```bash
# FFmpeg
apt install -y ffmpeg

# yt-dlp
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp
```

---

## 三、部署项目

### 3.1 上传代码

**方式一：Git 拉取（推荐）**
```bash
cd /www/wwwroot
git clone https://github.com/YiQing-House/bilibili-parser-refactor.git
cd bilibili-parser-refactor
```

**方式二：宝塔面板上传**

1. 宝塔 → **文件** → 进入 `/www/wwwroot/`
2. 上传项目压缩包 → 解压

### 3.2 安装依赖 & 构建

```bash
cd /www/wwwroot/bilibili-parser-refactor
npm install
npm run build
```

### 3.3 配置环境变量

```bash
cp .env.example .env
nano .env
```

填写以下内容（按需修改）：

```env
PORT=7621
ADMIN_PWD=你的管理密码
CORS_ORIGIN=https://你的域名.com
GLM_API_KEY=你的智谱APIKey
NETEASE_COOKIE=
```

---

## 四、PM2 启动服务

### 方式一：宝塔 PM2 管理器（图形界面）

1. 宝塔 → **软件商店** → **PM2 管理器** → **设置**
2. 点击 **添加项目**
3. 填写：
   - **启动文件**：`/www/wwwroot/bilibili-parser-refactor/server/index.js`
   - **项目名称**：`bilibili-parser`
   - **运行目录**：`/www/wwwroot/bilibili-parser-refactor`
4. 点击 **提交**

### 方式二：命令行

```bash
cd /www/wwwroot/bilibili-parser-refactor
pm2 start server/index.js --name bilibili-parser
pm2 save
pm2 startup
```

验证：

```bash
pm2 status
# 应显示 bilibili-parser: online

curl http://localhost:7621/api/health
# 应返回 {"status":"ok"}
```

---

## 五、配置反向代理（Nginx）

### 5.1 添加站点

1. 宝塔 → **网站** → **添加站点**
2. 填写：
   - **域名**：`你的域名.com`
   - **PHP 版本**：纯静态
3. 点击 **提交**

### 5.2 配置 SSL

1. 点击站点名称 → **SSL**
2. 选择 **Let's Encrypt** → 勾选域名 → 点击 **申请**
3. 开启 **强制 HTTPS**

### 5.3 配置反向代理

1. 点击站点名称 → **反向代理**
2. 点击 **添加反向代理**
3. 填写：
   - **代理名称**：`bilibili-parser`
   - **目标URL**：`http://127.0.0.1:7621`
4. 点击 **提交**

### 5.4（可选）手动优化 Nginx 配置

如果需要更精细的控制，点击站点 → **配置文件**，在 `server { }` 内添加：

```nginx
# Gzip 压缩
gzip on;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
gzip_min_length 1024;

# 静态资源缓存
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2|woff|ttf)$ {
    proxy_pass http://127.0.0.1:7621;
    expires 30d;
    add_header Cache-Control "public, immutable";
}

# WebSocket 支持（下载进度推送）
location /socket.io/ {
    proxy_pass http://127.0.0.1:7621;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}

# 大文件下载超时
proxy_read_timeout 600s;
proxy_send_timeout 600s;
client_max_body_size 0;
```

---

## 六、域名解析

在你的域名 DNS 管理面板添加：

| 记录类型 | 主机记录 | 记录值 |
|----------|----------|--------|
| A | @ | 你的服务器 IP |
| A | www | 你的服务器 IP |

> ⏰ DNS 解析生效需要 5-30 分钟

---

## 七、日常维护

### 更新代码

```bash
cd /www/wwwroot/bilibili-parser-refactor
git pull origin main
npm install
npm run build
pm2 restart bilibili-parser
```

### 查看日志

```bash
pm2 logs bilibili-parser          # 实时日志
pm2 logs bilibili-parser --lines 50  # 最近 50 行
```

### 更新 yt-dlp

```bash
yt-dlp --update
# 或重新下载
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
```

---

## 常见问题

### Q: 访问显示 502 Bad Gateway
**A:** PM2 服务未启动。执行 `pm2 status` 检查，如果 offline 则 `pm2 restart bilibili-parser`

### Q: 下载功能报错
**A:** 检查 yt-dlp 和 ffmpeg 是否安装：
```bash
yt-dlp --version
ffmpeg -version
```

### Q: 4K 画质不可用
**A:** 需要登录 B 站大会员账号，在网站右上角点击登录扫码

### Q: 聊天看板娘不回复
**A:** 检查 `.env` 中 `GLM_API_KEY` 是否正确填写

### Q: 如何更换端口
**A:** 修改 `.env` 中的 `PORT`，然后同步修改宝塔反向代理的目标 URL
