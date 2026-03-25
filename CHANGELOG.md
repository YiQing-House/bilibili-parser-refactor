# 更新日志 / Changelog

## v4.1.0 (2026-03-25) — 番剧解析 & 资源下载增强

### 🆕 新增功能

#### 📺 番剧/电影/纪录片解析
- 搜索框支持输入 **番剧链接** 或直接输入 `ep`/`ss`/`md` 号
- 自动获取剧集列表、封面、评分、地区等完整信息
- 支持番剧、国创、电影、纪录片、电视剧全类型

#### 📝 字幕下载（SRT 格式）
- 解析结果新增 **CC 字幕下载按钮**
- B 站 JSON 字幕自动转换为通用 **SRT 格式**
- 支持多语言字幕选择（优先中文/AI 字幕）

#### 🖼️ 封面高清下载升级
- 后端代理获取 **原始分辨率** 高清封面
- 自动去除 B 站 URL 压缩参数，获取最高清版本
- 域名安全白名单校验

#### 🎮 互动视频支持
- 自动识别 B 站**互动视频（分支剧情）**
- 提供分支树查询 API，支持分支选择

#### 🔍 搜索框增强
- 输入提示更新，明确支持 `BV / AV / ep / ss` 多种格式

### 📡 新增 API
| 端点 | 说明 |
|---|---|
| `POST /api/parse/bangumi` | 番剧解析 |
| `GET /api/bangumi/playurl` | 番剧播放流 |
| `GET /api/video/subtitle/list` | 字幕列表 |
| `GET /api/video/subtitle/download` | 字幕 SRT 下载 |
| `GET /api/video/cover` | 封面代理下载 |
| `GET /api/video/interactive` | 互动视频分支 |

### 🏗️ 架构
- 模块化服务层：4 个独立 Service（bangumi / subtitle / cover / interactive）
- 无破坏性变更，兼容所有现有功能

### 🚀 部署
```bash
git pull origin main
pm2 restart all
```

---

## v4.0.0 (2026-03-19) — 全栈重构

### 🔄 代码重构
- **前端技术栈升级**：从原生 JavaScript + HTML 迁移至 **Vue 3 + TypeScript + Vite**
- **组件化架构**：将 4400+ 行单文件 `script.js` 拆分为 10+ 个可复用 Vue 组件
  - 通用组件：`AppToast`, `LoadingSpinner`, `SkeletonLoader`, `LoginModal`, `DownloadManager`
  - 布局组件：`AppHeader`, `AppFooter`
  - 业务组件：`SearchBox`, `QualitySelector`, `ResultCard`
- **状态管理**：引入 Pinia 替代全局变量 + 分散的 localStorage 操作
  - `app.ts`：主题/画质/格式设置，自动持久化
  - `auth.ts`：QR 登录/VIP 状态管理
  - `video.ts`：视频解析结果 + 智能解析 + 历史记录
  - `download.ts`：异步下载任务管理 + 后端轮询
- **API 服务层**：统一 Axios 实例 + 错误拦截器 + 中文错误码映射
  - `bilibili.ts`：解析/批量/收藏夹/用户投稿/下载所有接口
  - `auth.ts`：QR 码/扫码轮询/登录状态/退出

### 🎨 样式重构
- **Design Token 系统**：CSS 变量体系，覆盖颜色/间距/圆角/阴影/动画
- **双主题**：蜜桃奶茶（明亮）+ 暗樱粉（暗色），通过 `[data-theme]` 切换
- **SCSS 体系**：`_variables.scss`, `_mixins.scss`, `_reset.scss`, `global.scss`
- **响应式布局**：PC(≥1200px) / Pad(≥768px) / Mobile(<768px) 三档断点
- **毛玻璃效果**：`backdrop-filter` 统一管理
- **微动画**：fadeInUp, shimmer skeleton, toast slide-in, panel transition

### 🔧 工程化
- **TypeScript strict**：全项目类型安全，vue-tsc 编译零错误
- **路径别名**：`@/` 映射 `src/`
- **API 代理**：Vite proxy 转发 `/api/*` 到 Express 后端
- **持久化**：`pinia-plugin-persistedstate` 自动存储关键状态

### 📊 重构对比

| 指标 | 重构前 | 重构后 |
|------|--------|--------|
| 前端文件数 | 3 (html+js+css) | 20+ 组件/模块 |
| 最大文件 | script.js (168KB) | 各组件 <200行 |
| 类型安全 | ❌ 无 | ✅ TypeScript strict |
| 状态管理 | 全局变量 + localStorage | Pinia + 持久化 |
| 样式方案 | 内联 + 单文件 CSS | SCSS + Design Token |
| 组件复用 | ❌ | ✅ 10+ 可复用组件 |
