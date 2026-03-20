/**
 * ============================================================
 * 数据分析模块 - 访问日志 & 下载追踪
 * ============================================================
 * 按天存储到 server/logs/YYYY-MM-DD.json
 */

const fs = require('fs')
const path = require('path')

const LOGS_DIR = path.join(__dirname, 'logs')

// 确保日志目录存在
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true })
}

/** 获取今天的日期字符串 YYYY-MM-DD */
function today() {
  return new Date().toISOString().slice(0, 10)
}

/** 读取某天的日志 */
function readDayLog(date) {
  const file = path.join(LOGS_DIR, `${date}.json`)
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'))
    }
  } catch (e) { console.error('[Analytics] read error:', e.message) }
  return { visits: [], downloads: [], uniqueIPs: [], pageViews: 0 }
}

/** 写入某天的日志 */
function writeDayLog(date, data) {
  const file = path.join(LOGS_DIR, `${date}.json`)
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8')
}

/** 从请求中提取真实 IP */
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.connection?.remoteAddress
    || req.ip
    || 'unknown'
}

/** 解析 User-Agent 为简短设备描述 */
function parseDevice(ua) {
  if (!ua) return '未知'
  // 移动端
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) {
    const m = ua.match(/Android\s[\d.]+;\s*([^)]+?)(?:\s+Build)?/i)
    return m ? m[1].trim().slice(0, 20) : 'Android'
  }
  // PC 浏览器
  let browser = '未知浏览器'
  if (/Edg\//i.test(ua)) browser = 'Edge'
  else if (/Chrome\//i.test(ua)) browser = 'Chrome'
  else if (/Firefox\//i.test(ua)) browser = 'Firefox'
  else if (/Safari\//i.test(ua)) browser = 'Safari'
  // 操作系统
  let os = ''
  if (/Windows/i.test(ua)) os = 'Windows'
  else if (/Mac OS/i.test(ua)) os = 'macOS'
  else if (/Linux/i.test(ua)) os = 'Linux'
  return os ? `${browser}/${os}` : browser
}

/**
 * Express 中间件：记录每个页面访问
 * 只记录非静态资源、非 API 轮询的请求
 */
function accessLogger(loginSessions) {
  return (req, res, next) => {
    // 跳过静态资源和高频轮询
    const skip = [
      '/api/bilibili/qrcode/check',
      '/api/health',
      '/api/announcement',
      '/favicon.ico',
    ]
    if (skip.some(p => req.path.startsWith(p))) return next()
    if (req.path.match(/\.(js|css|png|jpg|svg|woff|ico|map)$/)) return next()

    const ip = getClientIP(req)
    const ua = req.headers['user-agent'] || ''
    const device = parseDevice(ua)
    const date = today()
    const log = readDayLog(date)

    // 记录访问
    log.visits.push({
      time: new Date().toISOString(),
      ip,
      path: req.path,
      method: req.method,
      device,
      user: getUserFromReq(req, loginSessions),
    })

    // 更新计数
    log.pageViews = (log.pageViews || 0) + 1
    if (!log.uniqueIPs.includes(ip)) {
      log.uniqueIPs.push(ip)
    }

    writeDayLog(date, log)
    next()
  }
}

/** 从请求中获取用户名 */
function getUserFromReq(req, loginSessions) {
  const sessionId = req.cookies?.bili_session
  if (sessionId && loginSessions.has(sessionId)) {
    const session = loginSessions.get(sessionId)
    return session.userInfo?.name || '已登录用户'
  }
  return '游客'
}

/**
 * 记录下载/解析行为
 */
function logDownload(req, videoInfo, loginSessions) {
  const date = today()
  const log = readDayLog(date)
  const ip = getClientIP(req)

  log.downloads.push({
    time: new Date().toISOString(),
    ip,
    device: parseDevice(req.headers['user-agent'] || ''),
    user: getUserFromReq(req, loginSessions),
    video: {
      title: videoInfo.title || '未知',
      author: videoInfo.author || '未知',
      bvid: videoInfo.bvid || '',
      url: videoInfo.url || '',
    },
  })

  writeDayLog(date, log)
}

/**
 * 获取看板统计数据
 */
function getStats(date, password) {
  const log = readDayLog(date || today())

  // 今日概览
  const totalVisits = log.visits?.length || 0
  const uniqueVisitors = log.uniqueIPs?.length || 0
  const totalDownloads = log.downloads?.length || 0

  // 按小时分布
  const hourlyVisits = new Array(24).fill(0)
  const hourlyDownloads = new Array(24).fill(0)
  ;(log.visits || []).forEach(v => {
    const h = new Date(v.time).getHours()
    hourlyVisits[h]++
  })
  ;(log.downloads || []).forEach(d => {
    const h = new Date(d.time).getHours()
    hourlyDownloads[h]++
  })

  // 热门设备
  const deviceCount = {}
  ;(log.visits || []).forEach(v => {
    deviceCount[v.device] = (deviceCount[v.device] || 0) + 1
  })
  const topDevices = Object.entries(deviceCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }))

  // 用户 vs 游客
  const loggedInCount = (log.downloads || []).filter(d => d.user !== '游客').length
  const guestCount = totalDownloads - loggedInCount

  // 最近下载记录 (最新 50 条)
  const recentDownloads = (log.downloads || []).slice(-50).reverse()

  // 最近访问记录 (最新 100 条)
  const recentVisits = (log.visits || []).slice(-100).reverse()

  // 可用日期列表（供日期切换）
  let availableDates = []
  try {
    availableDates = fs.readdirSync(LOGS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
      .sort()
      .reverse()
  } catch {}

  return {
    date: date || today(),
    totalVisits,
    uniqueVisitors,
    totalDownloads,
    loggedInCount,
    guestCount,
    hourlyVisits,
    hourlyDownloads,
    topDevices,
    recentDownloads,
    recentVisits,
    availableDates,
  }
}

module.exports = { accessLogger, logDownload, getStats }
