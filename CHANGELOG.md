# 更新日志 / Changelog

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
