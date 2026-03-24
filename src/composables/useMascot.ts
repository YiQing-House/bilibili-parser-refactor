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
  ; (window as any).__waifuUserContext = ctx
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
    '完美解析！让本尊帮你看看视频讲了什么~',
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

async function fetchBiliAISummary(bvid: string, cid: number, upMid?: number): Promise<string> {
  try {
    let url = `/api/video/ai-summary?bvid=${bvid}&cid=${cid}`
    if (upMid) url += `&up_mid=${upMid}`
    const resp = await fetch(url)
    const data = await resp.json()
    return data.available ? (data.summary || '') : ''
  } catch (e) { console.error('[Mascot] B站AI总结请求失败:', e); return '' }
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

    // ---- 解析视频 -> B站AI总结优先 -> 降级GLM ----
    watch(() => videoStore.currentResult, async (result, old) => {
      if (result && result !== old) {
        setContext(`正在查看视频: ${result.title}`)
        showPreset(PRESET.parseSuccess)



        // 1. 优先拿 B 站官方 AI 总结
        let biliSummary = ''
        if (result.bvid && result.cid) {
          biliSummary = await fetchBiliAISummary(result.bvid, result.cid, result.authorMid)
        } else {
          console.warn('[Mascot] 缺少 bvid 或 cid，跳过 AI 总结')
        }

        if (biliSummary) {
          // 有 B 站 AI 总结 -> 让看板娘用可爱语气复述
          callAI(
            '以下是B站对视频的AI总结。请用你的可爱语气，把这段总结转述给用户。保留关键信息，3-4句话。不要说根据AI总结这种话，直接说视频讲了什么。',
            '视频标题: ' + result.title + '\nB站AI总结:\n' + biliSummary
          )
        } else {
          // 2. 没有 B 站 AI 总结 -> 降级: 字幕 + 视频描述
          let subtitle = ''
          if (result.bvid && result.cid) {
            subtitle = await fetchSubtitle(result.bvid, result.cid)
          }
          const desc = result.description || ''

          if (subtitle || desc) {
            // 有字幕或描述 -> 直接让 AI 根据已有信息总结，不联网
            let content = `视频标题: ${result.title}`
            if (desc) content += `\n视频简介: ${desc}`
            if (subtitle) content += `\n视频字幕:\n${subtitle.slice(0, 2000)}`
            callAI(
              '请根据以下视频的标题、简介和字幕内容，用可爱语气总结这个视频讲了什么。3-4句话。只能基于给出的信息，严禁编造。',
              content
            )
          } else {
            // 啥都没有 -> 只用标题简单评论
            callAI(
              '用户解析了一个B站视频，但没有字幕和AI总结。请根据视频标题猜测视频可能讲了什么，用可爱语气简单评论。2句话即可。要明确表示这只是根据标题的猜测。',
              '视频标题: ' + result.title
            )
          }
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
    watch(() => downloadStore.totalCount, (n, o) => {
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
