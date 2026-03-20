<template>
  <div class="disclaimer-bar">
    <div class="disclaimer-bar__inner">
      <div class="disclaimer-bar__track">
        <span class="disclaimer-bar__text">
          <i class="fas fa-shield-alt disclaimer-bar__icon"></i>
          本工具仅供学习交流 · 内容版权归原作者所有 · 使用即表示同意服务条款
        </span>
        <span class="disclaimer-bar__text" aria-hidden="true">
          <i class="fas fa-shield-alt disclaimer-bar__icon"></i>
          本工具仅供学习交流 · 内容版权归原作者所有 · 使用即表示同意服务条款
        </span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/styles/mixins' as *;

// ============================================================
// 免责声明 — 方案A 品牌融合 info-bar + 滚动
// 半透明毛玻璃融入品牌设计语言，低调专业
// ============================================================
.disclaimer-bar {
  position: relative;
  z-index: 999; // 低于侧边栏(9998)和弹窗(10000)
  width: 100%;
  overflow: hidden;

  // 半透明毛玻璃背景 — 融入整体设计
  backdrop-filter: blur(12px) saturate(130%);
  -webkit-backdrop-filter: blur(12px) saturate(130%);
  background: rgba(251, 114, 153, 0.06);
  border-bottom: 1px solid rgba(251, 114, 153, 0.10);

  &__inner {
    padding: 6px 0;
  }

  &__track {
    display: flex;
    white-space: nowrap;
    animation: disclaimerScroll 36s linear infinite;
    will-change: transform;

    &:hover {
      animation-play-state: paused;
    }
  }

  &__icon {
    font-size: 0.7em;
    opacity: 0.55;
    margin-right: 6px;
  }

  &__text {
    flex-shrink: 0;
    padding: 0 64px;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-normal);
    color: var(--color-text-secondary);
    letter-spacing: 0.02em;
    line-height: 1.5;
  }
}

// 亮色主题微调
:global([data-theme="light"]) .disclaimer-bar {
  background: rgba(0, 161, 214, 0.04);
  border-bottom-color: rgba(0, 161, 214, 0.08);
}

@keyframes disclaimerScroll {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
}
</style>
