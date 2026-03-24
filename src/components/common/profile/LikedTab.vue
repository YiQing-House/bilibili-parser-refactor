<template>
  <div class="up-list-area">
    <!-- 搜索框 -->
    <div class="up-search-bar">
      <i class="fas fa-search"></i>
      <input v-model="search" placeholder="搜索点赞视频..." />
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
        <i class="fas fa-inbox"></i><p>暂无点赞视频</p>
      </div>
      <div class="up-empty" v-else-if="!filtered.length && search">
        <i class="fas fa-search"></i><p>未找到匹配视频</p>
      </div>
      <VideoItem
        v-for="v in filtered" :key="v.bvid"
        :video="v"
        @click="$emit('parse', v.bvid)"
      />
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
    v.title?.toLowerCase().includes(q) || v.upper?.toLowerCase().includes(q)
  )
})

const sentinelRef = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

function setupObserver() {
  if (observer) observer.disconnect()
  const el = sentinelRef.value
  if (!el) return
  // 找到最近的滚动容器作为 root
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
</script>

<style lang="scss" src="./_shared.scss"></style>

