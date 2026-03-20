<template>
  <div class="skeleton" :style="{ width, height, borderRadius: radius }"></div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  width?: string
  height?: string
  radius?: string
}>(), {
  width: '100%',
  height: '20px',
  radius: 'var(--radius-sm)',
})
</script>

<style lang="scss" scoped>
.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-bg-input) 25%,
    var(--color-bg-bar) 50%,
    var(--color-bg-input) 75%
  );
  background-size: 200px 100%;
  animation: shimmer 1.5s infinite;
}
</style>
