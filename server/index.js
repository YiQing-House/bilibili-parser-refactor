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

const express = require('express')
const cors = require('cors')
const axios = require('axios')
const cookieParser = require('cookie-parser')
const fs = require('fs')
const path = require('path')
const SessionStore = require('./sessionStore')
const { encWbi } = require('./wbiSign')

const app = express()
const PORT = process.env.PORT || 3000

// 持久化会话存储（JSON 文件，重启不丢失）
const loginSessions = new SessionStore()

// 数据分析模块
const { accessLogger, logDownload, getStats } = require('./analytics')
// 看板娘聊天 AI
const { registerChatAPI } = require('./chat')

// 中间件
app.use(cors({ origin: true, credentials: true }))
app.use(cookieParser())
app.use(express.json())
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
  }
}

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
  const { password, date } = req.query
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, error: '密码错误' })
  }
  const data = getStats(date)
  res.json({ success: true, data })
})

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ==================== 看板娘聊天 ====================
registerChatAPI(app)

// ==================== 启动 ====================
app.listen(PORT, () => {
  console.log(`\n🚀 后端服务已启动: http://localhost:${PORT}`)
  console.log(`📡 API 端点: /api/bilibili/qrcode, /api/parse`)
  console.log()
})
