<template>
  <!-- 背景图容器 — 双层交替淡入淡出 -->
  <div
    class="bg-carousel"
    @mouseenter="carousel.pause()"
    @mouseleave="carousel.resume()"
    @touchstart="carousel.onTouchStart"
    @touchend="carousel.onTouchEnd"
  >
    <div
      class="bg-carousel__layer"
      :class="{ active: carousel.activeLayerA.value }"
      :style="carousel.layerAUrl.value ? { backgroundImage: `url(${carousel.layerAUrl.value})` } : {}"
    ></div>
    <div
      class="bg-carousel__layer"
      :class="{ active: !carousel.activeLayerA.value }"
      :style="carousel.layerBUrl.value ? { backgroundImage: `url(${carousel.layerBUrl.value})` } : {}"
    ></div>
  </div>
  <!-- 遮罩 (对比度 ≥ 4.5:1) -->
  <div class="bg-carousel__overlay"></div>

  <!-- Header -->
  <AppHeader @toast="showToast" />

  <!-- 免责声明 — 最高图层，任何情况下不被覆盖 -->
  <DisclaimerBanner />

  <!-- Content -->
  <main class="container">
    <router-view />
  </main>



  <!-- 右侧浮动按钮组 -->
  <div class="side-buttons">
    <!-- 个人中心 -->
    <button class="side-btn side-btn--avatar" @click="authStore.toggleProfile" :title="authStore.isLoggedIn ? '我的' : '未登录'">
      <img v-if="authStore.isLoggedIn && authStore.userInfo?.avatar" :src="authStore.userInfo.avatar" class="side-btn__avatar" referrerpolicy="no-referrer" />
      <i v-else class="fas fa-user"></i>
    </button>
    <button class="side-btn" @click="appStore.toggleSettings()" title="设置">
      <i class="fas fa-cog"></i>
    </button>
    <button class="side-btn side-btn--pink" @click="showAnnouncement" title="通告">
      <i class="fas fa-bullhorn"></i>
      <span v-if="hasNewAnnouncement" class="side-badge">!</span>
    </button>
    <button class="side-btn side-btn--blue" @click="downloadStore.togglePanel()" title="下载管理">
      <i class="fas fa-download"></i>
      <span v-if="downloadStore.activeCount > 0" class="side-badge">{{ downloadStore.activeCount }}</span>
    </button>
    <button class="side-btn side-btn--music" @click="toggleMusic" title="音乐">
      <i class="fas fa-music"></i>
    </button>
  </div>

  <!-- Download Manager (侧滑面板) -->
  <DownloadManager />

  <!-- 个人中心侧边栏 -->
  <UserProfile />

  <!-- 智能看板娘（聊天输入框直接注入 #waifu 容器，不需要独立组件） -->

  <!-- 通告弹窗 -->
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="announcementVisible" class="ann-overlay" @click.self="announcementVisible = false">
        <div class="ann-card">
          <div class="ann-header">
            <h3>📢 系统通告</h3>
            <button class="ann-close" @click="announcementVisible = false">✕</button>
          </div>
          <div class="ann-body">
            <div v-for="(ann, idx) in announcementList" :key="idx" class="ann-item" :class="{ 'ann-item--first': idx === 0 }">
              <div class="ann-item-title">{{ ann.title || '无标题' }}</div>
              <p v-for="(line, li) in ann.content.split('\n').filter((l: string) => l.trim())" :key="li">{{ line }}</p>
              <div class="ann-time">📅 {{ formatTime(ann.updatedAt) }}</div>
            </div>
            <div v-if="!announcementList.length" class="ann-empty">暂无通告</div>
          </div>
          <div class="ann-footer">
            <button class="ann-btn" @click="announcementVisible = false">我知道了</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Toast -->
  <AppToast ref="toastRef" />
</template>

<script setup lang="ts">
import { ref, computed, provide, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useDownloadStore } from '@/stores/download'
import { useCarousel } from '@/composables/useCarousel'
import AppHeader from '@/components/layout/AppHeader.vue'

import DisclaimerBanner from '@/components/layout/DisclaimerBanner.vue'
import DownloadManager from '@/components/common/DownloadManager.vue'
import UserProfile from '@/components/common/UserProfile.vue'
import AppToast from '@/components/common/AppToast.vue'
import api from '@/services/api'
import { useMascot } from '@/composables/useMascot'

const appStore = useAppStore()
const authStore = useAuthStore()
const downloadStore = useDownloadStore()
const carousel = useCarousel()
const mascot = useMascot()
const toastRef = ref<InstanceType<typeof AppToast>>()

// 通告系统
interface Announcement { title: string; content: string; updatedAt: string }
const announcementVisible = ref(false)
const announcementList = ref<Announcement[]>([])
const hasNewAnnouncement = ref(false)

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('zh-CN')
}

function showAnnouncement() {
  if (announcementList.value.length) {
    announcementVisible.value = true
    hasNewAnnouncement.value = false
    localStorage.setItem('ann_read', announcementList.value[0].updatedAt)
  } else {
    showToast('暂无通告', 'info')
  }
}

async function fetchAnnouncement() {
  try {
    const { data } = await api.get('/api/announcement')
    if (data.data && Array.isArray(data.data) && data.data.length) {
      announcementList.value = data.data
      const lastRead = localStorage.getItem('ann_read')
      if (lastRead !== data.data[0].updatedAt) {
        hasNewAnnouncement.value = true
        announcementVisible.value = true
      }
    }
  } catch { /* ignore */ }
}

function showToast(message: string, type: string = 'info') {
  toastRef.value?.showToast(message, type as 'success' | 'error' | 'warning' | 'info')
}

provide('toast', showToast)

function toggleMusic() {
  const fn = (window as any).__toggleMusicPlayer
  if (typeof fn === 'function') fn()
}

// 保存当前背景图（从浏览器显示的图直接导出）
function saveBgImage() {
  // 找到当前活跃的背景层
  const layers = document.querySelectorAll('.bg-carousel__layer.active')
  const layer = layers[0] as HTMLElement
  if (!layer) { showToast('暂无背景图', 'warning'); return }

  const bgStyle = getComputedStyle(layer).backgroundImage
  const match = bgStyle.match(/url\(["']?(.*?)["']?\)/)
  if (!match || !match[1]) { showToast('暂无背景图', 'warning'); return }

  const imgUrl = match[1]
  showToast('正在保存...', 'info')

  // 用 Image 加载（浏览器缓存），再 canvas 导出
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      canvas.toBlob((blob) => {
        if (!blob) { showToast('保存失败', 'error'); return }
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `wallpaper_${Date.now()}.jpg`
        a.click()
        URL.revokeObjectURL(a.href)
        showToast('背景图已保存 ✨', 'success')
      }, 'image/jpeg', 0.95)
    } catch {
      // canvas 被污染（跨域），回退到后端代理
      const proxyUrl = `/api/proxy/image?url=${encodeURIComponent(imgUrl)}`
      fetch(proxyUrl)
        .then(r => r.blob())
        .then(blob => {
          const a = document.createElement('a')
          a.href = URL.createObjectURL(blob)
          a.download = `wallpaper_${Date.now()}.jpg`
          a.click()
          URL.revokeObjectURL(a.href)
          showToast('背景图已保存 ✨', 'success')
        })
        .catch(() => showToast('保存失败', 'error'))
    }
  }
  img.onerror = () => {
    // 直接用后端代理
    const proxyUrl = `/api/proxy/image?url=${encodeURIComponent(imgUrl)}`
    fetch(proxyUrl)
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `wallpaper_${Date.now()}.jpg`
        a.click()
        URL.revokeObjectURL(a.href)
        showToast('背景图已保存 ✨', 'success')
      })
      .catch(() => showToast('保存失败', 'error'))
  }
  img.src = imgUrl
}
// 识别背景图角色
const bgIdentifying = ref(false)
async function identifyBgCharacter() {
  const url = carousel.currentBgUrl.value
  if (!url) { showToast('暂无背景图', 'warning'); return }
  if (bgIdentifying.value) return
  bgIdentifying.value = true
  showToast('🔍 正在识别角色...', 'info')
  try {
    const { data } = await api.post('/api/chat', {
      message: `请识别这张图片中的动漫角色。图片地址：${url}\n\n请告诉我：\n1. 角色名称\n2. 出自哪部作品\n3. 简短介绍\n如果无法识别，就描述图片里的内容。`,
      sessionId: 'bg-identify-' + Date.now()
    })
    const reply = data?.reply || data?.data?.reply || '识别失败'
    // 通过看板娘气泡显示结果
    const tips = document.getElementById('waifu-tips')
    if (tips) {
      tips.textContent = reply.length > 200 ? reply.slice(0, 200) + '...' : reply
      tips.style.opacity = '1'
      tips.style.visibility = 'visible'
      setTimeout(() => { tips.style.opacity = '0' }, 15000)
    } else {
      showToast(reply.length > 100 ? reply.slice(0, 100) + '...' : reply, 'info')
    }
  } catch (e) {
    showToast('识别失败，请稍后再试', 'error')
  } finally {
    bgIdentifying.value = false
  }
}

onMounted(() => {
  appStore.initThemeListener()
  fetchAnnouncement()

  // 全局禁止右键菜单（搜索框 input/textarea 除外）
  document.addEventListener('contextmenu', (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const tag = target.tagName.toLowerCase()
    if (tag === 'input' || tag === 'textarea') return
    e.preventDefault()
  })
})
</script>

<style lang="scss">
@use '@/styles/global.scss';

// 右侧浮动按钮组 (原版 3 个)
.side-buttons {
  position: fixed;
  right: 16px;
  bottom: 24px;
  z-index: 200;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.side-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  color: white;
  background: var(--color-bg-elevated);
  backdrop-filter: var(--backdrop-blur-light);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  box-shadow: var(--shadow-md);
  transition: all var(--transition-fast);
  position: relative;

  &:hover {
    transform: scale(1.1);
    color: var(--color-text-primary);
    box-shadow: var(--shadow-lg);
  }

  &--pink {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
    &:hover { background: var(--color-primary-hover); color: white; }
  }

  &--music {
    background: linear-gradient(135deg, #23d5ab, #00a1d6);
    color: white;
    border-color: #23d5ab;
    &:hover { background: linear-gradient(135deg, #1ec9a0, #0090c0); color: white; }
  }

  &--blue {
    background: var(--color-blue);
    color: white;
    border-color: var(--color-blue);
    &:hover { background: var(--color-blue-hover); color: white; }
  }

  &--purple {
    background: linear-gradient(135deg, #a855f7, #7c3aed);
    color: white;
    border-color: #a855f7;
    &:hover { background: linear-gradient(135deg, #9333ea, #6d28d9); color: white; }
  }

  &--orange {
    background: linear-gradient(135deg, #f97316, #ea580c);
    color: white;
    border-color: #f97316;
    &:hover { background: linear-gradient(135deg, #ea580c, #c2410c); color: white; }
    &:disabled { opacity: 0.7; cursor: wait; }
  }

  &--avatar {
    padding: 0; overflow: hidden;
    border: 2px solid var(--color-primary);
    background: var(--color-bg-elevated);
  }

  &__avatar {
    width: 100%; height: 100%;
    object-fit: cover; border-radius: 50%;
  }
}

.side-badge {
  position: absolute;
  top: -4px; right: -4px;
  min-width: 16px; height: 16px;
  background: var(--color-danger);
  color: white;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  padding: 0 3px;
}

// 通告弹窗
.ann-overlay {
  position: fixed; inset: 0; z-index: 10000;
  display: flex; justify-content: center; align-items: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.ann-card {
  background: var(--color-bg-card, #1e1e1e);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  width: 90%; max-width: 460px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  animation: annSlideUp 0.3s ease;
}

.ann-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 24px;
  background: linear-gradient(135deg, #fb7299, #00a1d6);
  h3 { color: white; font-size: 1.05rem; margin: 0; }
}

.ann-close {
  background: rgba(255,255,255,0.2); border: none; color: white;
  width: 28px; height: 28px; border-radius: 50%; cursor: pointer;
  font-size: 13px; display: flex; align-items: center; justify-content: center;
  transition: background 0.2s;
  &:hover { background: rgba(255,255,255,0.35); }
}

.ann-body {
  padding: 16px 24px;
  color: var(--color-text-primary, #e0e0e0);
  line-height: 1.7; font-size: 0.9rem;
  max-height: 55vh; overflow-y: auto;
  p { margin-bottom: 4px; }
}

.ann-item {
  padding: 12px 0;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  &:last-child { border-bottom: none; }
  &--first {
    border-left: 3px solid #00a1d6;
    padding-left: 12px;
    margin-left: -12px;
  }
}

.ann-item-title {
  font-weight: 600; font-size: 0.95rem;
  color: #fb7299; margin-bottom: 6px;
}

.ann-time { font-size: 0.75rem; color: var(--color-text-secondary, #888); margin-top: 8px; }

.ann-empty { text-align: center; padding: 30px; color: #666; }

.ann-footer {
  padding: 10px 24px 16px;
  display: flex; justify-content: center;
}

.ann-btn {
  padding: 8px 28px;
  background: linear-gradient(135deg, #fb7299, #e91e63);
  color: white; border: none; border-radius: 8px;
  cursor: pointer; font-size: 0.95rem;
  transition: opacity 0.2s, transform 0.2s;
  &:hover { opacity: 0.9; transform: translateY(-1px); }
}

@keyframes annSlideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
