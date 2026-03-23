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
  </header>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import LoginModal from '@/components/common/LoginModal.vue'

const appStore = useAppStore()
const authStore = useAuthStore()
const showLoginModal = ref(false)
const isScrolled = ref(false)

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
</style>
