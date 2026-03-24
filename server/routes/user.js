/**
 * 用户数据路由
 * 投稿 / 收藏夹 / 观看历史 / 点赞 / 行为画像分析
 */
const express = require('express')
const axios = require('axios')
const { getAuthHeaders, estimateQuality, getSessionCookies } = require('../helpers/bilibili')
const { encWbi } = require('../wbiSign')

module.exports = function createUserRoutes({ loginSessions }) {
  const router = express.Router()

  // 获取用户投稿视频
  router.get('/bilibili/submissions', async (req, res) => {
    try {
      const sessionId = req.cookies?.bili_session
      if (!sessionId || !loginSessions.has(sessionId)) {
        return res.status(401).json({ success: false, error: '未登录' })
      }
      const { cookies } = loginSessions.get(sessionId)
      const headers = getAuthHeaders(cookies)
      const page = parseInt(req.query.page) || 1
      const pageSize = parseInt(req.query.pageSize) || 20

      const params = { mid: cookies.DedeUserID, ps: pageSize, pn: page, order: 'pubdate' }
      const signedParams = await encWbi(params, headers)
      const qs = Object.entries(signedParams).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')

      const apiRes = await axios.get(`https://api.bilibili.com/x/space/wbi/arc/search?${qs}`, { headers })
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
            bvid: v.bvid, title: v.title,
            cover: v.pic?.startsWith('//') ? `https:${v.pic}` : v.pic,
            plays: v.play, duration: v.length, created: v.created,
            comment: v.comment, danmakus: v.video_review, favorites: v.favorites,
            description: v.description,
            maxQuality: estimateQuality(v.dimension?.width),
          })),
        },
      })
    } catch (error) {
      console.error('[Submissions] 获取失败:', error.message)
      res.status(500).json({ success: false, error: '获取投稿失败' })
    }
  })

  // 获取用户收藏夹列表
  router.get('/bilibili/favorites', async (req, res) => {
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
        data: folders.map(f => ({ id: f.id, title: f.title, mediaCount: f.media_count })),
      })
    } catch (error) {
      console.error('[Favorites] 获取失败:', error.message)
      res.status(500).json({ success: false, error: '获取收藏夹失败' })
    }
  })

  // 获取收藏夹内视频
  router.get('/bilibili/favorites/:id', async (req, res) => {
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
          list: medias.map(m => {
            const dur = m.duration || 0
            const mm = Math.floor(dur / 60)
            const ss = dur % 60
            const durText = `${mm}:${String(ss).padStart(2, '0')}`
            return {
              bvid: m.bvid, title: m.title,
              cover: m.cover?.startsWith('//') ? `https:${m.cover}` : m.cover,
              plays: m.cnt_info?.play || 0, duration: durText,
              upper: m.upper?.name || '',
              favorites: m.cnt_info?.collect || 0,
              danmakus: m.cnt_info?.danmaku || 0,
              pubdate: m.pubtime || 0,
            }
          }),
        },
      })
    } catch (error) {
      console.error('[FavDetail] 获取失败:', error.message)
      res.status(500).json({ success: false, error: '获取收藏夹内容失败' })
    }
  })

  // 获取观看历史
  router.get('/bilibili/history', async (req, res) => {
    try {
      const sessionId = req.cookies?.bili_session
      if (!sessionId || !loginSessions.has(sessionId)) {
        return res.status(401).json({ success: false, error: '未登录' })
      }
      const { cookies } = loginSessions.get(sessionId)
      const headers = getAuthHeaders(cookies)
      const ps = parseInt(req.query.ps) || 20
      const max = parseInt(req.query.max) || 0
      const viewAt = parseInt(req.query.view_at) || 0

      let url = `https://api.bilibili.com/x/web-interface/history/cursor?ps=${ps}&type=archive`
      if (max) url += `&max=${max}&view_at=${viewAt}`

      const apiRes = await axios.get(url, { headers, timeout: 10000 })
      if (apiRes.data?.code !== 0) {
        return res.status(500).json({ success: false, error: apiRes.data?.message || '接口异常' })
      }

      const list = apiRes.data?.data?.list || []
      const cursor = apiRes.data?.data?.cursor || {}

      res.json({
        success: true,
        data: {
          cursor: { max: cursor.max, viewAt: cursor.view_at },
          hasMore: list.length >= ps,
          list: list.map(item => {
            const dur = item.duration || 0
            const mm = Math.floor(dur / 60)
            const ss = dur % 60
            const durText = `${mm}:${String(ss).padStart(2, '0')}`
            return {
              bvid: item.history?.bvid || '', title: item.title || '',
              cover: item.cover?.startsWith('//') ? `https:${item.cover}` : (item.cover || ''),
              plays: item.view_at || 0, duration: durText,
              progress: item.progress || 0, totalDuration: dur,
              upper: item.author_name || '', viewAt: item.view_at || 0,
              tag: item.tag_name || '',
            }
          }),
        },
      })
    } catch (error) {
      console.error('[History] 获取失败:', error.message)
      res.status(500).json({ success: false, error: '获取观看历史失败' })
    }
  })



  // 用户行为分析（供 AI 画像用）
  router.get('/user/profile-analysis', async (req, res) => {
    try {
      const sessionId = req.cookies?.bili_session
      if (!sessionId || !loginSessions.has(sessionId)) {
        return res.json({ success: false, error: '未登录' })
      }
      const cookies = loginSessions.get(sessionId).cookies
      const headers = getAuthHeaders(cookies)
      const results = { history: [], favorites: [], categories: {} }

      try {
        const historyRes = await axios.get('https://api.bilibili.com/x/web-interface/history/cursor?ps=30', { headers, timeout: 10000 })
        const list = historyRes.data?.data?.list || []
        results.history = list.map(item => ({ title: item.title, tname: item.tag_name || item.tname || '未知', author: item.author_name || '' }))
      } catch (e) { console.error('[ProfileAnalysis] 历史记录获取失败:', e.message) }

      try {
        const mid = cookies.DedeUserID
        const favRes = await axios.get(`https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${mid}`, { headers, timeout: 10000 })
        const folders = favRes.data?.data?.list || []
        for (const folder of folders.slice(0, 3)) {
          try {
            const contentRes = await axios.get(`https://api.bilibili.com/x/v3/fav/resource/list?media_id=${folder.id}&ps=10&pn=1`, { headers, timeout: 8000 })
            const medias = contentRes.data?.data?.medias || []
            for (const m of medias) {
              results.favorites.push({ title: m.title, tname: '', author: m.upper?.name || '', folderName: folder.title })
            }
          } catch { /* skip */ }
        }
      } catch (e) { console.error('[ProfileAnalysis] 收藏夹获取失败:', e.message) }

      const allItems = [...results.history]
      for (const item of allItems) {
        const cat = item.tname || '未知'
        results.categories[cat] = (results.categories[cat] || 0) + 1
      }

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

  return router
}
