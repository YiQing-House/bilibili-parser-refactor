/**
 * ============================================================
 * bilibili-parser-refactor 内置后端
 * ============================================================
 * 
 * 精简入口：只负责中间件注册和路由挂载。
 * 业务逻辑已拆分到 routes/ 和 helpers/ 目录。
 * ============================================================
 */

require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const rateLimit = require('express-rate-limit')
const path = require('path')
const SessionStore = require('./sessionStore')

// 服务层
const bilibiliService = require('./services/bilibiliService')

const app = express()
const PORT = process.env.PORT || 7621

// ==================== 共享实例 ====================

// 下载进度追踪器
const ProgressTracker = require('./shared/progressTracker')
const downloadProgress = new ProgressTracker()
bilibiliService.setProgressTracker(downloadProgress)

// 持久化会话存储
const loginSessions = new SessionStore()

// 数据分析模块
const { accessLogger, logDownload, getStats, getRangeStats } = require('./analytics')

// 看板娘聊天 AI
const { registerChatAPI, registerVideoAnalysis } = require('./chat')

// ==================== 中间件 ====================

// [安全] CORS 白名单
const CORS_WHITELIST = [
  'http://localhost:7622',
  'http://localhost:7621',
  'http://127.0.0.1:7622',
  process.env.CORS_ORIGIN,
].filter(Boolean)
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || CORS_WHITELIST.includes(origin)) return cb(null, true)
    cb(new Error('CORS 被拒绝'))
  },
  credentials: true,
}))
app.use(cookieParser())
app.use(express.json())

// [安全] 速率限制
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, message: { success: false, error: '请求过于频繁，请稍后再试' } })
const parseLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, message: { success: false, error: '解析请求过于频繁' } })
const downloadLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, message: { success: false, error: '下载请求过于频繁' } })
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { success: false, error: '管理接口请求过于频繁' } })
app.use('/api/', apiLimiter)
app.use('/api/parse', parseLimiter)
app.use('/api/download', downloadLimiter)
app.use('/api/admin', adminLimiter)

// FFmpeg.wasm COOP/COEP 头
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
  next()
})

// 访问日志
app.use(accessLogger(loginSessions))

// ==================== 路由注册 ====================

// 共享上下文（注入到路由工厂函数）
const ctx = { loginSessions, downloadProgress, logDownload }

// 认证系统
const createAuthRoutes = require('./routes/auth')
app.use('/api', createAuthRoutes(ctx))

// 视频解析
const createParseRoutes = require('./routes/parse')
const parseRouter = createParseRoutes(ctx)
app.use('/api', parseRouter)

// 下载
const createDownloadRoutes = require('./routes/download')
app.use('/api', createDownloadRoutes(ctx))

// 代理（需要 parseBilibiliVideo 来处理 302 重定向）
const createProxyRoutes = require('./routes/proxy')
app.use('/api', createProxyRoutes({ ...ctx, parseBilibiliVideo: parseRouter.parseBilibiliVideo }))

// 用户数据
const createUserRoutes = require('./routes/user')
app.use('/api', createUserRoutes(ctx))

// 视频增值（AI总结/字幕/弹幕）
const createVideoRoutes = require('./routes/video')
app.use('/api', createVideoRoutes(ctx))

// 番剧/电影/纪录片解析
const createBangumiRoutes = require('./routes/bangumi')
app.use('/api', createBangumiRoutes(ctx))

// APP 下载
const appRoutes = require('./routes/app')
app.use('/api/app', appRoutes)

// 管理面板（通告 + 看板 + 页面）
const adminRoutes = require('./routes/admin')
app.use('/api', adminRoutes)
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')))
app.get('/admin/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')))

// 音乐播放器
const musicRoutes = require('./routes/music')
app.use('/api', musicRoutes)

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 看板娘聊天
registerChatAPI(app)
registerVideoAnalysis(app)

// Live2D 模型代理
const live2dRoutes = require('./routes/live2d')
app.use('/api/live2d', live2dRoutes)

// ==================== 生产模式：托管前端构建产物 ====================
const fs = require('fs')
const distPath = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distPath)) {
  console.log('[PROD] 检测到 dist/ 目录，启用静态文件托管')
  app.use(express.static(distPath))
  // SPA 回退：所有非 API 路由返回 index.html
  app.get('/{*splat}', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/admin')) {
      res.sendFile(path.join(distPath, 'index.html'))
    }
  })
}

// ==================== 启动 ====================
app.listen(PORT, () => {
  console.log(`\n🚀 后端服务已启动: http://localhost:${PORT}`)
  console.log(`📡 API 端点: /api/bilibili/qrcode, /api/parse`)
  if (fs.existsSync(distPath)) {
    console.log(`🌐 前端: http://localhost:${PORT} (生产模式)`)
  }
  console.log()
})
