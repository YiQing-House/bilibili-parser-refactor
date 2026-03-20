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

            <!-- ========== Tab 切换 ========== -->
            <div class="up-tabs">
              <button :class="['up-tab', { active: tab === 'submissions' }]" @click="switchTab('submissions')">
                <i class="fas fa-video"></i> 投稿
              </button>
              <button :class="['up-tab', { active: tab === 'favorites' }]" @click="switchTab('favorites')">
                <i class="fas fa-star"></i> 收藏夹
              </button>
            </div>

            <!-- ========== 投稿列表 ========== -->
            <div v-if="tab === 'submissions'" class="up-list-area">
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
                <div v-for="v in subList" :key="v.bvid" class="up-video" @click="parseVideo(v.bvid)">
                  <img :src="v.cover" class="up-video__cover" loading="lazy" referrerpolicy="no-referrer" />
                  <div class="up-video__meta">
                    <span class="up-video__title">{{ v.title }}</span>
                    <span class="up-video__info">
                      <i class="fas fa-play"></i> {{ fmt(v.plays) }}
                      <span class="up-video__dur">{{ v.duration }}</span>
                    </span>
                  </div>
                </div>
                <button v-if="subList.length < subTotal" class="up-loadmore" @click="loadSubmissions(subPage + 1)" :disabled="subLoading">
                  {{ subLoading ? '加载中...' : '加载更多' }}
                </button>
              </template>
            </div>

            <!-- ========== 收藏夹列表 ========== -->
            <div v-if="tab === 'favorites'" class="up-list-area">
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
                <div class="up-folder-back" @click="activeFav = null">
                  <i class="fas fa-arrow-left"></i>
                  <span>{{ activeFav.title }}</span>
                </div>
                <div v-if="favVidLoading && !favVideos.length" class="up-skeleton-list">
                  <div class="up-skeleton-item" v-for="i in 4" :key="i"></div>
                </div>
                <div v-else-if="favVidError" class="up-error-box">
                  <p>{{ favVidError }}</p>
                  <button @click="loadFolderVideos(activeFav!.id, 1)"><i class="fas fa-redo"></i> 重试</button>
                </div>
                <template v-else>
                  <div v-for="v in favVideos" :key="v.bvid" class="up-video" @click="parseVideo(v.bvid)">
                    <img :src="v.cover" class="up-video__cover" loading="lazy" referrerpolicy="no-referrer" />
                    <div class="up-video__meta">
                      <span class="up-video__title">{{ v.title }}</span>
                      <span class="up-video__info">
                        <i class="fas fa-play"></i> {{ fmt(v.plays) }}
                        <span v-if="v.upper" class="up-video__up">{{ v.upper }}</span>
                      </span>
                    </div>
                  </div>
                  <button v-if="favVideos.length < favVidTotal" class="up-loadmore" @click="loadFolderVideos(activeFav!.id, favVidPage + 1)" :disabled="favVidLoading">
                    {{ favVidLoading ? '加载中...' : '加载更多' }}
                  </button>
                </template>
              </template>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, inject } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useVideoStore } from '@/stores/video'
import * as authApi from '@/services/auth'

const authStore = useAuthStore()
const videoStore = useVideoStore()
const toast = inject<(m: string, t: string) => void>('toast')

// --- Tab ---
const tab = ref<'submissions' | 'favorites'>('submissions')

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

const expPct = computed(() => {
  const d = authStore.userDetail
  if (!d || !d.nextLevelExp) return 0
  return Math.min(100, Math.round((d.currentExp / d.nextLevelExp) * 100))
})

function fmt(n: number) { return Math.floor(n).toLocaleString('zh-CN') }

// 切换 tab
function switchTab(t: 'submissions' | 'favorites') {
  tab.value = t
  if (t === 'submissions' && !subList.value.length) loadSubmissions(1)
  if (t === 'favorites' && !favFolders.value.length) loadFavorites()
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
  if (open && !subList.value.length) {
    loadSubmissions(1)
  }
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

// ---- 视频列表 ----
.up-list-area {
  display: flex; flex-direction: column; gap: var(--spacing-xs);
  flex: 1;
}

.up-video {
  display: flex; gap: var(--spacing-sm); padding: var(--spacing-xs);
  border-radius: var(--radius-sm); cursor: pointer;
  transition: background var(--transition-fast);
  &:hover { background: var(--color-bg-hover); }

  &__cover {
    width: 100px; height: 60px; border-radius: var(--radius-sm);
    object-fit: cover; flex-shrink: 0; background: var(--color-bg-hover);
  }
  &__meta {
    flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 4px;
  }
  &__title {
    font-size: var(--font-size-xs); color: var(--color-text-primary);
    @include text-ellipsis; font-weight: var(--font-weight-medium);
  }
  &__info {
    font-size: 11px; color: var(--color-text-secondary);
    display: flex; align-items: center; gap: 6px;
    i { font-size: 10px; }
  }
  &__dur, &__up {
    color: var(--color-text-placeholder); font-size: 10px;
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

// ---- Transition ----
.panel-enter-active { transition: all 0.3s var(--ease-out); }
.panel-leave-active { transition: all 0.2s ease; }
.panel-enter-from, .panel-leave-to { opacity: 0; .up-panel { transform: translateX(100%); } }
</style>
