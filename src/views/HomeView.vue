<template>
  <div class="home">
    <!-- Loading -->
    <div v-if="videoStore.isLoading" class="center-block">
      <LoadingSpinner size="lg" text="正在解析视频信息..." />
    </div>

    <!-- Error -->
    <div v-else-if="videoStore.error" class="center-block">
      <div class="error-box">
        <i class="fas fa-exclamation-triangle"></i>
        <p>{{ videoStore.error }}</p>
        <button class="retry-btn" @click="retry"><i class="fas fa-redo"></i> 重试</button>
      </div>
    </div>

    <!-- Single Result -->
    <ResultCard v-else-if="videoStore.currentResult" :data="videoStore.currentResult" @toast="handleToast" />

    <!-- Batch -->
    <div v-else-if="videoStore.hasBatchResults" class="batch">
      <h3 class="batch__title">批量结果 · {{ videoStore.batchResults.length }} 个视频</h3>
      <div class="batch__list">
        <ResultCard v-for="(v, i) in videoStore.batchResults" :key="i" :data="v" @toast="handleToast" />
      </div>
    </div>

    <!-- Search — 沉在底部 -->
    <div class="search-anchor">
      <SearchBox @show-login="showLogin = true" @toast="handleToast" />
    </div>

    <!-- Footer — 紧接搜索栏下方，无需滚动 -->
    <AppFooter />

    <LoginModal v-model:visible="showLogin" @login-success="handleToast('登录成功！', 'success')" />
  </div>
</template>

<script setup lang="ts">
import { ref, inject } from 'vue'
import { useVideoStore } from '@/stores/video'
import SearchBox from '@/components/video/SearchBox.vue'
import ResultCard from '@/components/video/ResultCard.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import LoginModal from '@/components/common/LoginModal.vue'
import AppFooter from '@/components/layout/AppFooter.vue'

const videoStore = useVideoStore()
const showLogin = ref(false)
const toast = inject<(m: string, t: string) => void>('toast')

function handleToast(msg: string, type: string) { toast?.(msg, type) }
function retry() { const u = videoStore.inputUrl.trim(); if (u) videoStore.smartParse(u) }
</script>

<style lang="scss" scoped>
@use '@/styles/mixins' as *;

.home {
  animation: fadeIn 0.3s ease;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.search-anchor {
  margin-top: auto;
  padding: 0;
}

.center-block {
  display: flex; justify-content: center; padding: var(--spacing-2xl) 0;
}

.error-box {
  @include card;
  padding: var(--spacing-xl);
  text-align: center;
  display: flex; flex-direction: column; align-items: center; gap: var(--spacing-md);
  i { font-size: 2rem; color: var(--color-danger); }
  p { color: var(--color-text-secondary); font-size: var(--font-size-sm); }
}

.retry-btn {
  @include btn-reset;
  padding: 8px 20px;
  border-radius: var(--radius-sm);
  background: var(--color-primary);
  color: white;
  font-size: var(--font-size-sm);
  &:hover { filter: brightness(1.08); transform: translateY(-1px); }
}

.batch {
  margin-top: var(--spacing-lg);
  &__title { font-size: var(--font-size-md); margin-bottom: var(--spacing-md); color: var(--color-text-secondary); font-weight: var(--font-weight-medium); }
  &__list { display: flex; flex-direction: column; gap: var(--spacing-md); }
}
</style>

