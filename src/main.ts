import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'

// Router
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: () => import('./views/HomeView.vue'),
    },
  ],
})

// Pinia
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

// App
const app = createApp(App)
app.use(pinia)
app.use(router)
app.mount('#app')

// 鼠标拖尾粒子
import { initCursorTrail } from './utils/cursorTrail'
initCursorTrail()

// 禁止看板娘区域右键菜单
document.addEventListener('contextmenu', (e) => {
  const waifu = document.getElementById('waifu')
  if (waifu && waifu.contains(e.target as Node)) {
    e.preventDefault()
  }
})

// ==================== 看板娘 AI 系统 ====================
// 对话历史
let chatHistory: { role: string; content: string }[] = []
try {
  const saved = localStorage.getItem('waifu-chat-history')
  if (saved) chatHistory = JSON.parse(saved)
} catch { /* ignore */ }

function saveChatHistory() {
  try {
    localStorage.setItem('waifu-chat-history', JSON.stringify(chatHistory.slice(-20)))
  } catch { /* ignore */ }
}

function truncateReply(text: string, maxLen = 150): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '…'
}

// 原生气泡（用于 AI 回复）
let tipsTimer: ReturnType<typeof setTimeout> | null = null
function showWaifuTips(text: string, duration = 6000) {
  const tips = document.getElementById('waifu-tips')
  if (!tips) return
  // 清除上一条消息的隐藏定时器
  if (tipsTimer) clearTimeout(tipsTimer)
  tips.textContent = text
  // 强制覆盖第三方库可能的隐藏行为
  tips.style.display = 'block'
  tips.style.visibility = 'visible'
  tips.style.opacity = '1'
  tips.style.transition = 'opacity 0.3s'
  tipsTimer = setTimeout(() => {
    tips.style.opacity = '0'
    tipsTimer = null
  }, duration)
}

// 角色切换打招呼
let lastModelId = parseInt(localStorage.getItem('modelId') || '1')
const CHARACTER_GREETINGS: Record<number, string> = {
  1: '大家好~我是 Pio！有什么可以帮你的吗？(◕ᴗ◕✿)',
  2: '22娘登场！准备好和我一起玩转B站了吗？(≧▽≦)',
  3: '你好呀~33娘来陪你了，有什么需要帮忙的吗？(●\'◡\'●)',
  4: '♪ 初音未来上线~今天想听什么歌呢？🎵',
  5: '喵~小萝莉来啦！要不要摸摸我？🐱',
  6: '「清风明月本无价，近水远山皆有情」——晴岚在此~ 🌸',
}
setInterval(() => {
  const currentId = parseInt(localStorage.getItem('modelId') || '1')
  if (currentId !== lastModelId) {
    lastModelId = currentId
    const greeting = CHARACTER_GREETINGS[currentId] || '嗨~我换了个新形象，喜欢吗？✨'
    showWaifuTips(greeting, 6000)
  }
}, 2000)

function getCurrentModelId(): number {
  try { return parseInt(localStorage.getItem('modelId') || '1') } catch { return 1 }
}

// ==================== 常驻聊天框 ====================
const PLACEHOLDER = '和看板娘聊天~'
let thinkingTimer: ReturnType<typeof setInterval> | null = null

// 聊天框思考状态
function startChatThinking() {
  const input = document.getElementById('waifu-chat-text') as HTMLTextAreaElement
  const btn = document.getElementById('waifu-chat-send') as HTMLButtonElement
  if (!input) return
  let dots = 0
  const frames = ['思考中', '思考中.', '思考中..', '思考中...']
  input.value = ''
  input.placeholder = frames[0]
  input.disabled = true
  input.style.cursor = 'not-allowed'
  input.style.opacity = '0.5'
  if (btn) { btn.disabled = true; btn.style.opacity = '0.3' }
  thinkingTimer = setInterval(() => {
    dots = (dots + 1) % frames.length
    if (input) input.placeholder = frames[dots]
  }, 400)
}

function stopChatThinking() {
  const input = document.getElementById('waifu-chat-text') as HTMLTextAreaElement
  const btn = document.getElementById('waifu-chat-send') as HTMLButtonElement
  if (thinkingTimer) { clearInterval(thinkingTimer); thinkingTimer = null }
  if (input) {
    input.placeholder = PLACEHOLDER
    input.disabled = false
    input.style.cursor = ''
    input.style.opacity = ''
  }
  if (btn) { btn.disabled = false; btn.style.opacity = '' }
}

/**
 * 核心 AI 调用
 */
async function callAI(context: string, userMsg: string): Promise<string> {
  startChatThinking()
  chatHistory.push({ role: 'user', content: userMsg })
  saveChatHistory()

  try {
    const resp = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userMsg,
        context,
        character: getCurrentModelId(),
        history: chatHistory.slice(-10),
      }),
    })

    if (!resp.ok || !resp.body) {
      const fallbackResp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg, context,
          character: getCurrentModelId(), history: chatHistory.slice(-10),
        }),
      })
      const data = await fallbackResp.json()
      const reply = data.reply || '…'
      chatHistory.push({ role: 'assistant', content: reply })
      saveChatHistory()
      showWaifuTips(truncateReply(reply), 10000)
      return reply
    }

    // SSE 流式
    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let fullReply = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const data = JSON.parse(line.slice(6))
          if (data.done) break
          if (data.content) {
            fullReply += data.content
            showWaifuTips(truncateReply(fullReply), 15000)
          }
        } catch { /* skip */ }
      }
    }

    if (fullReply) {
      chatHistory.push({ role: 'assistant', content: fullReply })
      saveChatHistory()
      showWaifuTips(truncateReply(fullReply), 10000)
    }
    return fullReply
  } catch {
    showWaifuTips('网络好像出问题了…😥', 5000)
    return ''
  } finally {
    stopChatThinking()
  }
}

// 暴露给 useMascot.ts
;(window as any).__waifuCallAI = callAI
;(window as any).__waifuShowTips = showWaifuTips
;(window as any).__waifuStartThinking = startChatThinking
;(window as any).__waifuStopThinking = stopChatThinking

// ==================== 创建常驻聊天框 ====================
const waitForWaifu = setInterval(() => {
  const toolbar = document.getElementById('waifu-tool')
  if (!toolbar) return
  clearInterval(waitForWaifu)

  // 常驻聊天框（默认显示）
  const chatBox = document.createElement('div')
  chatBox.id = 'waifu-chat-box'
  chatBox.style.cssText = `
    display:flex; position:fixed; bottom:8px; left:320px;
    gap:6px; padding:5px 8px; align-items:flex-end;
    background:rgba(0,0,0,0.6); backdrop-filter:blur(10px);
    border:1px solid rgba(255,255,255,0.1); border-radius:16px;
    z-index:999; width:200px;
  `
  chatBox.innerHTML = `
    <textarea id="waifu-chat-text" placeholder="${PLACEHOLDER}"
      rows="1"
      style="flex:1;border:none;outline:none;background:transparent;
      color:#eee;padding:4px 8px;font-size:12px;font-family:inherit;min-width:0;
      resize:none;max-height:80px;line-height:1.4;overflow-y:auto;
      transition:opacity 0.2s;"
    ></textarea>
    <button id="waifu-chat-send"
      style="width:26px;height:26px;border-radius:50%;border:none;
      background:#FB7299;color:#fff;font-size:11px;cursor:pointer;flex-shrink:0;
      transition:opacity 0.2s;">
      <i class="fas fa-paper-plane"></i>
    </button>
  `
  document.body.appendChild(chatBox)

  // 用户手动发消息
  async function sendChat() {
    const textInput = document.getElementById('waifu-chat-text') as HTMLTextAreaElement
    if (!textInput || textInput.disabled) return
    const msg = textInput.value.trim()
    if (!msg) return
    textInput.value = ''
    ;(textInput as any).style.height = 'auto'
    await callAI((window as any).__waifuUserContext || '空闲中', msg)
  }

  document.getElementById('waifu-chat-send')?.addEventListener('click', sendChat)
  const chatText = document.getElementById('waifu-chat-text') as HTMLTextAreaElement
  if (chatText) {
    chatText.addEventListener('input', () => {
      chatText.style.height = 'auto'
      chatText.style.height = Math.min(chatText.scrollHeight, 80) + 'px'
    })
    chatText.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() }
    })
  }
}, 1000)
