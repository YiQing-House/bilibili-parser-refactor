<template>
  <div class="toast-wrap">
    <TransitionGroup name="t">
      <div v-for="t in toasts" :key="t.id" :class="['toast', `toast--${t.type}`]">
        <span>{{ t.message }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface T { id: number; message: string; type: 'success' | 'error' | 'warning' | 'info' }
const toasts = ref<T[]>([])
let c = 0

function showToast(message: string, type: T['type'] = 'info', duration = 3000) {
  const id = ++c
  toasts.value.push({ id, message, type })
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id) }, duration)
}

defineExpose({ showToast })
</script>

<style lang="scss" scoped>
@use '@/styles/mixins' as *;

.toast-wrap {
  position: fixed; top: 72px; right: 16px; z-index: 10000;
  display: flex; flex-direction: column; gap: 6px;
  @include mobile { left: var(--spacing-md); right: var(--spacing-md); }
}

.toast {
  padding: 10px 18px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  backdrop-filter: blur(16px);
  box-shadow: var(--shadow-md);
  max-width: 360px;

  &--success { background: rgba(46, 213, 115, 0.9); color: white; }
  &--error { background: rgba(255, 71, 87, 0.9); color: white; }
  &--warning { background: rgba(255, 165, 2, 0.9); color: white; }
  &--info { background: var(--color-bg-elevated); color: var(--color-text-primary); border: 1px solid var(--color-border); }
}

.t-enter-active { transition: all 0.25s var(--ease-out); }
.t-leave-active { transition: all 0.15s ease; }
.t-enter-from { opacity: 0; transform: translateX(30px); }
.t-leave-to { opacity: 0; transform: translateX(30px) scale(0.95); }
</style>
