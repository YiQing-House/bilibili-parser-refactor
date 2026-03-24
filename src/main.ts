import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import { initCursorTrail } from './utils/cursorTrail'
import { initWaifuChat } from './modules/waifuChat'

// Router
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: () => import('./views/HomeView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
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
initCursorTrail()

// 看板娘 AI 聊天系统（拆分到独立模块）
initWaifuChat()
