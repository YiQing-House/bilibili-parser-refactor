// ============================================================
// 下载任务管理 Store
// ============================================================

import { defineStore } from 'pinia'
import * as bilibiliApi from '@/services/bilibili'
import type { DownloadProgress } from '@/types/api'

export interface DownloadTask {
  id: string
  filename: string
  videoUrl: string
  backendTaskId?: string
  status: 'pending' | 'starting' | 'downloading' | 'completed' | 'error' | 'cancelled' | 'paused'
  percent: number
  stage: string
  speed: string
  pollingTimer?: ReturnType<typeof setInterval>
}

interface DownloadState {
  tasks: Map<string, DownloadTask>
  panelOpen: boolean
}

export const useDownloadStore = defineStore('download', {
  state: (): DownloadState => ({
    tasks: new Map(),
    panelOpen: false,
  }),

  getters: {
    taskList(): DownloadTask[] {
      return Array.from(this.tasks.values())
    },
    activeCount(): number {
      return this.taskList.filter((t) =>
        ['pending', 'starting', 'downloading'].includes(t.status)
      ).length
    },
    completedCount(): number {
      return this.taskList.filter((t) => t.status === 'completed').length
    },
    totalCount(): number {
      return this.tasks.size
    },
  },

  actions: {
    /** 创建异步下载任务 */
    async createTask(videoUrl: string, filename: string, qn: number = 80, format: string = 'mp4') {
      const taskId = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

      const task: DownloadTask = {
        id: taskId,
        filename,
        videoUrl,
        status: 'starting',
        percent: 0,
        stage: '提交任务中...',
        speed: '',
      }
      this.tasks.set(taskId, task)

      try {
        // 创建后端任务
        const res = await bilibiliApi.createDownloadTask({
          url: videoUrl,
          qn,
          format,
        })

        task.backendTaskId = res.taskId
        task.stage = '任务已创建...'
        this.tasks.set(taskId, { ...task })

        // 开始轮询进度
        this.startPolling(taskId, res.taskId)

        return taskId
      } catch (e: unknown) {
        task.status = 'error'
        task.stage = e instanceof Error ? e.message : '创建失败'
        this.tasks.set(taskId, { ...task })
        throw e
      }
    },

    /** 轮询后端下载进度 */
    startPolling(frontendId: string, backendId: string) {
      const timer = setInterval(async () => {
        const task = this.tasks.get(frontendId)
        if (!task) {
          clearInterval(timer)
          return
        }

        try {
          const progress: DownloadProgress = await bilibiliApi.getDownloadProgress(backendId)

          // 翻译阶段
          let stageName = progress.stage || '处理中...'
          if (progress.stage === 'video') stageName = '下载视频中...'
          else if (progress.stage === 'audio') stageName = '下载音频中...'
          else if (progress.stage === 'merging') stageName = '合并音视频中...'
          else if (progress.stage === 'completed') stageName = '已完成'
          else if (progress.message) stageName = progress.message

          // 附加大小信息
          if (progress.downloadedMB && progress.totalMB) {
            stageName += ` (${progress.downloadedMB}/${progress.totalMB}MB)`
          }

          const updated: DownloadTask = {
            ...task,
            status: progress.status === 'completed' ? 'completed' : 'downloading',
            stage: stageName,
            percent: progress.percent || 0,
            speed: progress.speed || '',
          }

          if (progress.status === 'completed') {
            clearInterval(timer)
            updated.percent = 100
            updated.stage = '已完成'

            // 触发浏览器下载
            if (progress.downloadUrl) {
              this.triggerBrowserDownload(progress.downloadUrl, progress.fileName || task.filename)
            }
          } else if (progress.status === 'error') {
            clearInterval(timer)
            updated.status = 'error'
            updated.stage = progress.error || '下载失败'
          } else if (progress.status === 'cancelled') {
            clearInterval(timer)
            updated.status = 'cancelled'
            updated.stage = '已取消'
          }

          this.tasks.set(frontendId, updated)
        } catch {
          // 轮询失败，继续尝试
        }
      }, 800)

      // 保存 timer
      const task = this.tasks.get(frontendId)
      if (task) {
        task.pollingTimer = timer
        this.tasks.set(frontendId, { ...task })
      }

      // 15 分钟超时
      setTimeout(() => {
        const t = this.tasks.get(frontendId)
        if (t && ['starting', 'downloading'].includes(t.status)) {
          clearInterval(timer)
          t.status = 'error'
          t.stage = '处理超时'
          this.tasks.set(frontendId, { ...t })
        }
      }, 15 * 60 * 1000)
    },

    /** 触发浏览器下载 */
    triggerBrowserDownload(url: string, filename: string) {
      const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`
      const link = document.createElement('a')
      link.href = fullUrl
      link.download = filename
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      setTimeout(() => document.body.removeChild(link), 1000)
    },

    /** 直接下载 (不走异步任务，用于封面/流式) */
    directDownload(url: string, filename: string) {
      this.triggerBrowserDownload(url, filename)
    },

    /** 取消任务 */
    async cancelTask(taskId: string) {
      const task = this.tasks.get(taskId)
      if (!task) return

      if (task.pollingTimer) {
        clearInterval(task.pollingTimer)
      }

      if (task.backendTaskId) {
        try {
          await bilibiliApi.cancelDownload(task.backendTaskId)
        } catch { /* ignore */ }
      }

      task.status = 'cancelled'
      task.stage = '已取消'
      this.tasks.set(taskId, { ...task })
    },

    /** 清除已完成/失败/取消的任务 */
    clearFinished() {
      for (const [id, task] of this.tasks) {
        if (['completed', 'error', 'cancelled'].includes(task.status)) {
          this.tasks.delete(id)
        }
      }
    },

    /** 切换面板显示 */
    togglePanel() {
      this.panelOpen = !this.panelOpen
    },
  },
})
