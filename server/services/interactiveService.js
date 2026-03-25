/**
 * 互动视频服务
 * 解析分支树结构，返回所有可选路径
 */
const axios = require('axios')
const { BILIBILI_HEADERS, getAuthHeaders } = require('../helpers/bilibili')

/**
 * 获取互动视频分支信息
 */
async function getEdgeInfo(bvid, cid, edgeId, cookies) {
  const headers = cookies ? getAuthHeaders(cookies) : { ...BILIBILI_HEADERS }

  const params = { bvid, cid }
  if (edgeId) params.edge_id = edgeId

  const res = await axios.get('https://api.bilibili.com/x/stein/edgeinfo_v2', {
    params, headers, timeout: 10000,
  })

  if (res.data?.code !== 0) {
    throw new Error(res.data?.message || '获取互动视频信息失败')
  }

  const data = res.data.data
  const edges = data.edges
  if (!edges) return { isInteractive: false }

  return {
    isInteractive: true,
    title: edges.title || '',
    currentNode: {
      edgeId: data.edge_id || 1,
      cid: parseInt(cid),
      title: edges.title || '',
    },
    choices: (edges.questions || []).flatMap(q =>
      (q.choices || []).map(c => ({
        edgeId: c.id,
        cid: c.cid,
        text: c.option || '',
        isDefault: !!c.is_default,
      }))
    ),
    hiddenVars: (data.hidden_vars || []).map(v => ({
      name: v.id_v2 || v.name,
      value: v.value,
    })),
  }
}

/**
 * 检测视频是否为互动视频
 */
function isInteractiveVideo(videoInfo) {
  return !!(videoInfo?.interaction || videoInfo?.rights?.is_stein_gate)
}

module.exports = { getEdgeInfo, isInteractiveVideo }
