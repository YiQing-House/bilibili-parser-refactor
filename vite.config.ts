import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 7622,
    proxy: {
      '/api': {
        target: 'http://localhost:7621',
        changeOrigin: true,
        // 关键：转发 cookie 以支持登录会话
        cookieDomainRewrite: { '*': '' },
        configure: (proxy) => {
          // 确保 set-cookie 正确传递
          proxy.on('proxyRes', (proxyRes) => {
            const cookies = proxyRes.headers['set-cookie']
            if (cookies) {
              // 移除 Secure 标记以便在 HTTP 本地开发时工作
              proxyRes.headers['set-cookie'] = cookies.map((cookie: string) =>
                cookie.replace(/;\s*secure/gi, '').replace(/;\s*samesite=none/gi, '; SameSite=Lax')
              )
            }
          })
        },
      },
      '/admin': {
        target: 'http://localhost:7621',
        changeOrigin: true,
      },
    },
  },
  css: {
    preprocessorOptions: {
      scss: {},
    },
  },
})
