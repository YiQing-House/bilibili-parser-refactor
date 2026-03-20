/**
 * 看板娘 AI 聊天后端
 * 代理豆包大模型 API，未配置 KEY 时使用本地预设回复
 * 支持根据角色 modelId 切换人设
 */
const axios = require('axios')

// ==================== 角色人设映射 ====================
// fghrsh/live2d_api 模型 ID 对应角色
const CHARACTER_PROFILES = {
  1: { name: 'Pio', personality: '元气可爱的银发少女', style: '说话活泼俏皮，喜欢用颜文字', emoji: '(◕ᴗ◕✿)' },
  2: { name: '22娘', personality: 'B站看板娘，元气满满的双马尾少女', style: '热情开朗，超爱B站文化', emoji: '(≧▽≦)' },
  3: { name: '33娘', personality: 'B站看板娘，温柔知性的长发少女', style: '说话温柔有条理，像大姐姐一样', emoji: "(●'◡'●)" },
  4: { name: '初音未来', personality: '来自未来的虚拟歌姬', style: '说话带有音乐感和未来感，偶尔哼歌', emoji: '🎵' },
  5: { name: '小萝莉', personality: '可爱的猫耳萝莉', style: '撒娇卖萌，喜欢用喵~结尾', emoji: '🐱' },
  6: { name: '晴岚', personality: '古风才女，知书达理', style: '说话优雅古典，偶尔引用诗词', emoji: '🌸' },
}
const DEFAULT_PROFILE = { name: '小助手', personality: '可爱活泼的看板娘', style: '说话俏皮可爱', emoji: '✨' }

function getProfile(modelId) {
  return CHARACTER_PROFILES[modelId] || DEFAULT_PROFILE
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

// 关键词回复（带角色特色）
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

/**
 * 注册聊天 API 路由
 */
function registerChatAPI(app) {
  app.post('/api/chat', async (req, res) => {
    try {
      const { message, context, history, character } = req.body
      if (!message) return res.status(400).json({ success: false, error: '消息不能为空' })

      const profile = getProfile(character || 1)
      const apiKey = process.env.DOUBAO_API_KEY
      const modelId = process.env.DOUBAO_MODEL_ID || 'doubao-1-5-pro-32k-250115'

      // 有 API Key → 调用豆包
      if (apiKey) {
        const reply = await callDoubao(apiKey, modelId, message, context, history, profile)
        return res.json({ success: true, reply })
      }

      // 无 API Key → 关键词匹配 + 预设回复
      const kwReply = matchKeyword(message, profile)
      if (kwReply) return res.json({ success: true, reply: kwReply })
      return res.json({ success: true, reply: pickRandom(getFallbackReplies(profile)) })

    } catch (error) {
      console.error('[Chat] 错误:', error.message)
      res.status(500).json({ success: false, error: 'AI 回复失败' })
    }
  })
}

/**
 * 调用豆包大模型 API（含角色人设）
 */
async function callDoubao(apiKey, modelId, message, context, history, profile) {
  const systemPrompt = `你是一个B站视频下载助手网站的看板娘，名叫「${profile.name}」。
你的人设：${profile.personality}。
你的说话风格：${profile.style}。
你的职责：帮助用户使用网站功能（视频解析、下载、弹幕、收藏夹管理等）。
用户当前状态：${context || '空闲中'}。
请完全代入角色，用简短可爱的语气回答，适当使用 emoji（特别是 ${profile.emoji}）。回复控制在 2-3 句话内。`

  const messages = [
    { role: 'system', content: systemPrompt },
  ]

  // 添加历史消息
  if (history && Array.isArray(history)) {
    for (const h of history.slice(-8)) {
      messages.push({ role: h.role, content: h.content })
    }
  }
  messages.push({ role: 'user', content: message })

  const resp = await axios.post(
    'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    {
      model: modelId,
      messages,
      max_tokens: 300,
      temperature: 0.8,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      timeout: 15000,
    }
  )

  return resp.data?.choices?.[0]?.message?.content || '嗯…我好像说不出话了 😥'
}

module.exports = { registerChatAPI }
