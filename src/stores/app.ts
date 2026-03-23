// ============================================================
// 全局应用状态 Store
// ============================================================

import { defineStore } from 'pinia'
import type { FormatType } from '@/types/video'

interface AppState {
  theme: 'light' | 'dark' | 'auto'
  quality: number
  format: FormatType
  videoFormat: string
  audioFormat: string
  filenameFormat: 'title' | 'title-author' | 'author-title'
  settingsSidebarOpen: boolean
}

export const useAppStore = defineStore('app', {
  state: (): AppState => ({
    theme: 'dark',
    quality: 80,
    format: 'video+audio',
    videoFormat: 'mp4',
    audioFormat: 'mp3',
    filenameFormat: 'title',
    settingsSidebarOpen: false,
  }),

  getters: {
    isDark(): boolean {
      if (this.theme === 'auto') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches
      }
      return this.theme === 'dark'
    },
    qualityLabel(): string {
      const map: Record<number, string> = {
        120: '4K', 116: '1080P高帧率', 112: '1080P高帧率',
        80: '1080P', 64: '720P', 32: '480P', 16: '360P',
      }
      return map[this.quality] || '1080P'
    },
    formatLabel(): string {
      const map: Record<string, string> = {
        'video+audio': '完整视频',
        'video+audio-separate': '视频+音频分离',
        'audio': '仅音频',
        'video-only': '仅视频',
        'cover': '封面',
      }
      return map[this.format] || '完整视频'
    },
    needsQuality(): boolean {
      return this.format !== 'cover' && this.format !== 'audio'
    },
  },

  actions: {
    setTheme() {
      // 仅支持暗色主题
      this.theme = 'dark'
      this.applyTheme()
    },

    applyTheme() {
      document.documentElement.setAttribute('data-theme', 'dark')
      document.documentElement.style.colorScheme = 'dark'
    },

    setQuality(qn: number) {
      this.quality = qn
    },

    setFormat(format: FormatType) {
      this.format = format
    },

    toggleSettings() {
      this.settingsSidebarOpen = !this.settingsSidebarOpen
    },

    initThemeListener() {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      mediaQuery.addEventListener('change', () => {
        if (this.theme === 'auto') {
          this.applyTheme()
        }
      })
      this.applyTheme()
    },
  },

  persist: {
    key: 'bili-parser-app',
    pick: ['theme', 'quality', 'format', 'videoFormat', 'audioFormat', 'filenameFormat'],
  },
})
