/**
 * B站 WBI 签名模块
 * 用于需要 wbi 鉴权的接口（如 /x/space/wbi/arc/search）
 */
const crypto = require('crypto')
const axios = require('axios')

// 混淆用的索引表
const mixinKeyEncTab = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
]

// 缓存 wbi keys
let cachedKeys = null
let cacheTime = 0
const CACHE_TTL = 30 * 60 * 1000 // 30 分钟缓存

/**
 * 从 img_key 和 sub_key 生成 mixin_key
 */
function getMixinKey(imgKey, subKey) {
  const orig = imgKey + subKey
  let key = ''
  for (let i = 0; i < 32; i++) {
    key += orig[mixinKeyEncTab[i]]
  }
  return key
}

/**
 * 获取 wbi keys（带缓存）
 */
async function getWbiKeys(headers) {
  const now = Date.now()
  if (cachedKeys && (now - cacheTime) < CACHE_TTL) {
    return cachedKeys
  }

  const res = await axios.get('https://api.bilibili.com/x/web-interface/nav', { headers })
  const wbiImg = res.data?.data?.wbi_img || {}

  // 从 URL 中提取 key：https://i0.hdslb.com/bfs/wbi/xxx.png -> xxx
  const imgKey = wbiImg.img_url?.split('/').pop()?.split('.')[0] || ''
  const subKey = wbiImg.sub_url?.split('/').pop()?.split('.')[0] || ''

  cachedKeys = { imgKey, subKey }
  cacheTime = now
  return cachedKeys
}

/**
 * 对查询参数进行 wbi 签名
 * @param {Object} params - 原始查询参数
 * @param {Object} headers - 请求头（含 Cookie）
 * @returns {Object} - 添加了 w_rid 和 wts 的参数
 */
async function encWbi(params, headers) {
  const { imgKey, subKey } = await getWbiKeys(headers)
  const mixinKey = getMixinKey(imgKey, subKey)

  const wts = Math.round(Date.now() / 1000)
  const allParams = { ...params, wts }

  // 按 key 排序，过滤特殊字符
  const sortedKeys = Object.keys(allParams).sort()
  const queryParts = []
  for (const key of sortedKeys) {
    const val = String(allParams[key]).replace(/[!'()*]/g, '')
    queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`)
  }
  const queryStr = queryParts.join('&')

  // MD5 签名
  const w_rid = crypto.createHash('md5').update(queryStr + mixinKey).digest('hex')

  return { ...allParams, w_rid }
}

module.exports = { encWbi }
