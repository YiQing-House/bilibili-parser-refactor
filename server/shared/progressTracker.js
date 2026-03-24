/**
 * 下载进度追踪器
 *
 * 替代 global.updateDownloadProgress，提供模块化的进度管理。
 * 由 index.js 创建实例，通过依赖注入传递给 service 层。
 */

class ProgressTracker {
  constructor() {
    this._map = new Map()
    // 每 60 秒清理 5 分钟前的过期条目
    this._cleanupTimer = setInterval(() => {
      const now = Date.now()
      for (const [taskId, data] of this._map.entries()) {
        if (now - data.updatedAt > 5 * 60 * 1000) this._map.delete(taskId)
      }
    }, 60000)
  }

  update(taskId, data) {
    this._map.set(taskId, { ...data, updatedAt: Date.now() })
  }

  get(taskId) {
    return this._map.get(taskId)
  }

  set(taskId, data) {
    this._map.set(taskId, { ...data, updatedAt: Date.now() })
  }

  has(taskId) {
    return this._map.has(taskId)
  }

  delete(taskId) {
    return this._map.delete(taskId)
  }

  destroy() {
    clearInterval(this._cleanupTimer)
    this._map.clear()
  }
}

module.exports = ProgressTracker
