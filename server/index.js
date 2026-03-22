/**
 * ============================================================
 * bilibili-parser-refactor 内置后端
 * ============================================================
 * 
 * 从原项目 bilibili-parser/server.js 迁移而来，
 * 仅保留前端必需的 API：
 *   - 登录系统（二维码/轮询/状态/登出）
 *   - 视频解析（POST /api/parse）
 *   - 健康检查
 * ============================================================
 */

require('dotenv').config()
const express = require('express')
const cors = require('cors')
const axios = require('axios')
const cookieParser = require('cookie-parser')
const fs = require('fs')
const path = require('path')
const os = require('os')
const SessionStore = require('./sessionStore')
const { encWbi } = require('./wbiSign')

// 原项目 services（视频下载/多平台/yt-dlp）
const bilibiliService = require('./services/bilibiliService')
const multiPlatformService = require('./services/multiPlatformService')
const ytdlpService = require('./services/ytdlpService')

const app = express()
const PORT = process.env.PORT || 3000

// ==================== 下载进度追踪 ====================
const downloadProgress = new Map()
function updateDownloadProgress(taskId, data) {
  downloadProgress.set(taskId, { ...data, updatedAt: Date.now() })
}
setInterval(() => {
  const now = Date.now()
  for (const [taskId, data] of downloadProgress.entries()) {
    if (now - data.updatedAt > 5 * 60 * 1000) downloadProgress.delete(taskId)
  }
}, 60000)
global.updateDownloadProgress = updateDownloadProgress

// 持久化会话存储（JSON 文件，重启不丢失）
const loginSessions = new SessionStore()

// 数据分析模块
const { accessLogger, logDownload, getStats, getRangeStats } = require('./analytics')

// 看板娘聊天 AI
const { registerChatAPI, registerVideoAnalysis } = require('./chat')

// 中间件
app.use(cors({ origin: true, credentials: true }))
app.use(cookieParser())
app.use(express.json())

// FFmpeg.wasm 需要 SharedArrayBuffer，必须设置 COOP/COEP 头
// 使用 credentialless 模式，比 require-corp 更宽松，不会阻止跨域图片/CDN 资源
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
  next()
})

app.use(accessLogger(loginSessions))

// ==================== 登录系统 ====================

// 获取登录二维码
app.get('/api/bilibili/qrcode', async (req, res) => {
  try {
    const response = await axios.get(
      'https://passport.bilibili.com/x/passport-login/web/qrcode/generate',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.bilibili.com/',
        },
      }
    )

    if (response.data.code === 0) {
      const { url, qrcode_key } = response.data.data
      // 用第三方 API 生成二维码图片
      const qrcodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`
      res.json({ success: true, qrcodeUrl, qrcodeKey: qrcode_key })
    } else {
      throw new Error(response.data.message || '获取二维码失败')
    }
  } catch (error) {
    console.error('[QR] 获取二维码失败:', error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

// 检查二维码扫描状态
app.get('/api/bilibili/qrcode/check', async (req, res) => {
  try {
    const { key } = req.query
    if (!key) return res.status(400).json({ success: false, error: '缺少 qrcode_key' })

    const response = await axios.get(
      `https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${key}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.bilibili.com/',
        },
      }
    )

    const data = response.data.data
    let status = 'waiting'
    let userInfo = null
    let isVip = false
    let vipLabel = ''

    switch (data.code) {
      case 0: {
        // 登录成功
        status = 'confirmed'
        const urlParams = new URLSearchParams(data.url.split('?')[1])
        const sessdata = urlParams.get('SESSDATA')
        const biliJct = urlParams.get('bili_jct')
        const dedeUserId = urlParams.get('DedeUserID')

        if (sessdata) {
          const cookies = { SESSDATA: sessdata, bili_jct: biliJct, DedeUserID: dedeUserId }

          // 获取用户信息
          try {
            const userRes = await axios.get('https://api.bilibili.com/x/web-interface/nav', {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Cookie': `SESSDATA=${sessdata}; bili_jct=${biliJct}; DedeUserID=${dedeUserId}`,
              },
            })
            if (userRes.data.code === 0) {
              const u = userRes.data.data
              // 头像走后端代理，避免浏览器 CORS 拦截
              const avatarProxy = `/api/proxy/avatar?url=${encodeURIComponent(u.face)}`
              userInfo = { name: u.uname, avatar: avatarProxy, mid: u.mid }
              isVip = u.vipStatus === 1
              // 解析大会员类型
              const vipTypeMap = { 0: '', 1: '月度大会员', 2: '年度大会员' }
              vipLabel = vipTypeMap[u.vipType] || (isVip ? '大会员' : '')
            }
          } catch (e) {
            console.error('[QR] 获取用户信息失败:', e.message)
          }

          // 存储会话
          const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          loginSessions.set(sessionId, { cookies, userInfo, isVip, vipLabel, createdAt: Date.now() })
          res.cookie('bili_session', sessionId, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 })
        }
        break
      }
      case 86038:
        status = 'expired'
        break
      case 86090:
        status = 'scanned'
        break
      case 86101:
        status = 'waiting'
        break
    }

    res.json({ success: true, status, userInfo, isVip, vipLabel })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// 检查登录状态
app.get('/api/bilibili/status', (req, res) => {
  const sessionId = req.cookies?.bili_session
  if (sessionId && loginSessions.has(sessionId)) {
    const session = loginSessions.get(sessionId)
    res.json({ success: true, isLoggedIn: true, isVip: session.isVip, vipLabel: session.vipLabel || '', userInfo: session.userInfo })
  } else {
    res.json({ success: true, isLoggedIn: false })
  }
})

// 退出登录
app.post('/api/bilibili/logout', (req, res) => {
  const sessionId = req.cookies?.bili_session
  if (sessionId) {
    loginSessions.delete(sessionId)
    res.clearCookie('bili_session')
  }
  res.json({ success: true })
})

// 获取用户详细信息（硬币/等级/经验/获赞）
app.get('/api/bilibili/userinfo', async (req, res) => {
  try {
    const sessionId = req.cookies?.bili_session
    if (!sessionId || !loginSessions.has(sessionId)) {
      return res.status(401).json({ success: false, error: '未登录' })
    }
    const session = loginSessions.get(sessionId)
    const { cookies } = session
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Cookie': `SESSDATA=${cookies.SESSDATA}; bili_jct=${cookies.bili_jct}; DedeUserID=${cookies.DedeUserID}`,
      'Referer': 'https://www.bilibili.com/',
    }

    // 并发请求 nav（个人信息）和 upstat（获赞数）
    const [navRes, upstatRes] = await Promise.all([
      axios.get('https://api.bilibili.com/x/web-interface/nav', { headers }),
      axios.get(`https://api.bilibili.com/x/space/upstat?mid=${cookies.DedeUserID}`, { headers }),
    ])

    const nav = navRes.data?.data || {}
    const upstat = upstatRes.data?.data || {}

    res.json({
      success: true,
      data: {
        coins: nav.money || 0,
        level: nav.level_info?.current_level || 0,
        currentExp: nav.level_info?.current_exp || 0,
        nextLevelExp: nav.level_info?.next_exp || 1,
        totalLikes: upstat.likes || 0,
        mid: nav.mid || cookies.DedeUserID,
      },
    })
  } catch (error) {
    console.error('[UserInfo] 获取失败:', error.message)
    res.status(500).json({ success: false, error: '获取用户信息失败' })
  }
})

// 辅助：构造已登录请求头
function getAuthHeaders(cookies) {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Cookie': `SESSDATA=${cookies.SESSDATA}; bili_jct=${cookies.bili_jct}; DedeUserID=${cookies.DedeUserID}`,
    'Referer': 'https://www.bilibili.com/',
  }
}

// 获取用户投稿视频
app.get('/api/bilibili/submissions', async (req, res) => {
  try {
    const sessionId = req.cookies?.bili_session
    if (!sessionId || !loginSessions.has(sessionId)) {
      return res.status(401).json({ success: false, error: '未登录' })
    }
    const { cookies } = loginSessions.get(sessionId)
    const headers = getAuthHeaders(cookies)
    const page = parseInt(req.query.page) || 1
    const pageSize = parseInt(req.query.pageSize) || 20

    // 使用 wbi 签名
    const params = { mid: cookies.DedeUserID, ps: pageSize, pn: page, order: 'pubdate' }
    const signedParams = await encWbi(params, headers)
    const qs = Object.entries(signedParams).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')

    const apiRes = await axios.get(
      `https://api.bilibili.com/x/space/wbi/arc/search?${qs}`,
      { headers }
    )

    if (apiRes.data?.code !== 0) {
      console.error('[Submissions] B站返回:', apiRes.data?.code, apiRes.data?.message)
      return res.status(500).json({ success: false, error: apiRes.data?.message || '接口返回异常' })
    }

    const list = apiRes.data?.data?.list?.vlist || []
    const total = apiRes.data?.data?.page?.count || 0

    res.json({
      success: true,
      data: {
        total,
        list: list.map(v => ({
          bvid: v.bvid,
          title: v.title,
          cover: v.pic?.startsWith('//') ? `https:${v.pic}` : v.pic,
          plays: v.play,
          duration: v.length,
          created: v.created,
        })),
      },
    })
  } catch (error) {
    console.error('[Submissions] 获取失败:', error.message)
    res.status(500).json({ success: false, error: '获取投稿失败' })
  }
})

// 获取用户收藏夹列表
app.get('/api/bilibili/favorites', async (req, res) => {
  try {
    const sessionId = req.cookies?.bili_session
    if (!sessionId || !loginSessions.has(sessionId)) {
      return res.status(401).json({ success: false, error: '未登录' })
    }
    const { cookies } = loginSessions.get(sessionId)
    const headers = getAuthHeaders(cookies)

    const apiRes = await axios.get(
      `https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${cookies.DedeUserID}`,
      { headers }
    )

    const folders = apiRes.data?.data?.list || []
    res.json({
      success: true,
      data: folders.map(f => ({
        id: f.id,
        title: f.title,
        mediaCount: f.media_count,
      })),
    })
  } catch (error) {
    console.error('[Favorites] 获取失败:', error.message)
    res.status(500).json({ success: false, error: '获取收藏夹失败' })
  }
})

// 获取收藏夹内视频
app.get('/api/bilibili/favorites/:id', async (req, res) => {
  try {
    const sessionId = req.cookies?.bili_session
    if (!sessionId || !loginSessions.has(sessionId)) {
      return res.status(401).json({ success: false, error: '未登录' })
    }
    const { cookies } = loginSessions.get(sessionId)
    const headers = getAuthHeaders(cookies)
    const page = parseInt(req.query.page) || 1

    const apiRes = await axios.get(
      `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${req.params.id}&pn=${page}&ps=20&order=mtime`,
      { headers }
    )

    const medias = apiRes.data?.data?.medias || []
    const total = apiRes.data?.data?.info?.media_count || 0

    res.json({
      success: true,
      data: {
        total,
        list: medias.map(m => ({
          bvid: m.bvid,
          title: m.title,
          cover: m.cover?.startsWith('//') ? `https:${m.cover}` : m.cover,
          plays: m.cnt_info?.play || 0,
          duration: m.duration,
          upper: m.upper?.name || '',
        })),
      },
    })
  } catch (error) {
    console.error('[FavDetail] 获取失败:', error.message)
    res.status(500).json({ success: false, error: '获取收藏夹内容失败' })
  }
})

// ==================== 视频解析 ====================

app.post('/api/parse', async (req, res) => {
  try {
    const { url } = req.body
    if (!url) return res.status(400).json({ success: false, error: '请提供视频链接' })

    // 获取用户 cookies
    let cookies = null
    const sessionId = req.cookies?.bili_session
    if (sessionId && loginSessions.has(sessionId)) {
      cookies = loginSessions.get(sessionId).cookies
    }

    // B站视频解析
    if (url.includes('bilibili.com') || url.includes('b23.tv')) {
      const result = await parseBilibiliVideo(url, cookies)
      // 记录解析行为
      logDownload(req, { ...result, url }, loginSessions)
      res.json({ success: true, data: { ...result, platform: '哔哩哔哩' } })
    } else {
      res.status(400).json({ success: false, error: '暂时仅支持B站视频' })
    }
  } catch (error) {
    console.error('[Parse] 解析错误:', error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

// B站视频解析逻辑
async function parseBilibiliVideo(url, cookies) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://www.bilibili.com/',
  }
  if (cookies) {
    headers['Cookie'] = `SESSDATA=${cookies.SESSDATA}; bili_jct=${cookies.bili_jct}; DedeUserID=${cookies.DedeUserID}`
  }

  // 处理短链接
  let finalUrl = url
  if (url.includes('b23.tv')) {
    const resp = await axios.get(url, { maxRedirects: 5, headers })
    finalUrl = resp.request.res.responseUrl || url
  }

  // 提取 BV 号
  const bvMatch = finalUrl.match(/BV[a-zA-Z0-9]+/)
  if (!bvMatch) throw new Error('无法从链接中提取视频ID')

  const bvid = bvMatch[0]

  // 获取视频信息
  const infoRes = await axios.get(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, { headers })
  if (infoRes.data.code !== 0) throw new Error(infoRes.data.message || '获取视频信息失败')

  const info = infoRes.data.data

  // 获取最高画质信息（请求 playurl 获取 DASH 流）
  let maxQuality = 80 // 默认 1080P
  const qualities = []
  try {
    const cid = info.pages?.[0]?.cid || info.cid
    if (cid) {
      const playHeaders = { ...headers }
      const playRes = await axios.get('https://api.bilibili.com/x/player/playurl', {
        params: { bvid: bvid, cid: cid, qn: 120, fnval: 4048, fourk: 1, platform: 'pc' },
        headers: playHeaders, timeout: 8000
      })
      if (playRes.data?.code === 0 && playRes.data?.data?.dash?.video) {
        const videos = playRes.data.data.dash.video
        const qnSet = new Set(videos.map(v => v.id))
        maxQuality = Math.max(...qnSet)
        const qnMap = { 120: '4K', 116: '1080P高帧率', 112: '1080P高帧率', 80: '1080P', 64: '720P', 32: '480P', 16: '360P' }
        for (const qn of [...qnSet].sort((a, b) => b - a)) {
          qualities.push({ qn, label: qnMap[qn] || `${qn}`, needVip: qn > 80, needLogin: qn > 80 })
        }
        console.log(`[Parse] ${bvid} 最高画质: ${qnMap[maxQuality] || maxQuality}`)
      }
    }
  } catch (e) {
    console.log('[Parse] 画质探测失败:', e.message)
  }

  return {
    title: info.title,
    description: info.desc,
    cover: info.pic,
    duration: info.duration,
    pubdate: info.pubdate,
    author: info.owner?.name,
    authorMid: info.owner?.mid,
    authorAvatar: info.owner?.face,
    views: info.stat?.view,
    likes: info.stat?.like,
    coins: info.stat?.coin,
    favorites: info.stat?.favorite,
    shares: info.stat?.share,
    replies: info.stat?.reply,
    danmakus: info.stat?.danmaku,
    bvid: info.bvid,
    aid: info.aid,
    cid: info.cid,
    pages: info.pages,
    maxQuality: maxQuality,
    qualities: qualities,
  }
}

// ==================== 视频下载 API（原项目迁移）====================

// 视频下载（支持画质选择）
app.get('/api/bilibili/download', async (req, res) => {
  try {
    const { url, qn = 80, format = 'mp4', nameFormat = 'title' } = req.query
    if (!url) return res.status(400).json({ success: false, error: '请提供视频链接' })

    let cookies = null
    const sessionId = req.cookies?.bili_session
    if (sessionId && loginSessions.has(sessionId)) cookies = loginSessions.get(sessionId).cookies

    const taskId = `download_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    updateDownloadProgress(taskId, { status: 'starting', percent: 0, stage: '准备中...', videoPercent: 0, audioPercent: 0 })
    await bilibiliService.downloadWithQuality(url, parseInt(qn), cookies, res, format, nameFormat, taskId)
  } catch (error) {
    console.error('[Download] 错误:', error.message)
    if (!res.headersSent) res.status(500).json({ success: false, error: error.message })
  }
})

// 获取下载进度
app.get('/api/download-progress/:taskId', (req, res) => {
  const progress = downloadProgress.get(req.params.taskId)
  res.json({ success: true, data: progress || { status: 'unknown', percent: 0 } })
})

// 取消下载任务
app.post('/api/cancel-download/:taskId', (req, res) => {
  try {
    const { taskId } = req.params
    const cancelled = bilibiliService.cancelDownload(taskId)
    downloadProgress.set(taskId, { status: 'cancelled', stage: 'cancelled', percent: 0, message: '下载已取消', updatedAt: Date.now() })
    res.json({ success: true, cancelled })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// 创建下载任务（异步，返回 taskId 供前端轮询）
app.post('/api/bilibili/download-task', async (req, res) => {
  try {
    const { url, qn = 80, format = 'mp4', nameFormat = 'title' } = req.body
    if (!url) return res.status(400).json({ success: false, error: '请提供视频链接' })

    let cookies = null
    const sessionId = req.cookies?.bili_session
    if (sessionId && loginSessions.has(sessionId)) cookies = loginSessions.get(sessionId).cookies

    const taskId = `download_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    updateDownloadProgress(taskId, { status: 'starting', percent: 0, stage: '准备中...', videoPercent: 0, audioPercent: 0 })
    res.json({ success: true, taskId })

    bilibiliService.downloadWithQualityAsync(url, parseInt(qn), cookies, format, nameFormat, taskId)
      .then((filePath) => {
        const currentProgress = downloadProgress.get(taskId)
        if (!currentProgress || currentProgress.status !== 'completed') {
          updateDownloadProgress(taskId, {
            status: 'completed', percent: 100, stage: '下载完成', filePath,
            fileName: path.basename(filePath),
            downloadUrl: `/api/download-file/${encodeURIComponent(path.basename(filePath))}`,
          })
        }
      })
      .catch((error) => {
        updateDownloadProgress(taskId, { status: 'error', percent: 0, stage: '下载失败', error: error.message })
      })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// 下载已完成的文件
app.get('/api/download-file/:filename', (req, res) => {
  try {
    const { filename } = req.params
    const downloadDir = path.join(os.tmpdir(), 'bilibili-downloads')
    const filePath = path.join(downloadDir, decodeURIComponent(filename))
    if (!filePath.startsWith(downloadDir)) return res.status(403).json({ success: false, error: '访问被拒绝' })
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: '文件不存在或已过期' })

    const stats = fs.statSync(filePath)
    const ext = path.extname(filename).toLowerCase()
    const mimeTypes = { '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.flv': 'video/x-flv', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4' }
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream')
    res.setHeader('Content-Length', stats.size)
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
    const fileStream = fs.createReadStream(filePath)
    fileStream.pipe(res)
    fileStream.on('end', () => { setTimeout(() => { try { fs.unlinkSync(filePath) } catch {} }, 5000) })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// 音频下载
app.get('/api/bilibili/download/audio', async (req, res) => {
  try {
    const { url, qn = 80 } = req.query
    if (!url) return res.status(400).json({ success: false, error: '请提供视频链接' })
    let cookies = null
    const sessionId = req.cookies?.bili_session
    if (sessionId && loginSessions.has(sessionId)) cookies = loginSessions.get(sessionId).cookies
    await bilibiliService.downloadAudio(url, parseInt(qn), cookies, res)
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ success: false, error: error.message })
  }
})

// 封面下载
app.get('/api/bilibili/download/cover', async (req, res) => {
  try {
    const { url } = req.query
    if (!url) return res.status(400).json({ success: false, error: '请提供视频链接' })
    await bilibiliService.downloadCover(url, res)
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ success: false, error: error.message })
  }
})

// 视频下载（无音频）
app.get('/api/bilibili/download/video-only', async (req, res) => {
  try {
    const { url, qn = 80 } = req.query
    if (!url) return res.status(400).json({ success: false, error: '请提供视频链接' })
    let cookies = null
    const sessionId = req.cookies?.bili_session
    if (sessionId && loginSessions.has(sessionId)) cookies = loginSessions.get(sessionId).cookies
    await bilibiliService.downloadVideoOnly(url, parseInt(qn), cookies, res)
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ success: false, error: error.message })
  }
})

// 获取视频/音频直接下载链接
app.get('/api/bilibili/direct-links', async (req, res) => {
  try {
    const { url, qn = 80 } = req.query
    if (!url) return res.status(400).json({ success: false, error: '请提供视频链接' })
    let cookies = null
    const sessionId = req.cookies?.bili_session
    if (sessionId && loginSessions.has(sessionId)) cookies = loginSessions.get(sessionId).cookies
    const links = await bilibiliService.getDirectLinks(url, parseInt(qn), cookies)
    res.json({ success: true, data: links })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// 流式代理下载
app.get('/api/bilibili/stream', async (req, res) => {
  try {
    const { url, qn = 80, type = 'video', format } = req.query
    if (!url) return res.status(400).json({ success: false, error: '请提供视频链接' })
    let cookies = null
    const sessionId = req.cookies?.bili_session
    if (sessionId && loginSessions.has(sessionId)) cookies = loginSessions.get(sessionId).cookies
    const links = await bilibiliService.getDirectLinks(url, parseInt(qn), cookies)
    const targetUrl = type === 'audio' ? links.audioUrl : links.videoUrl
    if (!targetUrl) return res.status(400).json({ success: false, error: `无法获取${type === 'audio' ? '音频' : '视频'}链接` })
    const ext = format || (type === 'audio' ? 'm4a' : 'm4s')
    const filename = `${links.title}_${type}.${ext}`
    if (format && format !== (type === 'audio' ? 'm4a' : 'm4s')) {
      await bilibiliService.streamWithFormat(targetUrl, res, filename, type, format)
    } else {
      await bilibiliService.streamProxy(targetUrl, res, filename)
    }
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ success: false, error: error.message })
  }
})

// ==================== 通用代理 ====================

// 图片代理（防盗链）
app.get('/api/proxy/image', async (req, res) => {
  try {
    const { url } = req.query
    if (!url) return res.status(400).send('Missing url parameter')
    const response = await axios({ method: 'GET', url, responseType: 'stream', timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': 'https://www.bilibili.com/', 'Accept': 'image/*,*/*' }
    })
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    response.data.pipe(res)
  } catch (error) {
    res.status(500).send('Failed to load image')
  }
})

// 视频下载代理
app.get('/api/download', async (req, res) => {
  try {
    const { url, filename } = req.query
    if (!url) return res.status(400).json({ success: false, error: '请提供视频链接' })
    const videoFilename = filename || `video_${Date.now()}.mp4`
    const isBilibiliCdn = url.includes('bilivideo.') || url.includes('akamaized.net') || url.includes('bilibili.com') || url.includes('hdslb.com')
    const referer = isBilibiliCdn ? 'https://www.bilibili.com/' : new URL(url).origin
    const response = await axios({ method: 'GET', url, responseType: 'stream', timeout: 300000, maxRedirects: 5,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': '*/*', 'Referer': referer, 'Origin': isBilibiliCdn ? 'https://www.bilibili.com' : undefined }
    })
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(videoFilename)}"`)
    res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp4')
    if (response.headers['content-length']) res.setHeader('Content-Length', response.headers['content-length'])
    res.setHeader('Access-Control-Allow-Origin', '*')
    response.data.pipe(res)
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ success: false, error: error.message })
  }
})

// ==================== 批量解析 ====================
app.post('/api/parse/batch', async (req, res) => {
  try {
    const { urls } = req.body
    if (!urls || !Array.isArray(urls) || urls.length === 0) return res.status(400).json({ success: false, error: '请提供视频链接数组' })
    if (urls.length > 50) return res.status(400).json({ success: false, error: '单次最多处理50个链接' })
    const results = await multiPlatformService.parseMultiple(urls)
    res.json({ success: true, total: urls.length, results })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// 用户投稿处理（旧版兼容）
app.get('/api/bilibili/user-videos', async (req, res) => {
  try {
    const { uid } = req.query
    if (!uid) return res.status(400).json({ success: false, error: '请提供用户UID' })
    let cookies = null
    const sessionId = req.cookies?.bili_session
    if (sessionId && loginSessions.has(sessionId)) cookies = loginSessions.get(sessionId).cookies
    const result = await multiPlatformService.parseBilibiliUserVideos(uid, cookies)
    res.json(result)
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// 获取支持的平台列表
app.get('/api/platforms', (req, res) => {
  try {
    const platforms = multiPlatformService.getSupportedPlatforms()
    res.json({ success: true, platforms })
  } catch { res.json({ success: true, platforms: [] }) }
})

// ==================== yt-dlp ====================

// 检查 yt-dlp 是否可用
app.get('/api/ytdlp/check', async (req, res) => {
  try {
    const check = await ytdlpService.checkAvailable()
    res.json({ success: true, available: check.available, version: check.version || null, command: check.command || null, ffmpegAvailable: check.ffmpegAvailable || false, error: check.error || null })
  } catch (error) {
    res.json({ success: false, available: false, error: error.message })
  }
})

// 使用 yt-dlp 获取视频信息
app.post('/api/ytdlp/info', async (req, res) => {
  try {
    const { url } = req.body
    if (!url) return res.status(400).json({ success: false, error: '请提供视频链接' })
    const info = await ytdlpService.getVideoInfo(url)
    res.json({ success: true, data: { title: info.title, author: info.uploader || info.channel || '未知', duration: info.duration ? ytdlpService.formatDuration(info.duration) : '00:00', thumbnail: info.thumbnail || info.thumbnails?.[0]?.url || '', formats: info.formats || [] } })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// 使用 yt-dlp 下载视频
app.get('/api/ytdlp/download', async (req, res) => {
  try {
    let { url, format = 'best' } = req.query
    if (!url) return res.status(400).json({ success: false, error: '请提供视频链接' })
    const isBilibili = url.includes('bilibili.com') || url.includes('b23.tv')
    if (isBilibili) {
      try { await bilibiliService.downloadAndMerge(url, res); return } catch { /* fallback to yt-dlp */ }
    }
    const check = await ytdlpService.checkAvailable()
    if (!check.available) return res.status(503).json({ success: false, error: '服务器未配置此下载功能' })
    await ytdlpService.downloadVideoStream(url, format, res)
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ success: false, error: error.message })
  }
})

// URL 校验辅助函数
function isValidUrl(string) {
  try { const u = new URL(string); return u.protocol === 'http:' || u.protocol === 'https:' } catch { return false }
}

// ==================== 用户行为分析（供 AI 画像用）====================
app.get('/api/user/profile-analysis', async (req, res) => {
  try {
    const sessionId = req.cookies?.bili_session
    if (!sessionId || !loginSessions.has(sessionId)) {
      return res.json({ success: false, error: '未登录' })
    }
    const cookies = loginSessions.get(sessionId).cookies
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.bilibili.com/',
      'Cookie': `SESSDATA=${cookies.SESSDATA}; bili_jct=${cookies.bili_jct}; DedeUserID=${cookies.DedeUserID}`,
    }

    const results = { history: [], favorites: [], categories: {} }

    // 1. 获取观看历史（最近 30 条）
    try {
      const historyRes = await axios.get(
        'https://api.bilibili.com/x/web-interface/history/cursor?ps=30',
        { headers, timeout: 10000 }
      )
      const list = historyRes.data?.data?.list || []
      results.history = list.map(item => ({
        title: item.title,
        tname: item.tag_name || item.tname || '未知',
        author: item.author_name || '',
      }))
    } catch (e) {
      console.error('[ProfileAnalysis] 历史记录获取失败:', e.message)
    }

    // 2. 获取收藏夹列表 + 每个取几个视频
    try {
      const mid = cookies.DedeUserID
      const favRes = await axios.get(
        `https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${mid}`,
        { headers, timeout: 10000 }
      )
      const folders = favRes.data?.data?.list || []
      // 取前 3 个收藏夹，每个取 10 个视频
      for (const folder of folders.slice(0, 3)) {
        try {
          const contentRes = await axios.get(
            `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${folder.id}&ps=10&pn=1`,
            { headers, timeout: 8000 }
          )
          const medias = contentRes.data?.data?.medias || []
          for (const m of medias) {
            results.favorites.push({
              title: m.title,
              tname: m.upper?.name ? '' : '', // 分区在 intro 里不太好拿，用标题推断
              author: m.upper?.name || '',
              folderName: folder.title,
            })
          }
        } catch { /* skip folder */ }
      }
    } catch (e) {
      console.error('[ProfileAnalysis] 收藏夹获取失败:', e.message)
    }

    // 3. 统计分区分布
    const allItems = [...results.history]
    for (const item of allItems) {
      const cat = item.tname || '未知'
      results.categories[cat] = (results.categories[cat] || 0) + 1
    }

    // 4. 生成摘要文本
    const catEntries = Object.entries(results.categories).sort((a, b) => b[1] - a[1])
    const topCategories = catEntries.slice(0, 5).map(([name, count]) => `${name}(${count}次)`).join('、')

    const historyTitles = results.history.slice(0, 10).map(h => h.title).join('、')
    const favTitles = results.favorites.slice(0, 10).map(f => `「${f.title}」(${f.folderName})`).join('、')

    const summary = [
      topCategories ? `常看分区: ${topCategories}` : '',
      historyTitles ? `最近在看: ${historyTitles}` : '',
      favTitles ? `收藏内容: ${favTitles}` : '',
    ].filter(Boolean).join('\n')

    console.log(`[ProfileAnalysis] 历史${results.history.length}条，收藏${results.favorites.length}条，分区${catEntries.length}个`)
    res.json({ success: true, summary, categories: results.categories })

  } catch (error) {
    console.error('[ProfileAnalysis] 失败:', error.message)
    res.json({ success: false, error: error.message })
  }
})


// ==================== 视频字幕抓取 ====================
app.get('/api/video/subtitle', async (req, res) => {
  try {
    const { bvid, cid } = req.query
    if (!bvid || !cid) return res.status(400).json({ success: false, error: '缺少 bvid 或 cid' })

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.bilibili.com/',
    }
    const sessionId = req.cookies?.bili_session
    if (sessionId && loginSessions.has(sessionId)) {
      const cookies = loginSessions.get(sessionId).cookies
      headers['Cookie'] = `SESSDATA=${cookies.SESSDATA}; bili_jct=${cookies.bili_jct}; DedeUserID=${cookies.DedeUserID}`
    }

    const playerRes = await axios.get(
      `https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`,
      { headers, timeout: 10000 }
    )
    const subtitles = playerRes.data?.data?.subtitle?.subtitles
    if (!subtitles || subtitles.length === 0) {
      return res.json({ success: true, text: '' })
    }

    let targetSub = subtitles.find(s => s.lan === 'zh-CN' || s.lan === 'ai-zh')
      || subtitles.find(s => s.lan.startsWith('zh'))
      || subtitles[0]

    let subUrl = targetSub.subtitle_url
    if (subUrl.startsWith('//')) subUrl = 'https:' + subUrl

    const subRes = await axios.get(subUrl, { headers, timeout: 10000 })
    const body = subRes.data?.body || subRes.data
    if (!Array.isArray(body)) return res.json({ success: true, text: '' })

    const fullText = body.map(item => item.content).join(' ')
    const text = fullText.length > 3000 ? fullText.slice(0, 3000) + '…' : fullText
    res.json({ success: true, text, lang: targetSub.lan })
  } catch (error) {
    console.error('[Subtitle] 失败:', error.message)
    res.json({ success: true, text: '' })
  }
})

// ==================== 弹幕下载 ====================
app.get('/api/bilibili/danmaku/:cid', async (req, res) => {
  try {
    const { cid } = req.params
    const response = await axios.get(`https://comment.bilibili.com/${cid}.xml`, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.bilibili.com/',
      },
      decompress: true,
    })
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="danmaku_${cid}.xml"`)
    res.send(response.data)
  } catch (error) {
    console.error('[Danmaku] 获取失败:', error.message)
    res.status(500).json({ success: false, error: '弹幕获取失败' })
  }
})

// ==================== 头像代理 ====================
app.get('/api/proxy/avatar', async (req, res) => {
  try {
    const { url } = req.query
    if (!url) return res.status(400).send('缺少 url 参数')
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.bilibili.com/',
      },
    })
    res.set('Content-Type', response.headers['content-type'] || 'image/jpeg')
    res.set('Cache-Control', 'public, max-age=86400')
    res.send(response.data)
  } catch (error) {
    console.error('[Avatar] 代理失败:', error.message)
    res.status(502).send('头像加载失败')
  }
})

// ==================== 云通告系统 ====================
const ANNOUNCEMENT_FILE = path.join(__dirname, 'announcement.json')
const ADMIN_PASSWORD = process.env.ADMIN_PWD || 'bili2025'

function readAnnouncements() {
  try {
    if (fs.existsSync(ANNOUNCEMENT_FILE)) {
      const raw = JSON.parse(fs.readFileSync(ANNOUNCEMENT_FILE, 'utf-8'))
      // 兼容旧格式（单条对象 → 数组）
      if (Array.isArray(raw)) return raw
      if (raw.title || raw.content) return [raw]
    }
  } catch (e) { console.error('[Announcement] read error:', e.message) }
  return []
}

function writeAnnouncements(list) {
  fs.writeFileSync(ANNOUNCEMENT_FILE, JSON.stringify(list, null, 2), 'utf-8')
}

// 公开接口：获取所有启用的通告（最新在前）
app.get('/api/announcement', (req, res) => {
  const all = readAnnouncements()
  const enabled = all.filter(a => a.enabled && a.content)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  res.json({ success: true, data: enabled.length ? enabled : null })
})

// 管理接口：新增通告（密码保护）
app.post('/api/admin/announcement', (req, res) => {
  const { password, title, content, enabled } = req.body
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, error: 'wrong password' })
  }
  const all = readAnnouncements()
  const item = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: title || '',
    content: content || '',
    enabled: enabled !== false,
    updatedAt: new Date().toISOString(),
  }
  all.unshift(item) // 最新的在前
  writeAnnouncements(all)
  console.log('[Announcement] added:', item.title)
  res.json({ success: true, data: item })
})

// 管理接口：删除通告
app.delete('/api/admin/announcement/:id', (req, res) => {
  const { password } = req.query
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, error: 'wrong password' })
  }
  let all = readAnnouncements()
  all = all.filter(a => a.id !== req.params.id)
  writeAnnouncements(all)
  res.json({ success: true })
})

// 管理接口：获取全部通告（含禁用的）
app.get('/api/admin/announcements', (req, res) => {
  const { password } = req.query
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, error: 'wrong password' })
  }
  const all = readAnnouncements()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  res.json({ success: true, data: all })
})

// 管理页面
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'))
})

// 数据看板页面
app.get('/admin/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'))
})

// 看板数据 API（密码保护）
app.get('/api/admin/stats', (req, res) => {
  const { password, date, range } = req.query
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, error: '密码错误' })
  }
  // range 优先，否则按 date 查单天
  if (range) {
    const data = getRangeStats(range)
    res.json({ success: true, data })
  } else {
    const data = getStats(date)
    res.json({ success: true, data })
  }
})

// ==================== 音乐播放器 API（网易云 API Enhanced）====================
const NETEASE_API = 'https://music-api.qhouse.asia'
const NETEASE_COOKIE = process.env.NETEASE_COOKIE || ''  // 可选：网易云 Cookie，解锁 VIP 歌曲
const musicCache = { songs: [], updatedAt: 0, dayKey: '' }

if (NETEASE_COOKIE) {
  console.log('[Music] 已配置网易云 Cookie（VIP 模式）')
} else {
  console.log('[Music] 未配置 Cookie，仅免费歌曲可用')
}

// 网易云歌单 ID 列表（每天轮换）
const MUSIC_PLAYLISTS = [
  '3778678',      // 热歌榜
  '3779629',      // 新歌榜
  '19723756',     // 飙升榜
  '2884035',      // 原创榜
  '991319590',    // 华语金曲
  '5059633707',   // ACG 动漫
  '745956260',    // 欧美经典
  '5059642708',   // 日语经典
  '2809577409',   // 电子音乐
  '60198',        // Billboard
]

// 从网易云歌单获取歌曲 + URL
async function fetchPlaylistSongs(playlistId) {
  try {
    // 1. 获取歌单曲目
    const headers = NETEASE_COOKIE ? { Cookie: NETEASE_COOKIE } : {}
    const listRes = await axios.get(`${NETEASE_API}/playlist/track/all`, {
      params: { id: playlistId, limit: 200 },
      headers,
      timeout: 20000,
    })
    const songs = listRes.data?.songs || []
    if (!songs.length) return []

    // 2. 批量获取 URL（每批 50 首）
    const result = []
    for (let i = 0; i < songs.length; i += 50) {
      const batch = songs.slice(i, i + 50)
      const ids = batch.map(s => s.id).join(',')
      try {
        const urlRes = await axios.get(`${NETEASE_API}/song/url/v1`, {
          params: { id: ids, level: 'standard' },
          headers,
          timeout: 15000,
        })
        const urlMap = {}
        for (const u of (urlRes.data?.data || [])) {
          if (u.url) urlMap[u.id] = u.url
        }
        // 只保留有 URL 的歌曲
        for (const s of batch) {
          if (urlMap[s.id]) {
            result.push({
              id: s.id,
              name: s.name,
              artist: (s.ar || []).map(a => a.name).join('/'),
              url: urlMap[s.id],
              pic: s.al?.picUrl ? s.al.picUrl + '?param=100y100' : '',
            })
          }
        }
      } catch (e) {
        console.error(`[Music] URL 批次失败:`, e.message)
      }
    }
    return result
  } catch (e) {
    console.error(`[Music] 歌单 ${playlistId} 失败:`, e.message)
    return []
  }
}

// 获取个人每日推荐歌曲
async function fetchRecommendSongs() {
  if (!NETEASE_COOKIE) return []
  try {
    const headers = { Cookie: NETEASE_COOKIE }
    const res = await axios.get(`${NETEASE_API}/recommend/songs`, { headers, timeout: 15000 })
    const songs = res.data?.data?.dailySongs || []
    if (!songs.length) return []

    // 批量获取 URL
    const result = []
    for (let i = 0; i < songs.length; i += 50) {
      const batch = songs.slice(i, i + 50)
      const ids = batch.map(s => s.id).join(',')
      try {
        const urlRes = await axios.get(`${NETEASE_API}/song/url/v1`, {
          params: { id: ids, level: 'standard' }, headers, timeout: 15000,
        })
        const urlMap = {}
        for (const u of (urlRes.data?.data || [])) { if (u.url) urlMap[u.id] = u.url }
        for (const s of batch) {
          if (urlMap[s.id]) {
            result.push({
              id: s.id, name: s.name,
              artist: (s.ar || []).map(a => a.name).join('/'),
              url: urlMap[s.id],
              pic: s.al?.picUrl ? s.al.picUrl + '?param=100y100' : '',
            })
          }
        }
      } catch (e) { /* skip */ }
    }
    console.log(`[Music] 个人推荐: ${result.length} 首可播放`)
    return result
  } catch (e) {
    console.error('[Music] 个人推荐获取失败:', e.message)
    return []
  }
}

// 获取每日歌单（个人推荐优先，榜单兜底）
async function getDailyPlaylist() {
  const today = new Date().toISOString().slice(0, 10)
  const cacheAge = Date.now() - musicCache.updatedAt
  if (musicCache.dayKey === today && musicCache.songs.length > 0 && cacheAge < 2 * 3600 * 1000) {
    return musicCache.songs
  }

  const allSongs = []

  // 1. 优先：个人每日推荐（需要 Cookie）
  if (NETEASE_COOKIE) {
    const recommend = await fetchRecommendSongs()
    allSongs.push(...recommend)
  }

  // 2. 补充：从榜单里补到至少 80 首
  if (allSongs.length < 80) {
    const dayHash = today.split('-').reduce((a, b) => a + parseInt(b), 0)
    const picked = []
    for (let i = 0; i < 2; i++) {
      picked.push(MUSIC_PLAYLISTS[(dayHash + i) % MUSIC_PLAYLISTS.length])
    }
    console.log(`[Music] 补充歌单: ${picked.join(', ')}`)
    for (const pid of picked) {
      const songs = await fetchPlaylistSongs(pid)
      allSongs.push(...songs)
      console.log(`[Music] 歌单 ${pid}: ${songs.length} 首`)
    }
  }

  // 去重
  const seen = new Set()
  const unique = allSongs.filter(s => {
    const key = s.name + '-' + s.artist
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  musicCache.songs = unique
  musicCache.updatedAt = Date.now()
  musicCache.dayKey = today
  console.log(`[Music] 总计 ${unique.length} 首可播放歌曲`)
  return unique
}

// ---- 音频代理（绕过 CDN 防盗链）----
const songUrlCache = new Map() // id -> { url, ts }

app.get('/api/music/play/:id', async (req, res) => {
  try {
    const songId = req.params.id
    const now = Date.now()

    // URL 缓存 10 分钟
    let audioUrl = null
    const cached = songUrlCache.get(songId)
    if (cached && now - cached.ts < 10 * 60 * 1000) {
      audioUrl = cached.url
    } else {
      const headers = NETEASE_COOKIE ? { Cookie: NETEASE_COOKIE } : {}
      const urlRes = await axios.get(`${NETEASE_API}/song/url/v1`, {
        params: { id: songId, level: 'standard' },
        headers,
        timeout: 10000,
      })
      const data = urlRes.data?.data?.[0]
      if (data?.url) {
        audioUrl = data.url
        songUrlCache.set(songId, { url: audioUrl, ts: now })
      }
    }

    if (!audioUrl) {
      return res.status(404).send('URL not found')
    }

    // 代理音频流
    const audioRes = await axios.get(audioUrl, {
      responseType: 'stream',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://music.163.com/',
      },
    })

    // 转发响应头
    if (audioRes.headers['content-type']) res.set('Content-Type', audioRes.headers['content-type'])
    if (audioRes.headers['content-length']) res.set('Content-Length', audioRes.headers['content-length'])
    res.set('Accept-Ranges', 'bytes')
    res.set('Cache-Control', 'public, max-age=600')

    audioRes.data.pipe(res)
  } catch (e) {
    console.error(`[Music] 代理失败 ${req.params.id}:`, e.message)
    res.status(500).send('Proxy error')
  }
})

// 清理旧 URL 缓存
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of songUrlCache.entries()) {
    if (now - v.ts > 10 * 60 * 1000) songUrlCache.delete(k)
  }
}, 5 * 60 * 1000)

// ---- 歌词 API（去标点，标准 LRC）----
app.get('/api/lyric', async (req, res) => {
  try {
    const { id } = req.query
    if (!id) return res.type('text').send('')

    const headers = NETEASE_COOKIE ? { Cookie: NETEASE_COOKIE } : {}
    const lrcRes = await axios.get(`${NETEASE_API}/lyric`, {
      params: { id },
      headers,
      timeout: 10000,
    })
    let lrc = lrcRes.data?.lrc?.lyric || ''
    if (!lrc) return res.type('text').send('')

    // 去除标点符号（保留时间标签和字母数字汉字）
    lrc = lrc.split('\n').map(line => {
      // 提取时间标签 [xx:xx.xx]
      const match = line.match(/^(\[[\d:.]+\])(.*)$/)
      if (!match) return line
      const timeTag = match[1]
      let text = match[2]
      // 去除中英文标点
      text = text.replace(/[，。！？、；：""''（）《》【】…—·,.!?;:'"()\[\]{}<>~`@#$%^&*_+=|\\/\-]/g, '')
      return timeTag + text
    }).join('\n')

    res.type('text').send(lrc)
  } catch (e) {
    res.type('text').send('')
  }
})

app.get('/api/meting', async (req, res) => {
  try {
    const songs = await getDailyPlaylist()
    res.json(songs)
  } catch (error) {
    console.error('[Music] 错误:', error.message)
    res.json([])
  }
})

// 歌词代理（返回纯 LRC 文本，适配 APlayer lrcType: 3）
app.get('/api/lyric', async (req, res) => {
  try {
    const { id } = req.query
    if (!id) return res.status(400).send('')
    const headers = NETEASE_COOKIE ? { Cookie: NETEASE_COOKIE } : {}
    const lyricRes = await axios.get(`${NETEASE_API}/lyric`, {
      params: { id },
      headers,
      timeout: 10000,
    })
    // 提取 LRC 文本并直接返回纯文本
    const lrcText = lyricRes.data?.lrc?.lyric || ''
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.send(lrcText)
  } catch (error) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.send('')
  }
})

// 音频播放代理（实时获取新鲜 URL，解决缓存 URL 过期问题）
app.get('/api/music/play/:id', async (req, res) => {
  try {
    const { id } = req.params
    if (!id) return res.status(400).json({ error: '缺少 id' })
    const headers = NETEASE_COOKIE ? { Cookie: NETEASE_COOKIE } : {}
    const urlRes = await axios.get(`${NETEASE_API}/song/url/v1`, {
      params: { id, level: 'standard' },
      headers,
      timeout: 10000,
    })
    const songData = (urlRes.data?.data || [])[0]
    if (!songData?.url) {
      console.error(`[Music] 歌曲 ${id} 无可用 URL`)
      return res.status(404).json({ error: '歌曲暂不可用' })
    }
    // 302 重定向到真实 URL
    res.redirect(302, songData.url)
  } catch (error) {
    console.error(`[Music] 播放代理失败:`, error.message)
    res.status(500).json({ error: error.message })
  }
})


// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ==================== 看板娘聊天 ====================
registerChatAPI(app)
registerVideoAnalysis(app)

// ==================== 启动 ====================
app.listen(PORT, () => {
  console.log(`\n🚀 后端服务已启动: http://localhost:${PORT}`)
  console.log(`📡 API 端点: /api/bilibili/qrcode, /api/parse`)
  console.log()
})
