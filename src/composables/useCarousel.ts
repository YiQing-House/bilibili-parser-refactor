// ============================================================
// 背景轮播 Composable
// 双层交替淡入淡出方案:
//   - 两个背景层 A / B，通过 opacity 0/1 交替
//   - 5.5 秒轮换间隔 + 1.5 秒 CSS opacity 过渡
//   - Image 预加载, onerror 跳下一张
// ============================================================

import { ref, onMounted, onUnmounted } from 'vue'

// 随机动漫图片 API
const ANIME_APIS: string[] = [
  'https://img.paulzzh.com/touhou/random',   // 东方Project
  'https://www.dmoe.cc/random.php',           // 随机二次元美少女
]

const INTERVAL_MS = 60000   // 60 秒轮换（1 分钟）
let apiIndex = 0

export function useCarousel() {
  // 双层背景 URL
  const layerAUrl = ref('')
  const layerBUrl = ref('')
  // 当前哪一层可见 (true = A 可见, false = B 可见)
  const activeLayerA = ref(true)

  const isPaused = ref(false)
  const isLoading = ref(false)

  // 向外暴露 currentBgUrl 保持兼容（返回当前活跃层 URL）
  const currentBgUrl = ref('')

  let timer: ReturnType<typeof setInterval> | null = null

  function getRandomUrl(): string {
    const base = ANIME_APIS[apiIndex % ANIME_APIS.length]
    apiIndex++
    return `${base}${base.includes('?') ? '&' : '?'}t=${Date.now()}`
  }

  /**
   * 加载并切换背景图 — 双层交替淡入淡出
   * 将新图设到不可见的那一层，然后切换 activeLayerA
   */
  function loadNext() {
    if (isLoading.value) return
    isLoading.value = true

    const url = getRandomUrl()
    const img = new Image()
    img.src = url

    img.onload = () => {
      // 将新图设到当前不可见的层
      if (activeLayerA.value) {
        // A 当前可见，把新图放到 B，然后切到 B
        layerBUrl.value = url
      } else {
        // B 当前可见，把新图放到 A，然后切到 A
        layerAUrl.value = url
      }
      // 切换可见层（CSS transition: opacity 1.5s 会自动淡入淡出）
      activeLayerA.value = !activeLayerA.value
      currentBgUrl.value = url
      isLoading.value = false
    }

    img.onerror = () => {
      console.warn('背景图加载失败，跳过到下一张')
      isLoading.value = false
      setTimeout(() => loadNext(), 1000)
    }
  }

  function pause() { isPaused.value = true }
  function resume() { isPaused.value = false }

  function startAutoplay() {
    stopAutoplay()
    timer = setInterval(() => {
      if (!isPaused.value) loadNext()
    }, INTERVAL_MS)
  }

  function stopAutoplay() {
    if (timer) { clearInterval(timer); timer = null }
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
    console.log('背景图已初始化：双层交替淡入淡出，每 5.5 秒自动轮换')
  })

  onUnmounted(() => {
    stopAutoplay()
  })

  return {
    layerAUrl,
    layerBUrl,
    activeLayerA,
    currentBgUrl,
    isPaused,
    isLoading,
    loadNext,
    pause,
    resume,
    onTouchStart,
    onTouchEnd,
  }
}
