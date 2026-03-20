<template>
  <footer class="footer">
    <div class="footer__divider"></div>
    <div class="footer__inner">
      <div class="footer__links">
        <a href="javascript:void(0)" @click="showAbout = true">关于我们</a>
        <span class="sep">·</span>
        <a href="javascript:void(0)" @click="showUsage = true">使用说明</a>
        <span class="sep">·</span>
        <a href="javascript:void(0)" @click="showFeedback = true">建议反馈</a>
      </div>
      <p class="footer__copy">视频去水印助手 © 2025 · 仅供技术学习交流</p>
    </div>

    <!-- 关于我们 弹窗 -->
    <Teleport to="body">
      <div v-if="showAbout" class="modal-overlay" @click.self="showAbout = false">
        <div class="modal-card">
          <div class="modal-header">
            <h3>ℹ️ 关于我们</h3>
            <button class="modal-close" @click="showAbout = false">✕</button>
          </div>
          <div class="modal-body">
            <h4>B站视频下载助手</h4>
            <p>专注于B站视频下载的全栈工具，支持批量处理、收藏夹、用户投稿等功能。</p>
            <p><strong>主要功能：</strong></p>
            <ul>
              <li>多链接处理（单个、批量、收藏夹、用户投稿）</li>
              <li>多格式下载（视音完整、分离、仅音频、纯画面、封面）</li>
              <li>多画质支持（4K、1080P高帧率、1080P、720P 等）</li>
              <li>网站登录、VIP 权限检测</li>
              <li>现代化 UI（毛玻璃效果、主题切换、二次元背景）</li>
            </ul>
            <p class="tip">💡 建议登录B站账号后使用，可享受更好的体验和更高画质！</p>
            <p class="version">版本：v3.0.0（Refactored）</p>
          </div>
          <div class="modal-footer">
            <button class="modal-btn" @click="showAbout = false">关闭</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 使用说明 弹窗 -->
    <Teleport to="body">
      <div v-if="showUsage" class="modal-overlay" @click.self="showUsage = false">
        <div class="modal-card">
          <div class="modal-header">
            <h3>📖 使用说明</h3>
            <button class="modal-close" @click="showUsage = false">✕</button>
          </div>
          <div class="modal-body scrollable">
            <h4>单链接去水印</h4>
            <ol>
              <li>在搜索框输入视频链接</li>
              <li>选择处理方式（完整 / 分离 / 封面）</li>
              <li>选择画质（4K / 1080P / 720P 等）</li>
              <li>点击"去水印下载"</li>
            </ol>

            <h4>批量处理</h4>
            <ol>
              <li>在搜索框输入多个链接（换行分隔）</li>
              <li>系统自动识别并批量处理</li>
              <li>点击"全部下载"或单独下载</li>
            </ol>

            <h4>收藏夹处理</h4>
            <ol>
              <li>输入收藏夹链接或 ID</li>
              <li>系统自动处理收藏夹内所有视频</li>
            </ol>

            <h4>登录建议</h4>
            <p class="tip">
              💡 建议登录B站账号后使用！<br>
              • 登录后可获取更高画质（1080P+、4K）<br>
              • 大会员用户可下载会员专属画质<br>
              • 登录后系统会自动检测您的权限
            </p>
          </div>
          <div class="modal-footer">
            <button class="modal-btn" @click="showUsage = false">关闭</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 建议反馈 弹窗 -->
    <Teleport to="body">
      <div v-if="showFeedback" class="modal-overlay" @click.self="showFeedback = false">
        <div class="modal-card">
          <div class="modal-header">
            <h3>💬 建议反馈</h3>
            <button class="modal-close" @click="showFeedback = false">✕</button>
          </div>
          <div class="modal-body">
            <p>感谢您的使用！如果您有任何建议或反馈，欢迎联系我们。</p>
            <h4>联系方式</h4>
            <p><strong>GitHub Issues：</strong></p>
            <p><a href="https://github.com/YiQing-House/bilibili-parser/issues" target="_blank" rel="noopener" style="color: #00a1d6;">https://github.com/YiQing-House/bilibili-parser/issues</a></p>
            <p class="tip">其他联系方式将在后续更新中添加...</p>
            <p>我们会认真对待每一条反馈，感谢您的支持！</p>
          </div>
          <div class="modal-footer">
            <button class="modal-btn" @click="showFeedback = false">关闭</button>
          </div>
        </div>
      </div>
    </Teleport>
  </footer>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const showAbout = ref(false)
const showUsage = ref(false)
const showFeedback = ref(false)
</script>

<style lang="scss" scoped>
@use '@/styles/mixins' as *;

.footer {
  position: relative;
  z-index: 2;
  padding: var(--spacing-xs) var(--spacing-md) var(--spacing-sm);
  text-align: center;

  &__divider {
    max-width: var(--container-max-width);
    margin: 0 auto var(--spacing-xs);
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      var(--color-primary) 20%,
      var(--color-blue) 80%,
      transparent 100%
    );
    opacity: 0.35;
  }

  &__inner {
    max-width: var(--container-max-width);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-xs);
  }

  &__links {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);

    a {
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      text-decoration: none;
      cursor: pointer;
      transition: color var(--transition-fast);
      &:hover { color: var(--color-primary); }
    }

    .sep {
      color: var(--color-text-secondary);
      opacity: 0.3;
      font-size: var(--font-size-xs);
    }
  }

  &__copy {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    opacity: 0.6;
  }
}
</style>

<!-- 弹窗全局样式（不加 scoped） -->
<style lang="scss">
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 10000;
  display: flex;
  justify-content: center;
  align-items: center;
  animation: fadeIn 0.2s ease;
}

.modal-card {
  background: var(--color-bg-card, #1e1e1e);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  width: 90%;
  max-width: 480px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  animation: slideUp 0.3s ease;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 24px;
  background: linear-gradient(135deg, #fb7299, #00a1d6);

  h3 {
    font-size: 1.1rem;
    font-weight: 600;
    color: white;
    margin: 0;
  }
}

.modal-close {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.35);
  }
}

.modal-body {
  padding: 24px;
  color: var(--color-text-primary, #e0e0e0);
  line-height: 1.8;

  &.scrollable {
    max-height: 55vh;
    overflow-y: auto;
  }

  h4 {
    color: #fb7299;
    margin: 16px 0 8px;
    font-size: 1rem;

    &:first-child {
      margin-top: 0;
    }
  }

  p {
    margin-bottom: 12px;
  }

  ul, ol {
    padding-left: 20px;
    margin-bottom: 12px;

    li {
      margin-bottom: 4px;
    }
  }

  .tip {
    color: #00a1d6;
    font-size: 0.9rem;
  }

  .version {
    color: var(--color-text-secondary, #999);
    font-size: 0.85rem;
    margin-top: 16px;
  }
}

.modal-footer {
  padding: 12px 24px 18px;
  display: flex;
  justify-content: center;
}

.modal-btn {
  padding: 8px 28px;
  background: linear-gradient(135deg, #fb7299, #e91e63);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.95rem;
  transition: opacity 0.2s, transform 0.2s;

  &:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
