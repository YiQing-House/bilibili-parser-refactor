// ============================================================
// 视频解析结果 Store
// ============================================================

import { defineStore } from 'pinia'
import * as bilibiliApi from '@/services/bilibili'
import type { VideoData, HistoryItem } from '@/types/video'

interface VideoState {
  currentResult: VideoData | null
  batchResults: VideoData[]
  history: HistoryItem[]
  isLoading: boolean
  error: string | null
  inputUrl: string
}

export const useVideoStore = defineStore('video', {
  state: (): VideoState => ({
    currentResult: null,
    batchResults: [],
    history: [],
    isLoading: false,
    error: null,
    inputUrl: '',
  }),

  getters: {
    hasResult: (state) => !!state.currentResult,
    hasBatchResults: (state) => state.batchResults.length > 0,
    historyCount: (state) => state.history.length,
  },

  actions: {
    /** 解析单个视频 */
    async parseVideo(url: string) {
      this.isLoading = true
      this.error = null
      this.currentResult = null
      this.batchResults = []

      try {
        const result = await bilibiliApi.parseVideo(url)
        this.currentResult = result
        this.addToHistory(url, result)
        return result
      } catch (e: unknown) {
        this.error = e instanceof Error ? e.message : '解析失败'
        throw e
      } finally {
        this.isLoading = false
      }
    },

    /** 批量解析 */
    async parseBatch(urls: string[]) {
      this.isLoading = true
      this.error = null
      this.currentResult = null
      this.batchResults = []

      try {
        const result = await bilibiliApi.parseBatch(urls)
        this.batchResults = result.results
          .filter((r) => r.success && r.data)
          .map((r) => r.data as VideoData)
        return result
      } catch (e: unknown) {
        this.error = e instanceof Error ? e.message : '批量解析失败'
        throw e
      } finally {
        this.isLoading = false
      }
    },

    /** 收藏夹 */
    async parseFavorites(id: string) {
      this.isLoading = true
      this.error = null

      try {
        const results = await bilibiliApi.getFavorites(id)
        this.batchResults = results
        return results
      } catch (e: unknown) {
        this.error = e instanceof Error ? e.message : '收藏夹解析失败'
        throw e
      } finally {
        this.isLoading = false
      }
    },

    /** 用户投稿 */
    async parseUserVideos(uid: string) {
      this.isLoading = true
      this.error = null

      try {
        const results = await bilibiliApi.getUserVideos(uid)
        this.batchResults = results
        return results
      } catch (e: unknown) {
        this.error = e instanceof Error ? e.message : '用户投稿解析失败'
        throw e
      } finally {
        this.isLoading = false
      }
    },

    /** 智能解析 - 根据输入内容自动选择解析方式 */
    async smartParse(input: string) {
      const lines = input.trim().split('\n').map((l) => l.trim()).filter(Boolean)

      if (lines.length === 0) {
        this.error = '请输入视频链接'
        return
      }

      // 收藏夹链接
      const favMatch = lines[0].match(/fid=(\d+)/)
      if (favMatch) {
        return this.parseFavorites(favMatch[1])
      }

      // 纯数字 - 可能是收藏夹 ID
      if (/^\d{5,}$/.test(lines[0]) && !lines[0].includes('bilibili')) {
        return this.parseFavorites(lines[0])
      }

      // 用户主页链接
      const userMatch = lines[0].match(/space\.bilibili\.com\/(\d+)/)
      if (userMatch && !lines[0].includes('favlist')) {
        return this.parseUserVideos(userMatch[1])
      }

      // 多链接批量处理
      if (lines.length > 1) {
        return this.parseBatch(lines)
      }

      // 单链接
      return this.parseVideo(lines[0])
    },

    /** 添加到历史记录 */
    addToHistory(url: string, data: VideoData) {
      const item: HistoryItem = {
        id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        url,
        title: data.title,
        thumbnail: data.thumbnail,
        timestamp: Date.now(),
      }

      // 去重：相同 URL 只保留最新
      this.history = this.history.filter((h) => h.url !== url)
      this.history.unshift(item)

      // 最多保留 50 条
      if (this.history.length > 50) {
        this.history = this.history.slice(0, 50)
      }
    },

    /** 删除历史记录 */
    removeHistory(id: string) {
      this.history = this.history.filter((h) => h.id !== id)
    },

    /** 清空历史记录 */
    clearHistory() {
      this.history = []
    },

    /** 清空结果 */
    clearResult() {
      this.currentResult = null
      this.batchResults = []
      this.error = null
    },
  },

  persist: {
    key: 'bili-parser-video',
    pick: ['history'],
  },
})
