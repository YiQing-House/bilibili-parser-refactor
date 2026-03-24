<template>
  <div class="up-list-area">
    <!-- 搜索框 -->
    <div class="up-search-bar">
      <i class="fas fa-search"></i>
      <input v-model="search" placeholder="搜索观看历史..." />
    </div>

    <div v-if="loading && !list.length" class="up-skeleton-list">
      <div class="up-skeleton-item" v-for="i in 4" :key="i"></div>
    </div>
    <div v-else-if="error" class="up-error-box">
      <p>{{ error }}</p>
      <button @click="$emit('retry')"><i class="fas fa-redo"></i> 重试</button>
    </div>
    <template v-else>
      <div class="up-empty" v-if="!filtered.length && !search">
        <i class="fas fa-inbox"></i><p>暂无观看历史</p>
      </div>
      <div class="up-empty" v-else-if="!filtered.length && search">
        <i class="fas fa-search"></i><p>未找到匹配视频</p>
      </div>
      <VideoItem
        v-for="v in filtered" :key="v.bvid"
        :video="v"
        @click="$emit('parse', v.bvid)"
      >
        <template #info>
          <span class="up-video__info">
            <span v-if="v.upper"><i class="fas fa-user"></i> {{ v.upper }}</span>
            <span v-if="v.tag"><i class="fas fa-tag"></i> {{ v.tag }}</span>
          </span>
          <span class="up-video__info">
            <span><i class="fas fa-clock"></i> {{ fmtTimeAgo(v.viewAt) }}</span>
          </span>
        </template>
      </VideoItem>
      <div v-if="hasMore" ref="sentinelRef" class="up-scroll-sentinel">
        <span v-if="loading" class="up-scroll-hint"><i class="fas fa-spinner fa-spin"></i> 加载中...</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import VideoItem from './VideoItem.vue'

const props = defineProps<{
  list: any[]
  hasMore: boolean
  loading: boolean
  error: string
}>()

const emit = defineEmits<{
  'load-more': []
  'retry': []
  'parse': [bvid: string]
}>()

const search = ref('')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return props.list
  return props.list.filter(v =>
    v.title?.toLowerCase().includes(q) || v.upper?.toLowerCase().includes(q) || v.tag?.toLowerCase().includes(q)
  )
})

const sentinelRef = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

function setupObserver() {
  if (observer) observer.disconnect()
  const el = sentinelRef.value
  if (!el) return
  const scrollRoot = el.closest('.up-body') as Element | null
  observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting && !props.loading && props.hasMore) {
        emit('load-more')
      }
    }
  }, { root: scrollRoot, rootMargin: '200px' })
  observer.observe(el)
}

watch(sentinelRef, (v) => { if (v) setupObserver() })
onBeforeUnmount(() => observer?.disconnect())

function fmtTimeAgo(ts: number) {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - ts
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}天前`
  return new Date(ts * 1000).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}
</script>

<style lang="scss" src="./_shared.scss"></style>

