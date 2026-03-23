<template>
  <Teleport to="body">
    <Transition name="panel">
      <div v-if="authStore.profilePanelOpen" class="up-overlay" @click.self="authStore.toggleProfile">
        <div class="up-panel">
          <!-- 头部 -->
          <div class="up-head">
            <h3><i class="fas fa-user-circle"></i> 我的</h3>
            <button class="up-close" @click="authStore.toggleProfile">✕</button>
          </div>

          <div class="up-body">
            <!-- ========== 紧凑用户卡片 ========== -->
            <div v-if="authStore.userInfo" class="up-card">
              <div class="up-card__top">
                <img :src="authStore.userInfo.avatar" class="up-card__avatar" referrerpolicy="no-referrer" />
                <div class="up-card__info">
                  <span class="up-card__name">{{ authStore.userInfo.name }}</span>
                  <span :class="['up-card__vip', { active: authStore.isVip }]">
                    {{ authStore.isVip ? (authStore.vipLabel || '大会员') : '普通用户' }}
                  </span>
                </div>
              </div>
              <!-- 迷你数据行 -->
              <div v-if="authStore.userDetail" class="up-card__stats">
                <div class="up-mini"><i class="fas fa-medal"></i> LV{{ authStore.userDetail.level }}</div>
                <div class="up-mini"><i class="fas fa-coins"></i> {{ fmt(authStore.userDetail.coins) }}</div>
                <div class="up-mini"><i class="fas fa-thumbs-up"></i> {{ fmt(authStore.userDetail.totalLikes) }}</div>
                <div class="up-mini up-mini--exp">
                  <span class="up-mini-nums">{{ fmt(authStore.userDetail.currentExp) }}/{{ fmt(authStore.userDetail.nextLevelExp) }}</span>
                  <div class="up-mini-bar"><div class="up-mini-fill" :style="{ width: expPct + '%' }"></div></div>
                  <span>{{ expPct }}%</span>
                </div>
              </div>
              <div v-else-if="authStore.userDetailLoading" class="up-card__stats up-card__stats--loading">
                <div class="up-mini-skeleton" v-for="i in 4" :key="i"></div>
              </div>
            </div>

            <!-- ========== 未登录：扫码登录入口 ========== -->
            <div v-if="!authStore.isLoggedIn" class="up-login-prompt">
              <i class="fas fa-qrcode"></i>
              <p>未授权，请先登录</p>
              <button class="up-login-btn" @click="showLogin = true">
                <i class="fas fa-qrcode"></i> 扫码登录
              </button>
            </div>

            <!-- ========== Tab 切换 ========== -->
            <div v-if="authStore.isLoggedIn" class="up-tabs">
              <button :class="['up-tab', { active: tab === 'submissions' }]" @click="switchTab('submissions')">
                <i class="fas fa-video"></i> 投稿
              </button>
              <button :class="['up-tab', { active: tab === 'favorites' }]" @click="switchTab('favorites')">
                <i class="fas fa-star"></i> 收藏夹
              </button>
              <button :class="['up-tab', { active: tab === 'liked' }]" @click="switchTab('liked')">
                <i class="fas fa-thumbs-up"></i> 点赞
              </button>
              <button :class="['up-tab', { active: tab === 'history' }]" @click="switchTab('history')">
                <i class="fas fa-history"></i> 历史
              </button>
            </div>

            <!-- ========== 投稿列表 ========== -->
            <div v-if="authStore.isLoggedIn && tab === 'submissions'" class="up-list-area">
              <!-- 批量操作头部 -->
              <div class="up-batch-bar">
                <button class="up-batch-toggle" :class="{ active: batchMode === 'sub' }" @click="toggleBatchMode('sub')">
                  <i class="fas fa-download"></i> {{ batchMode === 'sub' ? '退出批量' : '批量下载' }}
                </button>
                <label v-if="batchMode === 'sub' && subList.length" class="up-select-all" @click.prevent="toggleSelectAll('sub')">
                  <span :class="['up-checkbox', { checked: isAllSelectedSub }]">
                    <i v-if="isAllSelectedSub" class="fas fa-check"></i>
                  </span>
                  <span>{{ isAllSelectedSub ? '取消全选' : '全选' }}</span>
                </label>
              </div>

              <div v-if="subLoading && !subList.length" class="up-skeleton-list">
                <div class="up-skeleton-item" v-for="i in 4" :key="i"></div>
              </div>
              <div v-else-if="subError" class="up-error-box">
                <p>{{ subError }}</p>
                <button @click="loadSubmissions(1)"><i class="fas fa-redo"></i> 重试</button>
              </div>
              <template v-else>
                <div class="up-empty" v-if="!subList.length">
                  <i class="fas fa-inbox"></i><p>暂无投稿</p>
                </div>
                <div
                  v-for="v in subList" :key="v.bvid"
                  :class="['up-video', { 'up-video--selected': selectedSub.has(v.bvid) }]"
                  @click="batchMode === 'sub' ? toggleSelect('sub', v.bvid) : parseVideo(v.bvid)"
                >
                  <!-- 批量选择 checkbox -->
                  <span v-if="batchMode === 'sub'" :class="['up-checkbox', { checked: selectedSub.has(v.bvid) }]">
                    <i v-if="selectedSub.has(v.bvid)" class="fas fa-check"></i>
                  </span>
                  <div class="up-video__thumb">
                    <img :src="v.cover" class="up-video__cover" loading="lazy" referrerpolicy="no-referrer" />
                    <span v-if="qualityLabel(v.maxQuality)" class="up-video__qbadge">{{ qualityLabel(v.maxQuality) }}</span>
                    <span v-if="v.duration" class="up-video__dur-badge">{{ v.duration }}</span>
                  </div>
                  <div class="up-video__meta">
                    <span class="up-video__title">{{ v.title }}</span>
                    <span class="up-video__info">
                      <span v-if="v.created"><i class="fas fa-clock"></i> {{ fmtDate(v.created) }}</span>
                      <span><i class="fas fa-play"></i> {{ fmt(v.plays) }}</span>
                      <span v-if="v.danmakus != null"><i class="fas fa-bars-staggered"></i> {{ fmt(v.danmakus) }}</span>
                    </span>
                    <span class="up-video__info">
                      <span v-if="v.comment != null"><i class="fas fa-comment"></i> {{ fmt(v.comment) }}</span>
                      <span v-if="v.favorites != null"><i class="fas fa-star"></i> {{ fmt(v.favorites) }}</span>
                    </span>
                  </div>
                </div>
                <button v-if="subList.length < subTotal" class="up-loadmore" @click="loadSubmissions(subPage + 1)" :disabled="subLoading">
                  {{ subLoading ? '加载中...' : '加载更多' }}
                </button>
              </template>
            </div>

            <!-- ========== 收藏夹列表 ========== -->
            <div v-if="authStore.isLoggedIn && tab === 'favorites'" class="up-list-area">
              <!-- 收藏夹目录 -->
              <template v-if="!activeFav">
                <div v-if="favLoading && !favFolders.length" class="up-skeleton-list">
                  <div class="up-skeleton-item" v-for="i in 3" :key="i"></div>
                </div>
                <div v-else-if="favError" class="up-error-box">
                  <p>{{ favError }}</p>
                  <button @click="loadFavorites"><i class="fas fa-redo"></i> 重试</button>
                </div>
                <template v-else>
                  <div class="up-empty" v-if="!favFolders.length">
                    <i class="fas fa-inbox"></i><p>暂无收藏夹</p>
                  </div>
                  <div v-for="f in favFolders" :key="f.id" class="up-folder" @click="openFolder(f)">
                    <i class="fas fa-folder"></i>
                    <span class="up-folder__name">{{ f.title }}</span>
                    <span class="up-folder__count">{{ f.mediaCount }} 个</span>
                    <i class="fas fa-chevron-right up-folder__arrow"></i>
                  </div>
                </template>
              </template>

              <!-- 收藏夹内视频 -->
              <template v-else>
                <div class="up-folder-back" @click="activeFav = null; exitBatchMode()">
                  <i class="fas fa-arrow-left"></i>
                  <span>{{ activeFav.title }}</span>
                </div>

                <!-- 批量操作头部 -->
                <div class="up-batch-bar">
                  <button class="up-batch-toggle" :class="{ active: batchMode === 'fav' }" @click="toggleBatchMode('fav')">
                    <i class="fas fa-download"></i> {{ batchMode === 'fav' ? '退出批量' : '批量下载' }}
                  </button>
                  <label v-if="batchMode === 'fav' && favVideos.length" class="up-select-all" @click.prevent="toggleSelectAll('fav')">
                    <span :class="['up-checkbox', { checked: isAllSelectedFav }]">
                      <i v-if="isAllSelectedFav" class="fas fa-check"></i>
                    </span>
                    <span>{{ isAllSelectedFav ? '取消全选' : '全选' }}</span>
                  </label>
                </div>

                <div v-if="favVidLoading && !favVideos.length" class="up-skeleton-list">
                  <div class="up-skeleton-item" v-for="i in 4" :key="i"></div>
                </div>
                <div v-else-if="favVidError" class="up-error-box">
                  <p>{{ favVidError }}</p>
                  <button @click="loadFolderVideos(activeFav!.id, 1)"><i class="fas fa-redo"></i> 重试</button>
                </div>
                <template v-else>
                  <div
                    v-for="v in favVideos" :key="v.bvid"
                    :class="['up-video', { 'up-video--selected': selectedFav.has(v.bvid) }]"
                    @click="batchMode === 'fav' ? toggleSelect('fav', v.bvid) : parseVideo(v.bvid)"
                  >
                    <span v-if="batchMode === 'fav'" :class="['up-checkbox', { checked: selectedFav.has(v.bvid) }]">
                      <i v-if="selectedFav.has(v.bvid)" class="fas fa-check"></i>
                    </span>
                    <div class="up-video__thumb">
                      <img :src="v.cover" class="up-video__cover" loading="lazy" referrerpolicy="no-referrer" />
                      <span v-if="v.duration" class="up-video__dur-badge">{{ v.duration }}</span>
                    </div>
                    <div class="up-video__meta">
                      <span class="up-video__title">{{ v.title }}</span>
                      <span class="up-video__info">
                        <span v-if="v.upper"><i class="fas fa-user"></i> {{ v.upper }}</span>
                        <span><i class="fas fa-play"></i> {{ fmt(v.plays) }}</span>
                        <span v-if="v.danmakus != null"><i class="fas fa-bars-staggered"></i> {{ fmt(v.danmakus) }}</span>
                      </span>
                      <span class="up-video__info">
                        <span v-if="v.favorites != null"><i class="fas fa-star"></i> {{ fmt(v.favorites) }}</span>
                        <span v-if="v.pubdate"><i class="fas fa-clock"></i> {{ fmtDate(v.pubdate) }}</span>
                      </span>
                    </div>
                  </div>
                  <button v-if="favVideos.length < favVidTotal" class="up-loadmore" @click="loadFolderVideos(activeFav!.id, favVidPage + 1)" :disabled="favVidLoading">
                    {{ favVidLoading ? '加载中...' : '加载更多' }}
                  </button>
                </template>
              </template>
            </div>

            <!-- ========== 点赞视频列表 ========== -->
            <div v-if="authStore.isLoggedIn && tab === 'liked'" class="up-list-area">
              <!-- 搜索框 -->
              <div class="up-search-bar">
                <i class="fas fa-search"></i>
                <input v-model="likedSearch" placeholder="搜索点赞视频..." />
              </div>
              <div v-if="likedLoading && !likedList.length" class="up-skeleton-list">
                <div class="up-skeleton-item" v-for="i in 4" :key="i"></div>
              </div>
              <div v-else-if="likedError" class="up-error-box">
                <p>{{ likedError }}</p>
                <button @click="loadLiked(1)"><i class="fas fa-redo"></i> 重试</button>
              </div>
              <template v-else>
                <div class="up-empty" v-if="!filteredLiked.length && !likedSearch">
                  <i class="fas fa-inbox"></i><p>暂无点赞视频</p>
                </div>
                <div class="up-empty" v-else-if="!filteredLiked.length && likedSearch">
                  <i class="fas fa-search"></i><p>未找到匹配视频</p>
                </div>
                <div
                  v-for="v in filteredLiked" :key="v.bvid"
                  class="up-video"
                  @click="parseVideo(v.bvid)"
                >
                  <div class="up-video__thumb">
                    <img :src="v.cover" class="up-video__cover" loading="lazy" referrerpolicy="no-referrer" />
                  </div>
                  <div class="up-video__meta">
                    <span class="up-video__title">{{ v.title }}</span>
                    <span class="up-video__info">
                      <span v-if="v.upper"><i class="fas fa-user"></i> {{ v.upper }}</span>
                      <span><i class="fas fa-play"></i> {{ fmt(v.plays) }}</span>
                      <span v-if="v.likes"><i class="fas fa-thumbs-up"></i> {{ fmt(v.likes) }}</span>
                    </span>
                  </div>
                </div>
                <button v-if="likedHasMore" class="up-loadmore" @click="loadLiked(likedPage + 1)" :disabled="likedLoading">
                  {{ likedLoading ? '加载中...' : '加载更多' }}
                </button>
              </template>
            </div>

            <!-- ========== 观看历史列表 ========== -->
            <div v-if="authStore.isLoggedIn && tab === 'history'" class="up-list-area">
              <!-- 搜索框 -->
              <div class="up-search-bar">
                <i class="fas fa-search"></i>
                <input v-model="historySearch" placeholder="搜索观看历史..." />
              </div>
              <div v-if="historyLoading && !historyList.length" class="up-skeleton-list">
                <div class="up-skeleton-item" v-for="i in 4" :key="i"></div>
              </div>
              <div v-else-if="historyError" class="up-error-box">
                <p>{{ historyError }}</p>
                <button @click="loadHistory()"><i class="fas fa-redo"></i> 重试</button>
              </div>
              <template v-else>
                <div class="up-empty" v-if="!filteredHistory.length && !historySearch">
                  <i class="fas fa-inbox"></i><p>暂无观看历史</p>
                </div>
                <div class="up-empty" v-else-if="!filteredHistory.length && historySearch">
                  <i class="fas fa-search"></i><p>未找到匹配视频</p>
                </div>
                <div
                  v-for="v in filteredHistory" :key="v.bvid"
                  class="up-video"
                  @click="parseVideo(v.bvid)"
                >
                  <div class="up-video__thumb">
                    <img :src="v.cover" class="up-video__cover" loading="lazy" referrerpolicy="no-referrer" />
                    <span v-if="v.duration" class="up-video__dur-badge">{{ v.duration }}</span>
                    <!-- 进度条 -->
                    <div v-if="v.progress > 0 && v.totalDuration > 0" class="up-video__progress">
                      <div class="up-video__progress-fill" :style="{ width: Math.min(100, (v.progress / v.totalDuration) * 100) + '%' }"></div>
                    </div>
                  </div>
                  <div class="up-video__meta">
                    <span class="up-video__title">{{ v.title }}</span>
                    <span class="up-video__info">
                      <span v-if="v.upper"><i class="fas fa-user"></i> {{ v.upper }}</span>
                      <span v-if="v.tag"><i class="fas fa-tag"></i> {{ v.tag }}</span>
                    </span>
                    <span class="up-video__info">
                      <span><i class="fas fa-clock"></i> {{ fmtTimeAgo(v.viewAt) }}</span>
                    </span>
                  </div>
                </div>
                <button v-if="historyHasMore" class="up-loadmore" @click="loadHistoryMore()" :disabled="historyLoading">
                  {{ historyLoading ? '加载中...' : '加载更多' }}
                </button>
              </template>
            </div>
          </div>

          <!-- ========== 底部浮动操作栏 ========== -->
          <Transition name="bar-slide">
            <div v-if="selectedCount > 0" class="up-batch-footer">
              <span class="up-batch-footer__info">
                <i class="fas fa-check-square"></i> 已选 {{ selectedCount }} 个
              </span>
              <!-- 画质选择 -->
              <select v-model="batchQn" class="up-batch-footer__qn" title="下载画质">
                <option v-for="q in QUALITY_OPTIONS" :key="q.qn" :value="q.qn">{{ q.label }}</option>
              </select>
              <button class="up-batch-footer__cancel" @click="exitBatchMode">取消</button>
              <button class="up-batch-footer__start" @click="startBatchDownload" :disabled="batchDownloading">
                <i :class="batchDownloading ? 'fas fa-spinner fa-spin' : 'fas fa-download'"></i>
                {{ batchDownloading ? batchProgress : '开始下载' }}
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- 扫码登录弹窗 -->
  <LoginModal v-model:visible="showLogin" @login-success="onLoginSuccess" />
</template>

<script setup lang="ts">
import { ref, computed, watch, inject, reactive } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useVideoStore } from '@/stores/video'
import { useAppStore } from '@/stores/app'
import * as authApi from '@/services/auth'
import { buildStreamUrl } from '@/services/bilibili'
import { downloadAndMerge, type MergeProgress } from '@/services/ffmpegMerge'
import LoginModal from '@/components/common/LoginModal.vue'

const authStore = useAuthStore()
const videoStore = useVideoStore()
const appStore = useAppStore()
const toast = inject<(m: string, t: string) => void>('toast')

// 扫码登录弹窗
const showLogin = ref(false)
function onLoginSuccess() {
  showLogin.value = false
  toast?.('登录成功 🎉', 'success')
  loadSubmissions(1)
}

// --- Tab ---
const tab = ref<'submissions' | 'favorites' | 'liked' | 'history'>('submissions')

// --- 投稿 ---
const subList = ref<any[]>([])
const subTotal = ref(0)
const subPage = ref(1)
const subLoading = ref(false)
const subError = ref('')

// --- 收藏夹 ---
const favFolders = ref<any[]>([])
const favLoading = ref(false)
const favError = ref('')

// --- 收藏夹内视频 ---
const activeFav = ref<{ id: number; title: string } | null>(null)
const favVideos = ref<any[]>([])
const favVidTotal = ref(0)
const favVidPage = ref(1)
const favVidLoading = ref(false)
const favVidError = ref('')

// --- 点赞 ---
const likedList = ref<any[]>([])
const likedPage = ref(1)
const likedHasMore = ref(false)
const likedLoading = ref(false)
const likedError = ref('')

// --- 历史 ---
const historyList = ref<any[]>([])
const historyCursor = ref<{ max: number; viewAt: number }>({ max: 0, viewAt: 0 })
const historyHasMore = ref(false)
const historyLoading = ref(false)
const historyError = ref('')

// --- 搜索 ---
const likedSearch = ref('')
const historySearch = ref('')

const filteredLiked = computed(() => {
  const q = likedSearch.value.trim().toLowerCase()
  if (!q) return likedList.value
  return likedList.value.filter(v =>
    v.title?.toLowerCase().includes(q) || v.upper?.toLowerCase().includes(q)
  )
})

const filteredHistory = computed(() => {
  const q = historySearch.value.trim().toLowerCase()
  if (!q) return historyList.value
  return historyList.value.filter(v =>
    v.title?.toLowerCase().includes(q) || v.upper?.toLowerCase().includes(q) || v.tag?.toLowerCase().includes(q)
  )
})

// ==================== 批量下载 ====================
const batchMode = ref<'sub' | 'fav' | null>(null)
const selectedSub = reactive(new Set<string>())
const selectedFav = reactive(new Set<string>())
const batchDownloading = ref(false)
const batchProgress = ref('提交中...')

// 画质选项
const QUALITY_OPTIONS = [
  { qn: 120, label: '4K' },
  { qn: 116, label: '1080P60' },
  { qn: 80,  label: '1080P' },
  { qn: 64,  label: '720P' },
  { qn: 32,  label: '480P' },
  { qn: 16,  label: '360P' },
]
const batchQn = ref(appStore.quality || 80)

const selectedCount = computed(() => {
  if (batchMode.value === 'sub') return selectedSub.size
  if (batchMode.value === 'fav') return selectedFav.size
  return 0
})

const isAllSelectedSub = computed(() =>
  subList.value.length > 0 && selectedSub.size === subList.value.length
)

const isAllSelectedFav = computed(() =>
  favVideos.value.length > 0 && selectedFav.size === favVideos.value.length
)

function toggleBatchMode(type: 'sub' | 'fav') {
  if (batchMode.value === type) {
    exitBatchMode()
  } else {
    batchMode.value = type
    selectedSub.clear()
    selectedFav.clear()
  }
}

function exitBatchMode() {
  batchMode.value = null
  selectedSub.clear()
  selectedFav.clear()
}

function toggleSelect(type: 'sub' | 'fav', bvid: string) {
  const set = type === 'sub' ? selectedSub : selectedFav
  if (set.has(bvid)) set.delete(bvid)
  else set.add(bvid)
}

function toggleSelectAll(type: 'sub' | 'fav') {
  if (type === 'sub') {
    if (isAllSelectedSub.value) {
      selectedSub.clear()
    } else {
      subList.value.forEach(v => selectedSub.add(v.bvid))
    }
  } else {
    if (isAllSelectedFav.value) {
      selectedFav.clear()
    } else {
      favVideos.value.forEach(v => selectedFav.add(v.bvid))
    }
  }
}

function sanitize(s: string) { return s.replace(/[<>:"/\\|?*]/g, '_') }

async function startBatchDownload() {
  const type = batchMode.value
  if (!type) return

  const selected = type === 'sub' ? [...selectedSub] : [...selectedFav]
  const videoList = type === 'sub' ? subList.value : favVideos.value

  if (!selected.length) {
    toast?.('请先选择要下载的视频', 'error')
    return
  }

  batchDownloading.value = true
  const total = selected.length
  const qn = batchQn.value
  toast?.(`开始批量下载 ${total} 个视频 (${QUALITY_OPTIONS.find(q => q.qn === qn)?.label || qn})...`, 'success')

  let successCount = 0
  let failCount = 0

  for (let i = 0; i < total; i++) {
    const bvid = selected[i]
    const video = videoList.find((v: any) => v.bvid === bvid)
    const title = sanitize(video?.title || bvid)
    const url = `https://www.bilibili.com/video/${bvid}`
    const fname = `${title}.mp4`

    batchProgress.value = `(${i + 1}/${total}) 处理中...`

    try {
      // 构建流式代理 URL（服务器只转发，不存盘）
      const videoStreamUrl = buildStreamUrl(url, 'video', qn)
      const audioStreamUrl = buildStreamUrl(url, 'audio', qn)

      // 浏览器端下载+合并（FFmpeg.wasm）
      await downloadAndMerge(videoStreamUrl, audioStreamUrl, fname, (progress: MergeProgress) => {
        batchProgress.value = `(${i + 1}/${total}) ${progress.message}`
      })

      successCount++
      toast?.(`✅ ${title} 下载完成`, 'success')
    } catch (e: any) {
      failCount++
      console.warn(`[批量下载] ${title} 失败:`, e.message)
      toast?.(`❌ ${title} 下载失败: ${e.message}`, 'error')
    }

    // 任务间延迟
    if (i < total - 1) {
      await new Promise(r => setTimeout(r, 300))
    }
  }

  batchDownloading.value = false
  batchProgress.value = '提交中...'
  exitBatchMode()
  toast?.(`批量下载完成：成功 ${successCount}，失败 ${failCount}`, successCount > 0 ? 'success' : 'error')
}

// ==================== 原有逻辑 ====================
const expPct = computed(() => {
  const d = authStore.userDetail
  if (!d || !d.nextLevelExp) return 0
  return Math.min(100, Math.round((d.currentExp / d.nextLevelExp) * 100))
})

function fmt(n: number) { return Math.floor(n).toLocaleString('zh-CN') }

// 画质 qn -> 显示文本
const QN_MAP: Record<number, string> = {
  120: '4K', 116: '1080P60', 112: '1080P+', 80: '1080P',
  74: '720P60', 64: '720P', 32: '480P', 16: '360P',
}
function qualityLabel(qn: number | undefined) {
  if (!qn) return ''
  return QN_MAP[qn] || ''
}

function fmtDate(ts: number) {
  const d = new Date(ts * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtTimeAgo(ts: number) {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - ts
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}天前`
  return fmtDate(ts)
}

// 加载点赞视频
async function loadLiked(page: number) {
  likedLoading.value = true
  likedError.value = ''
  try {
    const res = await authApi.getLikedVideos(page)
    if (page === 1) likedList.value = res.list
    else likedList.value.push(...res.list)
    likedHasMore.value = res.hasMore
    likedPage.value = page
  } catch (e: any) {
    likedError.value = e.message || '加载失败'
  } finally {
    likedLoading.value = false
  }
}

// 加载观看历史（首次）
async function loadHistory() {
  historyLoading.value = true
  historyError.value = ''
  historyCursor.value = { max: 0, viewAt: 0 }
  try {
    const res = await authApi.getHistory()
    historyList.value = res.list
    historyHasMore.value = res.hasMore
    historyCursor.value = res.cursor || { max: 0, viewAt: 0 }
  } catch (e: any) {
    historyError.value = e.message || '加载失败'
  } finally {
    historyLoading.value = false
  }
}

// 加载更多历史（cursor 分页）
async function loadHistoryMore() {
  historyLoading.value = true
  try {
    const res = await authApi.getHistory(historyCursor.value.max, historyCursor.value.viewAt)
    historyList.value.push(...res.list)
    historyHasMore.value = res.hasMore
    historyCursor.value = res.cursor || { max: 0, viewAt: 0 }
  } catch (e: any) {
    historyError.value = e.message || '加载失败'
  } finally {
    historyLoading.value = false
  }
}

// 切换 tab
function switchTab(t: 'submissions' | 'favorites' | 'liked' | 'history') {
  tab.value = t
  exitBatchMode()
  if (t === 'submissions' && !subList.value.length) loadSubmissions(1)
  if (t === 'favorites' && !favFolders.value.length) loadFavorites()
  if (t === 'liked' && !likedList.value.length) loadLiked(1)
  if (t === 'history' && !historyList.value.length) loadHistory()
}

// 加载投稿
async function loadSubmissions(page: number) {
  subLoading.value = true
  subError.value = ''
  try {
    const res = await authApi.getSubmissions(page)
    if (page === 1) subList.value = res.list
    else subList.value.push(...res.list)
    subTotal.value = res.total
    subPage.value = page
  } catch (e: any) {
    subError.value = e.message || '加载失败'
  } finally {
    subLoading.value = false
  }
}

// 加载收藏夹
async function loadFavorites() {
  favLoading.value = true
  favError.value = ''
  try {
    favFolders.value = await authApi.getFavorites()
  } catch (e: any) {
    favError.value = e.message || '加载失败'
  } finally {
    favLoading.value = false
  }
}

// 打开收藏夹
function openFolder(f: { id: number; title: string }) {
  activeFav.value = f
  favVideos.value = []
  exitBatchMode()
  loadFolderVideos(f.id, 1)
}

// 加载收藏夹内视频
async function loadFolderVideos(id: number, page: number) {
  favVidLoading.value = true
  favVidError.value = ''
  try {
    const res = await authApi.getFavoriteVideos(id, page)
    if (page === 1) favVideos.value = res.list
    else favVideos.value.push(...res.list)
    favVidTotal.value = res.total
    favVidPage.value = page
  } catch (e: any) {
    favVidError.value = e.message || '加载失败'
  } finally {
    favVidLoading.value = false
  }
}

// 点击视频 → 解析
function parseVideo(bvid: string) {
  const url = `https://www.bilibili.com/video/${bvid}`
  videoStore.inputUrl = url
  authStore.toggleProfile()
  videoStore.smartParse(url)
  toast?.('开始解析...', 'info')
}

// 面板打开时自动加载
watch(() => authStore.profilePanelOpen, (open) => {
  if (open && authStore.isLoggedIn && !subList.value.length) {
    loadSubmissions(1)
  }
  if (!open) exitBatchMode()
})
</script>

<style lang="scss" scoped>
@use '@/styles/mixins' as *;

// ---- 侧边栏容器 ----
.up-overlay {
  position: fixed; inset: 0; z-index: 9998;
  display: flex; justify-content: flex-end;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
}

.up-panel {
  width: 400px; max-width: 95vw; height: 100vh;
  @include glass-elevated;
  display: flex; flex-direction: column;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.3);
  position: relative;
}

.up-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--color-border);
  h3 { font-size: var(--font-size-md); display: flex; align-items: center; gap: var(--spacing-sm); }
}

.up-close {
  @include btn-reset;
  width: 28px; height: 28px; border-radius: 50%;
  color: var(--color-text-secondary); font-size: 1rem;
  &:hover { color: var(--color-text-primary); background: var(--color-bg-hover); }
}

.up-body {
  flex: 1; overflow-y: auto;
  padding: var(--spacing-sm) var(--spacing-md);
  padding-bottom: 72px; // 底部操作栏留空
  display: flex; flex-direction: column; gap: var(--spacing-sm);
}

// ---- 紧凑用户卡片 ----
.up-card {
  background: var(--color-bg-input);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm) var(--spacing-md);

  &__top {
    display: flex; align-items: center; gap: var(--spacing-sm);
  }
  &__avatar {
    width: 36px; height: 36px; border-radius: 50%;
    object-fit: cover; flex-shrink: 0;
    border: 2px solid var(--color-primary);
  }
  &__info { display: flex; flex-direction: column; gap: 2px; }
  &__name {
    font-size: var(--font-size-sm); font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
  }
  &__vip {
    font-size: 10px; padding: 1px 6px; border-radius: var(--radius-full);
    background: var(--color-bg-hover); color: var(--color-text-secondary);
    font-weight: var(--font-weight-bold); width: fit-content;
    &.active { background: linear-gradient(135deg, #FB7299, #FF9B8B); color: white; }
  }

  // 迷你数据行
  &__stats {
    display: flex; align-items: center; gap: 8px;
    margin-top: 8px; padding-top: 8px;
    border-top: 1px solid var(--color-border);
    flex-wrap: wrap;
    &--loading { gap: 6px; }
  }
}

.up-mini {
  font-size: 11px; color: var(--color-text-secondary);
  display: flex; align-items: center; gap: 4px;
  i { font-size: 10px; }
  &--exp {
    flex: 1; display: flex; align-items: center; gap: 4px;
    span { font-size: 10px; color: var(--color-blue); font-weight: 600; }
  }
}

.up-mini-nums {
  font-size: 10px; color: var(--color-text-placeholder);
  white-space: nowrap;
}
.up-mini-bar {
  flex: 1; height: 4px; background: var(--color-bg-hover);
  border-radius: 2px; overflow: hidden; min-width: 40px;
}
.up-mini-fill {
  height: 100%; border-radius: 2px;
  background: linear-gradient(90deg, #00A1D6, #FB7299);
  transition: width 0.5s ease;
}
.up-mini-skeleton {
  width: 50px; height: 14px; border-radius: 4px;
  background: var(--color-bg-hover); animation: pulse 1.5s ease-in-out infinite;
}

// ---- Tab ----
.up-tabs {
  display: flex; gap: 0; border-bottom: 1px solid var(--color-border);
}
.up-tab {
  @include btn-reset;
  flex: 1; padding: 8px; font-size: var(--font-size-sm);
  color: var(--color-text-secondary); border-bottom: 2px solid transparent;
  transition: all 0.2s;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  &:hover { color: var(--color-text-primary); }
  &.active { color: var(--color-primary); border-bottom-color: var(--color-primary); }
}

// ==================== 批量操作头部 ====================
.up-batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 4px;
  gap: 8px;
}

.up-batch-toggle {
  @include btn-reset;
  padding: 5px 14px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  background: var(--color-bg-input);
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;

  &:hover {
    color: var(--color-primary);
    border-color: rgba(251, 114, 153, 0.3);
    background: rgba(251, 114, 153, 0.08);
  }

  &.active {
    color: #fff;
    background: linear-gradient(135deg, #FB7299, #00A1D6);
    border-color: transparent;
  }
}

.up-select-all {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  transition: all 0.15s;

  &:hover {
    color: var(--color-text-primary);
    background: var(--color-bg-hover);
  }
}

// ==================== 自定义 Checkbox ====================
.up-checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 5px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.04);
  flex-shrink: 0;
  transition: all 0.2s;

  i {
    font-size: 10px;
    color: white;
    transform: scale(0);
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  &.checked {
    background: linear-gradient(135deg, #FB7299, #00A1D6);
    border-color: transparent;
    box-shadow: 0 2px 8px rgba(251, 114, 153, 0.3);

    i {
      transform: scale(1);
    }
  }
}

// ---- 视频列表 ----
.up-list-area {
  display: flex; flex-direction: column; gap: var(--spacing-xs);
  flex: 1;
}

.up-video {
  display: flex; gap: var(--spacing-sm); padding: var(--spacing-xs);
  border-radius: var(--radius-sm); cursor: pointer;
  transition: all 0.2s;
  align-items: center;
  border: 1px solid transparent;

  &:hover { background: var(--color-bg-hover); }

  &--selected {
    background: rgba(251, 114, 153, 0.08) !important;
    border-color: rgba(251, 114, 153, 0.2);
  }

  &__thumb {
    position: relative;
    flex-shrink: 0;
    width: 100px;
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  &__cover {
    width: 100%; height: 60px;
    object-fit: cover; display: block;
    background: var(--color-bg-hover);
  }
  &__dur-badge {
    position: absolute;
    bottom: 3px; right: 3px;
    background: rgba(0, 0, 0, 0.75);
    color: #fff;
    font-size: 9px;
    font-weight: 600;
    padding: 1px 4px;
    border-radius: 3px;
    line-height: 1.3;
  }
  &__qbadge {
    position: absolute;
    top: 3px; left: 3px;
    background: rgba(0, 161, 214, 0.85);
    color: #fff;
    font-size: 8px;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 3px;
    line-height: 1.3;
  }
  &__meta {
    flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 4px;
  }
  &__title {
    font-size: var(--font-size-xs); color: var(--color-text-primary);
    @include text-ellipsis; font-weight: var(--font-weight-medium);
  }
  &__info {
    font-size: 10px; color: var(--color-text-secondary);
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    span {
      display: inline-flex; align-items: center; gap: 2px; white-space: nowrap;
    }
    i { font-size: 9px; opacity: 0.7; transform: translateY(0.5px); }
  }
  &__dur, &__up {
    color: var(--color-text-placeholder); font-size: 10px;
  }
  &__progress {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 3px;
    background: rgba(255, 255, 255, 0.15);
  }
  &__progress-fill {
    height: 100%;
    background: #00a1d6;
    border-radius: 0 2px 2px 0;
    transition: width 0.3s;
  }
}

// ---- 搜索框 ----
.up-search-bar {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 10px; margin-bottom: 6px;
  background: var(--color-bg-hover);
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  transition: border-color 0.2s;
  &:focus-within {
    border-color: rgba(0, 161, 214, 0.4);
  }
  i { font-size: 11px; color: var(--color-text-placeholder); }
  input {
    flex: 1; border: none; outline: none;
    background: transparent; color: var(--color-text-primary);
    font-size: 12px;
    &::placeholder { color: var(--color-text-placeholder); }
  }
}

// ---- 收藏夹文件夹 ----
.up-folder {
  display: flex; align-items: center; gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-xs); cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
  &:hover { background: var(--color-bg-hover); }
  > i:first-child { color: var(--color-blue); font-size: 14px; }
  &__name { flex: 1; font-size: var(--font-size-sm); color: var(--color-text-primary); @include text-ellipsis; }
  &__count { font-size: 11px; color: var(--color-text-secondary); }
  &__arrow { font-size: 10px; color: var(--color-text-placeholder); }
}

.up-folder-back {
  display: flex; align-items: center; gap: var(--spacing-sm);
  padding: var(--spacing-xs) 0; cursor: pointer; font-size: var(--font-size-sm);
  color: var(--color-primary); font-weight: var(--font-weight-medium);
  &:hover { opacity: 0.8; }
  i { font-size: 12px; }
}

// ---- 加载更多 ----
.up-loadmore {
  @include btn-reset;
  padding: 8px; text-align: center; font-size: var(--font-size-xs);
  color: var(--color-primary); border-radius: var(--radius-sm);
  &:hover { background: var(--color-primary-light); }
  &:disabled { color: var(--color-text-placeholder); }
}

// ---- 未登录入口 ----
.up-login-prompt {
  display: flex; flex-direction: column; align-items: center; gap: var(--spacing-md);
  padding: var(--spacing-2xl) var(--spacing-lg);
  color: var(--color-text-secondary);
  > i { font-size: 2.5rem; opacity: 0.4; color: var(--color-primary); }
  p { font-size: var(--font-size-sm); }
}

.up-login-btn {
  @include btn-reset;
  padding: 10px 28px; border-radius: var(--radius-full);
  background: linear-gradient(135deg, #FB7299, #FF9B8B);
  color: white; font-size: var(--font-size-sm); font-weight: var(--font-weight-bold);
  display: flex; align-items: center; gap: 6px;
  box-shadow: 0 4px 12px rgba(251, 114, 153, 0.35);
  transition: all 0.2s;
  &:hover { filter: brightness(1.08); transform: translateY(-1px); }
  &:active { transform: translateY(0); }
}

// ---- 空 / 错误 ----
.up-empty {
  display: flex; flex-direction: column; align-items: center; gap: var(--spacing-sm);
  padding: var(--spacing-2xl); color: var(--color-text-secondary);
  i { font-size: 1.5rem; opacity: 0.3; }
  p { font-size: var(--font-size-sm); }
}
.up-error-box {
  display: flex; flex-direction: column; align-items: center; gap: var(--spacing-sm);
  padding: var(--spacing-lg); color: var(--color-text-secondary);
  p { font-size: var(--font-size-sm); }
  button {
    @include btn-reset; padding: 6px 16px; border-radius: var(--radius-sm);
    background: var(--color-primary); color: white; font-size: var(--font-size-xs);
    &:hover { filter: brightness(1.08); }
  }
}

// ---- 骨架屏 ----
.up-skeleton-list { display: flex; flex-direction: column; gap: var(--spacing-xs); }
.up-skeleton-item {
  height: 60px; border-radius: var(--radius-sm);
  background: var(--color-bg-hover); animation: pulse 1.5s ease-in-out infinite;
}

// ==================== 底部浮动操作栏 ====================
.up-batch-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: rgba(15, 17, 22, 0.88);
  backdrop-filter: blur(16px) saturate(1.4);
  -webkit-backdrop-filter: blur(16px) saturate(1.4);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  z-index: 10;

  &__info {
    flex: 1;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-primary);
    display: flex;
    align-items: center;
    gap: 6px;

    i { font-size: 14px; }
  }

  &__qn {
    appearance: none;
    -webkit-appearance: none;
    padding: 5px 24px 5px 10px;
    border-radius: var(--radius-full);
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-primary);
    background: var(--color-bg-input) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23999' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E") no-repeat right 8px center;
    border: 1px solid var(--color-border);
    cursor: pointer;
    transition: all 0.2s;
    min-width: 70px;

    &:hover {
      border-color: rgba(251, 114, 153, 0.4);
    }

    &:focus {
      outline: none;
      border-color: var(--color-primary);
      box-shadow: 0 0 0 2px rgba(251, 114, 153, 0.15);
    }

    option {
      background: var(--color-bg-primary);
      color: var(--color-text-primary);
    }
  }

  &__cancel {
    @include btn-reset;
    padding: 7px 16px;
    border-radius: var(--radius-full);
    font-size: 12px;
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border);
    transition: all 0.2s;

    &:hover {
      color: var(--color-text-primary);
      background: var(--color-bg-hover);
    }
  }

  &__start {
    @include btn-reset;
    padding: 7px 20px;
    border-radius: var(--radius-full);
    font-size: 12px;
    font-weight: 700;
    color: white;
    background: linear-gradient(135deg, #FB7299, #00A1D6);
    display: flex;
    align-items: center;
    gap: 6px;
    box-shadow: 0 4px 12px rgba(251, 114, 153, 0.3);
    transition: all 0.2s;

    &:hover:not(:disabled) {
      filter: brightness(1.1);
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(251, 114, 153, 0.4);
    }

    &:active:not(:disabled) { transform: translateY(0); }

    &:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }
  }
}

// 操作栏入场动画
.bar-slide-enter-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.bar-slide-leave-active {
  transition: all 0.2s ease;
}
.bar-slide-enter-from {
  transform: translateY(100%);
  opacity: 0;
}
.bar-slide-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

// ---- Panel Transition ----
.panel-enter-active { transition: all 0.3s var(--ease-out); }
.panel-leave-active { transition: all 0.2s ease; }
.panel-enter-from, .panel-leave-to { opacity: 0; .up-panel { transform: translateX(100%); } }
</style>
