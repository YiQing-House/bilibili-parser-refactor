/**
 * 视频解析路由
 * 单个解析 / 批量解析 / yt-dlp 信息
 */
const express = require('express')
const axios = require('axios')
const { BILIBILI_HEADERS, getSessionCookies } = require('../helpers/bilibili')
const multiPlatformService = require('../services/multiPlatformService')
const ytdlpService = require('../services/ytdlpService')

module.exports = function createParseRoutes({ loginSessions, logDownload }) {
  const router = express.Router()

  // B站视频解析逻辑（内部函数）
  async function parseBilibiliVideo(url, cookies) {
    const headers = { ...BILIBILI_HEADERS, 'Referer': 'https://www.bilibili.com/' }
    if (cookies) {
      headers['Cookie'] = `SESSDATA=${cookies.SESSDATA}; bili_jct=${cookies.bili_jct}; DedeUserID=${cookies.DedeUserID}`
    }

    // 处理短链接
    let finalUrl = url.trim()
    if (/b23\.tv|btv|bili2233\.cn|bili22\.cn|bili23\.cn/i.test(finalUrl)) {
      if (!/^https?:\/\//i.test(finalUrl)) finalUrl = 'https://' + finalUrl
      const resp = await axios.get(finalUrl, { maxRedirects: 5, headers, timeout: 8000 })
      finalUrl = resp.request.res.responseUrl || finalUrl
    }

    // 纯 BV/AV 号补全
    const bareIdMatch = finalUrl.match(/^(BV[a-zA-Z0-9]{10,})$/i)
    if (bareIdMatch) finalUrl = `https://www.bilibili.com/video/${bareIdMatch[1]}`
    const bareAvMatch = finalUrl.match(/^av(\d+)$/i)
    if (bareAvMatch) finalUrl = `https://www.bilibili.com/video/av${bareAvMatch[1]}`

    // 提取 BV 号或 AV 号
    const bvMatch = finalUrl.match(/BV[a-zA-Z0-9]+/i)
    const avMatch = !bvMatch && finalUrl.match(/av(\d+)/i)

    let bvid
    if (bvMatch) {
      bvid = bvMatch[0]
    } else if (avMatch) {
      const avInfo = await axios.get(`https://api.bilibili.com/x/web-interface/view?aid=${avMatch[1]}`, { headers, timeout: 8000 })
      if (avInfo.data.code !== 0) throw new Error(avInfo.data.message || 'AV号查询失败')
      bvid = avInfo.data.data.bvid
      if (!bvid) throw new Error('AV号转换BV号失败')
    } else {
      throw new Error('无法从链接中提取视频ID')
    }

    // 获取视频信息
    const infoRes = await axios.get(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, { headers })
    if (infoRes.data.code !== 0) throw new Error(infoRes.data.message || '获取视频信息失败')
    const info = infoRes.data.data

    // 获取最高画质
    let maxQuality = 80
    const qualities = []
    try {
      const cid = info.pages?.[0]?.cid || info.cid
      if (cid) {
        const playRes = await axios.get('https://api.bilibili.com/x/player/playurl', {
          params: { bvid, cid, qn: 120, fnval: 4048, fourk: 1, platform: 'pc' },
          headers, timeout: 8000
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
      title: info.title, description: info.desc, cover: info.pic,
      duration: info.duration, pubdate: info.pubdate,
      author: info.owner?.name, authorMid: info.owner?.mid, authorAvatar: info.owner?.face,
      views: info.stat?.view, likes: info.stat?.like, coins: info.stat?.coin,
      favorites: info.stat?.favorite, shares: info.stat?.share, replies: info.stat?.reply,
      danmakus: info.stat?.danmaku, bvid: info.bvid, aid: info.aid, cid: info.cid,
      pages: info.pages, maxQuality, qualities,
    }
  }

  // POST /api/parse — 单个解析
  router.post('/parse', async (req, res) => {
    try {
      const { url } = req.body
      if (!url) return res.status(400).json({ success: false, error: '请提供视频链接' })

      const cookies = getSessionCookies(req, loginSessions)

      const isBiliUrl = /bilibili\.com|b23\.tv|bili2233\.cn|bili22\.cn|bili23\.cn|btv/i.test(url)
      const isBareId = /^(BV[a-zA-Z0-9]{10,}|av\d+)$/i.test(url.trim())
      if (isBiliUrl || isBareId) {
        const result = await parseBilibiliVideo(url, cookies)
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

  // POST /api/parse/batch — 批量解析
  router.post('/parse/batch', async (req, res) => {
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

  // GET /api/platforms — 平台列表
  router.get('/platforms', (req, res) => {
    try {
      const platforms = multiPlatformService.getSupportedPlatforms()
      res.json({ success: true, platforms })
    } catch { res.json({ success: true, platforms: [] }) }
  })

  // yt-dlp 相关
  router.get('/ytdlp/check', async (req, res) => {
    try {
      const check = await ytdlpService.checkAvailable()
      res.json({ success: true, available: check.available, version: check.version || null, command: check.command || null, ffmpegAvailable: check.ffmpegAvailable || false, error: check.error || null })
    } catch (error) {
      res.json({ success: false, available: false, error: error.message })
    }
  })

  router.post('/ytdlp/info', async (req, res) => {
    try {
      const { url } = req.body
      if (!url) return res.status(400).json({ success: false, error: '请提供视频链接' })
      const info = await ytdlpService.getVideoInfo(url)
      res.json({ success: true, data: { title: info.title, author: info.uploader || info.channel || '未知', duration: info.duration ? ytdlpService.formatDuration(info.duration) : '00:00', thumbnail: info.thumbnail || info.thumbnails?.[0]?.url || '', formats: info.formats || [] } })
    } catch (error) {
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // 暴露 parseBilibiliVideo 供其他路由使用
  router.parseBilibiliVideo = parseBilibiliVideo

  return router
}
