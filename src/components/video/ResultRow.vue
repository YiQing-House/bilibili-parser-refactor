<template>
  <div class="rr" v-if="data">
    <!-- 封面 -->
    <a class="rr__cover" :href="biliUrl" target="_blank" rel="noopener" :title="data.title">
      <img :src="coverSrc" :alt="data.title" loading="lazy" referrerpolicy="no-referrer" />
      <span v-if="maxQualityLabel" class="rr__qbadge">{{ maxQualityLabel }}</span>
      <span v-if="durationText" class="rr__dur">{{ durationText }}</span>
    </a>

    <!-- 信息 -->
    <div class="rr__info">
      <div class="rr__title">{{ data.title }}</div>
      <div class="rr__meta">
        <span v-if="data.author"><i class="fas fa-user"></i> {{ data.author }}</span>
        <span v-if="data.bvid"><i class="fas fa-hashtag"></i> {{ data.bvid }}</span>
        <span v-if="pubdateText"><i class="fas fa-clock"></i> {{ pubdateText }}</span>
      </div>
      <div class="rr__stats">
        <span v-if="data.views != null"><i class="fas fa-play"></i> {{ fmt(data.views) }}</span>
        <span v-if="data.likes != null"><i class="fas fa-thumbs-up"></i> {{ fmt(data.likes) }}</span>
        <span v-if="data.coins != null"><i class="fas fa-coins"></i> {{ fmt(data.coins) }}</span>
        <span v-if="data.favorites != null"><i class="fas fa-star"></i> {{ fmt(data.favorites) }}</span>
        <span v-if="data.shares != null"><i class="fas fa-share"></i> {{ fmt(data.shares) }}</span>
        <span v-if="data.danmakus != null"><i class="fas fa-bars-staggered"></i> {{ fmt(data.danmakus) }}</span>
        <span v-if="data.replies != null"><i class="fas fa-comment"></i> {{ fmt(data.replies) }}</span>
      </div>
    </div>

    <!-- 操作 -->
    <div class="rr__actions">
      <button class="rr__dl" @click="handleDownload" :title="appStore.formatLabel + '下载'">
        <i class="fas fa-download"></i>
      </button>
      <button class="rr__btn" @click="copyDirectLink" title="复制直链">
        <i class="fas fa-link"></i>
      </button>
      <button v-if="coverSrc" class="rr__btn" @click="downloadCover" title="封面"><i class="fas fa-image"></i></button>
      <button v-if="data.cid" class="rr__btn" @click="downloadDanmaku" title="弹幕"><i class="fas fa-bars-staggered"></i></button>
      <button v-if="isMultiP" class="rr__btn" @click="pagesExpanded = !pagesExpanded" :title="pagesExpanded ? '收起分P' : '展开分P'">
        <i :class="pagesExpanded ? 'fas fa-chevron-up' : 'fas fa-list-ol'"></i>
      </button>
    </div>

    <!-- 多 P 分集列表 -->
    <div v-if="isMultiP && pagesExpanded" class="rr__pages">
      <div class="rr__pages-head">
        <span>分P列表（共{{ data.pages!.length }}P）</span>
        <button class="rr__pages-dlall" @click="handleDownloadAllPages" title="下载全部P">
          <i class="fas fa-download"></i> 全部下载
        </button>
      </div>
      <div v-for="p in data.pages" :key="p.cid" class="rr__page-item">
        <span class="rr__page-num">P{{ p.page }}</span>
        <span class="rr__page-title">{{ p.part }}</span>
        <span class="rr__page-dur">{{ fmtDur(p.duration) }}</span>
        <button class="rr__page-dl" @click="handleDownloadPage(p)" title="下载此P">
          <i class="fas fa-download"></i>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { VideoData } from '@/types/video'
import { QUALITY_MAP } from '@/types/video'
import { useAppStore } from '@/stores/app'
import { useDownloadStore } from '@/stores/download'
import { useVideoStore } from '@/stores/video'
import { buildCoverUrl, buildStreamUrl, buildDownloadUrl } from '@/services/bilibili'

const props = defineProps<{ data: VideoData }>()
const emit = defineEmits<{ (e: 'toast', msg: string, type: string): void }>()
const appStore = useAppStore()
const downloadStore = useDownloadStore()
const videoStore = useVideoStore()

const coverSrc = computed(() => {
  const pic = props.data.cover || props.data.thumbnail
  if (!pic) return ''
  if (pic.startsWith('//')) return `https:${pic}`
  return pic
})

const biliUrl = computed(() => {
  if (props.data.bvid) return `https://www.bilibili.com/video/${props.data.bvid}`
  return videoStore.inputUrl || '#'
})

const durationText = computed(() => {
  const d = props.data.duration
  if (!d) return ''
  if (typeof d === 'string') return d
  const h = Math.floor(d / 3600)
  const m = Math.floor((d % 3600) / 60)
  const s = d % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
})

const pubdateText = computed(() => {
  if (!props.data.pubdate) return ''
  const d = new Date(props.data.pubdate * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})

const maxQualityLabel = computed(() => {
  const qn = props.data.maxQuality
  if (!qn) return ''
  return QUALITY_MAP[qn] || ''
})

function fmt(n: number) {
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万'
  return n.toLocaleString('zh-CN')
}

function sanitize(s: string) { return s.replace(/[<>:"/\\|?*]/g, '_') }

function handleDownload() {
  const url = videoStore.inputUrl.trim()
  if (!url) return
  const title = sanitize(props.data.title || 'video')
  const qn = appStore.quality
  const maxQ = props.data.maxQuality || 80
  const actualQn = qn > maxQ ? maxQ : qn
  const qName = QUALITY_MAP[actualQn] || String(actualQn)
  const fname = `${qName}_${title}.mp4`
  const fmt = appStore.format

  if (fmt === 'cover') { downloadCover(); return }
  if (fmt === 'video+audio-separate') {
    emit('toast', '开始下载视频和音频...', 'success')
    downloadStore.directDownload(buildStreamUrl(url, 'video', actualQn), `${qName}_${title}_video.m4s`)
    setTimeout(() => downloadStore.directDownload(buildStreamUrl(url, 'audio', actualQn), `${qName}_${title}_audio.m4a`), 800)
    return
  }

  downloadStore.createTask(url, fname, actualQn, appStore.videoFormat)
    .then(() => { emit('toast', '下载任务已创建', 'success'); downloadStore.panelOpen = true })
    .catch((e: Error) => emit('toast', `下载失败: ${e.message}`, 'error'))
}

function downloadCover() {
  const url = videoStore.inputUrl.trim()
  if (!url) return
  downloadStore.directDownload(buildCoverUrl(url), `${sanitize(props.data.title || 'cover')}.jpg`)
  emit('toast', '封面下载已开始', 'success')
}

/** 复制视频直链到剪贴板 */
function copyDirectLink() {
  const url = props.data.url || (props.data.bvid ? `https://www.bilibili.com/video/${props.data.bvid}` : '')
  if (!url) { emit('toast', '无可用链接', 'error'); return }
  const directUrl = buildDownloadUrl(url, appStore.quality, appStore.videoFormat)
  navigator.clipboard.writeText(directUrl).then(() => {
    emit('toast', '直链已复制到剪贴板', 'success')
  }).catch(() => {
    emit('toast', '复制失败，请手动复制', 'error')
  })
}

function downloadDanmaku() {
  const cid = props.data.cid
  if (!cid) return
  downloadStore.directDownload(`/api/bilibili/danmaku/${cid}`, `${sanitize(props.data.title || 'danmaku')}_弹幕.xml`)
  emit('toast', '弹幕下载已开始', 'success')
}

// 多 P 支持
const pagesExpanded = ref(false)
const isMultiP = computed(() => (props.data.pages?.length || 0) > 1)

function fmtDur(d: number) {
  const m = Math.floor(d / 60)
  const s = d % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function handleDownloadPage(p: { page: number; part: string; cid: number }) {
  const url = `https://www.bilibili.com/video/${props.data.bvid}?p=${p.page}`
  const title = sanitize(`${props.data.title}_P${p.page}_${p.part}`)
  const qn = appStore.quality
  const maxQ = props.data.maxQuality || 80
  const actualQn = qn > maxQ ? maxQ : qn
  const qName = QUALITY_MAP[actualQn] || String(actualQn)
  const fname = `${qName}_${title}.mp4`
  downloadStore.createTask(url, fname, actualQn, appStore.videoFormat)
    .then(() => { emit('toast', `P${p.page} 下载任务已创建`, 'success'); downloadStore.panelOpen = true })
    .catch((e: Error) => emit('toast', `P${p.page} 下载失败: ${e.message}`, 'error'))
}

function handleDownloadAllPages() {
  const pages = props.data.pages
  if (!pages || pages.length === 0) return
  const qn = appStore.quality
  const maxQ = props.data.maxQuality || 80
  const actualQn = qn > maxQ ? maxQ : qn
  const qName = QUALITY_MAP[actualQn] || String(actualQn)

  for (const p of pages) {
    const url = `https://www.bilibili.com/video/${props.data.bvid}?p=${p.page}`
    const title = sanitize(`${props.data.title}_P${p.page}_${p.part}`)
    const fname = `${qName}_${title}.mp4`
    downloadStore.createTask(url, fname, actualQn, appStore.videoFormat).catch(() => {})
  }
  emit('toast', `已创建 ${pages.length} 个分P下载任务`, 'success')
  downloadStore.panelOpen = true
}
</script>

<style lang="scss" scoped>
@use '@/styles/mixins' as *;

.rr {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: background 0.2s;

  &:hover { background: rgba(255, 255, 255, 0.08); }

  // ---------- 封面 ----------
  &__cover {
    position: relative;
    flex-shrink: 0;
    width: 96px;
    border-radius: 6px;
    overflow: hidden;
    display: block;

    img {
      width: 100%;
      aspect-ratio: 16 / 9;
      object-fit: cover;
      display: block;
    }
  }

  &__qbadge {
    position: absolute;
    top: 3px; left: 3px;
    background: linear-gradient(135deg, #00A1D6, #0090BF);
    color: #fff;
    font-size: 9px;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 3px;
  }

  &__dur {
    position: absolute;
    bottom: 3px; right: 3px;
    background: rgba(0,0,0,0.75);
    color: #fff;
    font-size: 9px;
    font-weight: 600;
    padding: 1px 4px;
    border-radius: 3px;
  }

  // ---------- 信息 ----------
  &__info {
    flex: 1;
    min-width: 0;
  }

  &__title {
    font-size: 0.82rem;
    font-weight: 600;
    color: #f1f1f1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 4px;
  }

  &__meta {
    display: flex;
    gap: 10px;
    color: #A2A7B0;
    font-size: 0.68rem;
    margin-bottom: 2px;

    span {
      display: flex;
      align-items: center;
      gap: 3px;
      white-space: nowrap;
    }
    i { font-size: 0.6rem; opacity: 0.7; transform: translateY(0.5px); }
  }

  &__stats {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    color: #8a8f99;
    font-size: 0.64rem;

    span {
      display: flex;
      align-items: center;
      gap: 3px;
      white-space: nowrap;
    }
    i { font-size: 0.58rem; opacity: 0.6; transform: translateY(0.5px); }
  }

  // ---------- 操作 ----------
  &__actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  &__dl {
    width: 34px; height: 34px;
    border-radius: 8px;
    border: none;
    background: linear-gradient(135deg, #00A1D6, #0090BF);
    color: #fff;
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    box-shadow: 0 2px 8px rgba(0, 161, 214, 0.3);

    &:hover { transform: scale(1.08); filter: brightness(1.1); }
  }

  &__btn {
    width: 28px; height: 28px;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.05);
    color: #A2A7B0;
    font-size: 11px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;

    &:hover {
      color: #FB7299;
      border-color: rgba(251,114,153,0.3);
      background: rgba(251,114,153,0.1);
    }
  }

  // ---------- 多 P 分集 ----------
  &__pages {
    flex-basis: 100%;
    margin-top: 6px;
    padding: 8px;
    background: rgba(255,255,255,0.03);
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.06);
    max-height: 240px;
    overflow-y: auto;
  }

  &__pages-head {
    font-size: 12px;
    color: #A2A7B0;
    margin-bottom: 6px;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__pages-dlall {
    @include btn-reset;
    font-size: 11px;
    padding: 3px 10px;
    border-radius: 6px;
    border: 1px solid rgba(0,161,214,0.3);
    background: rgba(0,161,214,0.1);
    color: #00A1D6;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    transition: all 0.15s;
    &:hover { background: #00A1D6; color: #fff; }
  }

  &__page-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    border-radius: 6px;
    transition: background 0.15s;
    &:hover { background: rgba(255,255,255,0.06); }
  }

  &__page-num {
    font-size: 11px;
    font-weight: 700;
    color: #00A1D6;
    min-width: 28px;
  }

  &__page-title {
    flex: 1;
    font-size: 12px;
    color: #ddd;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__page-dur {
    font-size: 11px;
    color: #888;
    min-width: 36px;
    text-align: right;
  }

  &__page-dl {
    width: 24px; height: 24px;
    border-radius: 6px;
    border: 1px solid rgba(0,161,214,0.3);
    background: rgba(0,161,214,0.1);
    color: #00A1D6;
    font-size: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    flex-shrink: 0;
    &:hover { background: #00A1D6; color: #fff; }
  }
}

</style>
