<template>
  <div class="up-list-area">
    <!-- 收藏夹目录 -->
    <template v-if="!activeFolder">
      <div v-if="loading && !folders.length" class="up-skeleton-list">
        <div class="up-skeleton-item" v-for="i in 3" :key="i"></div>
      </div>
      <div v-else-if="error" class="up-error-box">
        <p>{{ error }}</p>
        <button @click="$emit('retry-folders')"><i class="fas fa-redo"></i> 重试</button>
      </div>
      <template v-else>
        <div class="up-empty" v-if="!folders.length">
          <i class="fas fa-inbox"></i><p>暂无收藏夹</p>
        </div>
        <div v-for="f in folders" :key="f.id" class="up-folder" @click="$emit('open-folder', f)">
          <i class="fas fa-folder"></i>
          <span class="up-folder__name">{{ f.title }}</span>
          <span class="up-folder__count">{{ f.mediaCount }} 个</span>
          <i class="fas fa-chevron-right up-folder__arrow"></i>
        </div>
      </template>
    </template>

    <!-- 收藏夹内视频 -->
    <template v-else>
      <div class="up-folder-back" @click="$emit('back')">
        <i class="fas fa-arrow-left"></i>
        <span>{{ activeFolder.title }}</span>
      </div>

      <!-- 批量操作头部 -->
      <div class="up-batch-bar">
        <button class="up-batch-toggle" :class="{ active: batchMode }" @click="$emit('toggle-batch')">
          <i class="fas fa-download"></i> {{ batchMode ? '退出批量' : '批量下载' }}
        </button>
        <label v-if="batchMode && videos.length" class="up-select-all" @click.prevent="$emit('toggle-select-all')">
          <span :class="['up-checkbox', { checked: allSelected }]">
            <i v-if="allSelected" class="fas fa-check"></i>
          </span>
          <span>{{ allSelected ? '取消全选' : '全选' }}</span>
        </label>
      </div>

      <div v-if="vidLoading && !videos.length" class="up-skeleton-list">
        <div class="up-skeleton-item" v-for="i in 4" :key="i"></div>
      </div>
      <div v-else-if="vidError" class="up-error-box">
        <p>{{ vidError }}</p>
        <button @click="$emit('retry-videos')"><i class="fas fa-redo"></i> 重试</button>
      </div>
      <template v-else>
        <VideoItem
          v-for="v in videos" :key="v.bvid"
          :video="v"
          :selectable="batchMode"
          :selected="selectedSet.has(v.bvid)"
          @click="batchMode ? $emit('toggle-select', v.bvid) : $emit('parse', v.bvid)"
        >
          <template #info>
            <span class="up-video__info">
              <span v-if="v.upper"><i class="fas fa-user"></i> {{ v.upper }}</span>
              <span><i class="fas fa-play"></i> {{ fmt(v.plays) }}</span>
              <span v-if="v.danmakus != null"><i class="fas fa-bars-staggered"></i> {{ fmt(v.danmakus) }}</span>
            </span>
            <span class="up-video__info">
              <span v-if="v.favorites != null"><i class="fas fa-star"></i> {{ fmt(v.favorites) }}</span>
              <span v-if="v.pubdate"><i class="fas fa-clock"></i> {{ fmtDate(v.pubdate) }}</span>
            </span>
          </template>
        </VideoItem>
        <div v-if="videos.length < vidTotal" ref="sentinelRef" class="up-scroll-sentinel">
          <span v-if="vidLoading" class="up-scroll-hint"><i class="fas fa-spinner fa-spin"></i> 加载中...</span>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import VideoItem from './VideoItem.vue'

const props = defineProps<{
  folders: any[]
  loading: boolean
  error: string
  activeFolder: { id: number; title: string } | null
  videos: any[]
  vidTotal: number
  vidLoading: boolean
  vidError: string
  batchMode: boolean
  selectedSet: Set<string>
  allSelected: boolean
}>()

const emit = defineEmits<{
  'open-folder': [folder: { id: number; title: string }]
  'back': []
  'load-more-videos': []
  'retry-folders': []
  'retry-videos': []
  'parse': [bvid: string]
  'toggle-batch': []
  'toggle-select': [bvid: string]
  'toggle-select-all': []
}>()

const sentinelRef = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

function setupObserver() {
  if (observer) observer.disconnect()
  const el = sentinelRef.value
  if (!el) return
  const scrollRoot = el.closest('.up-body') as Element | null
  observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting && !props.vidLoading && props.videos.length < props.vidTotal) {
        emit('load-more-videos')
      }
    }
  }, { root: scrollRoot, rootMargin: '200px' })
  observer.observe(el)
}

watch(sentinelRef, (v) => { if (v) setupObserver() })
onBeforeUnmount(() => observer?.disconnect())

function fmt(n: number) { return Math.floor(n).toLocaleString('zh-CN') }
function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}
</script>

<style lang="scss" src="./_shared.scss"></style>

