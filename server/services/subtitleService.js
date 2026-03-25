/**
 * 字幕下载服务
 * JSON → SRT 格式转换 + 多语言支持
 */
const axios = require('axios')
const { BILIBILI_HEADERS, getAuthHeaders } = require('../helpers/bilibili')

/**
 * 获取视频字幕列表
 */
async function getSubtitleList(bvid, cid, cookies) {
  const headers = cookies ? getAuthHeaders(cookies) : { ...BILIBILI_HEADERS }

  const res = await axios.get(`https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`, {
    headers, timeout: 10000,
  })

  const subtitles = res.data?.data?.subtitle?.subtitles || []
  return subtitles.map(s => ({
    lan: s.lan,
    lanDoc: s.lan_doc,
    url: s.subtitle_url?.startsWith('//') ? `https:${s.subtitle_url}` : s.subtitle_url,
    isAi: s.lan?.startsWith('ai-'),
  }))
}

/**
 * 下载字幕内容并转为 SRT
 */
async function downloadAsSrt(subtitleUrl) {
  const res = await axios.get(subtitleUrl, {
    headers: BILIBILI_HEADERS, timeout: 10000,
  })

  const body = res.data?.body || res.data
  if (!Array.isArray(body)) throw new Error('字幕数据格式异常')

  return jsonToSrt(body)
}

/**
 * B站字幕 JSON → SRT 格式
 */
function jsonToSrt(items) {
  return items.map((item, i) => {
    const from = formatSrtTime(item.from)
    const to = formatSrtTime(item.to)
    return `${i + 1}\n${from} --> ${to}\n${item.content}\n`
  }).join('\n')
}

/**
 * 秒 → SRT 时间格式 (HH:MM:SS,mmm)
 */
function formatSrtTime(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad3(ms)}`
}

function pad(n) { return String(n).padStart(2, '0') }
function pad3(n) { return String(n).padStart(3, '0') }

module.exports = { getSubtitleList, downloadAsSrt }
