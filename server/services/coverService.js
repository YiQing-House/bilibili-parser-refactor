/**
 * 封面下载服务
 * 代理下载 B站封面（绕过跨域/防盗链），自动获取最高分辨率
 */
const axios = require('axios')
const { BILIBILI_HEADERS } = require('../helpers/bilibili')

/**
 * 获取高清封面 URL（去除 B站 URL 中的尺寸压缩参数）
 */
function getHdCoverUrl(coverUrl) {
  if (!coverUrl) return null
  let url = coverUrl
  if (url.startsWith('//')) url = `https:${url}`
  // 去除 @xxx.webp / @xxx.jpg 压缩后缀
  url = url.replace(/@[\w.]+$/, '')
  return url
}

/**
 * 代理下载封面图片
 */
async function downloadCover(coverUrl) {
  const hdUrl = getHdCoverUrl(coverUrl)
  if (!hdUrl) throw new Error('封面URL为空')

  // 验证域名安全
  const hostname = new URL(hdUrl).hostname
  if (!hostname.endsWith('hdslb.com') && !hostname.endsWith('biliimg.com')) {
    throw new Error('不允许的封面域名')
  }

  const res = await axios.get(hdUrl, {
    responseType: 'arraybuffer',
    headers: { ...BILIBILI_HEADERS, Referer: 'https://www.bilibili.com/' },
    timeout: 15000,
  })

  const contentType = res.headers['content-type'] || 'image/jpeg'
  const ext = contentType.includes('png') ? 'png'
    : contentType.includes('webp') ? 'webp'
    : 'jpg'

  return { buffer: res.data, contentType, ext }
}

module.exports = { getHdCoverUrl, downloadCover }
