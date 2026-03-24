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

            <!-- ========== 下载统计 ========== -->
            <div class="up-dl-stats">
              <div class="up-dl-stats__item">
                <i class="fas fa-download"></i>
                <span class="up-dl-stats__val">{{ downloadStore.downloadStats.totalCount }}</span>
                <span class="up-dl-stats__label">已下载</span>
              </div>
              <div class="up-dl-stats__item">
                <i class="fas fa-database"></i>
                <span class="up-dl-stats__val">{{ downloadStore.formatSize(downloadStore.downloadStats.totalSize) }}</span>
                <span class="up-dl-stats__label">累计大小</span>
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

              <button :class="['up-tab', { active: tab === 'history' }]" @click="switchTab('history')">
                <i class="fas fa-history"></i> 历史
              </button>
            </div>

            <!-- ========== Tab 内容 ========== -->
            <SubmissionTab
              v-if="authStore.isLoggedIn && tab === 'submissions'"
              :list="subList" :total="subTotal" :loading="subLoading" :error="subError"
              :batch-mode="batchMode === 'sub'" :selected-set="selectedSub" :all-selected="isAllSelectedSub"
              @load-more="loadSubmissions(subPage + 1)"
              @retry="loadSubmissions(1)"
              @parse="parseVideo"
              @toggle-batch="toggleBatchMode('sub')"
              @toggle-select="toggleSelect('sub', $event)"
              @toggle-select-all="toggleSelectAll('sub')"
            />

            <FavoritesTab
              v-if="authStore.isLoggedIn && tab === 'favorites'"
              :folders="favFolders" :loading="favLoading" :error="favError"
              :active-folder="activeFav" :videos="favVideos" :vid-total="favVidTotal"
              :vid-loading="favVidLoading" :vid-error="favVidError"
              :batch-mode="batchMode === 'fav'" :selected-set="selectedFav" :all-selected="isAllSelectedFav"
              @open-folder="openFolder"
              @back="activeFav = null; exitBatchMode()"
              @load-more-videos="loadFolderVideos(activeFav!.id, favVidPage + 1)"
              @retry-folders="loadFavorites"
              @retry-videos="loadFolderVideos(activeFav!.id, 1)"
              @parse="parseVideo"
              @toggle-batch="toggleBatchMode('fav')"
              @toggle-select="toggleSelect('fav', $event)"
              @toggle-select-all="toggleSelectAll('fav')"
            />



            <HistoryTab
              v-if="authStore.isLoggedIn && tab === 'history'"
              :list="historyList" :has-more="historyHasMore" :loading="historyLoading" :error="historyError"
              @load-more="loadHistoryMore"
              @retry="loadHistory"
              @parse="parseVideo"
            />
          </div>

          <!-- ========== 底部浮动操作栏 ========== -->
          <BatchFooter
            :selected-count="selectedCount"
            :downloading="batchDownloading"
            :progress="batchProgress"
            @cancel="exitBatchMode"
            @start="startBatchDownload"
          />
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- 扫码登录弹窗 -->
  <LoginModal v-model:visible="showLogin" @login-success="onLoginSuccess" />
</template>

<script setup lang="ts">
import { ref, computed, reactive, inject, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useVideoStore } from '@/stores/video'
import { useDownloadStore } from '@/stores/download'
import * as authApi from '@/services/auth'
import { buildStreamUrl } from '@/services/bilibili'
import { QUALITY_OPTIONS } from '@/types/video'
import { downloadAndMerge, type MergeProgress } from '@/services/ffmpegMerge'
import LoginModal from '@/components/common/LoginModal.vue'
import SubmissionTab from './profile/SubmissionTab.vue'
import FavoritesTab from './profile/FavoritesTab.vue'

import HistoryTab from './profile/HistoryTab.vue'
import BatchFooter from './profile/BatchFooter.vue'

const authStore = useAuthStore()
const videoStore = useVideoStore()
const downloadStore = useDownloadStore()
const toast = inject<(m: string, t: string) => void>('toast')

// 扫码登录弹窗
const showLogin = ref(false)
function onLoginSuccess() {
  showLogin.value = false
  toast?.('登录成功 🎉', 'success')
  loadSubmissions(1)
}

// --- Tab ---
const tab = ref<'submissions' | 'favorites' | 'history'>('submissions')

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



// --- 历史 ---
const historyList = ref<any[]>([])
const historyCursor = ref<{ max: number; viewAt: number }>({ max: 0, viewAt: 0 })
const historyHasMore = ref(false)
const historyLoading = ref(false)
const historyError = ref('')

// ==================== 批量下载 ====================
const batchMode = ref<'sub' | 'fav' | null>(null)
const selectedSub = reactive(new Set<string>())
const selectedFav = reactive(new Set<string>())
const batchDownloading = ref(false)
const batchProgress = ref('提交中...')

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
  if (batchMode.value === type) exitBatchMode()
  else { batchMode.value = type; selectedSub.clear(); selectedFav.clear() }
}

function exitBatchMode() {
  batchMode.value = null; selectedSub.clear(); selectedFav.clear()
}

function toggleSelect(type: 'sub' | 'fav', bvid: string) {
  const set = type === 'sub' ? selectedSub : selectedFav
  if (set.has(bvid)) set.delete(bvid); else set.add(bvid)
}

function toggleSelectAll(type: 'sub' | 'fav') {
  if (type === 'sub') {
    if (isAllSelectedSub.value) selectedSub.clear()
    else subList.value.forEach(v => selectedSub.add(v.bvid))
  } else {
    if (isAllSelectedFav.value) selectedFav.clear()
    else favVideos.value.forEach(v => selectedFav.add(v.bvid))
  }
}

function sanitize(s: string) { return s.replace(/[<>:"/\\|?*]/g, '_') }

async function startBatchDownload(qn: number) {
  const type = batchMode.value
  if (!type) return
  const selected = type === 'sub' ? [...selectedSub] : [...selectedFav]
  const videoList = type === 'sub' ? subList.value : favVideos.value
  if (!selected.length) { toast?.('请先选择要下载的视频', 'error'); return }

  batchDownloading.value = true
  const total = selected.length
  toast?.(`开始批量下载 ${total} 个视频 (${QUALITY_OPTIONS.find(q => q.qn === qn)?.label || qn})...`, 'success')

  let sc = 0, fc = 0
  for (let i = 0; i < total; i++) {
    const bvid = selected[i]
    const video = videoList.find((v: any) => v.bvid === bvid)
    const title = sanitize(video?.title || bvid)
    const url = `https://www.bilibili.com/video/${bvid}`

    batchProgress.value = `(${i + 1}/${total}) 处理中...`
    try {
      const vsUrl = buildStreamUrl(url, 'video', qn)
      const asUrl = buildStreamUrl(url, 'audio', qn)
      await downloadAndMerge(vsUrl, asUrl, `${title}.mp4`, (p: MergeProgress) => {
        batchProgress.value = `(${i + 1}/${total}) ${p.message}`
      })
      sc++; toast?.(`✅ ${title} 下载完成`, 'success')
    } catch (e: any) {
      fc++; toast?.(`❌ ${title} 下载失败: ${e.message}`, 'error')
    }
    if (i < total - 1) await new Promise(r => setTimeout(r, 300))
  }
  batchDownloading.value = false; batchProgress.value = '提交中...'; exitBatchMode()
  toast?.(`批量下载完成：成功 ${sc}，失败 ${fc}`, sc > 0 ? 'success' : 'error')
}

// ==================== 通用函数 ====================
const expPct = computed(() => {
  const d = authStore.userDetail
  if (!d || !d.nextLevelExp) return 0
  return Math.min(100, Math.round((d.currentExp / d.nextLevelExp) * 100))
})

function fmt(n: number) { return Math.floor(n).toLocaleString('zh-CN') }

// ==================== 数据加载 ====================
async function loadSubmissions(page: number) {
  subLoading.value = true; subError.value = ''
  try {
    const res = await authApi.getSubmissions(page)
    if (page === 1) subList.value = res.list; else subList.value.push(...res.list)
    subTotal.value = res.total; subPage.value = page
  } catch (e: any) { subError.value = e.message || '加载失败' }
  finally { subLoading.value = false }
}

async function loadFavorites() {
  favLoading.value = true; favError.value = ''
  try { favFolders.value = await authApi.getFavorites() }
  catch (e: any) { favError.value = e.message || '加载失败' }
  finally { favLoading.value = false }
}

function openFolder(f: { id: number; title: string }) {
  activeFav.value = f; favVideos.value = []; exitBatchMode()
  loadFolderVideos(f.id, 1)
}

async function loadFolderVideos(id: number, page: number) {
  favVidLoading.value = true; favVidError.value = ''
  try {
    const res = await authApi.getFavoriteVideos(id, page)
    if (page === 1) favVideos.value = res.list; else favVideos.value.push(...res.list)
    favVidTotal.value = res.total; favVidPage.value = page
  } catch (e: any) { favVidError.value = e.message || '加载失败' }
  finally { favVidLoading.value = false }
}



async function loadHistory() {
  historyLoading.value = true; historyError.value = ''; historyCursor.value = { max: 0, viewAt: 0 }
  try {
    const res = await authApi.getHistory()
    historyList.value = res.list; historyHasMore.value = res.hasMore
    historyCursor.value = res.cursor || { max: 0, viewAt: 0 }
  } catch (e: any) { historyError.value = e.message || '加载失败' }
  finally { historyLoading.value = false }
}

async function loadHistoryMore() {
  historyLoading.value = true
  try {
    const res = await authApi.getHistory(historyCursor.value.max, historyCursor.value.viewAt)
    historyList.value.push(...res.list); historyHasMore.value = res.hasMore
    historyCursor.value = res.cursor || { max: 0, viewAt: 0 }
  } catch (e: any) { historyError.value = e.message || '加载失败' }
  finally { historyLoading.value = false }
}

function switchTab(t: 'submissions' | 'favorites' | 'history') {
  tab.value = t; exitBatchMode()
  if (t === 'submissions' && !subList.value.length) loadSubmissions(1)
  if (t === 'favorites' && !favFolders.value.length) loadFavorites()
  if (t === 'history' && !historyList.value.length) loadHistory()
}

function parseVideo(bvid: string) {
  const url = `https://www.bilibili.com/video/${bvid}`
  videoStore.inputUrl = url; authStore.toggleProfile()
  videoStore.smartParse(url); toast?.('开始解析...', 'info')
}

watch(() => authStore.profilePanelOpen, (open) => {
  if (open && authStore.isLoggedIn && !subList.value.length) loadSubmissions(1)
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
  padding-bottom: 72px;
  display: flex; flex-direction: column; gap: var(--spacing-sm);
}

// ---- 紧凑用户卡片 ----
.up-card {
  background: var(--color-bg-input);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm) var(--spacing-md);

  &__top { display: flex; align-items: center; gap: var(--spacing-sm); }
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
  &__stats {
    display: flex; align-items: center; gap: 8px;
    margin-top: 8px; padding-top: 8px;
    border-top: 1px solid var(--color-border); flex-wrap: wrap;
    &--loading { gap: 6px; }
  }
}

.up-dl-stats {
  display: flex; gap: 12px; margin-top: 8px;
  &__item {
    flex: 1; display: flex; flex-direction: column; align-items: center;
    gap: 2px; padding: 8px;
    background: var(--color-bg-input); border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    i { font-size: 14px; color: var(--color-primary); margin-bottom: 2px; }
  }
  &__val {
    font-size: 16px; font-weight: 700;
    background: linear-gradient(135deg, #fb7299, #00a1d6);
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  &__label { font-size: 10px; color: var(--color-text-secondary); }
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
.up-mini-nums { font-size: 10px; color: var(--color-text-placeholder); white-space: nowrap; }
.up-mini-bar { flex: 1; height: 4px; background: var(--color-bg-hover); border-radius: 2px; overflow: hidden; min-width: 40px; }
.up-mini-fill { height: 100%; border-radius: 2px; background: linear-gradient(90deg, #00A1D6, #FB7299); transition: width 0.5s ease; }
.up-mini-skeleton { width: 50px; height: 14px; border-radius: 4px; background: var(--color-bg-hover); animation: pulse 1.5s ease-in-out infinite; }

// ---- Tab ----
.up-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--color-border); }
.up-tab {
  @include btn-reset;
  flex: 1; padding: 8px; font-size: var(--font-size-sm);
  color: var(--color-text-secondary); border-bottom: 2px solid transparent;
  transition: all 0.2s;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  &:hover { color: var(--color-text-primary); }
  &.active { color: var(--color-primary); border-bottom-color: var(--color-primary); }
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

// ---- 移动端适配 ----
@include mobile {
  .up-panel {
    width: 100vw;
    max-width: 100vw;
  }
  .up-head {
    padding: var(--spacing-sm) var(--spacing-md);
  }
  .up-body {
    padding: var(--spacing-xs) var(--spacing-sm);
    padding-bottom: 72px;
  }
}

// ---- Panel Transition ----
.panel-enter-active { transition: all 0.3s var(--ease-out); }
.panel-leave-active { transition: all 0.2s ease; }
.panel-enter-from, .panel-leave-to { opacity: 0; .up-panel { transform: translateX(100%); } }
</style>
