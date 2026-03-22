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
        <span v-if="data.views != null"><i class="fas fa-play"></i> {{ fmt(data.views) }}</span>
        <span v-if="data.likes != null"><i class="fas fa-thumbs-up"></i> {{ fmt(data.likes) }}</span>
      </div>
    </div>

    <!-- 操作 -->
    <div class="rr__actions">
      <button class="rr__dl" @click="handleDownload" :title="appStore.formatLabel + '下载'">
        <i class="fas fa-download"></i>
      </button>
      <button v-if="coverSrc" class="rr__btn" @click="downloadCover" title="封面"><i class="fas fa-image"></i></button>
      <button v-if="data.cid" class="rr__btn" @click="downloadDanmaku" title="弹幕"><i class="fas fa-bars-staggered"></i></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { VideoData } from '@/types/video'
import { QUALITY_MAP } from '@/types/video'
import { useAppStore } from '@/stores/app'
import { useDownloadStore } from '@/stores/download'
import { useVideoStore } from '@/stores/video'
import { buildCoverUrl, buildStreamUrl } from '@/services/bilibili'

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

function downloadDanmaku() {
  const cid = props.data.cid
  if (!cid) return
  downloadStore.directDownload(`/api/bilibili/danmaku/${cid}`, `${sanitize(props.data.title || 'danmaku')}_弹幕.xml`)
  emit('toast', '弹幕下载已开始', 'success')
}
</script>

<style lang="scss" scoped>
.rr {
  display: flex;
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

    span {
      display: flex;
      align-items: center;
      gap: 3px;
      white-space: nowrap;
    }
    i { font-size: 0.6rem; opacity: 0.7; }
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
}

// 亮色模式
[data-theme="light"] .rr {
  background: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.06);
  &:hover { background: rgba(0, 0, 0, 0.06); }
  .rr__title { color: #212121; }
  .rr__meta { color: #666; }
}
</style>
