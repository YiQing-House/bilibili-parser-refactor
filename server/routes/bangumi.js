/**
 * 番剧/电影/纪录片路由
 */
const express = require('express')
const { getSessionCookies } = require('../helpers/bilibili')
const bangumiService = require('../services/bangumiService')

module.exports = function createBangumiRoutes({ loginSessions }) {
  const router = express.Router()

  // POST /api/parse/bangumi — 番剧解析
  router.post('/parse/bangumi', async (req, res) => {
    try {
      const { url } = req.body
      if (!url) return res.status(400).json({ success: false, error: '请提供番剧链接' })

      const bangumiId = bangumiService.extractBangumiId(url)
      if (!bangumiId) {
        return res.status(400).json({ success: false, error: '无法识别番剧ID（需要 ep/ss/md 号）' })
      }

      const cookies = getSessionCookies(req, loginSessions)
      const seasonInfo = await bangumiService.getSeasonInfo(bangumiId, cookies)

      // 获取第一集（或指定集）的画质信息
      const targetEp = bangumiId.type === 'ep'
        ? seasonInfo.episodes.find(ep => ep.epId === bangumiId.id) || seasonInfo.episodes[0]
        : seasonInfo.episodes[0]

      let qualities = []
      let maxQuality = 80
      if (targetEp) {
        try {
          const playInfo = await bangumiService.getPlayUrl(targetEp.epId, targetEp.cid, 120, cookies)
          qualities = playInfo.qualities
          maxQuality = playInfo.maxQuality
        } catch (e) {
          console.log('[Bangumi] 画质探测失败:', e.message)
        }
      }

      console.log(`[Bangumi] ${seasonInfo.title} | ${seasonInfo.episodes.length}集 | 最高画质 ${maxQuality}`)

      res.json({
        success: true,
        data: {
          platform: '哔哩哔哩',
          isBangumi: true,
          ...seasonInfo,
          maxQuality,
          qualities,
          currentEp: targetEp || null,
        },
      })
    } catch (error) {
      console.error('[Bangumi] 解析失败:', error.message)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // GET /api/bangumi/playurl — 获取指定集的播放流
  router.get('/bangumi/playurl', async (req, res) => {
    try {
      const { ep_id, cid, qn } = req.query
      if (!ep_id || !cid) return res.status(400).json({ success: false, error: '缺少 ep_id 或 cid' })

      const cookies = getSessionCookies(req, loginSessions)
      const playInfo = await bangumiService.getPlayUrl(parseInt(ep_id), parseInt(cid), parseInt(qn) || 120, cookies)

      res.json({ success: true, data: playInfo })
    } catch (error) {
      console.error('[Bangumi] 播放流获取失败:', error.message)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  return router
}
