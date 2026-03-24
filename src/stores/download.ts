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
  qn: number
  format: string
  backendTaskId?: string
  downloadUrl?: string
  status: 'pending' | 'starting' | 'downloading' | 'completed' | 'error' | 'cancelled' | 'paused'
  percent: number
  stage: string
  speed: string
  pollingTimer?: ReturnType<typeof setInterval>
}

interface DownloadState {
  // [P3] Map → Record，确保 Vue 响应式系统完全追踪属性变化
  tasks: Record<string, DownloadTask>
  panelOpen: boolean
  // 下载统计（持久化）
  downloadStats: {
    totalCount: number
    totalSize: number // 字节
  }
}

// [P3] 最大并发下载数
const MAX_CONCURRENT = 3

export const useDownloadStore = defineStore('download', {
  state: (): DownloadState => ({
    tasks: {},
    panelOpen: false,
    downloadStats: { totalCount: 0, totalSize: 0 },
  }),

  getters: {
    taskList(): DownloadTask[] {
      return Object.values(this.tasks)
    },
    activeCount(): number {
      return this.taskList.filter((t) =>
        ['starting', 'downloading'].includes(t.status)
      ).length
    },
    completedCount(): number {
      return this.taskList.filter((t) => t.status === 'completed').length
    },
    pendingCount(): number {
      return this.taskList.filter((t) => t.status === 'pending').length
    },
    totalCount(): number {
      return Object.keys(this.tasks).length
    },
  },

  actions: {
    /** 创建异步下载任务（含并发控制） */
    async createTask(videoUrl: string, filename: string, qn: number = 80, format: string = 'mp4') {
      const taskId = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

      // [P3] 并发限制：超过 MAX_CONCURRENT 时排队
      const isQueued = this.activeCount >= MAX_CONCURRENT

      const task: DownloadTask = {
        id: taskId,
        filename,
        videoUrl,
        qn,
        format,
        status: isQueued ? 'pending' : 'starting',
        percent: 0,
        stage: isQueued ? `排队中（第${this.pendingCount + 1}位）...` : '提交任务中...',
        speed: '',
      }
      this.tasks[taskId] = task

      if (isQueued) {
        // 排队等待，由 processQueue 在其他任务完成时触发
        return taskId
      }

      await this._startTask(taskId, videoUrl, qn, format)
      return taskId
    },

    /** 内部：实际启动下载任务 */
    async _startTask(taskId: string, videoUrl: string, qn: number = 80, format: string = 'mp4') {
      const task = this.tasks[taskId]
      if (!task) return

      task.status = 'starting'
      task.stage = '提交任务中...'
      this.tasks[taskId] = { ...task }

      try {
        const res = await bilibiliApi.createDownloadTask({
          url: videoUrl,
          qn,
          format,
        })

        task.backendTaskId = res.taskId
        task.stage = '任务已创建...'
        this.tasks[taskId] = { ...task }

        this.startPolling(taskId, res.taskId)
      } catch (e: unknown) {
        task.status = 'error'
        task.stage = e instanceof Error ? e.message : '创建失败'
        this.tasks[taskId] = { ...task }
        this._processQueue()
      }
    },

    /** 内部：处理排队任务（有任务完成/失败/取消时调用） */
    _processQueue() {
      const pending = this.taskList.filter(t => t.status === 'pending')
      const slots = MAX_CONCURRENT - this.activeCount
      for (let i = 0; i < Math.min(slots, pending.length); i++) {
        const t = pending[i]
        this._startTask(t.id, t.videoUrl, t.qn, t.format)
      }
    },

    /** 轮询后端下载进度 */
    startPolling(frontendId: string, backendId: string) {
      const timer = setInterval(async () => {
        const task = this.tasks[frontendId]
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
            updated.downloadUrl = progress.downloadUrl || ''

            // 更新下载统计
            const fileSizeBytes = (progress.totalMB || 0) * 1024 * 1024
            this.recordDownloadComplete(fileSizeBytes)

            // 触发浏览器下载
            if (progress.downloadUrl) {
              this.triggerBrowserDownload(progress.downloadUrl, progress.fileName || task.filename)
            }
            this._processQueue()
          } else if (progress.status === 'error') {
            clearInterval(timer)
            updated.status = 'error'
            updated.stage = progress.error || '下载失败'
            this._processQueue()
          } else if (progress.status === 'cancelled') {
            clearInterval(timer)
            updated.status = 'cancelled'
            updated.stage = '已取消'
            this._processQueue()
          }

          this.tasks[frontendId] = updated
        } catch {
          // 轮询失败，继续尝试
        }
      }, 2000) // [P2] 降低轮询频率 800ms → 2000ms

      // 保存 timer
      const task = this.tasks[frontendId]
      if (task) {
        task.pollingTimer = timer
        this.tasks[frontendId] = { ...task }
      }

      // 15 分钟超时
      setTimeout(() => {
        const t = this.tasks[frontendId]
        if (t && ['starting', 'downloading'].includes(t.status)) {
          clearInterval(timer)
          this.tasks[frontendId] = { ...t, status: 'error', stage: '处理超时' }
          this._processQueue()
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
      const task = this.tasks[taskId]
      if (!task) return

      if (task.pollingTimer) {
        clearInterval(task.pollingTimer)
      }

      if (task.backendTaskId) {
        try {
          await bilibiliApi.cancelDownload(task.backendTaskId)
        } catch { /* ignore */ }
      }

      this.tasks[taskId] = { ...task, status: 'cancelled', stage: '已取消' }
      this._processQueue()
    },

    /** 清除已完成/失败/取消的任务 */
    clearFinished() {
      for (const [id, task] of Object.entries(this.tasks)) {
        if (['completed', 'error', 'cancelled'].includes(task.status)) {
          delete this.tasks[id]
        }
      }
    },

    /** 重试失败/取消的任务 */
    async retryTask(taskId: string) {
      const task = this.tasks[taskId]
      if (!task || !['error', 'cancelled'].includes(task.status)) return

      // 保存原任务参数
      const { videoUrl, filename, qn, format } = task
      // 删除旧任务
      delete this.tasks[taskId]
      // 重新创建（保留原始画质和格式）
      await this.createTask(videoUrl, filename, qn, format)
    },

    /** 切换面板显示 */
    togglePanel() {
      this.panelOpen = !this.panelOpen
    },

    /** 记录下载完成（更新统计） */
    recordDownloadComplete(fileSize: number = 0) {
      this.downloadStats.totalCount++
      this.downloadStats.totalSize += fileSize
    },

    /** 格式化统计大小 */
    formatSize(bytes: number): string {
      if (bytes === 0) return '0 B'
      const units = ['B', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(1024))
      return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i]
    },
  },

  persist: {
    key: 'bili-parser-download',
    pick: ['downloadStats'],
  },
})
