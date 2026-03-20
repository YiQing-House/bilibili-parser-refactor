/**
 * useMascot — 智能看板娘状态管理 (Phase 1 + 3)
 * 监听 Pinia stores 变化 → 自动触发气泡台词
 * 闲置超时 → 主动互动
 */
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useVideoStore } from '@/stores/video'
import { useDownloadStore } from '@/stores/download'
import { useAuthStore } from '@/stores/auth'

// 气泡消息队列
export interface BubbleMsg {
  text: string
  duration?: number
  type?: 'info' | 'success' | 'error' | 'chat'
}

// 全局状态
const bubbleQueue = ref<BubbleMsg[]>([])
const currentBubble = ref<BubbleMsg | null>(null)
const chatOpen = ref(false)
export const userContext = ref('空闲中')

// 冷却防刷
let lastBubbleTime = 0
const COOLDOWN = 3000

// 闲置计时
let idleTimer: ReturnType<typeof setTimeout> | null = null
const IDLE_TIMEOUT = 60_000 // 60 秒

// ---- 预设台词 ----
const WELCOME_LINES = [
  '欢迎回来~今天想下载什么视频呀？(◕ᴗ◕✿)',
  '嗨嗨~有什么我能帮你的吗？✨',
  '又来啦~让我看看有什么好视频！🎬',
]

const IDLE_LINES = [
  '主人好久没动了，要不要找个有趣的视频看看？🤔',
  '无聊的话可以点我聊天哦~ (●\'◡\'●)',
  '好安静啊…要不去B站逛逛？',
  '摸鱼时间到！🐟',
  '我在这里等你呢，随时可以找我聊天~',
]

const PARSE_SUCCESS = [
  '解析成功啦！快看看视频信息~📹',
  '搞定！点下载就可以保存了哦✨',
  '诶嘿嘿，解析好啦(≧▽≦)',
]

const PARSE_FAIL = [
  '啊…解析失败了，要不换个链接试试？😢',
  '出错了呢…检查一下链接是不是对的？',
]

const DOWNLOAD_START = [
  '开始下载啦，稍等一下哦~⏳',
  '下载中…我帮你盯着进度！📥',
]

const DOWNLOAD_DONE = [
  '下载完成啦！快去看看吧~ 🎉',
  '搞定！视频已经下好了(ﾉ◕ヮ◕)ﾉ*:・ﾟ✧',
]

const LOGIN_SUCCESS = [
  '登录成功！现在可以下载高清视频了~🎊',
  '欢迎大会员！享受 4K 极致体验吧✨',
]

const LOGOUT = [
  '下次再见哦~ (｡•́ωก̀｡)',
]

function pick(arr: string[]) { return arr[Math.floor(Math.random() * arr.length)] }

// ---- 核心方法 ----
export function showBubble(msg: BubbleMsg) {
  const now = Date.now()
  if (now - lastBubbleTime < COOLDOWN && msg.type !== 'chat') return
  lastBubbleTime = now
  currentBubble.value = msg

  const duration = msg.duration || 5000

  // 优先用原库 showMessage
  const win = window as any
  if (typeof win.showMessage === 'function') {
    win.showMessage(msg.text, duration, 10)
  } else {
    // 回退：直接操作 #waifu-tips DOM
    const tips = document.getElementById('waifu-tips')
    if (tips) {
      tips.textContent = msg.text
      tips.style.opacity = '1'
      tips.style.transition = 'opacity 0.3s'
      setTimeout(() => {
        // 移除内联样式，让原库 CSS 重新接管
        tips.style.removeProperty('opacity')
        tips.style.removeProperty('transition')
      }, duration)
    }
  }

  setTimeout(() => {
    if (currentBubble.value === msg) currentBubble.value = null
  }, duration)
}

export function toggleChat() {
  chatOpen.value = !chatOpen.value
}

export function setContext(ctx: string) {
  userContext.value = ctx
}

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    showBubble({ text: pick(IDLE_LINES), type: 'info', duration: 8000 })
    resetIdleTimer() // 循环
  }, IDLE_TIMEOUT)
}

// ---- Composable ----
export function useMascot() {
  onMounted(() => {
    const videoStore = useVideoStore()
    const downloadStore = useDownloadStore()
    const authStore = useAuthStore()

    // 欢迎语（延迟 2 秒）
    setTimeout(() => showBubble({ text: pick(WELCOME_LINES), type: 'info', duration: 6000 }), 2000)

    // 监听解析结果（属性名是 currentResult，不是 currentVideo）
    watch(() => videoStore.currentResult, (v, old) => {
      if (v && v !== old) {
        setContext(`正在查看视频：${v.title}`)
        showBubble({ text: pick(PARSE_SUCCESS), type: 'success' })
      }
    })

    // 监听解析错误
    watch(() => videoStore.error, (err) => {
      if (err) {
        setContext('解析失败')
        showBubble({ text: pick(PARSE_FAIL), type: 'error' })
      }
    })

    // 监听下载任务创建（tasks 是 Map，用 .size）
    watch(() => downloadStore.tasks.size, (newSize, oldSize) => {
      if (newSize > oldSize) {
        setContext('正在下载视频')
        showBubble({ text: pick(DOWNLOAD_START), type: 'info' })
      }
    })

    // 监听下载完成（用 getter taskList）
    watch(() => downloadStore.completedCount, (n: number, old: number) => {
      if (n > old) {
        showBubble({ text: pick(DOWNLOAD_DONE), type: 'success' })
      }
    })

    // 监听登录
    watch(() => authStore.isLoggedIn, (loggedIn, was) => {
      if (loggedIn && !was) {
        setContext('用户已登录')
        showBubble({ text: pick(LOGIN_SUCCESS), type: 'success', duration: 6000 })
      }
      if (!loggedIn && was) {
        showBubble({ text: pick(LOGOUT), type: 'info' })
      }
    })

    // 闲置检测
    resetIdleTimer()
    const events = ['mousemove', 'keydown', 'click', 'scroll']
    const onActivity = () => {
      resetIdleTimer()
      if (userContext.value === '空闲中') return
    }
    events.forEach(e => document.addEventListener(e, onActivity, { passive: true }))

    onUnmounted(() => {
      events.forEach(e => document.removeEventListener(e, onActivity))
      if (idleTimer) clearTimeout(idleTimer)
    })
  })

  return {
    currentBubble,
    chatOpen,
    userContext,
    showBubble,
    toggleChat,
  }
}
