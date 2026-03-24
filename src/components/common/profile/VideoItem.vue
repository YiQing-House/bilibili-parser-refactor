<template>
  <div
    :class="['up-video', { 'up-video--selected': selected }]"
    @click="$emit('click')"
  >
    <!-- 批量选择 checkbox -->
    <span v-if="selectable" :class="['up-checkbox', { checked: selected }]">
      <i v-if="selected" class="fas fa-check"></i>
    </span>

    <div class="up-video__thumb">
      <img :src="video.cover" class="up-video__cover" loading="lazy" referrerpolicy="no-referrer" />
      <span v-if="qualityBadge" class="up-video__qbadge">{{ qualityBadge }}</span>
      <span v-if="video.duration" class="up-video__dur-badge">{{ video.duration }}</span>
      <!-- 播放进度条（历史记录用） -->
      <div v-if="video.progress > 0 && video.totalDuration > 0" class="up-video__progress">
        <div class="up-video__progress-fill" :style="{ width: Math.min(100, (video.progress / video.totalDuration) * 100) + '%' }"></div>
      </div>
    </div>

    <div class="up-video__meta">
      <span class="up-video__title">{{ video.title }}</span>
      <slot name="info">
        <span class="up-video__info">
          <span v-if="video.upper"><i class="fas fa-user"></i> {{ video.upper }}</span>
          <span v-if="video.plays != null"><i class="fas fa-play"></i> {{ fmt(video.plays) }}</span>
          <span v-if="video.likes"><i class="fas fa-thumbs-up"></i> {{ fmt(video.likes) }}</span>
        </span>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  video: any
  selected?: boolean
  selectable?: boolean
  qualityBadge?: string
}>()

defineEmits<{
  click: []
}>()

function fmt(n: number) { return Math.floor(n).toLocaleString('zh-CN') }
</script>

<style lang="scss" src="./_shared.scss"></style>
