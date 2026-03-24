# 🐧 宝塔面板部署指南

> 适用环境：腾讯云东京 + OpenCloudOS 9 + 宝塔面板 + Cloudflare DNS

---

## 一、SSH 安装基础依赖

宝塔面板已装好，接下来通过 **SSH 终端** 或宝塔 **终端** 执行：

```bash
# 安装 Node.js 22（OpenCloudOS 用 dnf）
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf install -y nodejs

# 验证
node -v    # v22.x
npm -v     # 10.x

# 安装 PM2（进程守护）
npm install -g pm2

# 安装 FFmpeg
dnf install -y epel-release
dnf install -y ffmpeg
# 如果上面装不了，用静态构建版：
# curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o ffmpeg.tar.xz
# tar xf ffmpeg.tar.xz && cp ffmpeg-*-static/ffmpeg ffmpeg-*-static/ffprobe /usr/local/bin/

# 安装 yt-dlp
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp

# 安装 Git（如果没有）
dnf install -y git
```

---

## 二、部署项目

```bash
# 拉取代码
cd /www/wwwroot
git clone https://github.com/YiQing-House/bilibili-parser-refactor.git
cd bilibili-parser-refactor

# 安装依赖 + 构建前端
npm install
npm run build

# 配置环境变量
cp .env.example .env
nano .env
```

编辑 `.env`：

```env
PORT=7621
ADMIN_PWD=你的管理密码
CORS_ORIGIN=https://你的域名.com
GLM_API_KEY=你的智谱APIKey
NETEASE_COOKIE=
```

---

## 三、PM2 启动

### 方式一：宝塔 PM2 管理器（图形界面）

1. 宝塔 → **软件商店** → 搜索 **PM2 管理器** → 安装
2. PM2 管理器 → **设置** → **添加项目**
3. 填写：
   - **启动文件**：`/www/wwwroot/bilibili-parser-refactor/server/index.js`
   - **项目名称**：`bilibili-parser`
   - **运行目录**：`/www/wwwroot/bilibili-parser-refactor`
4. 提交

### 方式二：命令行

```bash
cd /www/wwwroot/bilibili-parser-refactor
pm2 start server/index.js --name bilibili-parser
pm2 save
pm2 startup

# 验证
pm2 status
curl http://localhost:7621/api/health
```

---

## 四、宝塔 Nginx 反向代理

### 4.1 添加站点

宝塔 → **网站** → **添加站点**：
- **域名**：`你的域名.com`
- **PHP 版本**：纯静态
- 提交

### 4.2 配置反向代理

点击站点名 → **反向代理** → **添加反向代理**：
- **代理名称**：`bilibili-parser`
- **目标 URL**：`http://127.0.0.1:7621`
- 提交

### 4.3 优化 Nginx 配置（可选）

点击站点 → **配置文件**，在 `server { }` 内添加：

```nginx
# Gzip
gzip on;
gzip_types text/plain text/css application/json application/javascript text/xml image/svg+xml;
gzip_min_length 1024;

# 大文件下载超时
proxy_read_timeout 600s;
proxy_send_timeout 600s;
client_max_body_size 0;

# 静态资源缓存
location ~* \.(js|css|png|jpg|svg|woff2)$ {
    proxy_pass http://127.0.0.1:7621;
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

---

## 五、Cloudflare DNS 配置

1. 登录 [Cloudflare](https://dash.cloudflare.com/)
2. 选择你的域名 → **DNS**
3. 修改/添加记录：

| 类型 | 名称 | 内容 | 代理状态 |
|------|------|------|----------|
| A | @ | `43.153.139.182` | 已代理 ☁️ |

4. **SSL/TLS** → 加密模式设为 **完全（Full）**

> ⚠️ SSL 模式必须选 **完全（Full）**，因为宝塔 Nginx 会处理 HTTPS
>
> 如果宝塔没配 SSL 证书，选 **灵活（Flexible）**

### 宝塔 SSL 证书（可选但推荐）

站点 → **SSL** → **Let's Encrypt** → 申请证书 → 开启强制 HTTPS

---

## 六、腾讯云安全组

确保以下端口已放行：

| 端口 | 用途 |
|------|------|
| 80 | HTTP |
| 443 | HTTPS |
| 7621 | Node.js（仅内网，Nginx 代理用） |
| 8888 | 宝塔面板 |

腾讯云控制台 → **安全组** → 入站规则 → 添加 80/443

---

## 七、日常维护

```bash
# 更新代码
cd /www/wwwroot/bilibili-parser-refactor
git pull origin main
npm install
npm run build
pm2 restart bilibili-parser

# 查看日志
pm2 logs bilibili-parser

# 更新 yt-dlp
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
```

---

## 常见问题

| 问题 | 解决 |
|------|------|
| 502 Bad Gateway | `pm2 status` 检查服务是否在线 |
| 下载报错 | `ffmpeg -version` 和 `yt-dlp --version` 确认已安装 |
| dnf 装不了 ffmpeg | 用静态构建版（见第一步注释） |
| npm install 报错 | 确认 `node -v` 显示 v22.x |
| 4K 不可用 | 网站登录 B 站大会员账号 |
