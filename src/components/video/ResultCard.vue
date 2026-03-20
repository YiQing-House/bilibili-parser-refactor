<template>
  <div class="result" v-if="data">
    <div class="result__thumb">
      <img :src="data.thumbnail" :alt="data.title" loading="lazy" />
      <span v-if="data.duration" class="result__duration">{{ data.duration }}</span>
    </div>

    <div class="result__body">
      <h3 class="result__title">{{ data.title }}</h3>

      <div class="result__meta">
        <span v-if="data.author"><i class="fas fa-user"></i> {{ data.author }}</span>
        <span v-if="data.bvid"><i class="fas fa-hashtag"></i> {{ data.bvid }}</span>
      </div>

      <div class="result__actions">
        <button class="btn-primary" @click="handleDownload">
          <i class="fas fa-download"></i> {{ appStore.formatLabel }}下载
        </button>
        <button v-if="data.thumbnail" class="btn-ghost" @click="downloadCover">
          <i class="fas fa-image"></i> 封面
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
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

  &__thumb {
    position: relative;
    flex-shrink: 0;
    width: 220px;
    border-radius: var(--radius-md);
    overflow: hidden;

    @include mobile { width: 100%; }

    img {
      width: 100%;
      aspect-ratio: 16 / 9;
      object-fit: cover;
    }
  }

  &__duration {
    position: absolute;
    bottom: 6px;
    right: 6px;
    background: rgba(0, 0, 0, 0.75);
    color: white;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
  }

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

  &__actions {
    display: flex;
    gap: var(--spacing-sm);
    margin-top: auto;
    padding-top: var(--spacing-sm);

    @include mobile { flex-direction: column; }
  }
}

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
