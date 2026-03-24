/**
 * Live2D 模型代理路由（带磁盘缓存）
 *
 * 首次请求从 CDN 拉取并缓存到 server/cache/live2d/
 * 后续请求直接从磁盘读取，切换模型秒开
 */

const express = require('express')
const axios = require('axios')
const fs = require('fs')
const path = require('path')
const router = express.Router()

// 缓存目录
const CACHE_DIR = path.join(__dirname, '..', 'cache', 'live2d')

// 确保缓存目录存在
function ensureCacheDir(filePath) {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

// 获取缓存文件路径
function getCachePath(source, rest) {
  // 把 CDN 路径映射为本地路径：cache/live2d/evrstr/koharu/model.json
  return path.join(CACHE_DIR, source, rest.replace(/\//g, path.sep))
}

// evrstr/live2d-widget-models 的模型列表（已剔除男角色）
const EVRSTR_MODELS = [
  'koharu','carcano1891_2201','k2_3301','sagiri','natori','murakumo','xisitina',
  'index','katou','pkp_1201','hallo','kobayaxi','histoire',
  'ots14_3001','rice','rfb_1601','haru_seifuku','ump9_3404','g36_2407','terisa',
  'kp31','m1928a1_1501','stl','ads_3601','river','aoba',
  'kurumi','madoka','tsumiki','mashiro_ryoufuku','misaki_ryoufuku','dsr50_1801',
  'nanami_ryoufuku','rem','uiharu','lewis_3502','grizzly_2102','liang','mlemk1_604',
  '95type_405','gelina','px4storm_2801','kp31_3101','epsilon_2','22','welrod_1401',
  'kp31_310','chiaki_kitty','live_uu','izumi','uni','nanami_shifuku','saten',
  'mashiro_seifuku','date','kesyoban','platelet','tia','ntw20_2301',
  'cbjms_3503','dcloud','33','mashiro_shifuku','greeter','ak12_3302','shizuku',
  'natori_pro_jp','dsr50_2101','fn57_2203','hk416_3401','rem_2','misaki_seifuku',
  'umaru','mikoto','300girl','otoha_shifuku','m950a_2303','ump45_3403',
  'sat8_3602','an94_3303','r93_3501','mai','g41_2401','Neptune','ots14_1203',
  'chitose','otoha_seifuku','paimeng','kuroko','aa12_2403','sat8_2601',
  'nanami_seifuku','bronya','type88_3504','kp31_1103','hiyori','haru','kanna',
  'carcano1938_2202','epsilon','platelet_2','contender','miku','kanzaki',
  'contender_2302','yuri','misaki_shifuku','pio','hk416_805','snow_miku',
  'type64-ar_2901','otoha_ryoufuku','g36c_1202','chino','vector_1901',
  'miara_pro_en','wa2000_6'
]

// Content-Type 映射
const CONTENT_TYPES = {
  json: 'application/json', moc: 'application/octet-stream',
  moc3: 'application/octet-stream', png: 'image/png',
  jpg: 'image/jpeg', mtn: 'application/octet-stream',
  exp: 'application/octet-stream', model3: 'application/json',
}

// 模型列表
router.get('/model_list.json', (req, res) => {
  const models = EVRSTR_MODELS.map(name => `evrstr/${name}`)
  models.unshift(
    'fghrsh/Potion-Maker/Pio', 'fghrsh/Potion-Maker/Tia',
    'fghrsh/bilibili-live/22', 'fghrsh/bilibili-live/33',
    'fghrsh/ShizukuTalk/shizuku-48', 'fghrsh/KantaiCollection/murakumo'
  )
  const messages = models.map((m, i) => {
    const name = m.split('/').pop()
    return `${name} (${i + 1}/${models.length})`
  })
  res.json({ models, messages })
})

// 对 evrstr 模型 JSON 注入 layout（统一处理）
function injectLayout(buffer) {
  try {
    const modelData = JSON.parse(buffer.toString())
    if (!modelData.layout || modelData.layout.width > 2.0) {
      modelData.layout = { center_x: 0, center_y: -0.05, width: 1.6 }
    }
    return Buffer.from(JSON.stringify(modelData))
  } catch {
    return buffer
  }
}

// 模型文件代理（磁盘缓存）
router.use('/model', async (req, res) => {
  try {
    const parts = req.path.slice(1).split('/')
    const source = parts[0]
    const rest = parts.slice(1).join('/')
    if (!source || !rest) return res.status(400).json({ error: 'Invalid path' })

    const ext = rest.split('.').pop()?.toLowerCase()
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream'

    // ---------- 1. 尝试从磁盘缓存读取 ----------
    const cachePath = getCachePath(source, rest)
    try {
      const data = await fs.promises.readFile(cachePath)
      res.setHeader('Content-Type', contentType)
      res.setHeader('Cache-Control', 'public, max-age=2592000')  // 30 天
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('X-Cache', 'HIT')
      return res.send(data)
    } catch { /* 缓存未命中，继续从 CDN 拉取 */ }

    // ---------- 2. 缓存未命中，从 CDN 拉取 ----------
    let cdnUrl = ''
    if (source === 'fghrsh') {
      cdnUrl = `https://fastly.jsdelivr.net/gh/fghrsh/live2d_api/model/${rest}`
    } else if (source === 'evrstr') {
      const mappedRest = rest.replace(/\/index\.json$/, '/model.json')
      cdnUrl = `https://cdn.jsdelivr.net/gh/evrstr/live2d-widget-models/live2d_evrstr/${mappedRest}`
    } else {
      return res.status(404).json({ error: 'Unknown model source' })
    }

    const resp = await axios.get(cdnUrl, {
      responseType: 'arraybuffer', timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })

    let data = Buffer.from(resp.data)

    // evrstr 模型 JSON 注入 layout
    if (source === 'evrstr' && ext === 'json') {
      data = injectLayout(data)
    }

    // ---------- 3. 写入磁盘缓存（异步，不阻塞响应） ----------
    ensureCacheDir(cachePath)
    fs.writeFile(cachePath, data, (err) => {
      if (err) console.error('[Live2D Cache] 写入失败:', err.message)
    })

    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=2592000')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('X-Cache', 'MISS')
    res.send(data)
  } catch (error) {
    console.error('[Live2D Proxy] 失败:', error.message)
    res.status(404).json({ error: 'Model file not found' })
  }
})

// 缓存管理：清除全部缓存
router.delete('/cache', (req, res) => {
  const { password } = req.query
  if (password !== process.env.ADMIN_PWD) {
    return res.status(403).json({ success: false, error: '权限不足' })
  }
  try {
    if (fs.existsSync(CACHE_DIR)) {
      fs.rmSync(CACHE_DIR, { recursive: true, force: true })
      console.log('[Live2D] 缓存已清除')
    }
    res.json({ success: true, message: '缓存已清除' })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

module.exports = router
