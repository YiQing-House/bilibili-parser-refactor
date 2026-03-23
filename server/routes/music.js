/**
 * 音乐播放器路由（网易云 API Enhanced）
 * 从 index.js 提取，消除代码膨胀
 */

const express = require('express')
const axios = require('axios')
const router = express.Router()

const NETEASE_API = 'https://music-api.qhouse.asia'
const NETEASE_COOKIE = process.env.NETEASE_COOKIE || ''
const musicCache = { songs: [], updatedAt: 0, dayKey: '' }

if (NETEASE_COOKIE) {
  console.log('[Music] 已配置网易云 Cookie（VIP 模式）')
} else {
  console.log('[Music] 未配置 Cookie，仅免费歌曲可用')
}

// 网易云歌单 ID 列表（每天轮换）
const MUSIC_PLAYLISTS = [
  '3778678', '3779629', '19723756', '2884035', '991319590',
  '5059633707', '745956260', '5059642708', '2809577409', '60198',
]

// 从网易云歌单获取歌曲 + URL
async function fetchPlaylistSongs(playlistId) {
  try {
    const headers = NETEASE_COOKIE ? { Cookie: NETEASE_COOKIE } : {}
    const listRes = await axios.get(`${NETEASE_API}/playlist/track/all`, {
      params: { id: playlistId, limit: 200 }, headers, timeout: 20000,
    })
    const songs = listRes.data?.songs || []
    if (!songs.length) return []

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
      } catch (e) { console.error(`[Music] URL 批次失败:`, e.message) }
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
      } catch { /* skip */ }
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
  if (NETEASE_COOKIE) {
    const recommend = await fetchRecommendSongs()
    allSongs.push(...recommend)
  }

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

// ---- 路由 ----

// 每日歌单
router.get('/meting', async (req, res) => {
  try {
    const songs = await getDailyPlaylist()
    res.json(songs)
  } catch (error) {
    console.error('[Music] 错误:', error.message)
    res.json([])
  }
})

// 音频播放代理（302 重定向到真实 URL）
router.get('/music/play/:id', async (req, res) => {
  try {
    const { id } = req.params
    if (!id) return res.status(400).json({ error: '缺少 id' })
    const headers = NETEASE_COOKIE ? { Cookie: NETEASE_COOKIE } : {}
    const urlRes = await axios.get(`${NETEASE_API}/song/url/v1`, {
      params: { id, level: 'standard' }, headers, timeout: 10000,
    })
    const songData = (urlRes.data?.data || [])[0]
    if (!songData?.url) {
      console.error(`[Music] 歌曲 ${id} 无可用 URL`)
      return res.status(404).json({ error: '歌曲暂不可用' })
    }
    res.redirect(302, songData.url)
  } catch (error) {
    console.error(`[Music] 播放代理失败:`, error.message)
    res.status(500).json({ error: error.message })
  }
})

// 歌词代理（返回纯 LRC 文本）
router.get('/lyric', async (req, res) => {
  try {
    const { id } = req.query
    if (!id) return res.status(400).send('')
    const headers = NETEASE_COOKIE ? { Cookie: NETEASE_COOKIE } : {}
    const lyricRes = await axios.get(`${NETEASE_API}/lyric`, {
      params: { id }, headers, timeout: 10000,
    })
    const lrcText = lyricRes.data?.lrc?.lyric || ''
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.send(lrcText)
  } catch {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.send('')
  }
})

module.exports = router
