/**
 * useMascot — 看板娘智能状态管理
 * - 预设互动：根据用户操作行为触发看板娘对话
 * - 登录 → 拉行为数据 → AI 分析画像
 * - 解析视频 → 字幕+联网双通道 → AI 总结
 */
import { watch, onMounted, onUnmounted } from 'vue'
import { useVideoStore } from '@/stores/video'
import { useDownloadStore } from '@/stores/download'
import { useAuthStore } from '@/stores/auth'

function callAI(context: string, msg: string) {
  const fn = (window as any).__waifuCallAI
  if (typeof fn === 'function') return fn(context, msg)
}

function showTips(text: string, duration = 6000) {
  const fn = (window as any).__waifuShowTips
  if (typeof fn === 'function') fn(text, duration)
}

function setContext(ctx: string) {
  ;(window as any).__waifuUserContext = ctx
}

function getCurrentModelId(): number {
  try { return parseInt(localStorage.getItem('modelId') || '1') } catch { return 1 }
}

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

// ==================== 预设互动台词 ====================
const PRESET = {
  // 页面加载/首次访问
  welcome: [
    '欢迎来到视频下载站~有什么需要帮忙的吗？✨',
    '嗨~今天想下载什么好视频呀？(◕ᴗ◕✿)',
    '你来啦~快把视频链接丢给我吧！🎬',
  ],
  // 解析成功
  parseSuccess: [
    '解析成功啦！快看看视频信息~ 📹',
    '搞定！视频信息出来了哦 ✨',
    '完美解析！让 AI 帮你看看视频讲了什么~',
  ],
  // 解析失败
  parseFail: [
    '呜…解析失败了，链接是不是不对呀？😢',
    '出错了呢…要不换个链接试试？🤔',
    '解析出问题了，检查一下链接格式吧~',
  ],
  // 开始下载
  downloadStart: [
    '开始下载啦，稍等一下哦~ ⏳',
    '下载中…我帮你盯着进度！📥',
    '正在下载~喝杯水等一会儿吧 ☕',
  ],
  // 下载完成
  downloadDone: [
    '下载完成啦！快去看看吧~ 🎉',
    '搞定！视频已经下好了 (ﾉ◕ヮ◕)ﾉ*:・ﾟ✧',
    '下载好了~享受观看吧！🎬',
  ],
  // 用户登出
  logout: [
    '下次再见哦~ (｡•́ωก̀｡)',
    '拜拜~欢迎下次再来！👋',
  ],
  // 闲置
  idle: [
    '好久没动了，要不要找个有趣的视频看看？🤔',
    '无聊的话可以跟我聊天哦~ (●\'◡\'●)',
    '好安静啊…要不去B站逛逛？',
    '摸鱼时间到！🐟',
    '发呆中…你也在发呆吗？😴',
  ],
  // 用户粘贴链接（输入框聚焦时）
  inputFocus: [
    '把链接粘贴过来就好啦~',
    '我准备好了，快输入链接吧！✌️',
  ],
  // 批量解析
  batchParse: [
    '哇~一次解析这么多，真有效率！💪',
    '批量任务收到！让我帮你一个个搞定~',
  ],
  // 用户切换画质
  qualityChange: [
    '画质越高越香哦~当然也越大 😜',
    '高画质爱好者！存储空间还够吗？💾',
  ],
}

// ==================== 行为数据拉取 ====================
async function fetchProfileAnalysis(): Promise<string> {
  try {
    const resp = await fetch('/api/user/profile-analysis')
    const data = await resp.json()
    return data.success ? (data.summary || '') : ''
  } catch { return '' }
}

async function fetchSubtitle(bvid: string, cid: number): Promise<string> {
  try {
    const resp = await fetch(`/api/video/subtitle?bvid=${bvid}&cid=${cid}`)
    const data = await resp.json()
    return data.text || ''
  } catch { return '' }
}

// ==================== 联网视频分析 ====================
async function analyzeVideo(videoUrl: string, title: string, subtitle?: string) {
  const startThink = (window as any).__waifuStartThinking
  const stopThink = (window as any).__waifuStopThinking
  if (startThink) startThink()

  try {
    // 如果有字幕就一起发给后端，让 AI 结合联网+字幕分析
    const body: any = { videoUrl, title, character: getCurrentModelId() }
    if (subtitle) body.subtitle = subtitle

    const resp = await fetch('/api/chat/video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!resp.ok || !resp.body) { showTips('视频分析失败了…😥'); return }

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
            const t = fullReply.length > 150 ? fullReply.slice(0, 150) + '…' : fullReply
            showTips(t, 15000)
          }
        } catch { /* skip */ }
      }
    }
    if (fullReply) {
      showTips(fullReply.length > 150 ? fullReply.slice(0, 150) + '…' : fullReply, 10000)
    }
  } catch { showTips('网络出问题了…😥') }
  finally { if (stopThink) stopThink() }
}

// ==================== 冷却控制 ====================
let lastPresetTime = 0
const PRESET_COOLDOWN = 4000

function showPreset(lines: string[], duration = 6000) {
  const now = Date.now()
  if (now - lastPresetTime < PRESET_COOLDOWN) return
  lastPresetTime = now
  showTips(pick(lines), duration)
}

// ==================== Composable ====================
export function useMascot() {
  onMounted(() => {
    const videoStore = useVideoStore()
    const downloadStore = useDownloadStore()
    const authStore = useAuthStore()

    // ---- 欢迎语（延迟 3 秒）----
    setTimeout(() => showPreset(PRESET.welcome, 6000), 3000)

    // ---- 登录 → AI 分析用户画像 ----
    watch(() => authStore.isLoggedIn, async (loggedIn, was) => {
      if (loggedIn && !was) {
        setContext('用户刚刚登录')
        setTimeout(async () => {
          if (!authStore.userDetail) {
            try { await authStore.fetchUserDetail() } catch { /* ignore */ }
          }
          const info = authStore.userInfo
          const detail = authStore.userDetail
          const isVip = authStore.isVip
          const vipLabel = authStore.vipLabel
          const behaviorSummary = await fetchProfileAnalysis()

          let userDesc = `用户「${info?.name || '未知'}」刚刚登录了。\n`
          if (detail) userDesc += `基础信息：Lv${detail.level}，硬币${detail.coins}，获赞${detail.totalLikes}。\n`
          if (isVip) userDesc += `会员状态：${vipLabel || '大会员'}。\n`
          if (behaviorSummary) userDesc += `\n用户行为数据：\n${behaviorSummary}`

          callAI(
            '用户刚登录B站账号。请根据全部信息（等级、获赞、会员、观看历史分区、收藏视频）综合分析该用户的类型、兴趣偏好、活跃程度。用可爱语气评价，3-4句话。',
            userDesc
          )
        }, 2000)
      }
      if (!loggedIn && was) {
        setContext('空闲中')
        showPreset(PRESET.logout)
      }
    })

    // ---- 解析视频 → 字幕+联网分析 ----
    watch(() => videoStore.currentResult, async (result, old) => {
      if (result && result !== old) {
        setContext(`正在查看视频：${result.title}`)
        showPreset(PRESET.parseSuccess)

        // 先拉字幕，再联网分析（字幕辅助）
        let subtitle = ''
        if (result.bvid && result.cid) {
          subtitle = await fetchSubtitle(result.bvid, result.cid)
        }
        const videoUrl = result.bvid
          ? `https://www.bilibili.com/video/${result.bvid}`
          : (result.url || '')
        if (videoUrl) {
          analyzeVideo(videoUrl, result.title, subtitle || undefined)
        }
      }
    })

    // ---- 解析失败 ----
    watch(() => videoStore.error, (err) => {
      if (err) {
        setContext('解析失败')
        showPreset(PRESET.parseFail)
      }
    })

    // ---- 下载开始 ----
    watch(() => downloadStore.tasks.size, (n, o) => {
      if (n > o) {
        setContext('正在下载视频')
        showPreset(PRESET.downloadStart)
      }
    })

    // ---- 下载完成 ----
    watch(() => downloadStore.completedCount, (n: number, o: number) => {
      if (n > o) {
        setContext('下载完成')
        showPreset(PRESET.downloadDone)
      }
    })

    // ---- 批量解析触发 ----
    watch(() => videoStore.batchResults, (results, old) => {
      if (results && results.length > 0 && results !== old) {
        showPreset(PRESET.batchParse)
      }
    })

    // ---- 搜索框聚焦互动 ----
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement
      if (target?.id === 'search-input' || target?.classList?.contains('search-input')) {
        showPreset(PRESET.inputFocus)
      }
    }
    document.addEventListener('focusin', onFocusIn)

    // ---- 闲置检测 ----
    let idleTimer: ReturnType<typeof setTimeout> | null = null
    function resetIdleTimer() {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        setContext('空闲中')
        showPreset(PRESET.idle, 8000)
        resetIdleTimer()
      }, 90_000) // 90秒
    }
    resetIdleTimer()
    const events = ['mousemove', 'keydown', 'click', 'scroll']
    const onActivity = () => resetIdleTimer()
    events.forEach(e => document.addEventListener(e, onActivity, { passive: true }))

    onUnmounted(() => {
      events.forEach(e => document.removeEventListener(e, onActivity))
      document.removeEventListener('focusin', onFocusIn)
      if (idleTimer) clearTimeout(idleTimer)
    })
  })

  return {}
}
