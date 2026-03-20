<template>
  <div class="loading-spinner" :class="[`loading-spinner--${size}`]">
    <div class="spinner"></div>
    <span v-if="text" class="loading-text">{{ text }}</span>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  size?: 'sm' | 'md' | 'lg'
  text?: string
}>(), {
  size: 'md',
  text: '',
})
</script>

<style lang="scss" scoped>
.loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-md);

  &--sm .spinner {
    width: 20px;
    height: 20px;
    border-width: 2px;
  }

  &--md .spinner {
    width: 36px;
    height: 36px;
    border-width: 3px;
  }

  &--lg .spinner {
    width: 48px;
    height: 48px;
    border-width: 4px;
  }
}

.spinner {
  border-radius: 50%;
  border-style: solid;
  border-color: var(--color-border);
  border-top-color: var(--color-primary);
  animation: spin 0.8s linear infinite;
}

.loading-text {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}
</style>
