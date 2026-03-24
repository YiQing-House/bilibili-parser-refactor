/**
 * 代理路由
 * 图片代理 / 头像代理 / 302 重定向直下 / CDN 代理
 */
const express = require('express')
const axios = require('axios')
const { BILIBILI_HEADERS, AVATAR_ALLOWED_HOSTS, isAllowedCdnUrl, getSessionCookies } = require('../helpers/bilibili')

module.exports = function createProxyRoutes({ loginSessions, parseBilibiliVideo }) {
  const router = express.Router()

  // 图片代理（防盗链）
  router.get('/proxy/image', async (req, res) => {
    try {
      const { url } = req.query
      if (!url) return res.status(400).send('Missing url parameter')
      const response = await axios({ method: 'GET', url, responseType: 'stream', timeout: 10000,
        headers: { ...BILIBILI_HEADERS, 'Accept': 'image/*,*/*' }
      })
      res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg')
      res.setHeader('Cache-Control', 'public, max-age=86400')
      response.data.pipe(res)
    } catch (error) {
      res.status(500).send('Failed to load image')
    }
  })

  // 头像代理
  router.get('/proxy/avatar', async (req, res) => {
    try {
      const { url } = req.query
      if (!url) return res.status(400).send('缺少 url 参数')
      try {
        const hostname = new URL(url).hostname
        if (!AVATAR_ALLOWED_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h))) {
          return res.status(403).send('不允许代理此域名')
        }
      } catch { return res.status(400).send('URL 格式错误') }
      const response = await axios.get(url, {
        responseType: 'arraybuffer', timeout: 10000, headers: BILIBILI_HEADERS,
      })
      res.set('Content-Type', response.headers['content-type'] || 'image/jpeg')
      res.set('Cache-Control', 'public, max-age=86400')
      res.send(response.data)
    } catch (error) {
      console.error('[Avatar] 代理失败:', error.message)
      res.status(502).send('头像加载失败')
    }
  })

  // 302 重定向直下（不走服务器带宽）
  router.get('/download/redirect', async (req, res) => {
    try {
      const { url, filename } = req.query
      if (!url) return res.status(400).json({ success: false, error: '请提供视频 CDN 链接' })

      const isCdnUrl = url.includes('bilivideo.') || url.includes('akamaized.net') || url.includes('hdslb.com')
      if (isCdnUrl) {
        if (filename) res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
        return res.redirect(302, url)
      }

      const cookies = getSessionCookies(req, loginSessions)
      const bvMatch = url.match(/BV\w+/i)
      if (!bvMatch) return res.status(400).json({ success: false, error: '无法识别的视频链接' })

      const qn = parseInt(req.query.qn) || 80
      const result = await parseBilibiliVideo(url, cookies)

      const params = { bvid: result.bvid, cid: result.cid, qn, fnval: 4048, fourk: 1 }
      const headers = { ...BILIBILI_HEADERS }
      if (cookies) {
        headers['Cookie'] = typeof cookies === 'string'
          ? cookies
          : Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
      }

      const playResp = await axios.get(
        `https://api.bilibili.com/x/player/playurl?${new URLSearchParams(params)}`,
        { headers, timeout: 10000 }
      )
      if (playResp.data.code !== 0) {
        return res.status(500).json({ success: false, error: playResp.data.message || 'playurl 失败' })
      }

      const playData = playResp.data.data
      let cdnUrl = ''
      if (playData.dash?.video?.length > 0) {
        cdnUrl = playData.dash.video[0].baseUrl || playData.dash.video[0].base_url
      } else if (playData.durl?.length > 0) {
        cdnUrl = playData.durl[0].url
      }
      if (!cdnUrl) return res.status(500).json({ success: false, error: '未获取到视频流 URL' })

      const videoFilename = filename || `${result.title || 'video'}.mp4`
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(videoFilename)}"`)
      res.redirect(302, cdnUrl)
    } catch (error) {
      console.error('[Download/Redirect] 错误:', error.message)
      if (!res.headersSent) res.status(500).json({ success: false, error: error.message })
    }
  })

  // CDN 代理下载（兜底方案）
  router.get('/download', async (req, res) => {
    try {
      const { url, filename } = req.query
      if (!url) return res.status(400).json({ success: false, error: '请提供视频链接' })
      if (!isAllowedCdnUrl(url)) {
        return res.status(403).json({ success: false, error: '不允许代理此域名的资源' })
      }
      const videoFilename = filename || `video_${Date.now()}.mp4`
      const response = await axios({ method: 'GET', url, responseType: 'stream', timeout: 300000, maxRedirects: 5,
        headers: { ...BILIBILI_HEADERS, 'Accept': '*/*', 'Origin': 'https://www.bilibili.com' }
      })
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(videoFilename)}"`)
      res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp4')
      if (response.headers['content-length']) res.setHeader('Content-Length', response.headers['content-length'])
      response.data.pipe(res)
    } catch (error) {
      if (!res.headersSent) res.status(500).json({ success: false, error: error.message })
    }
  })

  return router
}
