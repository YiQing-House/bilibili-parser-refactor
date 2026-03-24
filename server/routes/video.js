/**
 * 视频增值路由
 * AI 总结 / 字幕 / 弹幕
 */
const express = require('express')
const axios = require('axios')
const { BILIBILI_HEADERS, getSessionCookies } = require('../helpers/bilibili')

module.exports = function createVideoRoutes({ loginSessions }) {
  const router = express.Router()

  // B站 AI 视频总结
  router.get('/video/ai-summary', async (req, res) => {
    try {
      const { bvid, cid, up_mid } = req.query
      if (!bvid || !cid) return res.status(400).json({ success: false, error: '缺少 bvid 或 cid' })

      const headers = { ...BILIBILI_HEADERS }
      const sessionId = req.cookies?.bili_session
      if (sessionId && loginSessions.has(sessionId)) {
        const cookies = loginSessions.get(sessionId).cookies
        headers['Cookie'] = `SESSDATA=${cookies.SESSDATA}; bili_jct=${cookies.bili_jct}; DedeUserID=${cookies.DedeUserID}`
      }

      let url = `https://api.bilibili.com/x/web-interface/view/conclusion/get?bvid=${bvid}&cid=${cid}`
      if (up_mid) url += `&up_mid=${up_mid}`

      const apiRes = await axios.get(url, { headers, timeout: 10000 })
      const data = apiRes.data?.data

      if (apiRes.data?.code !== 0 || !data?.model_result) {
        return res.json({ success: true, summary: '', available: false })
      }

      const result = data.model_result
      let summaryText = result.summary || ''

      if (result.outline && result.outline.length > 0) {
        const outlineText = result.outline.map(section => {
          const parts = section.part_outline?.map(p => `  • ${p.content}`).join('\n') || ''
          return `【${section.title}】\n${parts}`
        }).join('\n')
        if (outlineText) summaryText += '\n\n' + outlineText
      }

      console.log(`[AISummary] ${bvid}: ${summaryText ? '成功' : '无内容'}`)
      res.json({ success: true, summary: summaryText, available: !!summaryText })
    } catch (error) {
      console.error('[AISummary] 获取失败:', error.message)
      res.json({ success: true, summary: '', available: false })
    }
  })

  // 视频字幕
  router.get('/video/subtitle', async (req, res) => {
    try {
      const { bvid, cid } = req.query
      if (!bvid || !cid) return res.status(400).json({ success: false, error: '缺少 bvid 或 cid' })

      const headers = { ...BILIBILI_HEADERS }
      const sessionId = req.cookies?.bili_session
      if (sessionId && loginSessions.has(sessionId)) {
        const cookies = loginSessions.get(sessionId).cookies
        headers['Cookie'] = `SESSDATA=${cookies.SESSDATA}; bili_jct=${cookies.bili_jct}; DedeUserID=${cookies.DedeUserID}`
      }

      const playerRes = await axios.get(`https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`, { headers, timeout: 10000 })
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

  // 弹幕下载
  router.get('/bilibili/danmaku/:cid', async (req, res) => {
    try {
      const { cid } = req.params
      const response = await axios.get(`https://comment.bilibili.com/${cid}.xml`, {
        responseType: 'arraybuffer', headers: BILIBILI_HEADERS, decompress: true,
      })
      res.setHeader('Content-Type', 'application/xml; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="danmaku_${cid}.xml"`)
      res.send(response.data)
    } catch (error) {
      console.error('[Danmaku] 获取失败:', error.message)
      res.status(500).json({ success: false, error: '弹幕获取失败' })
    }
  })

  return router
}
