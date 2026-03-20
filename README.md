# 🎬 B站视频去水印助手 (Refactored)

> B站视频解析下载工具 —— 基于 Vue3 + TypeScript + Vite 的全栈重构版本

[English](#english) | [中文](#中文)

---

<a id="中文"></a>

## ✨ 功能特性

- 🎯 **多链接处理**：支持单个、批量、收藏夹、用户投稿处理
- 🎨 **双主题系统**：蜜桃奶茶（明亮）+ 暗樱粉（暗色），自动跟随系统
- 🔐 **扫码登录**：B站 QR 码扫码登录、VIP 权限检测
- 📥 **多格式下载**：完整 / 视音分离 / 仅音频 / 仅视频 / 封面
- 🎬 **多画质支持**：4K / 1080P高帧率 / 1080P / 720P / 480P / 360P
- ⚡ **下载任务管理**：进度追踪、取消、批量管理
- 📱 **响应式布局**：PC / Pad / Mobile 三档自适应
- 💾 **状态持久化**：Pinia + LocalStorage 自动保存設定

## 🏗️ 项目结构

```
src/
├── assets/              # 静态资源
├── components/
│   ├── common/          # 通用组件
│   │   ├── AppToast.vue       # 全局提示
│   │   ├── DownloadManager.vue # 下载管理面板
│   │   ├── LoadingSpinner.vue  # 加载动画
│   │   ├── LoginModal.vue      # 登录弹窗
│   │   └── SkeletonLoader.vue  # 骨架屏
│   ├── layout/          # 布局组件
│   │   ├── AppHeader.vue       # 头部导航
│   │   └── AppFooter.vue       # 页脚
│   └── video/           # 业务组件
│       ├── QualitySelector.vue # 画质选择器
│       ├── ResultCard.vue      # 结果卡片
│       └── SearchBox.vue       # 搜索框
├── services/            # API 层
│   ├── api.ts           # Axios 实例 + 拦截器
│   ├── auth.ts          # 登录认证 API
│   └── bilibili.ts      # B站解析 API
├── stores/              # Pinia 状态管理
│   ├── app.ts           # 全局设置
│   ├── auth.ts          # 登录状态
│   ├── download.ts      # 下载任务
│   └── video.ts         # 视频解析
├── styles/              # SCSS 样式体系
│   ├── _variables.scss  # Design Tokens
│   ├── _mixins.scss     # 响应式 Mixins
│   ├── _reset.scss      # CSS Reset
│   └── global.scss      # 全局样式
├── types/               # TypeScript 类型
│   ├── api.ts
│   └── video.ts
├── views/
│   └── HomeView.vue     # 主页
├── App.vue
└── main.ts
```

## 🚀 快速开始

### 前端开发
```bash
cd bilibili-parser-refactor
npm install
npm run dev
# 访问 http://localhost:5173
```

### 后端服务 (需同时运行)
```bash
cd bilibili-parser   # 原始后端
npm install
npm start
# 后端运行在 http://localhost:3000
```

> Vite 已配置代理，前端 `/api/*` 请求自动转发到 `localhost:3000`

## 🛠️ 技术栈

| 前端 | 后端 |
|------|------|
| Vue 3 + Composition API | Node.js + Express |
| TypeScript | JavaScript |
| Vite | yt-dlp + ffmpeg |
| Pinia + Persistedstate | Cookie + Session |
| SCSS + CSS Variables | Docker |
| Vue Router 4 | |
| Axios | |

---

<a id="english"></a>

## 🎬 Bilibili Video Downloader (Refactored)

> A bilibili video parsing & download tool — fully refactored with Vue3 + TypeScript + Vite

### Features
- 🎯 Multi-link: single, batch, favorites, user uploads
- 🎨 Dual-theme: Peach Milk Tea (light) + Dark Sakura Pink (dark)
- 🔐 QR Code login with VIP detection
- 📥 Multiple formats: complete / split / audio-only / video-only / cover
- 🎬 Quality: 4K / 1080P60 / 1080P / 720P / 480P / 360P
- ⚡ Download manager with progress tracking
- 📱 Responsive: PC / Tablet / Mobile
- 💾 Persistent state via Pinia

### Quick Start
```bash
# Frontend
npm install && npm run dev

# Backend (in original bilibili-parser directory)
npm install && npm start
```

### Tech Stack
- **Frontend**: Vue 3, TypeScript, Vite, Pinia, SCSS, Vue Router
- **Backend**: Node.js, Express, yt-dlp, ffmpeg

## 📄 License

MIT License

## 📞 原项目

基于 [YiQing-House/bilibili-parser](https://github.com/YiQing-House/bilibili-parser) 重构
