<template>
  <Transition name="bubble">
    <div v-if="currentBubble" class="mascot-bubble" :class="'mascot-bubble--' + (currentBubble.type || 'info')">
      <div class="mascot-bubble__text">
        <span ref="textEl">{{ displayText }}</span>
        <span v-if="typing" class="mascot-bubble__cursor">|</span>
      </div>
      <div class="mascot-bubble__tail"></div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import type { BubbleMsg } from '@/composables/useMascot'

const props = defineProps<{ currentBubble: BubbleMsg | null }>()

const displayText = ref('')
const typing = ref(false)
let typeTimer: ReturnType<typeof setInterval> | null = null

// 打字机动画
watch(() => props.currentBubble, (msg) => {
  if (typeTimer) clearInterval(typeTimer)
  if (!msg) { displayText.value = ''; typing.value = false; return }

  const full = msg.text
  displayText.value = ''
  typing.value = true
  let i = 0

  typeTimer = setInterval(() => {
    if (i < full.length) {
      displayText.value += full[i]
      i++
    } else {
      typing.value = false
      if (typeTimer) clearInterval(typeTimer)
    }
  }, 40)
}, { immediate: true })

onUnmounted(() => { if (typeTimer) clearInterval(typeTimer) })
</script>

<style lang="scss" scoped>
.mascot-bubble {
  position: fixed;
  bottom: 340px; left: calc(50vw - 340px);
  max-width: 260px; min-width: 120px;
  padding: 10px 14px;
  border-radius: 12px 12px 12px 4px;
  font-size: 13px; line-height: 1.5;
  z-index: 9990;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  animation: bubblePop 0.3s ease;
  pointer-events: none;

  // 默认样式
  background: rgba(30, 30, 40, 0.92);
  backdrop-filter: blur(12px);
  color: #eee;
  border: 1px solid rgba(255, 255, 255, 0.08);

  &--success {
    border-color: rgba(0, 200, 120, 0.3);
    .mascot-bubble__text { color: #a0f0c0; }
  }
  &--error {
    border-color: rgba(251, 114, 153, 0.3);
    .mascot-bubble__text { color: #ffb0b0; }
  }

  &__text { word-break: break-word; }
  &__cursor {
    display: inline-block;
    animation: blink 0.6s step-end infinite;
    color: var(--color-primary, #FB7299);
    margin-left: 1px;
  }

  // 小尾巴
  &__tail {
    position: absolute;
    bottom: -6px; left: 16px;
    width: 12px; height: 12px;
    background: inherit;
    clip-path: polygon(0 0, 100% 0, 50% 100%);
    border: inherit;
  }
}

// Transition
.bubble-enter-active { animation: bubblePop 0.3s ease; }
.bubble-leave-active { animation: bubblePop 0.2s ease reverse; }

@keyframes bubblePop {
  0% { opacity: 0; transform: scale(0.8) translateY(8px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes blink { 50% { opacity: 0; } }

// 移动端适配
@media (max-width: 767px) {
  .mascot-bubble {
    left: 12px;
    bottom: 120px;
    max-width: calc(100vw - 24px);
    font-size: 12px;
    padding: 8px 12px;
  }
}
</style>
