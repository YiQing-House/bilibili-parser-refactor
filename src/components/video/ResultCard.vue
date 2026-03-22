<template>
  <div class="result" v-if="data">
    <!-- 封面区 -->
    <a class="result__thumb" :href="biliUrl" target="_blank" rel="noopener" :title="'在 B 站观看：' + data.title">
      <img :src="coverSrc" :alt="data.title" loading="lazy" referrerpolicy="no-referrer" />
      <span v-if="durationText" class="result__duration">{{ durationText }}</span>
      <span v-if="maxQualityLabel" class="result__quality">{{ maxQualityLabel }}</span>
      <span class="result__play-hint"><i class="fas fa-external-link-alt"></i></span>
    </a>

    <div class="result__body">
      <!-- 标题 -->
      <h3 class="result__title">{{ data.title }}</h3>

      <!-- Meta 行：UP主 + BV号 + 发布时间 -->
      <div class="result__meta">
        <span v-if="data.author"><i class="fas fa-user"></i> {{ data.author }}</span>
        <span v-if="data.bvid"><i class="fas fa-hashtag"></i> {{ data.bvid }}</span>
        <span v-if="data.pubdate"><i class="fas fa-clock"></i> {{ pubdateText }}</span>
      </div>

      <!-- 统计数据栏 -->
      <div class="result__stats">
        <div class="stat" v-if="data.views != null"><i class="fas fa-play"></i><span>{{ fmt(data.views) }}</span></div>
        <div class="stat" v-if="data.likes != null"><i class="fas fa-thumbs-up"></i><span>{{ fmt(data.likes) }}</span></div>
        <div class="stat" v-if="data.coins != null"><i class="fas fa-coins"></i><span>{{ fmt(data.coins) }}</span></div>
        <div class="stat" v-if="data.favorites != null"><i class="fas fa-star"></i><span>{{ fmt(data.favorites) }}</span></div>
        <div class="stat" v-if="data.shares != null"><i class="fas fa-share"></i><span>{{ fmt(data.shares) }}</span></div>
        <div class="stat" v-if="data.danmakus != null"><i class="fas fa-bars-staggered"></i><span>{{ fmt(data.danmakus) }}</span></div>
        <div class="stat" v-if="data.replies != null"><i class="fas fa-comment"></i><span>{{ fmt(data.replies) }}</span></div>
      </div>

      <!-- 操作区 -->
      <div class="result__actions">
        <button class="btn-primary" @click="handleDownload">
          <i class="fas fa-download"></i> {{ appStore.formatLabel }}下载
        </button>
        <button v-if="coverSrc" class="btn-ghost" @click="downloadCover">
          <i class="fas fa-image"></i> 封面
        </button>
        <button v-if="data.cid" class="btn-ghost" @click="downloadDanmaku">
          <i class="fas fa-comment-dots"></i> 弹幕
        </button>
      </div>
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

// 封面：优先使用 cover（B 站原图），备选 thumbnail
const coverSrc = computed(() => {
  const pic = props.data.cover || props.data.thumbnail
  if (!pic) return ''
  if (pic.startsWith('//')) return `https:${pic}`
  return pic
})

// B 站原页面链接
const biliUrl = computed(() => {
  if (props.data.bvid) return `https://www.bilibili.com/video/${props.data.bvid}`
  return videoStore.inputUrl || '#'
})

// 时长格式化（秒 → mm:ss 或 hh:mm:ss）
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

// 发布时间
const pubdateText = computed(() => {
  if (!props.data.pubdate) return ''
  const d = new Date(props.data.pubdate * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})

// 最高画质标签
const maxQualityLabel = computed(() => {
  const qn = props.data.maxQuality
  if (!qn) return ''
  return QUALITY_MAP[qn] || ''
})

// 数字格式化
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
  if (fmt === 'audio') { downloadStore.directDownload(buildStreamUrl(url, 'audio', actualQn), `${title}.m4a`); return }
  if (fmt === 'video-only') { downloadStore.directDownload(buildStreamUrl(url, 'video', actualQn), `${qName}_${title}.m4s`); return }

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
  const title = sanitize(props.data.title || 'danmaku')
  downloadStore.directDownload(`/api/bilibili/danmaku/${cid}`, `${title}_弹幕.xml`)
  emit('toast', '弹幕下载已开始', 'success')
}
</script>

<style lang="scss" scoped>
@use '@/styles/mixins' as *;

.result {
  @include card;
  display: flex;
  gap: var(--spacing-lg);
  padding: var(--spacing-lg);
  animation: fadeInUp 0.4s var(--ease-out);
  margin-top: var(--spacing-lg);

  @include mobile {
    flex-direction: column;
    gap: var(--spacing-md);
    padding: var(--spacing-md);
  }

  // ---- 封面 ----
  &__thumb {
    position: relative;
    flex-shrink: 0;
    width: 280px;
    border-radius: var(--radius-md);
    overflow: hidden;
    display: block;
    text-decoration: none;
    cursor: pointer;

    @include mobile { width: 100%; }

    img {
      width: 100%;
      aspect-ratio: 16 / 9;
      object-fit: cover;
      transition: transform 0.3s ease;
    }

    &:hover img { transform: scale(1.05); }
    &:hover .result__play-hint { opacity: 1; }
  }

  &__duration {
    position: absolute;
    bottom: 8px; right: 8px;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    letter-spacing: 0.5px;
  }

  &__play-hint {
    position: absolute;
    top: 8px; right: 8px;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    width: 28px; height: 28px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px;
    opacity: 0;
    transition: opacity 0.2s;
  }

  &__quality {
    position: absolute;
    top: 8px; left: 8px;
    background: linear-gradient(135deg, var(--color-blue, #00A1D6), #0090BF);
    color: white;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: var(--font-weight-bold);
    letter-spacing: 0.3px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  }

  // ---- 信息区 ----
  &__body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  &__title {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    line-height: 1.4;
    @include text-clamp(2);
    @include mobile { font-size: var(--font-size-md); }
  }

  &__meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-md);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    span { display: flex; align-items: center; gap: 4px; }
    i { font-size: 0.75em; }
  }

  // ---- 统计数据 ----
  &__stats {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: var(--spacing-xs) 0;
  }

  // ---- 操作区 ----
  &__actions {
    display: flex;
    gap: var(--spacing-sm);
    margin-top: auto;
    padding-top: var(--spacing-sm);

    @include mobile { flex-direction: column; }
  }
}

// ---- 数据小标签 ----
.stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  background: var(--color-bg-input);
  border: 1px solid var(--color-border);
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;

  i { font-size: 11px; opacity: 0.7; }
  span { font-weight: var(--font-weight-medium); }
}

// ---- 按钮 ----
.btn-primary {
  @include btn-reset;
  padding: 8px 20px;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--color-blue), #0090BF);
  color: white;
  font-size: var(--font-size-sm);
  box-shadow: var(--shadow-glow-blue);

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    filter: brightness(1.08);
  }
}

.btn-ghost {
  @include btn-reset;
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  border: 1px solid var(--color-border);

  &:hover {
    color: var(--color-primary);
    border-color: var(--color-primary);
    background: var(--color-primary-light);
  }
}
</style>
