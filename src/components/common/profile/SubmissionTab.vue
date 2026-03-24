<template>
  <div class="up-list-area">
    <!-- 批量操作头部 -->
    <div class="up-batch-bar">
      <button class="up-batch-toggle" :class="{ active: batchMode }" @click="$emit('toggle-batch')">
        <i class="fas fa-download"></i> {{ batchMode ? '退出批量' : '批量下载' }}
      </button>
      <label v-if="batchMode && list.length" class="up-select-all" @click.prevent="$emit('toggle-select-all')">
        <span :class="['up-checkbox', { checked: allSelected }]">
          <i v-if="allSelected" class="fas fa-check"></i>
        </span>
        <span>{{ allSelected ? '取消全选' : '全选' }}</span>
      </label>
    </div>

    <div v-if="loading && !list.length" class="up-skeleton-list">
      <div class="up-skeleton-item" v-for="i in 4" :key="i"></div>
    </div>
    <div v-else-if="error" class="up-error-box">
      <p>{{ error }}</p>
      <button @click="$emit('retry')"><i class="fas fa-redo"></i> 重试</button>
    </div>
    <template v-else>
      <div class="up-empty" v-if="!list.length">
        <i class="fas fa-inbox"></i><p>暂无投稿</p>
      </div>
      <VideoItem
        v-for="v in list" :key="v.bvid"
        :video="v"
        :selectable="batchMode"
        :selected="selectedSet.has(v.bvid)"
        :quality-badge="qualityLabel(v.maxQuality)"
        @click="batchMode ? $emit('toggle-select', v.bvid) : $emit('parse', v.bvid)"
      >
        <template #info>
          <span class="up-video__info">
            <span v-if="v.created"><i class="fas fa-clock"></i> {{ fmtDate(v.created) }}</span>
            <span><i class="fas fa-play"></i> {{ fmt(v.plays) }}</span>
            <span v-if="v.danmakus != null"><i class="fas fa-bars-staggered"></i> {{ fmt(v.danmakus) }}</span>
          </span>
          <span class="up-video__info">
            <span v-if="v.comment != null"><i class="fas fa-comment"></i> {{ fmt(v.comment) }}</span>
            <span v-if="v.favorites != null"><i class="fas fa-star"></i> {{ fmt(v.favorites) }}</span>
          </span>
        </template>
      </VideoItem>
      <div v-if="list.length < total" ref="sentinelRef" class="up-scroll-sentinel">
        <span v-if="loading" class="up-scroll-hint"><i class="fas fa-spinner fa-spin"></i> 加载中...</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { QUALITY_MAP } from '@/types/video'
import VideoItem from './VideoItem.vue'

const props = defineProps<{
  list: any[]
  total: number
  loading: boolean
  error: string
  batchMode: boolean
  selectedSet: Set<string>
  allSelected: boolean
}>()

const emit = defineEmits<{
  'load-more': []
  'retry': []
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
      if (e.isIntersecting && !props.loading && props.list.length < props.total) {
        emit('load-more')
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
function qualityLabel(qn: number | undefined) {
  if (!qn) return ''
  return QUALITY_MAP[qn] || ''
}
</script>

<style lang="scss" src="./_shared.scss"></style>

