<template>
  <div class="quality-bar" :class="{ disabled: disabled }" ref="barRef">
    <button
      v-for="opt in options"
      :key="opt.qn"
      :class="[
        'q-chip',
        { active: modelValue === opt.qn },
        { locked: opt.needVip && !authStore.isVip },
      ]"
      :disabled="disabled"
      @click="select(opt)"
    >
      {{ opt.label }}
      <span v-if="opt.needVip" class="q-vip">大会员</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { QUALITY_OPTIONS } from '@/types/video'
import { useAuthStore } from '@/stores/auth'

defineProps<{ modelValue: number; disabled?: boolean }>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void
  (e: 'vipRequired'): void
  (e: 'loginRequired'): void
}>()

const authStore = useAuthStore()
const options = QUALITY_OPTIONS

function select(opt: typeof QUALITY_OPTIONS[number]) {
  if (opt.needLogin && !authStore.isLoggedIn) { emit('loginRequired'); return }
  if (opt.needVip && !authStore.isVip) { emit('vipRequired'); return }
  emit('update:modelValue', opt.qn)
}
</script>

<style lang="scss" scoped>
@use '@/styles/mixins' as *;

.quality-bar {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  @include hide-scrollbar;

  &.disabled {
    opacity: 0.35;
    pointer-events: none;
  }
}

.q-chip {
  @include btn-reset;
  padding: 5px 10px;
  border-radius: var(--radius-full);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  background: transparent;
  white-space: nowrap;
  position: relative;
  flex-shrink: 0;
  transition: all 0.2s ease;

  &:hover:not(.locked) {
    color: var(--color-text-primary);
    background: var(--color-bg-hover);
  }

  &.active {
    color: white;
    background: var(--color-primary);
    font-weight: var(--font-weight-bold);
    box-shadow: var(--shadow-glow-pink);

    &:hover {
      background: var(--color-primary-hover, #e5577f);
      box-shadow: 0 0 16px rgba(251, 114, 153, 0.6);
      transform: scale(1.05);
    }
  }

  &.locked {
    opacity: 0.35;
    cursor: not-allowed;
  }
}

.q-vip {
  font-size: 9px;
  background: var(--color-primary);
  color: white;
  padding: 0 4px;
  border-radius: 3px;
  margin-left: 2px;
  vertical-align: super;
  line-height: 1;
  font-weight: var(--font-weight-bold);

  .q-chip.active & {
    background: white;
    color: var(--color-primary);
  }
}
</style>
