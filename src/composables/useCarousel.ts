// ============================================================
// 背景轮播 Composable — 混合模式（动态视频 + 静态图片）
// 双层交替淡入淡出:
//   - 两个背景层 A / B，通过 opacity 0/1 交替
//   - 视频播完 @ended 触发切换 / 图片 60 秒定时切换
//   - Image/Video 预加载, onerror 跳下一张
// ============================================================

import { ref, onMounted, onUnmounted } from 'vue'

// ==================== 资源定义 ====================

export interface BgResource {
  type: 'video' | 'image'
  url: string
  /** 视频是否循环播放一轮后切换（默认 false = 播完切换） */
  loop?: boolean
}

// 动态视频壁纸（公开可用的二次元 / 风格化短视频）
const VIDEO_BACKGROUNDS: BgResource[] = [
  // Sakura petals — 唯美樱花粒子
  { type: 'video', url: 'https://cdn.pixabay.com/video/2020/07/30/45349-446297770_large.mp4' },
  // Anime sky / 星空
  { type: 'video', url: 'https://cdn.pixabay.com/video/2024/04/09/207289_large.mp4' },
  // Night city neon / 夜景霓虹
  { type: 'video', url: 'https://cdn.pixabay.com/video/2021/10/12/91491-631267816_large.mp4' },
  // Rain on window / 窗外雨滴
  { type: 'video', url: 'https://cdn.pixabay.com/video/2020/05/25/39831-423759627_large.mp4' },
  // Clouds flowing / 流云
  { type: 'video', url: 'https://cdn.pixabay.com/video/2019/06/28/24940-345366288_large.mp4' },
]

// 随机动漫图片 API（保留现有）
const ANIME_APIS: string[] = [
  'https://img.paulzzh.com/touhou/random',   // 东方Project
  'https://www.dmoe.cc/random.php',           // 随机二次元美少女
]

// 混合播放列表：视频 + 图片穿插
// 策略: 每播放 2 张图片后插入 1 个视频
const IMAGE_BETWEEN_VIDEOS = 2

// ==================== 常量 ====================

const IMAGE_INTERVAL_MS = 60000  // 图片停留 60 秒
const VIDEO_MAX_DURATION = 120   // 视频最长播放 120 秒（超长视频强制切换）

let apiIndex = 0

export function useCarousel() {
  // 双层背景
  const layerAUrl = ref('')
  const layerBUrl = ref('')
  const layerAType = ref<'video' | 'image'>('image')
  const layerBType = ref<'video' | 'image'>('image')
  // 当前哪一层可见 (true = A 可见, false = B 可见)
  const activeLayerA = ref(true)

  const isPaused = ref(false)
  const isLoading = ref(false)

  // 向外暴露
  const currentBgUrl = ref('')
  const currentBgType = ref<'video' | 'image'>('image')

  let timer: ReturnType<typeof setInterval> | null = null
  let videoTimer: ReturnType<typeof setTimeout> | null = null
  let imageCount = 0   // 连续图片计数
  let videoIndex = 0   // 视频列表索引

  // ==================== 资源获取 ====================

  function getNextResource(): BgResource {
    imageCount++

    // 每播放 IMAGE_BETWEEN_VIDEOS 张图片后，播一个视频
    if (imageCount > IMAGE_BETWEEN_VIDEOS && VIDEO_BACKGROUNDS.length > 0) {
      imageCount = 0
      const video = VIDEO_BACKGROUNDS[videoIndex % VIDEO_BACKGROUNDS.length]
      videoIndex++
      return video
    }

    // 返回随机图片
    const base = ANIME_APIS[apiIndex % ANIME_APIS.length]
    apiIndex++
    return {
      type: 'image',
      url: `${base}${base.includes('?') ? '&' : '?'}t=${Date.now()}`,
    }
  }

  // ==================== 切换逻辑 ====================

  function loadNext() {
    if (isLoading.value) return
    isLoading.value = true

    // 清除视频定时器
    if (videoTimer) { clearTimeout(videoTimer); videoTimer = null }

    const resource = getNextResource()

    if (resource.type === 'video') {
      loadVideo(resource)
    } else {
      loadImage(resource)
    }
  }

  function loadImage(resource: BgResource) {
    const img = new Image()
    img.src = resource.url

    img.onload = () => {
      applyToInactiveLayer(resource)
      isLoading.value = false
    }

    img.onerror = () => {
      console.warn('背景图加载失败，跳过到下一张')
      isLoading.value = false
      setTimeout(() => loadNext(), 1000)
    }
  }

  function loadVideo(resource: BgResource) {
    // 视频直接切换，由 <video> 标签自行加载
    applyToInactiveLayer(resource)
    isLoading.value = false

    // 安全计时器：防止视频过长
    videoTimer = setTimeout(() => {
      loadNext()
    }, VIDEO_MAX_DURATION * 1000)
  }

  function applyToInactiveLayer(resource: BgResource) {
    if (activeLayerA.value) {
      // A 当前可见，新内容放到 B，然后切到 B
      layerBUrl.value = resource.url
      layerBType.value = resource.type
    } else {
      // B 当前可见，新内容放到 A，然后切到 A
      layerAUrl.value = resource.url
      layerAType.value = resource.type
    }
    // 切换可见层
    activeLayerA.value = !activeLayerA.value
    currentBgUrl.value = resource.url
    currentBgType.value = resource.type
  }

  // ==================== 视频播完事件 ====================

  function onVideoEnded() {
    // 视频自然播放完毕 → 切换下一个
    if (videoTimer) { clearTimeout(videoTimer); videoTimer = null }
    loadNext()
  }

  // ==================== 自动播放控制 ====================

  function pause() { isPaused.value = true }
  function resume() { isPaused.value = false }

  function startAutoplay() {
    stopAutoplay()
    timer = setInterval(() => {
      // 只有图片模式才走定时器自动切换
      // 视频模式由 @ended 驱动
      if (!isPaused.value && currentBgType.value === 'image') {
        loadNext()
      }
    }, IMAGE_INTERVAL_MS)
  }

  function stopAutoplay() {
    if (timer) { clearInterval(timer); timer = null }
    if (videoTimer) { clearTimeout(videoTimer); videoTimer = null }
  }

  // Touch / swipe (移动端手势换图)
  let touchStartX = 0
  let touchStartY = 0

  function onTouchStart(e: TouchEvent) {
    touchStartX = e.touches[0].clientX
    touchStartY = e.touches[0].clientY
    pause()
  }

  function onTouchEnd(e: TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX
    const dy = e.changedTouches[0].clientY - touchStartY
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      loadNext()
    }
    resume()
  }

  onMounted(() => {
    loadNext()
    startAutoplay()
    console.log('背景轮播已初始化：动态视频 + 静态图片混合模式')
  })

  onUnmounted(() => {
    stopAutoplay()
  })

  return {
    layerAUrl,
    layerBUrl,
    layerAType,
    layerBType,
    activeLayerA,
    currentBgUrl,
    currentBgType,
    isPaused,
    isLoading,
    loadNext,
    onVideoEnded,
    pause,
    resume,
    onTouchStart,
    onTouchEnd,
  }
}
