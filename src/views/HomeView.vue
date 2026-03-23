<template>
  <div class="home">
    <!-- ===== 底部抽屉 ===== -->
    <div
      class="drawer"
      :class="{
        'drawer--single': !videoStore.isLoading && !videoStore.error && videoStore.currentResult && !videoStore.hasBatchResults,
        'drawer--batch':  !videoStore.isLoading && !videoStore.error && videoStore.hasBatchResults,
        'drawer--loading': videoStore.isLoading,
      }"
    >
      <!-- 拖拽手柄 -->
      <div v-if="hasContent" class="drawer__handle">
        <span></span>
      </div>

      <!-- 结果区域（可滚动） -->
      <div v-if="hasContent" class="drawer__results" ref="resultsRef">
        <!-- Loading -->
        <div v-if="videoStore.isLoading" class="drawer__status">
          <LoadingSpinner size="sm" text="正在解析视频信息..." />
        </div>

        <!-- Error -->
        <div v-else-if="videoStore.error" class="drawer__status drawer__status--err">
          <i class="fas fa-exclamation-triangle"></i>
          <span>{{ videoStore.error }}</span>
          <button class="drawer__retry" @click="retry">
            <i class="fas fa-redo"></i> 重试
          </button>
        </div>

        <!-- 单个结果 — 紧凑行 -->
        <ResultRow v-else-if="videoStore.currentResult && !videoStore.hasBatchResults"
          :data="videoStore.currentResult" @toast="handleToast"
        />

        <!-- 批量结果 -->
        <template v-else-if="videoStore.hasBatchResults || videoStore.hasBatchErrors">
          <div class="drawer__batch-head">
            <span>批量结果 · {{ videoStore.batchSummary }}</span>
          </div>
          <ResultRow
            v-for="(v, i) in videoStore.batchResults" :key="'ok-'+i"
            :data="v" @toast="handleToast"
          />
          <!-- 失败条目 -->
          <div v-for="(err, i) in videoStore.batchErrors" :key="'err-'+i" class="drawer__error-row">
            <i class="fas fa-exclamation-circle"></i>
            <span class="drawer__error-url" :title="err.url">{{ err.url.slice(0, 60) }}</span>
            <span class="drawer__error-msg">{{ err.error }}</span>
            <button v-if="err.retryable" class="drawer__error-retry" @click="videoStore.retryBatchError(i)">
              <i class="fas fa-redo"></i> 重试
            </button>
          </div>
        </template>
      </div>

      <!-- 搜索栏 — 始终在底部 -->
      <div class="drawer__search">
        <SearchBox @show-login="showLogin = true" @toast="handleToast" />
      </div>
    </div>

    <!-- Footer 独立固定在最底部 -->
    <div class="page-footer">
      <AppFooter />
    </div>

    <LoginModal v-model:visible="showLogin" @login-success="handleToast('登录成功！', 'success')" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { inject } from 'vue'
import { useVideoStore } from '@/stores/video'
import SearchBox from '@/components/video/SearchBox.vue'
import ResultRow from '@/components/video/ResultRow.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import LoginModal from '@/components/common/LoginModal.vue'
import AppFooter from '@/components/layout/AppFooter.vue'

const videoStore = useVideoStore()
const showLogin = ref(false)
const toast = inject<(m: string, t: string) => void>('toast')


const hasContent = computed(() =>
  videoStore.isLoading || videoStore.error || videoStore.currentResult || videoStore.hasBatchResults || videoStore.hasBatchErrors
)

function handleToast(msg: string, type: string) { toast?.(msg, type) }
function retry() { const u = videoStore.inputUrl.trim(); if (u) videoStore.smartParse(u) }
</script>

<style lang="scss" scoped>
@use '@/styles/mixins' as *;

.home {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

// =================== 底部抽屉 ===================
.drawer {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: 56px; // 给看板娘对话框和 footer 留空间
  width: min(720px, calc(100% - 32px));
  z-index: 200;

  // 毛玻璃面板
  background: rgba(15, 17, 22, 0.82);
  backdrop-filter: blur(24px) saturate(1.6);
  -webkit-backdrop-filter: blur(24px) saturate(1.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  box-shadow:
    0 -4px 30px rgba(0, 0, 0, 0.35),
    0 0 0 1px rgba(255, 255, 255, 0.04) inset;

  // 过渡
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);

  // -- 有单个结果 --
  &--single .drawer__results {
    max-height: 80px;
  }

  // -- 批量 --
  &--batch .drawer__results {
    max-height: 50vh;
  }

  // -- 加载中 --
  &--loading .drawer__results {
    max-height: 60px;
  }
}

// 拖拽手柄（装饰）
.drawer__handle {
  display: flex;
  justify-content: center;
  padding: 8px 0 2px;
  cursor: default;

  span {
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.15);
  }
}

// 结果区
.drawer__results {
  max-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1);

  // 滚动条
  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.12);
    border-radius: 2px;
    &:hover { background: rgba(255, 255, 255, 0.2); }
  }
}

.drawer__status {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 4px;
  font-size: 0.8rem;
  color: #A2A7B0;

  &--err {
    color: #FF6B81;
    i { font-size: 1rem; }
  }
}

.drawer__retry {
  margin-left: auto;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.06);
  color: #eee;
  font-size: 0.72rem;
  cursor: pointer;
  &:hover { background: rgba(255, 255, 255, 0.12); }
}

// 批量失败条目
.drawer__error-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(255, 80, 80, 0.08);
  border-left: 3px solid #ff5050;
  border-radius: 6px;
  margin: 4px 0;
  font-size: 0.78rem;

  > i { color: #ff5050; flex-shrink: 0; }
}
.drawer__error-url {
  color: #ccc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}
.drawer__error-msg {
  color: #ff8a8a;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.drawer__error-retry {
  margin-left: auto;
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 80, 80, 0.3);
  background: rgba(255, 80, 80, 0.1);
  color: #ff8a8a;
  font-size: 0.7rem;
  cursor: pointer;
  flex-shrink: 0;
  &:hover { background: rgba(255, 80, 80, 0.2); }
}

.drawer__batch-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 4px;
  font-size: 0.75rem;
  color: #A2A7B0;
  font-weight: 600;
}

// 搜索栏区域 — 覆盖子组件样式让其融入抽屉
.drawer__search {
  padding: 4px 0 0;

  :deep(.hero-search) {
    padding: 4px 0 6px;
    max-width: 100%;
  }

  :deep(.hero-search__bar) {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.08);
    box-shadow: none;
    animation: none;
    min-height: 46px;
    margin: 0 8px;
    width: calc(100% - 16px);

    &.focused, &.hasValue {
      background: rgba(255, 255, 255, 0.08);
      box-shadow: 0 0 0 1px var(--color-border-focus);
    }
  }

  :deep(.hero-search__tools) {
    padding: 0 8px;
  }

  :deep(.history-panel) {
    bottom: calc(100% + 4px);
  }
}

// 底部 Footer — 独立于抽屉
.page-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  text-align: center;
  padding: 4px 0;
  z-index: 50;
}

// =================== 响应式 ===================
@include mobile {
  .drawer {
    width: calc(100% - 16px);
    bottom: 8px;
    border-radius: 14px;

    &--batch .drawer__results {
      max-height: 45vh;
    }
  }
}
</style>
