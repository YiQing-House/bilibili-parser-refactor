/**
 * 管理面板路由（通告 + 看板 + 页面）
 * 从 index.js 提取
 */

const express = require('express')
const fs = require('fs')
const path = require('path')
const router = express.Router()

const ANNOUNCEMENT_FILE = path.join(__dirname, '..', 'announcement.json')
const ADMIN_PASSWORD = process.env.ADMIN_PWD
if (!ADMIN_PASSWORD) console.warn('[安全] ⚠️  未设置 ADMIN_PWD 环境变量！管理面板将无法访问。')

function readAnnouncements() {
  try {
    if (fs.existsSync(ANNOUNCEMENT_FILE)) {
      const raw = JSON.parse(fs.readFileSync(ANNOUNCEMENT_FILE, 'utf-8'))
      if (Array.isArray(raw)) return raw
      if (raw.title || raw.content) return [raw]
    }
  } catch (e) { console.error('[Announcement] read error:', e.message) }
  return []
}

function writeAnnouncements(list) {
  fs.writeFile(ANNOUNCEMENT_FILE, JSON.stringify(list, null, 2), 'utf-8', (err) => {
    if (err) console.error('[Announcement] write error:', err.message)
  })
}

// 公开接口：获取启用通告
router.get('/announcement', (req, res) => {
  const all = readAnnouncements()
  const enabled = all.filter(a => a.enabled && a.content)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  res.json({ success: true, data: enabled.length ? enabled : null })
})

// 管理接口：新增通告
router.post('/admin/announcement', (req, res) => {
  const { password, title, content, enabled } = req.body
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, error: 'wrong password' })
  }
  const all = readAnnouncements()
  const item = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: title || '', content: content || '',
    enabled: enabled !== false,
    updatedAt: new Date().toISOString(),
  }
  all.unshift(item)
  writeAnnouncements(all)
  console.log('[Announcement] added:', item.title)
  res.json({ success: true, data: item })
})

// 管理接口：删除通告
router.delete('/admin/announcement/:id', (req, res) => {
  const { password } = req.query
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, error: 'wrong password' })
  }
  let all = readAnnouncements()
  all = all.filter(a => a.id !== req.params.id)
  writeAnnouncements(all)
  res.json({ success: true })
})

// 管理接口：获取全部通告
router.get('/admin/announcements', (req, res) => {
  const { password } = req.query
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, error: 'wrong password' })
  }
  const all = readAnnouncements()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  res.json({ success: true, data: all })
})

// 看板数据 API
router.get('/admin/stats', (req, res) => {
  const { password, date, range } = req.query
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, error: '密码错误' })
  }
  const { getStats, getRangeStats } = require('../analytics')
  if (range) {
    res.json({ success: true, data: getRangeStats(range) })
  } else {
    res.json({ success: true, data: getStats(date) })
  }
})

module.exports = router
