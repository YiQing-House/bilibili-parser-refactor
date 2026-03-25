/**
 * ============================================================
 * 数据分析模块 - 访问日志 & 下载追踪
 * ============================================================
 * 按天存储到 server/logs/YYYY-MM-DD.json
 * 支持多时间范围聚合查询
 */

const fs = require('fs')
const path = require('path')

const LOGS_DIR = path.join(__dirname, 'logs')
const LOG_RETENTION_DAYS = 90  // [P2] 保留最近 90 天日志

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true })
}

// [P2] 启动时清理过期日志，防止磁盘无限增长
try {
  const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000
  const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.json'))
  let cleaned = 0
  for (const f of files) {
    const filePath = path.join(LOGS_DIR, f)
    const stat = fs.statSync(filePath)
    if (stat.mtimeMs < cutoff) {
      fs.unlinkSync(filePath)
      cleaned++
    }
  }
  if (cleaned > 0) console.log(`[Analytics] 清理了 ${cleaned} 个过期日志文件（>${LOG_RETENTION_DAYS}天）`)
} catch (e) { /* ignore */ }

function today() { return new Date().toISOString().slice(0, 10) }

function readDayLog(date) {
  const file = path.join(LOGS_DIR, `${date}.json`)
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch (e) { console.error('[Analytics] read error:', e.message) }
  return { visits: [], downloads: [], uniqueIPs: [], pageViews: 0 }
}

function writeDayLog(date, data) {
  const file = path.join(LOGS_DIR, `${date}.json`)
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8')
}

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.connection?.remoteAddress
    || req.ip
    || 'unknown'
}

function parseDevice(ua) {
  if (!ua) return '未知'
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) {
    const m = ua.match(/Android\s[\d.]+;\s*([^)]+?)(?:\s+Build)?/i)
    return m ? m[1].trim().slice(0, 20) : 'Android'
  }
  let browser = '未知浏览器'
  if (/Edg\//i.test(ua)) browser = 'Edge'
  else if (/Chrome\//i.test(ua)) browser = 'Chrome'
  else if (/Firefox\//i.test(ua)) browser = 'Firefox'
  else if (/Safari\//i.test(ua)) browser = 'Safari'
  let os = ''
  if (/Windows/i.test(ua)) os = 'Windows'
  else if (/Mac OS/i.test(ua)) os = 'macOS'
  else if (/Linux/i.test(ua)) os = 'Linux'
  return os ? `${browser}/${os}` : browser
}

// [P1] 内存缓存当天日志，避免每请求读写磁盘
let _cachedLog = null
let _cachedDate = ''
let _saveTimer = null

function _getCachedLog(date) {
  if (_cachedDate !== date || !_cachedLog) {
    _cachedLog = readDayLog(date)
    _cachedDate = date
  }
  return _cachedLog
}

function _debounceSave(date, log) {
  if (_saveTimer) return
  _saveTimer = setTimeout(() => {
    _saveTimer = null
    writeDayLog(date, log)
  }, 1000)
}

function accessLogger(loginSessions) {
  // 只记录有业务意义的 API 路径
  const TRACK_PREFIXES = [
    '/api/parse',      // 视频解析
    '/api/download',   // 下载
    '/api/music',      // 音乐
    '/api/bilibili',   // B站API（排除轮询）
    '/api/admin',      // 管理操作
    '/api/user',       // 用户操作
  ]
  // 即使命中 TRACK_PREFIXES，仍跳过这些高频轮询
  const SKIP_EXACT = [
    '/api/bilibili/qrcode/check',
    '/api/health',
    '/api/announcement',
  ]

  return (req, res, next) => {
    const p = req.path
    // 跳过静态资源
    if (p.match(/\.(js|css|png|jpg|svg|woff|ico|map|json|webp|gif)$/)) return next()
    // 跳过高频轮询
    if (SKIP_EXACT.some(s => p.startsWith(s))) return next()
    // 跳过 favicon
    if (p === '/favicon.ico') return next()
    // 只记录有业务意义的路径
    if (!TRACK_PREFIXES.some(prefix => p.startsWith(prefix))) return next()

    const ip = getClientIP(req)
    const ua = req.headers['user-agent'] || ''
    const device = parseDevice(ua)
    const date = today()
    const log = _getCachedLog(date)

    log.visits.push({
      time: new Date().toISOString(),
      ip, path: req.path, method: req.method, device,
      user: getUserFromReq(req, loginSessions),
    })
    log.pageViews = (log.pageViews || 0) + 1
    if (!log.uniqueIPs.includes(ip)) log.uniqueIPs.push(ip)
    _debounceSave(date, log)
    next()
  }
}

function getUserFromReq(req, loginSessions) {
  const sessionId = req.cookies?.bili_session
  if (sessionId && loginSessions.has(sessionId)) {
    const session = loginSessions.get(sessionId)
    return session.userInfo?.name || '已登录用户'
  }
  return '游客'
}

function logDownload(req, videoInfo, loginSessions) {
  const date = today()
  const log = _getCachedLog(date)
  const ip = getClientIP(req)
  log.downloads.push({
    time: new Date().toISOString(),
    ip, device: parseDevice(req.headers['user-agent'] || ''),
    user: getUserFromReq(req, loginSessions),
    video: {
      title: videoInfo.title || '未知',
      author: videoInfo.author || '未知',
      bvid: videoInfo.bvid || '',
      url: videoInfo.url || '',
    },
  })
  _debounceSave(date, log)
}

/** 获取日期范围内所有日期字符串 YYYY-MM-DD */
function getDateRange(days) {
  const dates = []
  const now = new Date()
  for (let i = 0; i < days; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

/** 获取所有可用日期 */
function getAvailableDates() {
  try {
    return fs.readdirSync(LOGS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
      .sort().reverse()
  } catch { return [] }
}

/**
 * 获取单天统计（向后兼容）
 */
function getStats(date) {
  const log = readDayLog(date || today())
  const totalVisits = log.visits?.length || 0
  const uniqueVisitors = log.uniqueIPs?.length || 0
  const totalDownloads = log.downloads?.length || 0

  const hourlyVisits = new Array(24).fill(0)
  const hourlyDownloads = new Array(24).fill(0)
  ;(log.visits || []).forEach(v => { hourlyVisits[new Date(v.time).getHours()]++ })
  ;(log.downloads || []).forEach(d => { hourlyDownloads[new Date(d.time).getHours()]++ })

  const deviceCount = {}
  ;(log.visits || []).forEach(v => { deviceCount[v.device] = (deviceCount[v.device] || 0) + 1 })
  const topDevices = Object.entries(deviceCount).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }))

  const loggedInCount = (log.downloads || []).filter(d => d.user !== '游客').length
  const guestCount = totalDownloads - loggedInCount
  const recentDownloads = (log.downloads || []).slice(-50).reverse()
  const recentVisits = (log.visits || []).slice(-100).reverse()

  return {
    date: date || today(),
    totalVisits, uniqueVisitors, totalDownloads,
    loggedInCount, guestCount,
    hourlyVisits, hourlyDownloads,
    topDevices, recentDownloads, recentVisits,
    availableDates: getAvailableDates(),
  }
}

/**
 * 多时间范围聚合统计
 * @param {string} range - 'today' | '3d' | '7d' | '14d' | '30d' | '90d' | '180d' | '365d' | 'all'
 */
function getRangeStats(range) {
  let dates
  if (range === 'today') {
    dates = [today()]
  } else if (range === 'all') {
    dates = getAvailableDates()
  } else {
    const days = parseInt(range) || 7
    dates = getDateRange(days)
  }

  // 聚合所有天的数据
  let totalVisits = 0
  let totalDownloads = 0
  const allIPs = new Set()
  const deviceCount = {}
  const dailyVisits = []   // 逐日 { date, visits, downloads, uniqueIPs }
  const hourlyVisits = new Array(24).fill(0)
  const hourlyDownloads = new Array(24).fill(0)
  let loggedInCount = 0
  let guestCount = 0
  const recentDownloads = []
  const recentVisits = []

  // 按日期正序处理（图表用）
  const sortedDates = [...dates].sort()
  for (const date of sortedDates) {
    const log = readDayLog(date)
    const dayVisits = log.visits?.length || 0
    const dayDownloads = log.downloads?.length || 0
    const dayIPs = log.uniqueIPs?.length || 0

    totalVisits += dayVisits
    totalDownloads += dayDownloads
    ;(log.uniqueIPs || []).forEach(ip => allIPs.add(ip))

    dailyVisits.push({ date, visits: dayVisits, downloads: dayDownloads, uniqueIPs: dayIPs })

    // 小时分布（聚合所有天）
    ;(log.visits || []).forEach(v => {
      const h = new Date(v.time).getHours()
      hourlyVisits[h]++
      deviceCount[v.device] = (deviceCount[v.device] || 0) + 1
    })
    ;(log.downloads || []).forEach(d => {
      hourlyDownloads[new Date(d.time).getHours()]++
      if (d.user !== '游客') loggedInCount++
      else guestCount++
    })

    // 最近记录（取倒序前 50/100）
    recentDownloads.push(...(log.downloads || []))
    recentVisits.push(...(log.visits || []))
  }

  // 按时间倒序排序并截取
  recentDownloads.sort((a, b) => new Date(b.time) - new Date(a.time))
  recentVisits.sort((a, b) => new Date(b.time) - new Date(a.time))

  const topDevices = Object.entries(deviceCount)
    .sort((a, b) => b[1] - a[1]).slice(0, 15)
    .map(([name, count]) => ({ name, count }))

  return {
    range,
    dateCount: sortedDates.length,
    totalVisits,
    uniqueVisitors: allIPs.size,
    totalDownloads,
    loggedInCount, guestCount,
    hourlyVisits, hourlyDownloads,
    dailyVisits,
    topDevices,
    recentDownloads: recentDownloads.slice(0, 50),
    recentVisits: recentVisits.slice(0, 100),
    availableDates: getAvailableDates(),
  }
}

module.exports = { accessLogger, logDownload, getStats, getRangeStats }
