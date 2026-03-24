<template>
  <!-- Panel -->
  <Teleport to="body">
    <Transition name="panel">
      <div v-if="downloadStore.panelOpen" class="dm-overlay" @click.self="downloadStore.togglePanel">
        <div class="dm-panel">
          <div class="dm-head">
            <h3><i class="fas fa-tasks"></i> 下载管理 <span class="dm-count">{{ downloadStore.totalCount }}</span></h3>
            <span v-if="pendingCount > 0" class="dm-queued"><i class="fas fa-clock"></i> {{ pendingCount }} 个排队中</span>
            <div class="dm-head__right">
              <button v-if="downloadStore.completedCount" class="text-sm text-danger" @click="downloadStore.clearFinished">清除已完成 ({{ downloadStore.completedCount }})</button>
              <button class="dm-close" @click="downloadStore.togglePanel">✕</button>
            </div>
          </div>

          <div class="dm-body">
            <div v-if="!downloadStore.taskList.length" class="dm-empty">
              <i class="fas fa-inbox"></i>
              <p>暂无下载任务</p>
            </div>

            <TransitionGroup name="task-anim" tag="div" class="dm-list">
              <div v-for="task in downloadStore.taskList" :key="task.id" :class="['dm-task', `dm-task--${task.status}`]">
                <div class="dm-task__name">
                  {{ task.filename }}
                  <span v-if="task.qn" class="dm-qn">{{ qualityLabel(task.qn) }}</span>
                </div>
                <div class="dm-task__info">
                  <span>{{ task.stage }}</span>
                  <span v-if="task.speed" class="dm-speed">{{ task.speed }}</span>
                </div>
                <div v-if="['downloading','starting'].includes(task.status)" class="dm-bar">
                  <div class="dm-bar__fill" :style="{ width: `${task.percent}%` }"></div>
                  <span class="dm-pct">{{ task.percent }}%</span>
                </div>
                <div v-else-if="task.status === 'pending'" class="dm-bar dm-bar--pending">
                  <div class="dm-bar__fill dm-bar__fill--pending"></div>
                  <span class="dm-pct">排队中</span>
                </div>
                <div class="dm-task__status">
                  <i v-if="task.status === 'completed'" class="fas fa-check-circle s-done"></i>
                  <button v-if="task.status === 'completed' && task.downloadUrl" class="dm-redownload" @click="downloadStore.triggerBrowserDownload(task.downloadUrl, task.filename)" title="重新下载">
                    <i class="fas fa-download"></i>
                  </button>
                  <template v-else-if="task.status === 'error' || task.status === 'cancelled'">
                    <i :class="task.status === 'error' ? 'fas fa-exclamation-circle s-err' : 'fas fa-ban s-cancel'"></i>
                    <button class="dm-retry" @click="downloadStore.retryTask(task.id)" title="重试">
                      <i class="fas fa-redo-alt"></i>
                    </button>
                  </template>
                  <button v-else class="dm-cancel" @click="downloadStore.cancelTask(task.id)"><i class="fas fa-times"></i></button>
                </div>
              </div>
            </TransitionGroup>
          </div>

          <!-- 底部统计 -->
          <div v-if="downloadStore.downloadStats.totalCount > 0" class="dm-stats">
            <span><i class="fas fa-chart-bar"></i> 累计 {{ downloadStore.downloadStats.totalCount }} 次</span>
            <span>{{ downloadStore.formatSize(downloadStore.downloadStats.totalSize) }}</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useDownloadStore } from '@/stores/download'
import { QUALITY_MAP } from '@/types/video'
const downloadStore = useDownloadStore()
const pendingCount = computed(() => downloadStore.pendingCount)
function qualityLabel(qn: number) { return QUALITY_MAP[qn] || `${qn}` }
</script>

<style lang="scss" scoped>
@use '@/styles/mixins' as *;

.fab {
  @include btn-reset;
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 200;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-primary), var(--color-blue));
  color: white;
  font-size: 1.1rem;
  box-shadow: 0 4px 16px rgba(251, 114, 153, 0.35);

  &:hover { transform: scale(1.08); }
}

.fab-badge {
  position: absolute;
  top: -4px; right: -4px;
  min-width: 18px; height: 18px;
  background: var(--color-danger);
  color: white;
  border-radius: 9px;
  font-size: 10px;
  font-weight: var(--font-weight-bold);
  display: flex; align-items: center; justify-content: center;
  padding: 0 4px;
}

.dm-overlay {
  position: fixed; inset: 0; z-index: 9998;
  display: flex; justify-content: flex-end;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
}

.dm-panel {
  width: 400px; max-width: 95vw; height: 100vh;
  @include glass-elevated;
  display: flex; flex-direction: column;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.3);

  // [#4] 移动端：底部滑出全宽
  @include mobile {
    width: 100vw;
    max-width: 100vw;
    height: 60vh;
    position: fixed;
    bottom: 0;
    left: 0;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.3);
  }
}

.dm-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--color-border);
  h3 { font-size: var(--font-size-md); display: flex; align-items: center; gap: var(--spacing-sm); }
  &__right { display: flex; gap: var(--spacing-sm); align-items: center; }
}

.dm-count { font-size: var(--font-size-xs); color: var(--color-text-secondary); font-weight: var(--font-weight-normal); }

.dm-close {
  @include btn-reset;
  width: 28px; height: 28px; border-radius: 50%;
  color: var(--color-text-secondary); font-size: 1rem;
  &:hover { color: var(--color-text-primary); background: var(--color-bg-hover); }
}

.text-sm { @include btn-reset; font-size: var(--font-size-xs); padding: 2px 8px; border-radius: var(--radius-sm); }
.text-danger { color: var(--color-danger); &:hover { background: rgba(255, 71, 87, 0.1); } }

.dm-body { flex: 1; overflow-y: auto; padding: var(--spacing-sm); }

.dm-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: var(--spacing-3xl); color: var(--color-text-secondary);
  i { font-size: 2rem; margin-bottom: var(--spacing-md); opacity: 0.3; }
}

.dm-list { display: flex; flex-direction: column; gap: var(--spacing-sm); }

.dm-task {
  background: var(--color-bg-input);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  display: flex; flex-direction: column; gap: 4px;

  &__name { font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); @include text-ellipsis; }
  &__info { font-size: var(--font-size-xs); color: var(--color-text-secondary); display: flex; justify-content: space-between; }
  &__status { display: flex; justify-content: flex-end; }
  &--completed { border-color: rgba(46, 213, 115, 0.25); }
  &--error { border-color: rgba(255, 71, 87, 0.25); }
}

.dm-speed { color: var(--color-blue); font-weight: var(--font-weight-bold); }

.dm-bar {
  display: flex; align-items: center; gap: var(--spacing-sm);
  &__fill {
    flex: 1; height: 4px; background: var(--color-bg-hover); border-radius: 2px; overflow: hidden; position: relative;
    &::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, var(--color-blue), var(--color-primary)); border-radius: 2px; transition: width 0.3s; }
  }
}

.dm-bar__fill {
  height: 4px; background: linear-gradient(90deg, var(--color-blue), var(--color-primary)); border-radius: 2px; transition: width 0.3s;
}

.dm-pct { font-size: var(--font-size-xs); font-weight: var(--font-weight-bold); color: var(--color-blue); min-width: 32px; text-align: right; }

.s-done { color: var(--color-success); }
.s-err { color: var(--color-danger); }
.s-cancel { color: var(--color-text-secondary); }

.dm-cancel {
  @include btn-reset;
  width: 22px; height: 22px; border-radius: 50%;
  color: var(--color-text-secondary); font-size: var(--font-size-xs);
  &:hover { color: var(--color-danger); background: rgba(255, 71, 87, 0.1); }
}

.dm-retry {
  @include btn-reset;
  width: 22px; height: 22px; border-radius: 50%;
  color: var(--color-blue); font-size: var(--font-size-xs); margin-left: 4px;
  &:hover { color: #fff; background: var(--color-blue); }
}

.dm-queued {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  background: rgba(255,165,0,0.1);
  border: 1px solid rgba(255,165,0,0.25);
  padding: 2px 8px;
  border-radius: 12px;
  i { margin-right: 4px; }
}

.dm-bar--pending {
  .dm-bar__fill--pending {
    width: 100% !important;
    background: linear-gradient(90deg, rgba(255,165,0,0.2), rgba(255,165,0,0.5), rgba(255,165,0,0.2));
    background-size: 200% 100%;
    animation: pending-shimmer 1.5s ease-in-out infinite;
  }
}
@keyframes pending-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.dm-task--pending { border-color: rgba(255,165,0,0.25); }

.dm-qn {
  font-size: 10px;
  background: var(--color-primary);
  color: white;
  padding: 1px 5px;
  border-radius: 3px;
  margin-left: 6px;
  font-weight: var(--font-weight-bold);
  vertical-align: middle;
}

.dm-redownload {
  @include btn-reset;
  color: var(--color-primary);
  font-size: 0.85rem;
  margin-left: 4px;
  opacity: 0.7;
  transition: opacity 0.15s;
  &:hover { opacity: 1; }
}

.dm-stats {
  display: flex;
  justify-content: space-between;
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  border-top: 1px solid var(--color-border);
  i { margin-right: 4px; }
}

.panel-enter-active { transition: all 0.3s var(--ease-out); }
.panel-leave-active { transition: all 0.2s ease; }
.panel-enter-from, .panel-leave-to { opacity: 0; .dm-panel { transform: translateX(100%); } }
.task-anim-enter-active { transition: all 0.25s var(--ease-out); }
.task-anim-leave-active { transition: all 0.15s ease; }
.task-anim-enter-from { opacity: 0; transform: translateY(-8px); }
.task-anim-leave-to { opacity: 0; transform: scale(0.95); }
</style>
