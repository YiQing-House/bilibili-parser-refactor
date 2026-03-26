<template>
  <header class="header" :class="{ scrolled: isScrolled }">
    <div class="header__inner">
      <!-- Logo -->
      <a href="/" class="header__logo">
        <svg viewBox="0 0 24 24" width="24" height="24" class="logo-icon">
          <rect x="2" y="4" width="8" height="14" rx="2" fill="#FB7299"/>
          <rect x="12" y="4" width="8" height="14" rx="2" fill="#00A1D6"/>
          <rect x="4" y="2" width="4" height="4" rx="1" fill="#FB7299" opacity="0.7"/>
          <rect x="16" y="2" width="4" height="4" rx="1" fill="#00A1D6" opacity="0.7"/>
        </svg>
        <span class="logo-text">视频去水印助手</span>
      </a>

      <!-- Actions -->
      <div class="header__actions">

        <!-- APP 下载按钮 -->
        <button class="app-download-btn" @click="showAppModal = true" title="下载 APP">
          <i class="fas fa-mobile-screen"></i>
          <span class="app-download-btn__text">APP</span>
        </button>

        <template v-if="authStore.isLoggedIn">
          <div class="user-pill">
            <img v-if="authStore.userInfo?.avatar" :src="authStore.userInfo.avatar" class="user-avatar" referrerpolicy="no-referrer" />
            <span class="user-name">{{ authStore.userInfo?.name }}</span>
            <span :class="['vip-tag', { active: authStore.isVip }]">
              {{ authStore.isVip ? (authStore.vipLabel || '大会员') : '普通用户' }}
            </span>
          </div>
          <button class="text-btn text-btn--muted" @click="handleLogout">退出</button>
        </template>

        <button v-else class="login-btn" @click="showLoginModal = true">
          <i class="fas fa-user"></i> 登录
        </button>
      </div>
    </div>

    <LoginModal v-model:visible="showLoginModal" @login-success="onLoginSuccess" />

    <!-- APP 下载弹窗 -->
    <Teleport to="body">
      <div v-if="showAppModal" class="modal-overlay" @click.self="showAppModal = false">
        <div class="app-modal">
          <div class="app-modal__header">
            <h3><i class="fas fa-mobile-screen"></i> 下载 bilibilias</h3>
            <button class="modal-close" @click="showAppModal = false">✕</button>
          </div>
          <div class="app-modal__body">
            <p class="app-modal__desc">移动端 B 站视频下载工具，支持更多功能</p>
            <div v-if="appLoading" class="app-modal__loading">
              <i class="fas fa-spinner fa-spin"></i> 加载中...
            </div>
            <div v-else-if="appList.length === 0" class="app-modal__empty">
              <i class="fas fa-box-open"></i>
              <p>暂无可用安装包</p>
            </div>
            <div v-else class="app-modal__list">
              <div v-for="app in appList" :key="app.filename" class="app-item">
                <div class="app-item__icon">
                  <i class="fab fa-android"></i>
                </div>
                <div class="app-item__info">
                  <div class="app-item__name">
                    bilibilias
                    <span :class="['app-item__variant', app.variant]">{{ variantLabel(app.variant) }}</span>
                  </div>
                  <div class="app-item__meta">
                    v{{ app.version }} · {{ app.sizeStr }}
                  </div>
                </div>
                <a :href="'/api/app/download/' + app.filename" class="app-item__download" download>
                  <i class="fas fa-download"></i>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </header>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import LoginModal from '@/components/common/LoginModal.vue'

const authStore = useAuthStore()
const showLoginModal = ref(false)
const isScrolled = ref(false)

// APP 下载
const showAppModal = ref(false)
const appList = ref<any[]>([])
const appLoading = ref(false)

const emit = defineEmits<{
  (e: 'toast', message: string, type: string): void
}>()

function onScroll() {
  isScrolled.value = window.scrollY > 10
}

onMounted(() => {
  authStore.checkStatus()
  window.addEventListener('scroll', onScroll, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
})

function onLoginSuccess() {
  emit('toast', '登录成功！', 'success')
}

async function handleLogout() {
  await authStore.logout()
  emit('toast', '已退出登录', 'info')
}

function variantLabel(v: string) {
  const map: Record<string, string> = { official: '正式版', beta: '测试版', alpha: '内测版' }
  return map[v] || v
}

// 打开弹窗时加载列表
watch(showAppModal, async (val) => {
  if (val && appList.value.length === 0) {
    appLoading.value = true
    try {
      const res = await fetch('/api/app/list')
      const data = await res.json()
      appList.value = data.apps || []
    } catch (e) {
      console.error('[App] 加载失败:', e)
    } finally {
      appLoading.value = false
    }
  }
})
</script>

<style lang="scss" scoped>
@use '@/styles/mixins' as *;

.header {
  position: sticky;
  top: 0;
  z-index: 100;
  height: var(--nav-height);
  // B站品牌渐变背景
  background: linear-gradient(135deg, rgba(0, 161, 214, 0.12) 0%, rgba(251, 114, 153, 0.10) 100%),
              var(--color-bg-body);
  border-bottom: none;
  transition: all var(--transition-base);

  // 蓝粉渐变底部装饰线
  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, #00A1D6 0%, #FB7299 50%, #00A1D6 100%);
  }

  &.scrolled {
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  }

  &__inner {
    max-width: var(--container-max-width);
    margin: 0 auto;
    padding: 0 var(--spacing-md);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-md);
    height: 100%;

    @include wide-up {
      max-width: 1080px;
    }
  }

  &__logo {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    text-decoration: none;
    transition: opacity var(--transition-fast);

    &:hover {
      opacity: 0.85;
      .logo-text { color: var(--color-primary); }
    }

    .logo-icon {
      width: 24px;
      height: 24px;
      flex-shrink: 0;
    }

    .logo-text {
      font-size: 16px;
      font-weight: var(--font-weight-bold);
      color: var(--color-text-primary);
      letter-spacing: -0.02em;
      transition: color var(--transition-fast);

      @include mobile {
        font-size: 14px;
      }
    }
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }
}

// 主题切换按钮 — B站蓝色
.icon-btn {
  @include btn-reset;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  color: var(--color-blue);
  font-size: var(--font-size-md);

  &:hover {
    background: rgba(0, 161, 214, 0.12);
    color: var(--color-blue);
  }
}

// 登录按钮 — B站粉色品牌渐变
.login-btn {
  @include btn-reset;
  padding: 6px 16px;
  border-radius: var(--radius-full);
  font-size: 14px;
  color: white;
  background: linear-gradient(135deg, #FB7299, #FF6A8A);
  font-weight: var(--font-weight-medium);
  box-shadow: 0 2px 8px rgba(251, 114, 153, 0.3);
  transition: all var(--transition-fast);

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(251, 114, 153, 0.4);
  }
}

.text-btn {
  @include btn-reset;
  padding: 4px 12px;
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);

  &--muted {
    color: var(--color-text-secondary);
    &:hover { color: var(--color-danger); background: var(--color-bg-hover); }
  }
}

.user-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px 3px 3px;
  background: rgba(251, 114, 153, 0.08);
  border-radius: var(--radius-full);
  border: 1px solid rgba(251, 114, 153, 0.15);
}

.user-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  object-fit: cover;
}

.user-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);

  @include mobile { display: none; }
}

.vip-tag {
  font-size: var(--font-size-xs);
  padding: 1px 6px;
  border-radius: var(--radius-full);
  background: var(--color-bg-input);
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-bold);

  &.active {
    background: linear-gradient(135deg, #FB7299, #FF9B8B);
    color: white;
  }
}

// APP 下载按钮
.app-download-btn {
  @include btn-reset;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: var(--radius-full);
  font-size: 13px;
  color: #00A1D6;
  background: rgba(0, 161, 214, 0.08);
  border: 1px solid rgba(0, 161, 214, 0.15);
  transition: all var(--transition-fast);

  &:hover {
    background: rgba(0, 161, 214, 0.18);
    transform: translateY(-1px);
  }

  &__text {
    font-weight: var(--font-weight-medium);
    @include mobile { display: none; }
  }
}
</style>

<!-- APP 弹窗样式（不加 scoped） -->
<style lang="scss">
.app-modal {
  background: var(--color-bg-card, #1e1e1e);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  width: 90%;
  max-width: 420px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  animation: slideUp 0.3s ease;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    background: linear-gradient(135deg, #00A1D6, #3FC9FF);

    h3 {
      font-size: 1rem;
      font-weight: 600;
      color: white;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
  }

  &__body {
    padding: 16px 20px 20px;
  }

  &__desc {
    color: var(--color-text-secondary, #999);
    font-size: 0.85rem;
    margin-bottom: 16px;
  }

  &__loading, &__empty {
    text-align: center;
    padding: 32px 0;
    color: var(--color-text-secondary, #999);

    i { font-size: 24px; margin-bottom: 8px; display: block; }
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
}

.app-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: all 0.15s;

  &:hover { background: rgba(255, 255, 255, 0.08); }

  &__icon {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: linear-gradient(135deg, #3DDC84, #2BAE6A);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 20px;
    flex-shrink: 0;
  }

  &__info { flex: 1; min-width: 0; }

  &__name {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-text-primary, #e0e0e0);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  &__variant {
    font-size: 0.7rem;
    padding: 1px 6px;
    border-radius: 4px;
    font-weight: 500;

    &.official { background: rgba(0, 161, 214, 0.15); color: #00A1D6; }
    &.beta { background: rgba(251, 114, 153, 0.15); color: #FB7299; }
    &.alpha { background: rgba(255, 152, 0, 0.15); color: #FF9800; }
  }

  &__meta {
    font-size: 0.75rem;
    color: var(--color-text-secondary, #999);
    margin-top: 2px;
  }

  &__download {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: linear-gradient(135deg, #00A1D6, #3FC9FF);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 14px;
    flex-shrink: 0;
    text-decoration: none;
    transition: all 0.15s;

    &:hover { transform: scale(1.1); box-shadow: 0 4px 12px rgba(0, 161, 214, 0.3); }
  }
}
</style>
