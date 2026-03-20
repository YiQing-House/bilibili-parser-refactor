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

// ==================== 看板娘 AI 聊天集成 ====================
const chatHistory: { role: string; content: string }[] = []

function showWaifuTips(text: string, duration = 6000) {
  const tips = document.getElementById('waifu-tips')
  if (!tips) return
  tips.textContent = text
  tips.style.opacity = '1'
  tips.style.transition = 'opacity 0.3s'
  setTimeout(() => {
    // 关键：移除内联样式，让原库 CSS 重新接管
    tips.style.removeProperty('opacity')
    tips.style.removeProperty('transition')
  }, duration)
}

const waitForWaifu = setInterval(() => {
  const toolbar = document.getElementById('waifu-tool')
  if (!toolbar) return
  clearInterval(waitForWaifu)

  // 1. 工具栏添加聊天按钮
  if (!document.getElementById('waifu-tool-chat')) {
    const chatBtn = document.createElement('span')
    chatBtn.id = 'waifu-tool-chat'
    chatBtn.className = 'fa-solid fa-comment-dots'
    chatBtn.title = '和我聊天'
    chatBtn.style.cursor = 'pointer'
    chatBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      const box = document.getElementById('waifu-chat-box')
      if (box) {
        const visible = box.style.display !== 'none'
        box.style.display = visible ? 'none' : 'flex'
        if (!visible) {
          (document.getElementById('waifu-chat-text') as HTMLInputElement)?.focus()
        }
      }
    })
    toolbar.insertBefore(chatBtn, toolbar.firstChild)
  }

  // 2. 创建底部输入框（放在页面底部 footer 区域旁边，不在 #waifu 里面）
  const chatBox = document.createElement('div')
  chatBox.id = 'waifu-chat-box'
  chatBox.style.cssText = `
    display:none; position:fixed; bottom:8px; left:320px;
    gap:6px; padding:5px 8px; align-items:flex-end;
    background:rgba(0,0,0,0.6); backdrop-filter:blur(10px);
    border:1px solid rgba(255,255,255,0.1); border-radius:16px;
    z-index:999; width:200px;
  `
  chatBox.innerHTML = `
    <textarea id="waifu-chat-text" placeholder="和看板娘聊天~"
      rows="1"
      style="flex:1;border:none;outline:none;background:transparent;
      color:#eee;padding:4px 8px;font-size:12px;font-family:inherit;min-width:0;
      resize:none;max-height:80px;line-height:1.4;overflow-y:auto;"
    ></textarea>
    <button id="waifu-chat-send"
      style="width:26px;height:26px;border-radius:50%;border:none;
      background:#FB7299;color:#fff;font-size:11px;cursor:pointer;flex-shrink:0;">
      <i class="fas fa-paper-plane"></i>
    </button>
  `
  document.body.appendChild(chatBox)

  // 3. 发送消息
  function getCurrentModelId(): number {
    try { return parseInt(localStorage.getItem('modelId') || '1') } catch { return 1 }
  }

  async function sendChat() {
    const textInput = document.getElementById('waifu-chat-text') as HTMLInputElement
    if (!textInput) return
    const msg = textInput.value.trim()
    if (!msg) return

    textInput.value = ''
    ;(textInput as any).style.height = 'auto'
    textInput.disabled = true
    showWaifuTips('💭 ' + msg, 3000)
    chatHistory.push({ role: 'user', content: msg })

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          context: '用户正在使用B站视频助手',
          character: getCurrentModelId(),
          history: chatHistory.slice(-10),
        }),
      })
      const data = await resp.json()
      const reply = data.reply || '…'
      chatHistory.push({ role: 'assistant', content: reply })
      showWaifuTips(reply, 8000)
    } catch {
      showWaifuTips('网络好像出问题了…😥', 5000)
    } finally {
      textInput.disabled = false
      textInput.focus()
    }
  }

  document.getElementById('waifu-chat-send')?.addEventListener('click', sendChat)
  const chatText = document.getElementById('waifu-chat-text') as HTMLTextAreaElement
  if (chatText) {
    // 自动调整高度（向上长高）
    chatText.addEventListener('input', () => {
      chatText.style.height = 'auto'
      chatText.style.height = Math.min(chatText.scrollHeight, 80) + 'px'
    })
    chatText.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() }
      if (e.key === 'Escape') { chatBox.style.display = 'none' }
    })
  }
}, 1000)

