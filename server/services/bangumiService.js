/**
 * 番剧/电影/纪录片解析服务
 * 支持 ep/ss 链接 → 获取季信息 + 剧集列表 + 播放流
 */
const axios = require('axios')
const { BILIBILI_HEADERS, getAuthHeaders } = require('../helpers/bilibili')

// 画质映射
const QN_MAP = {
  127: '8K', 126: '杜比视界', 125: 'HDR', 120: '4K',
  116: '1080P60', 112: '1080P+', 80: '1080P', 64: '720P',
  32: '480P', 16: '360P',
}

/**
 * 从 URL 中提取 ep_id 或 season_id
 */
function extractBangumiId(url) {
  const epMatch = url.match(/ep(\d+)/i)
  if (epMatch) return { type: 'ep', id: parseInt(epMatch[1]) }

  const ssMatch = url.match(/ss(\d+)/i)
  if (ssMatch) return { type: 'ss', id: parseInt(ssMatch[1]) }

  const mdMatch = url.match(/md(\d+)/i)
  if (mdMatch) return { type: 'md', id: parseInt(mdMatch[1]) }

  return null
}

/**
 * 检测 URL 是否为番剧链接
 */
function isBangumiUrl(url) {
  return /bangumi\/play|ep\d+|ss\d+|md\d+/i.test(url)
}

/**
 * 获取番剧季信息（含所有剧集）
 */
async function getSeasonInfo(bangumiId, cookies) {
  const headers = cookies ? getAuthHeaders(cookies) : { ...BILIBILI_HEADERS }

  let params = {}
  if (bangumiId.type === 'ep') params.ep_id = bangumiId.id
  else if (bangumiId.type === 'ss') params.season_id = bangumiId.id
  else if (bangumiId.type === 'md') params.media_id = bangumiId.id

  const res = await axios.get('https://api.bilibili.com/pgc/view/web/season', {
    params, headers, timeout: 10000,
  })

  if (res.data?.code !== 0) {
    throw new Error(res.data?.message || '获取番剧信息失败')
  }

  const data = res.data.result
  return {
    seasonId: data.season_id,
    mediaId: data.media_id,
    title: data.title,
    cover: data.cover,
    description: data.evaluate || data.description || '',
    type: data.type, // 1:番剧 2:电影 3:纪录片 4:国创 5:电视剧
    typeName: data.type_name || '',
    rating: data.rating?.score || null,
    ratingCount: data.rating?.count || 0,
    areas: (data.areas || []).map(a => a.name).join('/'),
    pubTime: data.publish?.pub_time || '',
    totalEpisodes: data.total || 0,
    episodes: (data.episodes || []).map(ep => ({
      epId: ep.id,
      title: ep.share_copy || ep.long_title || ep.title,
      longTitle: ep.long_title || '',
      shortTitle: ep.title || '',
      cover: ep.cover,
      duration: ep.duration ? Math.floor(ep.duration / 1000) : 0,
      cid: ep.cid,
      bvid: ep.bvid,
      aid: ep.aid,
      badgeText: ep.badge || '',
    })),
    sections: (data.section || []).map(sec => ({
      title: sec.title,
      episodes: (sec.episodes || []).map(ep => ({
        epId: ep.id,
        title: ep.share_copy || ep.long_title || ep.title,
        longTitle: ep.long_title || '',
        cover: ep.cover,
        duration: ep.duration ? Math.floor(ep.duration / 1000) : 0,
        cid: ep.cid,
        bvid: ep.bvid,
        aid: ep.aid,
        badgeText: ep.badge || '',
      })),
    })),
  }
}

/**
 * 获取番剧播放流（画质列表 + 下载 URL）
 */
async function getPlayUrl(epId, cid, qn, cookies) {
  const headers = cookies ? getAuthHeaders(cookies) : { ...BILIBILI_HEADERS }

  const res = await axios.get('https://api.bilibili.com/pgc/player/web/playurl', {
    params: { ep_id: epId, cid, qn: qn || 120, fnval: 4048, fourk: 1 },
    headers, timeout: 10000,
  })

  if (res.data?.code !== 0) {
    throw new Error(res.data?.message || '获取播放流失败')
  }

  const data = res.data.result
  const qualities = (data.accept_quality || []).map((qn, i) => ({
    qn,
    label: QN_MAP[qn] || data.accept_description?.[i] || `${qn}`,
    needVip: qn > 80,
  }))

  return {
    qualities,
    dash: data.dash || null,
    maxQuality: Math.max(...(data.accept_quality || [80])),
  }
}

module.exports = {
  extractBangumiId,
  isBangumiUrl,
  getSeasonInfo,
  getPlayUrl,
  QN_MAP,
}
