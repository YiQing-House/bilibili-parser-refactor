# 🎬 B站视频去水印助手

> 基于 Vue 3 + TypeScript + Express 的全栈视频解析下载工具

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

🔗 **原项目**：[YiQing-House/bilibili-parser](https://github.com/YiQing-House/bilibili-parser)

---

## ✨ 功能一览

| 功能 | 说明 |
|------|------|
| 🎯 多链接解析 | 单个 / 批量 / 收藏夹 / UP主投稿 |
| 🎬 多画质支持 | 4K / 1080P60 / 1080P / 720P / 480P / 360P |
| 📥 多格式下载 | 完整视频 / 仅音频 / 封面提取 |
| 🔐 扫码登录 | B站扫码登录，自动检测大会员画质 |
| 🎵 音乐播放器 | 集成网易云音乐 APlayer |
| 🤖 AI 看板娘 | Live2D + 智谱 AI 聊天（可切换角色） |
| ⚡ 下载管理 | 实时进度追踪、取消、批量管理 |
| 📱 响应式布局 | PC / 平板 / 手机三档自适应 |
| 🎨 毛玻璃 UI | Glassmorphism 设计 + 暗色主题 |

## 🖼️ 预览

<details>
<summary>桌面端截图</summary>

![Desktop](test_screenshots/desktop_1280.png)

</details>

<details>
<summary>移动端截图</summary>

![Mobile](test_screenshots/mobile_375.png)

</details>

## 🏗️ 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | Vue 3 + TypeScript + Vite + Pinia + SCSS |
| **后端** | Node.js + Express + yt-dlp + FFmpeg |
| **AI** | 智谱 GLM-4.5 (SSE 流式) |
| **看板娘** | Live2D Widget |
| **音乐** | APlayer + MetingJS |

## 🚀 快速开始

### 本地开发

```bash
# 克隆项目
git clone https://github.com/YiQing-House/bilibili-parser-refactor.git
cd bilibili-parser-refactor

# 安装依赖
npm install

# 复制环境变量
cp .env.example .env
# 编辑 .env 填写配置

# 启动开发模式（前端 + 后端同时运行）
# 终端 1：前端
npm run dev

# 终端 2：后端
npm run server
```

### 生产构建

```bash
npm run build    # 构建前端
npm run prod     # 构建 + 启动后端（一键生产模式）
```

## 📦 宝塔面板部署

详见 👉 [deploy/BT_DEPLOY.md](deploy/BT_DEPLOY.md)

## ⚙️ 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `PORT` | 否 | 服务端口，默认 7621 |
| `ADMIN_PWD` | 是 | 管理面板密码 |
| `CORS_ORIGIN` | 是 | 前端域名（如 `https://dl.example.com`） |
| `GLM_API_KEY` | 否 | 智谱 AI Key（看板娘聊天用） |
| `GLM_MODEL` | 否 | AI 模型，默认 `glm-4.5-air` |
| `NETEASE_COOKIE` | 否 | 网易云 Cookie（音乐播放器用） |

## 📁 项目结构

```
├── src/                    # 前端源码 (Vue 3)
│   ├── components/         # 组件
│   ├── composables/        # 组合式函数
│   ├── modules/            # 功能模块（看板娘/聊天）
│   ├── services/           # API 层
│   ├── stores/             # Pinia 状态管理
│   ├── styles/             # SCSS 样式体系
│   └── views/              # 页面
├── server/                 # 后端 (Express)
│   ├── routes/             # 路由模块
│   ├── services/bilibili/  # B站解析核心
│   ├── helpers/            # 辅助工具
│   └── middleware/         # 中间件
├── deploy/                 # 部署配置
│   ├── BT_DEPLOY.md        # 宝塔部署指南
│   ├── nginx.conf          # Nginx 配置模板
│   ├── setup.sh            # 一键部署脚本
│   └── update.sh           # 更新脚本
└── public/                 # 静态资源
```

## 📄 License

[MIT](LICENSE) © [YiQing-House](https://github.com/YiQing-House)

## 🔗 相关链接

- 🏠 **原项目**：[YiQing-House/bilibili-parser](https://github.com/YiQing-House/bilibili-parser)
- 🐛 **Issues**：[提交反馈](https://github.com/YiQing-House/bilibili-parser-refactor/issues)
