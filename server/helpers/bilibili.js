/**
 * 共享辅助函数 + 常量
 * 从 index.js 提取，供所有路由模块复用
 */

// [P3] 公共请求头常量
const BILIBILI_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://www.bilibili.com/',
}

// 辅助：构造已登录请求头
function getAuthHeaders(cookies) {
  return {
    ...BILIBILI_HEADERS,
    'Cookie': `SESSDATA=${cookies.SESSDATA}; bili_jct=${cookies.bili_jct}; DedeUserID=${cookies.DedeUserID}`,
  }
}

// 根据视频分辨率宽度推算最高画质(qn值)
function estimateQuality(width) {
  if (!width) return 0
  if (width >= 3840) return 120  // 4K
  if (width >= 1920) return 80   // 1080P
  if (width >= 1280) return 64   // 720P
  if (width >= 854)  return 32   // 480P
  return 16                       // 360P
}

// [安全] 允许下载代理的域名白名单
const ALLOWED_CDN_DOMAINS = ['bilivideo.com', 'bilivideo.cn', 'akamaized.net', 'hdslb.com', 'biliimg.com']
function isAllowedCdnUrl(urlStr) {
  try {
    const hostname = new URL(urlStr).hostname
    return ALLOWED_CDN_DOMAINS.some(d => hostname.endsWith(d))
  } catch { return false }
}

// [安全] 头像域名白名单
const AVATAR_ALLOWED_HOSTS = ['i0.hdslb.com', 'i1.hdslb.com', 'i2.hdslb.com', 'hdslb.com', 'static.hdslb.com']

// 从请求中提取登录 cookies
function getSessionCookies(req, loginSessions) {
  const sessionId = req.cookies?.bili_session
  if (sessionId && loginSessions.has(sessionId)) {
    return loginSessions.get(sessionId).cookies
  }
  return null
}

module.exports = {
  BILIBILI_HEADERS,
  ALLOWED_CDN_DOMAINS,
  AVATAR_ALLOWED_HOSTS,
  getAuthHeaders,
  estimateQuality,
  isAllowedCdnUrl,
  getSessionCookies,
}
