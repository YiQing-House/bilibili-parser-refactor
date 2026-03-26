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
  try {
    fs.writeFileSync(ANNOUNCEMENT_FILE, JSON.stringify(list, null, 2), 'utf-8')
  } catch (err) {
    console.error('[Announcement] write error:', err.message)
  }
}

// 公开接口：获取启用通告（按数组顺序 = 自定义排序）
router.get('/announcement', (req, res) => {
  const all = readAnnouncements()
  const enabled = all.filter(a => a.enabled && a.content)
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

// 管理接口：编辑通告（标题/内容/启用状态）
router.put('/admin/announcement/:id', (req, res) => {
  const { password, title, content, enabled } = req.body
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, error: 'wrong password' })
  }
  const all = readAnnouncements()
  const idx = all.findIndex(a => a.id === req.params.id)
  if (idx === -1) return res.status(404).json({ success: false, error: '通告不存在' })

  // 只更新传入的字段
  if (title !== undefined) all[idx].title = title
  if (content !== undefined) all[idx].content = content
  if (enabled !== undefined) all[idx].enabled = !!enabled
  all[idx].updatedAt = new Date().toISOString()

  writeAnnouncements(all)
  console.log(`[Announcement] updated: ${all[idx].title} (enabled=${all[idx].enabled})`)
  res.json({ success: true, data: all[idx] })
})

// 管理接口：切换通告启用状态（快捷接口）
router.patch('/admin/announcement/:id/toggle', (req, res) => {
  const { password } = req.body
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, error: 'wrong password' })
  }
  const all = readAnnouncements()
  const idx = all.findIndex(a => a.id === req.params.id)
  if (idx === -1) return res.status(404).json({ success: false, error: '通告不存在' })

  all[idx].enabled = !all[idx].enabled
  all[idx].updatedAt = new Date().toISOString()

  writeAnnouncements(all)
  console.log(`[Announcement] toggled: ${all[idx].title} -> ${all[idx].enabled ? '启用' : '禁用'}`)
  res.json({ success: true, data: all[idx] })
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

// 管理接口：获取全部通告（保持数组原始顺序 = 自定义排序）
router.get('/admin/announcements', (req, res) => {
  const { password } = req.query
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, error: 'wrong password' })
  }
  const all = readAnnouncements()
  res.json({ success: true, data: all })
})

// 管理接口：重排通告顺序（上移/下移）
router.patch('/admin/announcements/reorder', (req, res) => {
  const { password, id, direction } = req.body
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, error: 'wrong password' })
  }
  const all = readAnnouncements()
  const idx = all.findIndex(a => a.id === id)
  if (idx === -1) return res.status(404).json({ success: false, error: '通告不存在' })

  const newIdx = direction === 'up' ? idx - 1 : idx + 1
  if (newIdx < 0 || newIdx >= all.length) {
    return res.json({ success: true, data: all }) // 已在边界，无需移动
  }
  // 交换位置
  ;[all[idx], all[newIdx]] = [all[newIdx], all[idx]]
  writeAnnouncements(all)
  console.log(`[Announcement] reorder: ${all[newIdx].title} ${direction}`)
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

// AI 改写通告内容
router.post('/admin/ai-rewrite', async (req, res) => {
  const { password, content, title } = req.body
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, error: '密码错误' })
  }
  if (!content) {
    return res.status(400).json({ success: false, error: '缺少内容' })
  }

  const apiKey = process.env.GLM_API_KEY
  const glmModel = process.env.GLM_MODEL || 'glm-4.5-air'
  if (!apiKey) {
    return res.status(500).json({ success: false, error: '未配置 GLM_API_KEY' })
  }

  try {
    const axios = require('axios')
    const resp = await axios.post(
      'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      {
        model: glmModel,
        messages: [
          {
            role: 'system',
            content: `你是一个专业的软件更新公告编辑。请将用户提供的更新内容草稿改写为简洁、专业、美观的更新公告格式。
要求：
1. 使用 emoji 图标分类（如 🔧修复、✨新增、🎨优化、📱移动端等）
2. 每条更新用 | 分隔，一行展示
3. 语言简洁有力，去掉冗余描述
4. 保留所有关键信息，不要遗漏功能点
5. 不要加标题（标题已有），只输出内容部分
6. 输出纯文本，不要用 markdown

示例输出格式：
🔧 修复二维码登录流程 | 🎭 修复看板娘气泡不显示 | ✨ 新增 APP 下载弹窗 | 📢 通告支持自定义标题`
          },
          {
            role: 'user',
            content: `${title ? '标题：' + title + '\n' : ''}更新内容草稿：\n${content}`
          }
        ],
        max_tokens: 500,
        temperature: 0.7,
      },
      {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        timeout: 15000,
      }
    )

    const rewritten = resp.data?.choices?.[0]?.message?.content || ''
    if (rewritten) {
      res.json({ success: true, data: rewritten.trim() })
    } else {
      res.json({ success: false, error: 'AI 返回为空' })
    }
  } catch (err) {
    console.error('[AI Rewrite] 错误:', err.message)
    res.status(500).json({ success: false, error: 'AI 改写失败: ' + err.message })
  }
})

module.exports = router
