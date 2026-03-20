<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-bg" @click.self="close">
        <div class="modal">
          <div class="modal__head">
            <h3>扫码登录</h3>
            <button class="modal__x" @click="close">✕</button>
          </div>
          <div class="modal__body">
            <div class="qr-box">
              <!-- 正常二维码（隐藏直到加载完成） -->
              <img
                v-if="qrcodeUrl && status !== 'error'"
                :src="qrcodeUrl"
                alt="QR"
                class="qr-img"
                :style="{ opacity: imgLoaded ? 1 : 0, position: imgLoaded ? 'static' : 'absolute' }"
                @load="imgLoaded = true"
              />
              <!-- 加载中：获取二维码 或 图片渲染中 -->
              <LoadingSpinner
                v-if="status === 'loading' || (qrcodeUrl && !imgLoaded && status !== 'error')"
                size="md"
                :text="status === 'loading' ? '正在获取二维码...' : '正在加载二维码，请稍后...'"
              />
              <!-- 错误态 -->
              <div v-else-if="status === 'error'" class="qr-error">
                <i class="fas fa-exclamation-circle"></i>
                <span>{{ errorMsg }}</span>
              </div>
              <!-- 过期 -->
              <div v-if="status === 'expired'" class="qr-expired" @click="refreshQR">
                <i class="fas fa-redo"></i> 已过期，点击刷新
              </div>
              <!-- 已扫码 -->
              <div v-if="status === 'scanned'" class="qr-scanned">
                <i class="fas fa-check-circle"></i> 已扫码，请确认
              </div>
            </div>
            <!-- 错误时显示重试按钮 -->
            <button v-if="status === 'error'" class="retry-qr-btn" @click="refreshQR">
              <i class="fas fa-redo"></i> 重新获取二维码
            </button>
            <p class="modal__hint">使用<strong>哔哩哔哩 APP</strong>扫描二维码</p>
            <p class="modal__sub">登录后可使用大会员画质</p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'loginSuccess'): void
}>()

const authStore = useAuthStore()
const qrcodeUrl = ref('')
const imgLoaded = ref(false)
const status = ref<'loading' | 'waiting' | 'scanned' | 'expired' | 'error'>('loading')
const errorMsg = ref('')

watch(() => props.visible, async (v) => { v ? await refreshQR() : authStore.stopQRPolling() })

async function refreshQR() {
  status.value = 'loading'
  qrcodeUrl.value = ''
  imgLoaded.value = false
  errorMsg.value = ''
  try {
    const d = await authStore.getQRCode()
    qrcodeUrl.value = d.qrcodeUrl
    status.value = 'waiting'
    authStore.startQRPolling(d.qrcodeKey, {
      onScanned: () => { status.value = 'scanned' },
      onConfirmed: () => { emit('loginSuccess'); close() },
      onExpired: () => { status.value = 'expired' },
    })
  } catch (err: unknown) {
    console.error('[LoginModal] 二维码获取失败:', err)
    status.value = 'error'
    // 精确区分错误类型
    const e = err as { message?: string; code?: string; response?: { status: number } }
    if (e.code === 'ECONNABORTED') {
      errorMsg.value = '请求超时，请检查网络'
    } else if (e.message?.includes('网络连接失败') || e.message?.includes('Network Error')) {
      errorMsg.value = '后端服务未启动，请先运行后端'
    } else if (e.response?.status === 502 || e.response?.status === 503) {
      errorMsg.value = '后端服务暂不可用'
    } else {
      errorMsg.value = e.message || '获取二维码失败，请重试'
    }
  }
}

function close() { authStore.stopQRPolling(); emit('update:visible', false) }
</script>

<style lang="scss" scoped>
@use '@/styles/mixins' as *;

.modal-bg {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
}

.modal {
  @include glass-elevated;
  border-radius: var(--radius-lg);
  width: 340px; max-width: 90vw;
  box-shadow: var(--shadow-lg);
  overflow: hidden;

  &__head {
    display: flex; align-items: center; justify-content: space-between;
    padding: var(--spacing-md) var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);
    h3 { font-size: var(--font-size-md); color: var(--color-primary); }
  }

  &__x {
    @include btn-reset;
    width: 28px; height: 28px; border-radius: 50%;
    color: var(--color-text-secondary); font-size: 1rem;
    &:hover { color: var(--color-primary); background: var(--color-bg-hover); }
  }

  &__body {
    padding: var(--spacing-lg);
    display: flex; flex-direction: column; align-items: center; gap: var(--spacing-md);
  }

  &__hint { font-size: var(--font-size-sm); text-align: center; }
  &__sub { font-size: var(--font-size-xs); color: var(--color-text-secondary); text-align: center; }
}

.qr-box {
  position: relative; width: 180px; height: 180px;
  display: flex; align-items: center; justify-content: center;
  background: white; border-radius: var(--radius-md);
  overflow: hidden;
}

.qr-img { width: 160px; height: 160px; }

.qr-error {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: var(--spacing-md);
  text-align: center;
  i { font-size: 2rem; color: var(--color-danger); }
  span { font-size: var(--font-size-xs); color: var(--color-text-secondary); line-height: 1.4; }
}

.retry-qr-btn {
  @include btn-reset;
  padding: 6px 16px;
  border-radius: var(--radius-full);
  font-size: var(--font-size-sm);
  color: white;
  background: var(--color-primary);
  gap: 4px;
  &:hover { filter: brightness(1.1); }
}

.qr-expired {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  background: rgba(0,0,0,0.75); color: white; cursor: pointer; font-size: var(--font-size-sm);
}

.qr-scanned {
  position: absolute; bottom: 0; left: 0; right: 0;
  display: flex; align-items: center; justify-content: center; gap: 4px;
  padding: 6px;
  background: rgba(46, 213, 115, 0.9); color: white; font-size: var(--font-size-xs);
}

.modal-enter-active, .modal-leave-active { transition: opacity 0.25s; .modal { transition: transform 0.25s var(--ease-out); } }
.modal-enter-from, .modal-leave-to { opacity: 0; .modal { transform: scale(0.95) translateY(8px); } }
</style>
