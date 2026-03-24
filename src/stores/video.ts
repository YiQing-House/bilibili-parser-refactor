// ============================================================
// 视频解析结果 Store
// ============================================================

import { defineStore } from 'pinia'
import * as bilibiliApi from '@/services/bilibili'
import type { VideoData, HistoryItem } from '@/types/video'

// 批量解析中的失败条目
interface BatchError {
  url: string
  error: string
  retryable: boolean
}

interface VideoState {
  currentResult: VideoData | null
  batchResults: VideoData[]
  batchErrors: BatchError[]       // 失败条目
  batchProgress: { done: number; total: number } | null  // 解析进度
  history: HistoryItem[]
  isLoading: boolean
  error: string | null
  inputUrl: string
}

// 解析缓存：同 BV 号 5 分钟内不重复请求
const parseCache = new Map<string, { data: VideoData; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000  // 5 分钟
const MAX_CACHE_SIZE = 100       // [P2] 最大缓存数量，防止内存泄漏

function getCachedResult(url: string): VideoData | null {
  const key = url.match(/BV\w+/i)?.[0]?.toUpperCase() || url
  const cached = parseCache.get(key)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data
  return null
}

function setCacheResult(url: string, data: VideoData) {
  const key = data.bvid?.toUpperCase() || url.match(/BV\w+/i)?.[0]?.toUpperCase() || url
  // [P2] LRU 淘汰：超出上限时删除最旧的条目
  if (parseCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = parseCache.keys().next().value
    if (oldestKey) parseCache.delete(oldestKey)
  }
  parseCache.set(key, { data, timestamp: Date.now() })
}

export const useVideoStore = defineStore('video', {
  state: (): VideoState => ({
    currentResult: null,
    batchResults: [],
    batchErrors: [],
    batchProgress: null,
    history: [],
    isLoading: false,
    error: null,
    inputUrl: '',
  }),

  getters: {
    hasResult: (state) => !!state.currentResult,
    hasBatchResults: (state) => state.batchResults.length > 0,
    historyCount: (state) => state.history.length,
    /** 批量解析中是否有失败项 */
    hasBatchErrors: (state) => state.batchErrors.length > 0,
    /** 批量解析摘要文本 */
    batchSummary: (state) => {
      const ok = state.batchResults.length
      const fail = state.batchErrors.length
      if (fail === 0) return `${ok} 个视频`
      return `✅ ${ok} 成功，❌ ${fail} 失败`
    },
  },

  actions: {
    /** 解析单个视频 */
    async parseVideo(url: string) {
      this.isLoading = true
      this.error = null
      this.currentResult = null
      this.batchResults = []
      this.batchErrors = []

      try {
        // 命中缓存直接返回
        const cached = getCachedResult(url)
        if (cached) {
          this.currentResult = cached
          return cached
        }
        const result = await bilibiliApi.parseVideo(url)
        setCacheResult(url, result)
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

    /** 批量解析（保留失败项，支持去重） */
    async parseBatch(urls: string[]) {
      // 前端限制最多 50 条
      const MAX_BATCH = 50
      if (urls.length > MAX_BATCH) {
        urls = urls.slice(0, MAX_BATCH)
        console.warn(`[Batch] 超过 ${MAX_BATCH} 条限制，已截断`)
      }

      this.isLoading = true
      this.error = null
      this.currentResult = null
      this.batchResults = []
      this.batchErrors = []
      this.batchProgress = { done: 0, total: urls.length }

      // 去重
      const seen = new Set<string>()
      const uniqueUrls: string[] = []
      let dupCount = 0
      for (const u of urls) {
        const key = u.match(/BV\w+/i)?.[0]?.toUpperCase() || u.trim()
        if (seen.has(key)) { dupCount++; continue }
        seen.add(key)
        uniqueUrls.push(u)
      }
      if (dupCount > 0) {
        console.log(`[Batch] 去重 ${dupCount} 条重复链接`)
        this.batchProgress.total = uniqueUrls.length
      }

      try {
        const result = await bilibiliApi.parseBatch(uniqueUrls)

        // 分拣成功和失败
        for (const r of result.results) {
          if (r.success && r.data) {
            setCacheResult(r.url, r.data)
            this.batchResults.push(r.data)
          } else {
            this.batchErrors.push({
              url: r.url,
              error: r.error || '未知错误',
              retryable: r.retryable !== false,
            })
          }
        }

        this.batchProgress = { done: uniqueUrls.length, total: uniqueUrls.length }
        return result
      } catch (e: unknown) {
        this.error = e instanceof Error ? e.message : '批量解析失败'
        throw e
      } finally {
        this.isLoading = false
      }
    },

    /** 重试单个失败链接 */
    async retryBatchError(index: number) {
      const item = this.batchErrors[index]
      if (!item) return
      try {
        const result = await bilibiliApi.parseVideo(item.url)
        setCacheResult(item.url, result)
        this.batchResults.push(result)
        this.batchErrors.splice(index, 1)
      } catch (e: unknown) {
        this.batchErrors[index].error = e instanceof Error ? e.message : '重试失败'
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

      const firstLine = lines[0]

      // 收藏夹链接（多种格式）
      const favMatch = firstLine.match(/fid=(\d+)/) ||
                        firstLine.match(/favlist\?fid=(\d+)/) ||
                        firstLine.match(/medialist\/detail\/ml(\d+)/) ||
                        firstLine.match(/^ml(\d+)$/i)
      if (favMatch) {
        return this.parseFavorites(favMatch[1])
      }

      // 纯数字 - 可能是收藏夹 ID
      if (/^\d{5,}$/.test(firstLine) && !firstLine.includes('bilibili')) {
        return this.parseFavorites(firstLine)
      }

      // 用户主页链接（支持 /video 后缀）
      const userMatch = firstLine.match(/space\.bilibili\.com\/(\d+)/)
      if (userMatch && !firstLine.includes('favlist')) {
        return this.parseUserVideos(userMatch[1])
      }

      // UID: 前缀
      const uidMatch = firstLine.match(/^UID[:\s]*(\d+)$/i)
      if (uidMatch) {
        return this.parseUserVideos(uidMatch[1])
      }

      // 多链接批量处理
      if (lines.length > 1) {
        return this.parseBatch(lines)
      }

      // 单链接
      return this.parseVideo(firstLine)
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
      this.history = this.history.filter((h: HistoryItem) => h.url !== url)
      this.history.unshift(item)

      // 最多保留 50 条
      if (this.history.length > 50) {
        this.history = this.history.slice(0, 50)
      }
    },

    /** 删除历史记录 */
    removeHistory(id: string) {
      this.history = this.history.filter((h: HistoryItem) => h.id !== id)
    },

    /** 清空历史记录 */
    clearHistory() {
      this.history = []
    },

    /** 清空结果 */
    clearResult() {
      this.currentResult = null
      this.batchResults = []
      this.batchErrors = []
      this.batchProgress = null
      this.error = null
    },
  },

  persist: {
    key: 'bili-parser-video',
    pick: ['history'],
  },
})
