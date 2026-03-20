import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'

// Router
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: () => import('./views/HomeView.vue'),
    },
  ],
})

// Pinia
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

// App
const app = createApp(App)
app.use(pinia)
app.use(router)
app.mount('#app')

// 鼠标拖尾粒子
import { initCursorTrail } from './utils/cursorTrail'
initCursorTrail()

// 禁止看板娘区域右键菜单（防止连续点击弹出浏览器菜单）
document.addEventListener('contextmenu', (e) => {
  const waifu = document.getElementById('waifu')
  if (waifu && waifu.contains(e.target as Node)) {
    e.preventDefault()
  }
})
