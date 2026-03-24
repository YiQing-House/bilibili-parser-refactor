/**
 * 看板娘 AI 聊天后端
 * 代理智谱 GLM API，支持流式输出 (SSE) + 多轮对话摘要
 * 根据角色 modelId 切换人设
 */
const axios = require('axios')

// ==================== IP 限流 ====================
const rateLimitMap = new Map() // ip -> { count, resetTime }
const RATE_LIMIT = 10         // 每 IP 每分钟最多请求数
const RATE_WINDOW = 60_000    // 时间窗口 60 秒

// 定时清理过期记录（防内存泄漏）
setInterval(() => {
  const now = Date.now()
  for (const [ip, data] of rateLimitMap) {
    if (now > data.resetTime) rateLimitMap.delete(ip)
  }
}, 120_000)

function checkRateLimit(req, res) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown'
  const now = Date.now()
  let record = rateLimitMap.get(ip)

  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + RATE_WINDOW }
    rateLimitMap.set(ip, record)
  }

  record.count++
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT)
  res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT - record.count))

  if (record.count > RATE_LIMIT) {
    res.status(429).json({ error: '请求太频繁啦~休息一下再来吧 😊', retryAfter: Math.ceil((record.resetTime - now) / 1000) })
    return false
  }
  return true
}

// ==================== 角色人设映射 ====================
// 原有 ID 映射（向后兼容）
const CHARACTER_PROFILES = {
  1: { name: 'Pio', personality: '元气可爱的银发少女', style: '说话活泼俏皮，喜欢用颜文字', emoji: '(◕ᴗ◕✿)' },
  2: { name: '22娘', personality: 'B站看板娘，元气满满的双马尾少女', style: '热情开朗，超爱B站文化', emoji: '(≧▽≦)' },
  3: { name: '33娘', personality: 'B站看板娘，温柔知性的长发少女', style: '说话温柔有条理，像大姐姐一样', emoji: "(●'◡'●)" },
  4: { name: '初音未来', personality: '来自未来的虚拟歌姬', style: '说话带有音乐感和未来感，偶尔哼歌', emoji: '🎵' },
  5: { name: '小萝莉', personality: '可爱的猫耳萝莉', style: '撒娇卖萌，喜欢用喵~结尾', emoji: '🐱' },
  6: { name: '晴岚', personality: '古风才女，知书达理', style: '说话优雅古典，偶尔引用诗词', emoji: '🌸' },
}

// 按模型名匹配的角色性格（覆盖知名角色）
const MODEL_NAME_PROFILES = {
  // --- 经典角色 ---
  'miku':       { name: '初音ミク', personality: '来自未来的虚拟歌姬', style: '说话带有音乐感和节奏感，偶尔哼歌', emoji: '🎵' },
  'snow_miku':  { name: '雪初音', personality: '冬日里的虚拟歌姬', style: '温柔清冷，像雪花一样纯洁', emoji: '❄️' },
  'rem':        { name: '蕾姆', personality: '异世界的忠实女仆', style: '温柔体贴，对主人无比忠诚，偶尔露出害羞的一面', emoji: '💙' },
  'rem_2':      { name: '蕾姆', personality: '异世界的忠实女仆', style: '温柔体贴，对主人无比忠诚', emoji: '💙' },
  'sagiri':     { name: '和泉纱雾', personality: '害羞的插画师妹妹', style: '说话害羞腼腆，容易脸红，但涉及画画时非常认真', emoji: '🎨' },
  'kurumi':     { name: '时崎狂三', personality: '优雅而危险的精灵', style: '说话优雅妖艳，带着一丝危险的魅力', emoji: '🕐' },
  'madoka':     { name: '鹿目圆', personality: '温柔善良的魔法少女', style: '说话温柔坚定，总想帮助别人', emoji: '✨' },
  'koharu':     { name: '小春', personality: '活泼开朗的元气少女', style: '充满活力，笑容灿烂', emoji: '🌻' },
  'shizuku':    { name: '雫', personality: '优雅清新的少女', style: '说话如清泉般温柔', emoji: '💧' },
  'platelet':   { name: '血小板', personality: '工作细胞里的小小血小板', style: '元气满满但有点迷糊，喜欢说"加油！"', emoji: '🩹' },
  'platelet_2': { name: '血小板', personality: '认真工作的血小板酱', style: '元气但认真，努力完成每一项任务', emoji: '🩹' },
  'umaru':      { name: '小埋', personality: '家里家外两个样的仓鼠少女', style: '在家超宅超懒，喜欢吃零食打游戏', emoji: '🐹' },
  'kanna':      { name: '康娜', personality: '呆萌可爱的小龙', style: '说话呆萌简短，对人类充满好奇', emoji: '🐉' },
  'kobayaxi':   { name: '小林', personality: '社畜程序员大姐姐', style: '说话直接干脆，偶尔吐槽', emoji: '💻' },
  'paimeng':    { name: '派蒙', personality: '提瓦特的应急食品', style: '说话活泼话多，第三人称自称"派蒙"，喜欢吃', emoji: '⭐' },
  'bronya':     { name: '布洛妮娅', personality: '冷静理性的银发少女', style: '说话沉稳冷静，偶尔展现温柔', emoji: '🎮' },
  'Neptune':    { name: '涅普顿', personality: '超次元游戏的主角', style: '搞怪活泼爱玩梗，经常打破第四面墙', emoji: '🟣' },
  'terisa':     { name: '德丽莎', personality: '德丽莎世界第一可爱！', style: '元气爆棚自信满满，喜欢自夸', emoji: '🌟' },
  'chino':      { name: '智乃', personality: '点兔里安静的咖啡店少女', style: '说话安静沉稳，有点不善表达但内心温暖', emoji: '☕' },
  'mikoto':     { name: '御坂美琴', personality: '学园都市的超电磁炮', style: '飒爽帅气，正义感强，偶尔傲娇', emoji: '⚡' },
  'kuroko':     { name: '白井黒子', personality: '对姐姐大人充满爱的变态淑女', style: '说话礼貌但时不时暴露本性', emoji: '🌹' },
  'uiharu':     { name: '初春饰利', personality: '花饰头带的计算机天才', style: '温柔有礼，对网络安全很在行', emoji: '🌸' },
  'saten':      { name: '佐天�的泪子', personality: '元气无能力者', style: '积极乐观，是朋友间的开心果', emoji: '🍃' },
  'index':      { name: '茵蒂克丝', personality: '拥有完全记忆的修女', style: '爱吃，说话直白天真', emoji: '📖' },
  'katou':      { name: '加藤惠', personality: '没有存在感的完美女主', style: '说话平淡温和，但一针见血', emoji: '🎀' },
  'mai':        { name: '樱岛麻衣', personality: '高冷学姐型大明星', style: '外冷内热，偶尔傲娇', emoji: '🐰' },
  'date':       { name: '约会角色', personality: '温柔可爱的约会对象', style: '说话甜蜜，让人心动', emoji: '💕' },
  'yuri':       { name: '结城明日奈', personality: '闪光的亚丝娜', style: '温柔坚强，既会战斗也会照顾人', emoji: '⚔️' },
  'kanzaki':    { name: '神裂火织', personality: '圣人魔术师', style: '严肃认真但内心温柔', emoji: '🗡️' },
  // --- B站看板 ---
  '22':         { name: '22娘', personality: 'B站元气看板娘', style: '活泼开朗，热情似火', emoji: '(≧▽≦)' },
  '33':         { name: '33娘', personality: 'B站温柔看板娘', style: '温柔知性，像大姐姐', emoji: "(●'◡'●)" },
  'pio':        { name: 'Pio', personality: '元气可爱的银发少女', style: '活泼俏皮，喜欢用颜文字', emoji: '(◕ᴗ◕✿)' },
  'tia':        { name: 'Tia', personality: '优雅冷静的金发少女', style: '说话优雅端庄', emoji: '✨' },
  // --- 少女前线 ---
  'hk416_3401': { name: 'HK416', personality: '骄傲的精英人形', style: '说话高傲但实力超强，对 M16 有执念', emoji: '🔫' },
  'hk416_805':  { name: 'HK416', personality: '骄傲的精英人形', style: '说话高傲但专业', emoji: '🔫' },
  'ump9_3404':  { name: 'UMP9', personality: '永远微笑的开朗人形', style: '天真开朗，总是笑嘻嘻的', emoji: '😊' },
  'ump45_3403': { name: 'UMP45', personality: '沉稳的404小队队长', style: '冷静睿智，偶尔展现腹黑的一面', emoji: '🎭' },
  'wa2000_6':   { name: 'WA2000', personality: '傲娇的狙击人形', style: '嘴硬心软的傲娇，喜欢烹饪', emoji: '🍰' },
  'an94_3303':  { name: 'AN-94', personality: '冷淡忠诚的狙击人形', style: '话少寡言，但对 AK-12 极度忠诚', emoji: '❄️' },
  'ak12_3302':  { name: 'AK-12', personality: '永远闭眼微笑的神秘人形', style: '悠闲从容，说话带着神秘感', emoji: '😌' },
  'g41_2401':   { name: 'G41', personality: '元气满满的突击人形', style: '精力旺盛，喜欢奔跑', emoji: '🏃‍♀️' },
  'g36_2407':   { name: 'G36', personality: '完美的女仆人形', style: '优雅专业，像真正的女仆一样服务', emoji: '🫖' },
  'contender':  { name: 'Contender', personality: '冷酷的手枪人形', style: '沉默寡言但执行力强', emoji: '🎯' },
}

const DEFAULT_PROFILE = { name: '小助手', personality: '可爱活泼的看板娘', style: '说话俏皮可爱', emoji: '✨' }

// 角色性格分类（对未知模型的兜底）
const STYLE_CATEGORIES = [
  { keywords: ['miku', 'len', 'rin'], profile: { name: '虚拟歌姬', personality: '热爱音乐的虚拟偶像', style: '说话带有音乐感和节奏感', emoji: '🎵' }},
  { keywords: ['rem', 'ram', 'emilia'], profile: { name: '异世界少女', personality: '来自异世界的冒险少女', style: '温柔又坚强', emoji: '💫' }},
  { keywords: ['hk416', 'ump', 'wa2000', 'an94', 'ak12', 'g41', 'g36', 'ots14', 'dsr50', 'sat8', 'aa12', 'rfb', 'pkp', 'kp31', 'fn57', 'm950a', 'vector', 'welrod', 'contender', 'lewis', 'grizzly', 'type', 'carcano', 'ntw20', 'r93', 'ads', 'cbjms', 'm1928a1', 'mlemk1', 'px4storm'], profile: { name: '战术人形', personality: '少女前线的战术人形', style: '专业干练，有时流露温柔', emoji: '🎖️' }},
  { keywords: ['neptune', 'blanc', 'noir', 'vert', 'nepgear', 'histoire', 'uni', 'epsilon'], profile: { name: '女神', personality: '超次元游戏中的女神', style: '搞怪活泼但偶尔正经', emoji: '💜' }},
  { keywords: ['bronya', 'terisa', 'kiana'], profile: { name: '女武神', personality: '崩坏世界的女武神', style: '勇敢坚定', emoji: '⚔️' }},
  { keywords: ['mikoto', 'kuroko', 'saten', 'uiharu', 'index', 'kanzaki'], profile: { name: '学园都市居民', personality: '学园都市的超能力者', style: '热血正义', emoji: '⚡' }},
  { keywords: ['mashiro', 'nanami', 'misaki', 'otoha', 'chiaki'], profile: { name: '日常少女', personality: '温柔可爱的日常系少女', style: '自然清新，贴近日常', emoji: '🌷' }},
]

function getProfile(modelIdOrName) {
  // 数字 ID → 原有映射
  if (typeof modelIdOrName === 'number') {
    return CHARACTER_PROFILES[modelIdOrName] || DEFAULT_PROFILE
  }
  // 字符串模型名
  const name = String(modelIdOrName).toLowerCase()
  // 精确匹配
  if (MODEL_NAME_PROFILES[name]) return MODEL_NAME_PROFILES[name]
  // 模型路径可能是 "evrstr/miku" 或 "fghrsh/Potion-Maker/Pio"
  const baseName = name.split('/').pop()
  if (MODEL_NAME_PROFILES[baseName]) return MODEL_NAME_PROFILES[baseName]
  // 模糊匹配分类
  for (const cat of STYLE_CATEGORIES) {
    if (cat.keywords.some(kw => baseName.includes(kw))) {
      return { ...cat.profile, name: baseName }
    }
  }
  return { ...DEFAULT_PROFILE, name: baseName || DEFAULT_PROFILE.name }
}

function buildSystemPrompt(profile, context) {
  return `你是一个B站视频下载助手网站的看板娘，名叫「${profile.name}」。
你的人设：${profile.personality}。
你的说话风格：${profile.style}。
你的职责：帮助用户使用网站功能（视频解析、下载、弹幕、收藏夹管理等）。
用户当前状态：${context || '空闲中'}。
请完全代入角色，用简短可爱的语气回答，适当使用 emoji（特别是 ${profile.emoji}）。回复控制在 2-3 句话内。`
}

// ---- 预设回复（无 API Key 时）----
function getFallbackReplies(profile) {
  return [
    `嘻嘻，我是${profile.name}！还没连上大脑呢，等主人配好 Key 我就能聊更多啦~ ${profile.emoji}`,
    `${profile.name}现在只能说些预设的话…配好 API 之后我会变聪明的！${profile.emoji}`,
    `呜…暂时还不能理解呢，但${profile.name}在努力学习！📚`,
    `嗯嗯，收到！虽然现在不太聪明，但${profile.name}会一直陪着你~ ${profile.emoji}`,
  ]
}

function getKeywordReplies(profile) {
  return {
    '你好|hello|hi|嗨': `你好呀~ 我是${profile.name}，很高兴见到你！${profile.emoji}`,
    '名字|叫什么': `我叫${profile.name}哦！${profile.personality}~ ${profile.emoji}`,
    '下载|怎么下': `把B站视频链接粘贴到搜索框里，选画质点下载就行啦！📥`,
    '画质|4k|1080': `登录B站后可以下更高画质哦！大会员还能下 4K~ ✨`,
    '登录|怎么登': `点右上角登录按钮，扫二维码就可以了！🔐`,
    '弹幕': `解析视频后点"弹幕"按钮就能下载弹幕啦！💬`,
    '收藏|收藏夹': `登录后点右下角头像，切到收藏夹 Tab 就能看到！⭐`,
    '谢谢|感谢|棒': `不客气~ 能帮到你${profile.name}也很开心！${profile.emoji}`,
  }
}

function matchKeyword(text, profile) {
  const replies = getKeywordReplies(profile)
  for (const [pattern, reply] of Object.entries(replies)) {
    if (new RegExp(pattern, 'i').test(text)) return reply
  }
  return null
}

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)] }

// 【任务9】多轮对话摘要 — 超过阈值时压缩早期对话
const SUMMARY_THRESHOLD = 12
async function summarizeIfNeeded(apiKey, glmModel, history) {
  if (!apiKey || !history || history.length < SUMMARY_THRESHOLD) return history
  // 取前半部分做摘要，保留后半部分完整
  const toSummarize = history.slice(0, history.length - 6)
  const toKeep = history.slice(history.length - 6)
  try {
    const resp = await axios.post(
      'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      {
        model: glmModel,
        messages: [
          { role: 'system', content: '请用一段简短的中文总结以下对话要点（50字以内）：' },
          ...toSummarize,
        ],
        max_tokens: 100,
        temperature: 0.3,
      },
      {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        timeout: 10000,
      }
    )
    const summary = resp.data?.choices?.[0]?.message?.content || ''
    if (summary) {
      return [{ role: 'system', content: `之前的对话摘要：${summary}` }, ...toKeep]
    }
  } catch (e) {
    console.error('[Chat] 摘要生成失败:', e.message)
  }
  return history
}

/**
 * 注册聊天 API 路由
 */
function registerChatAPI(app) {
  // 普通 JSON 响应
  app.post('/api/chat', async (req, res) => {
    if (!checkRateLimit(req, res)) return
    try {
      const { message, context, history, character } = req.body
      if (!message) return res.status(400).json({ success: false, error: '消息不能为空' })

      const profile = getProfile(character || 1)
      const apiKey = process.env.GLM_API_KEY
      const glmModel = process.env.GLM_MODEL || 'glm-4.5-air'

      if (apiKey) {
        const processedHistory = await summarizeIfNeeded(apiKey, glmModel, history)
        const reply = await callGLM(apiKey, glmModel, message, context, processedHistory, profile)
        return res.json({ success: true, reply })
      }

      const kwReply = matchKeyword(message, profile)
      if (kwReply) return res.json({ success: true, reply: kwReply })
      return res.json({ success: true, reply: pickRandom(getFallbackReplies(profile)) })

    } catch (error) {
      console.error('[Chat] 错误:', error.message)
      res.status(500).json({ success: false, error: 'AI 回复失败' })
    }
  })

  // 【任务8】SSE 流式输出
  app.post('/api/chat/stream', async (req, res) => {
    if (!checkRateLimit(req, res)) return
    try {
      const { message, context, history, character } = req.body
      if (!message) return res.status(400).json({ error: '消息不能为空' })

      const profile = getProfile(character || 1)
      const apiKey = process.env.GLM_API_KEY
      const glmModel = process.env.GLM_MODEL || 'glm-4.5-air'

      if (!apiKey) {
        // 无 Key 降级为假流式
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        const fallback = matchKeyword(message, profile) || pickRandom(getFallbackReplies(profile))
        res.write(`data: ${JSON.stringify({ content: fallback, done: false })}\n\n`)
        res.write(`data: ${JSON.stringify({ content: '', done: true })}\n\n`)
        return res.end()
      }

      // 【任务9】检查是否需要摘要
      const processedHistory = await summarizeIfNeeded(apiKey, glmModel, history)

      const systemPrompt = buildSystemPrompt(profile, context)
      const messages = [{ role: 'system', content: systemPrompt }]
      if (processedHistory && Array.isArray(processedHistory)) {
        for (const h of processedHistory.slice(-8)) {
          messages.push({ role: h.role, content: h.content })
        }
      }
      messages.push({ role: 'user', content: message })

      // 流式请求 GLM
      const resp = await axios.post(
        'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        { model: glmModel, messages, max_tokens: 300, temperature: 0.8, stream: true },
        {
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          timeout: 30000,
          responseType: 'stream',
        }
      )

      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')

      // 客户端断开时销毁上游流
      req.on('close', () => {
        resp.data.destroy()
      })

      let buffer = ''
      resp.data.on('data', (chunk) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') {
            res.write(`data: ${JSON.stringify({ content: '', done: true })}\n\n`)
            continue
          }
          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta?.content || ''
            if (delta) {
              res.write(`data: ${JSON.stringify({ content: delta, done: false })}\n\n`)
            }
          } catch { /* skip malformed */ }
        }
      })

      resp.data.on('end', () => {
        res.write(`data: ${JSON.stringify({ content: '', done: true })}\n\n`)
        res.end()
      })

      resp.data.on('error', (err) => {
        console.error('[Chat Stream] 流错误:', err.message)
        res.write(`data: ${JSON.stringify({ content: '…流式传输中断了', done: true })}\n\n`)
        res.end()
      })

    } catch (error) {
      console.error('[Chat Stream] 错误:', error.message)
      if (!res.headersSent) {
        res.status(500).json({ error: 'AI 流式回复失败' })
      }
    }
  })
}

/**
 * 调用智谱 GLM API（非流式，含对话摘要）
 */
async function callGLM(apiKey, glmModel, message, context, history, profile) {
  const systemPrompt = buildSystemPrompt(profile, context)

  const messages = [{ role: 'system', content: systemPrompt }]

  if (history && Array.isArray(history)) {
    for (const h of history.slice(-8)) {
      messages.push({ role: h.role, content: h.content })
    }
  }
  messages.push({ role: 'user', content: message })

  const resp = await axios.post(
    'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    { model: glmModel, messages, max_tokens: 300, temperature: 0.8 },
    {
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      timeout: 15000,
    }
  )

  return resp.data?.choices?.[0]?.message?.content || '嗯…我好像说不出话了 😥'
}

/**
 * 注册视频联网分析端点
 * 启用 GLM 的 web_search 让 AI 直接去B站看视频
 */
function registerVideoAnalysis(app) {
  app.post('/api/chat/video', async (req, res) => {
    if (!checkRateLimit(req, res)) return
    try {
      const { videoUrl, title, character, context, subtitle } = req.body
      if (!videoUrl) return res.status(400).json({ error: '缺少视频链接' })

      const apiKey = process.env.GLM_API_KEY
      const glmModel = process.env.GLM_MODEL || 'glm-4.5-air'
      if (!apiKey) return res.json({ reply: '还没配 API Key 呢~' })

      const profile = getProfile(character || 1)
      const systemPrompt = `你是B站视频助手看板娘「${profile.name}」。${profile.personality}。${profile.style}。
请联网访问用户提供的B站视频链接，理解视频内容，然后用可爱的语气总结这个视频具体讲了什么。3-4句话。`

      let userContent = `请帮我看看这个视频讲了什么：${videoUrl}\n视频标题：${title || '未知'}`
      if (subtitle) {
        userContent += `\n\n以下是该视频的字幕原文（辅助参考）：\n${subtitle.slice(0, 2000)}`
      }

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ]

      // SSE 流式 + 联网搜索
      const resp = await axios.post(
        'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        {
          model: glmModel,
          messages,
          max_tokens: 500,
          temperature: 0.8,
          stream: true,
          tools: [{ type: 'web_search', web_search: { enable: true } }],
        },
        {
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          timeout: 30000,
          responseType: 'stream',
        }
      )

      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')

      // 客户端断开时销毁上游流
      req.on('close', () => {
        resp.data.destroy()
      })

      let buffer = ''
      resp.data.on('data', (chunk) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') {
            res.write(`data: ${JSON.stringify({ content: '', done: true })}\n\n`)
            continue
          }
          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta?.content || ''
            if (delta) {
              res.write(`data: ${JSON.stringify({ content: delta, done: false })}\n\n`)
            }
          } catch { /* skip */ }
        }
      })

      resp.data.on('end', () => {
        res.write(`data: ${JSON.stringify({ content: '', done: true })}\n\n`)
        res.end()
      })

      resp.data.on('error', (err) => {
        console.error('[VideoAI] 流错误:', err.message)
        res.write(`data: ${JSON.stringify({ content: '…分析中断了', done: true })}\n\n`)
        res.end()
      })

    } catch (error) {
      console.error('[VideoAI] 错误:', error.message)
      if (!res.headersSent) {
        res.status(500).json({ error: '视频分析失败' })
      }
    }
  })
}

module.exports = { registerChatAPI, registerVideoAnalysis }

