<template>
  <div class="hero-search" ref="cardRef">
    <!-- 一体化搜索卡片 -->
    <div class="hero-search__card" :class="{ focused: isFocused, hasValue: videoStore.inputUrl.trim() }">
      <!-- 上半：搜索栏 -->
      <div class="hero-search__bar" :class="{ multiline: isMultiline }">
        <i class="fas fa-link hero-search__bar-icon"></i>
        <textarea
          ref="inputRef"
          class="hero-search__input"
          v-model="videoStore.inputUrl"
          rows="1"
          placeholder="粘贴视频链接，开始解析...（Shift+Enter 换行 | 支持拖拽）"
          @focus="isFocused = true"
          @blur="isFocused = false"
          @keydown="onKeydown"
          @paste="onPaste"
          @input="autoResize"
          @drop.prevent="onDrop"
          @dragover.prevent
        />
        <button
          v-if="videoStore.inputUrl.trim()"
          class="hero-search__clear"
          @click="clearInput"
          title="清空"
        >
          <i class="fas fa-times"></i>
        </button>
        <button
          class="hero-search__submit"
          @click="handleParse"
          :disabled="videoStore.isLoading || !videoStore.inputUrl.trim()"
        >
          <i :class="videoStore.isLoading ? 'fas fa-circle-notch fa-spin' : 'fas fa-arrow-right'"></i>
          <span class="hero-search__submit-text">{{ videoStore.isLoading ? '解析中' : '去水印下载' }}</span>
        </button>
      </div>

      <!-- 分隔线 -->
      <div class="hero-search__divider"></div>

      <!-- 下半：工具行 -->
      <div class="hero-search__tools">
        <div class="hero-search__options">
          <QualitySelector
            v-model="appStore.quality"
            :disabled="!appStore.needsQuality"
            @login-required="$emit('showLogin')"
            @vip-required="$emit('toast', '此画质需要大会员', 'error')"
          />
        </div>
        <div class="custom-select" ref="formatRef">
          <div class="custom-select__trigger" @click.stop="formatOpen = !formatOpen">
            {{ FORMAT_OPTIONS.find(o => o.value === appStore.format)?.label || '完整' }}
            <i class="fas fa-chevron-down" :class="{ rotated: formatOpen }"></i>
          </div>
          <Transition name="dropdown">
            <div v-if="formatOpen" class="custom-select__menu">
              <div
                v-for="opt in FORMAT_OPTIONS" :key="opt.value"
                class="custom-select__item"
                :class="{ active: appStore.format === opt.value }"
                @click="appStore.format = opt.value; formatOpen = false"
              >{{ opt.label }}</div>
            </div>
          </Transition>
        </div>

        <div class="hero-search__actions">
          <button class="action-pill" @click="pasteFromClipboard" title="粘贴">
            <i class="fas fa-clipboard"></i>
            <span>粘贴</span>
          </button>
          <button class="action-pill" @click="toggleHistory" title="历史记录">
            <i class="fas fa-history"></i>
            <span>历史</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 历史记录下拉 -->
    <Transition name="drop">
      <div v-if="historyOpen && videoStore.history.length" class="history-panel">
        <div class="history-panel__head">
          <span>历史记录 · {{ videoStore.historyCount }}</span>
          <button @click="videoStore.clearHistory(); historyOpen = false">清空</button>
        </div>
        <div class="history-panel__list">
          <div
            v-for="item in videoStore.history.slice(0, 15)"
            :key="item.id"
            class="history-item"
            @click="useHistoryItem(item)"
          >
            <span class="history-item__title">{{ item.title }}</span>
            <button class="history-item__del" @click.stop="videoStore.removeHistory(item.id)">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useVideoStore } from '@/stores/video'
import { FORMAT_OPTIONS } from '@/types/video'
import type { HistoryItem } from '@/types/video'
import QualitySelector from '@/components/video/QualitySelector.vue'

const appStore = useAppStore()
const videoStore = useVideoStore()

defineEmits<{
  (e: 'showLogin'): void
  (e: 'toast', message: string, type: string): void
}>()

const inputRef = ref<HTMLTextAreaElement>()
const isMultiline = ref(false)
const cardRef = ref<HTMLDivElement>()
const historyOpen = ref(false)
const isFocused = ref(false)
const showTools = ref(false)
const formatOpen = ref(false)
const formatRef = ref<HTMLElement>()

// 点击外部关闭下拉
function onDocClick(e: MouseEvent) {
  if (formatRef.value && !formatRef.value.contains(e.target as Node)) {
    formatOpen.value = false
  }
}

// Shift+Enter 换行，Enter 触发搜索
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    if (e.shiftKey) {
      // 放行换行，等下一帧自动调整高度
      nextTick(autoResize)
    } else {
      e.preventDefault()
      handleParse()
    }
  }
}

// textarea 自适应高度
function autoResize() {
  const el = inputRef.value
  if (!el) return
  // 先重置为单行，再让 scrollHeight 决定实际高度
  el.style.height = '22px'
  const singleLine = 22
  const maxH = singleLine * 5
  const needH = Math.min(el.scrollHeight, maxH)
  el.style.height = needH + 'px'
  isMultiline.value = needH > singleLine + 2
}

// 智能粘贴：粘贴后自动触发解析（防止与 Ctrl+V 快捷键双重触发）
function onPaste() {
  setTimeout(() => {
    showTools.value = true
    autoResize()
    if (videoStore.inputUrl.trim() && !videoStore.isLoading) {
      handleParse()
    }
  }, 50)
}

/** #8 拖拽文件/文本输入 */
function onDrop(e: DragEvent) {
  const dt = e.dataTransfer
  if (!dt) return

  // 优先处理纯文本拖拽
  const text = dt.getData('text/plain')
  if (text?.trim()) {
    videoStore.inputUrl = text.trim()
    showTools.value = true
    nextTick(() => { autoResize(); handleParse() })
    return
  }

  // 处理 .txt 文件拖拽 — 读取其中链接
  const file = dt.files?.[0]
  if (file && (file.type === 'text/plain' || file.name.endsWith('.txt'))) {
    const reader = new FileReader()
    reader.onload = () => {
      const content = (reader.result as string)?.trim()
      if (content) {
        videoStore.inputUrl = content
        showTools.value = true
        nextTick(() => { autoResize(); handleParse() })
      }
    }
    reader.readAsText(file)
  }
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText()
    if (text.trim()) {
      videoStore.inputUrl = text.trim()
      showTools.value = true
      handleParse()
    }
  } catch {
    // 浏览器不支持或用户拒绝
  }
}

function clearInput() {
  videoStore.inputUrl = ''
  videoStore.clearResult()
  showTools.value = false
  isMultiline.value = false
  nextTick(() => {
    autoResize()
    inputRef.value?.focus()
  })
}

function toggleHistory() {
  historyOpen.value = !historyOpen.value
}

function useHistoryItem(item: HistoryItem) {
  videoStore.inputUrl = item.url
  historyOpen.value = false
  showTools.value = true
  handleParse()
}

function onClickOutside(e: MouseEvent) {
  if (cardRef.value && !cardRef.value.contains(e.target as Node)) {
    historyOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', onClickOutside, true)
  document.addEventListener('click', onDocClick)
})

onUnmounted(() => {
  document.removeEventListener('click', onClickOutside, true)
  document.removeEventListener('click', onDocClick)
})

async function handleParse() {
  if (!videoStore.inputUrl.trim()) return
  showTools.value = true
  try { await videoStore.smartParse(videoStore.inputUrl.trim()) } catch { /* store handles */ }
}
</script>

<style lang="scss" scoped>
@use '@/styles/mixins' as *;

// ============================================================
// Hero Search — 英雄区居中搜索
// ============================================================
.hero-search {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  width: 100%;
  max-width: 680px;
  margin: 0 auto;
  padding: var(--spacing-md) 0;

  // ---- 一体化卡片容器 ----
  &__card {
    width: 100%;
    backdrop-filter: blur(var(--glass-blur)) saturate(150%);
    -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(150%);
    background: var(--search-card-bg);
    border: 1px solid rgba(255, 255, 255, var(--glass-border-opacity));
    border-radius: var(--radius-lg);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12), var(--shadow-card-inner);
    transition: all 0.3s var(--ease-out);
    animation: fadeInUp 0.6s var(--ease-out) 0.1s both;

    &.focused,
    &.hasValue {
      background: var(--search-card-bg-focus);
      border-color: var(--color-border-focus);
      box-shadow: 0 8px 40px rgba(0, 0, 0, 0.18),
                  0 0 0 1px var(--color-border-focus),
                  0 0 40px rgba(251, 114, 153, 0.08);
    }
  }

  // ---- 搜索栏（卡片上半） ----
  &__bar {
    width: 100%;
    display: flex;
    align-items: center;
    min-height: 52px;
    padding: 0 12px 0 20px;
    gap: 12px;

    // 多行时按钮贴底
    &.multiline {
      align-items: flex-end;
      padding: 10px 8px 10px 20px;
    }

    @include mobile {
      min-height: 48px;
      padding: 6px 6px 6px 16px;
      gap: 8px;
    }
  }

  // ---- 分隔线 ----
  &__divider {
    height: 1px;
    margin: 0 16px;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.06) 20%,
      rgba(255, 255, 255, 0.06) 80%,
      transparent
    );
  }

  &__bar-icon {
    color: var(--color-text-placeholder);
    font-size: 14px;
    flex-shrink: 0;
    transition: color var(--transition-fast);

    .hero-search__card.focused & {
      color: var(--color-primary);
    }
  }

  &__input {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    color: var(--color-text-primary);
    font-size: 15px;
    font-family: var(--font-family);
    outline: none;
    resize: none;
    overflow-y: auto;
    line-height: 22px;
    height: 22px;
    max-height: 110px;
    padding: 0;
    margin: 0;

    &::placeholder {
      color: var(--color-text-placeholder);
    }

    @include mobile {
      font-size: 14px;
    }
  }

  &__clear {
    @include btn-reset;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    color: var(--color-text-secondary);
    font-size: 12px;
    flex-shrink: 0;

    &:hover {
      background: var(--color-bg-hover);
      color: var(--color-text-primary);
    }
  }

  &__submit {
    @include btn-reset;
    height: 40px;
    padding: 0 20px;
    border-radius: var(--radius-full);
    background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
    color: white;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    flex-shrink: 0;
    gap: 6px;
    box-shadow: 0 2px 12px var(--color-primary-glow);
    transition: all 0.25s var(--ease-out);

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 6px 24px var(--color-primary-glow);
    }

    &:active:not(:disabled) {
      transform: translateY(0);
    }

    @include mobile {
      height: 36px;
      padding: 0 14px;
    }
  }

  &__submit-text {
    @include mobile {
      display: none;
    }
  }

  // ---- 工具行（卡片下半） ----
  &__tools {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px 8px 20px;
    gap: var(--spacing-sm);

    @include mobile {
      flex-wrap: wrap;
      justify-content: center;
      padding: 6px 10px;
    }
  }

  &__options {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    @include hide-scrollbar;
  }

  &__actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
}

// ---- Pill 按钮 ----
.action-pill {
  @include btn-reset;
  padding: 4px 12px;
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  gap: 4px;
  border: 1px solid transparent;

  &:hover {
    color: var(--color-primary);
    background: var(--color-primary-light);
    border-color: rgba(251, 114, 153, 0.15);
  }

  @include mobile {
    span { display: none; }
    padding: 4px 8px;
  }
}

// ---- 工具行动画 ----
.tools-fade-enter-active { transition: all 0.3s var(--ease-out); }
.tools-fade-leave-active { transition: all 0.2s ease; }
.tools-fade-enter-from { opacity: 0; transform: translateY(-6px); }
.tools-fade-leave-to { opacity: 0; transform: translateY(-4px); }

// ---- 历史记录 ----
.history-panel {
  position: absolute;
  top: calc(100%);
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 420px;
  @include glass-elevated;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: 50;
  overflow: hidden;
  margin-top: var(--spacing-xs);

  &__head {
    padding: var(--spacing-sm) var(--spacing-md);
    border-bottom: 1px solid var(--color-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);

    button {
      @include btn-reset;
      font-size: var(--font-size-xs);
      color: var(--color-danger);
      padding: 2px 8px;
      border-radius: var(--radius-sm);
      &:hover { background: rgba(255, 71, 87, 0.1); }
    }
  }

  &__list {
    max-height: 220px;
    overflow-y: auto;
  }
}

.history-item {
  display: flex;
  align-items: center;
  padding: var(--spacing-sm) var(--spacing-md);
  cursor: pointer;
  transition: background var(--transition-fast);
  border-bottom: 1px solid var(--color-border);

  &:hover { background: var(--color-bg-hover); }
  &:last-child { border-bottom: none; }

  &__title {
    flex: 1;
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    @include text-ellipsis;
  }

  &__del {
    @include btn-reset;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    color: var(--color-text-secondary);
    font-size: var(--font-size-xs);
    flex-shrink: 0;
    &:hover { color: var(--color-danger); background: rgba(255, 71, 87, 0.1); }
  }
}

.drop-enter-active { transition: all 0.2s var(--ease-out); }
.drop-leave-active { transition: all 0.15s ease; }
.drop-enter-from, .drop-leave-to { opacity: 0; transform: translate(-50%, -8px); }

// ---- 自定义下拉选择器 ----
.custom-select {
  position: relative;
  flex-shrink: 0;

  &__trigger {
    padding: 4px 10px;
    font-size: var(--font-size-xs);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: var(--color-bg-input);
    color: var(--color-text-primary);
    cursor: url("/cursor-pointer.svg") 6 2, pointer;
    transition: all 0.2s;
    font-family: var(--font-family);
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    user-select: none;

    i {
      font-size: 10px;
      transition: transform 0.2s;
      &.rotated { transform: rotate(180deg); }
    }

    &:hover { border-color: var(--color-primary); }
  }

  &__menu {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    min-width: 90px;
    background: var(--color-bg-elevated, #1e1e2e);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-md, 10px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    overflow: hidden;
    z-index: 200;
    backdrop-filter: blur(16px);
  }

  &__item {
    padding: 8px 16px;
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    cursor: url("/cursor-pointer.svg") 6 2, pointer;
    transition: all 0.15s;
    white-space: nowrap;

    &:hover {
      background: rgba(251, 114, 153, 0.1);
      color: var(--color-text-primary);
    }

    &.active {
      color: #fb7299;
      font-weight: 600;
      background: rgba(251, 114, 153, 0.08);
    }
  }
}

// ---- 下拉动画 ----
.dropdown-enter-active { transition: all 0.2s ease; }
.dropdown-leave-active { transition: all 0.15s ease; }
.dropdown-enter-from, .dropdown-leave-to { opacity: 0; transform: translateX(-50%) translateY(6px); }
</style>
