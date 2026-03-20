<template>
  <Transition name="mchat-input">
    <div v-if="chatOpen" class="mchat-input" @click.stop>
      <textarea
        ref="inputRef"
        v-model="input"
        @keydown="onKey"
        :placeholder="loading ? '思考中...' : '和看板娘聊天~（Enter 发送）'"
        :disabled="loading"
        rows="1"
      ></textarea>
      <button @click="send" :disabled="!input.trim() || loading">
        <i :class="loading ? 'fas fa-spinner fa-spin' : 'fas fa-paper-plane'"></i>
      </button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import api from '@/services/api'
import { userContext, showBubble } from '@/composables/useMascot'

const props = defineProps<{ chatOpen: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const input = ref('')
const loading = ref(false)
const inputRef = ref<HTMLTextAreaElement>()
const history = ref<{ role: string; content: string }[]>([])

// 聊天框打开时自动聚焦
watch(() => props.chatOpen, (open) => {
  if (open) nextTick(() => inputRef.value?.focus())
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
  if (e.key === 'Escape') {
    emit('close')
  }
}

async function send() {
  const text = input.value.trim()
  if (!text || loading.value) return

  history.value.push({ role: 'user', content: text })
  input.value = ''
  loading.value = true

  // 先在对话框显示用户发的
  showBubble({ text: `💭 ${text}`, type: 'chat', duration: 3000 })

  try {
    const { data } = await api.post('/api/chat', {
      message: text,
      context: userContext.value,
      history: history.value.slice(-10),
    })
    const reply = data.reply || '...'
    history.value.push({ role: 'assistant', content: reply })
    // AI 回复显示在看板娘原生对话框
    showBubble({ text: reply, type: 'chat', duration: 8000 })
  } catch {
    showBubble({ text: '网络好像出问题了…😥', type: 'error', duration: 5000 })
  } finally {
    loading.value = false
    nextTick(() => inputRef.value?.focus())
  }
}
</script>

<style lang="scss" scoped>
@use '@/styles/mixins' as *;

.mchat-input {
  position: fixed;
  /* 底部居中，不挡住左下角看板娘 */
  bottom: 16px; left: 50%;
  transform: translateX(-50%);
  display: flex; gap: 6px;
  padding: 6px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  z-index: 9000;
  width: 240px;

  [data-theme="dark"] & {
    background: rgba(35, 35, 50, 0.88);
    border-color: rgba(255, 255, 255, 0.08);
  }

  textarea {
    flex: 1; border: none; outline: none; resize: none;
    background: transparent;
    color: #333; padding: 5px 8px;
    font-size: 12px; font-family: inherit; line-height: 1.4;
    border-radius: 14px;
    &::placeholder { color: #aaa; font-size: 11px; }
    &:disabled { opacity: 0.6; }
    [data-theme="dark"] & { color: #eee; &::placeholder { color: #777; } }
  }

  button {
    @include btn-reset;
    width: 28px; height: 28px; border-radius: 50%;
    background: var(--color-primary, #FB7299); color: white;
    font-size: 11px; flex-shrink: 0;
    &:hover { filter: brightness(1.1); }
    &:disabled { opacity: 0.3; }
  }
}

.mchat-input-enter-active { animation: inputSlide 0.2s ease; }
.mchat-input-leave-active { animation: inputSlide 0.15s ease reverse; }
@keyframes inputSlide {
  0% { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
}
</style>
