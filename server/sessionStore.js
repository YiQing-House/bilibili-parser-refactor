/**
 * Session 持久化存储
 * 
 * 用 JSON 文件替代内存 Map，使服务器重启后登录状态不丢失。
 * 对外暴露与 Map 相同的接口（get/set/has/delete），对调用方透明。
 * 
 * [P2优化] 使用异步写入 + debounce，避免阻塞事件循环
 */

const fs = require('fs')
const path = require('path')

const SESSION_FILE = path.join(__dirname, 'sessions.json')
// Session 最长存活时间：7 天（与 cookie maxAge 一致）
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000
const SAVE_DEBOUNCE_MS = 500  // 合并 500ms 内的多次写入

class SessionStore {
  constructor() {
    /** @type {Map<string, object>} */
    this._map = new Map()
    this._saveTimer = null
    this._load()
  }

  /** 从磁盘加载并清理过期 session */
  _load() {
    try {
      if (fs.existsSync(SESSION_FILE)) {
        const raw = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'))
        const now = Date.now()
        let cleaned = 0

        for (const [key, value] of Object.entries(raw)) {
          if (value.createdAt && (now - value.createdAt > SESSION_MAX_AGE)) {
            cleaned++
            continue
          }
          this._map.set(key, value)
        }

        console.log(`[Session] 从磁盘恢复 ${this._map.size} 个会话` +
          (cleaned ? `，清理 ${cleaned} 个过期会话` : ''))

        if (cleaned > 0) this._saveNow()
      }
    } catch (e) {
      console.error('[Session] 加载失败，将使用空存储:', e.message)
    }
  }

  /** [P2] 异步保存 + debounce，合并短时间内的多次写入 */
  _save() {
    if (this._saveTimer) return  // 已有待执行的保存，跳过
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null
      this._saveNow()
    }, SAVE_DEBOUNCE_MS)
  }

  /** 立即同步保存（仅用于启动清理） */
  _saveNow() {
    try {
      const obj = Object.fromEntries(this._map)
      fs.writeFile(SESSION_FILE, JSON.stringify(obj, null, 2), 'utf-8', (err) => {
        if (err) console.error('[Session] 持久化失败:', err.message)
      })
    } catch (e) {
      console.error('[Session] 持久化失败:', e.message)
    }
  }

  /** @returns {boolean} */
  has(key) {
    return this._map.has(key)
  }

  /** @returns {object|undefined} */
  get(key) {
    return this._map.get(key)
  }

  /** 设置并自动持久化（异步） */
  set(key, value) {
    this._map.set(key, value)
    this._save()
    return this
  }

  /** 删除并自动持久化（异步） */
  delete(key) {
    const result = this._map.delete(key)
    if (result) this._save()
    return result
  }

  /** @returns {number} */
  get size() {
    return this._map.size
  }
}

module.exports = SessionStore

