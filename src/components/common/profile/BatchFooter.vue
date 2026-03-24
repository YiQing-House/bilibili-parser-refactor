<template>
  <Transition name="bar-slide">
    <div v-if="selectedCount > 0" class="up-batch-footer">
      <span class="up-batch-footer__info">
        <i class="fas fa-check-square"></i> 已选 {{ selectedCount }} 个
      </span>
      <!-- 画质选择 -->
      <select v-model="qn" class="up-batch-footer__qn" title="下载画质">
        <option v-for="q in QUALITY_OPTIONS" :key="q.qn" :value="q.qn">{{ q.label }}</option>
      </select>
      <button class="up-batch-footer__cancel" @click="$emit('cancel')">取消</button>
      <button class="up-batch-footer__start" @click="$emit('start', qn)" :disabled="downloading">
        <i :class="downloading ? 'fas fa-spinner fa-spin' : 'fas fa-download'"></i>
        {{ downloading ? progress : '开始下载' }}
      </button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { QUALITY_OPTIONS } from '@/types/video'

const appStore = useAppStore()

defineProps<{
  selectedCount: number
  downloading: boolean
  progress: string
}>()

defineEmits<{
  cancel: []
  start: [qn: number]
}>()

const qn = ref(appStore.quality || 80)
</script>

<style lang="scss" src="./_shared.scss"></style>

