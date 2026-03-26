/**
 * APP 下载路由
 * 提供 bilibilias APK 文件列表和下载服务
 */

const express = require('express')
const fs = require('fs')
const path = require('path')
const router = express.Router()

// APK 存放目录
const APK_DIR = path.join(__dirname, '..', 'public', 'apk')

// 确保目录存在
if (!fs.existsSync(APK_DIR)) {
  fs.mkdirSync(APK_DIR, { recursive: true })
}

// GET /api/app/list — 获取可用的 APK 列表
router.get('/list', (req, res) => {
  try {
    const files = fs.readdirSync(APK_DIR)
      .filter(f => f.endsWith('.apk'))
      .map(f => {
        const stat = fs.statSync(path.join(APK_DIR, f))
        // 从文件名解析版本信息，如 bilibilias-official-v1.0.0.apk
        const match = f.match(/bilibilias[_-]?(official|alpha|beta)?[_-]?v?([\d.]+)?/i)
        return {
          filename: f,
          variant: match?.[1] || 'official',
          version: match?.[2] || '未知',
          size: stat.size,
          sizeStr: formatSize(stat.size),
          updatedAt: stat.mtime.toISOString(),
        }
      })
      .sort((a, b) => {
        // official 排最前
        const order = { official: 0, beta: 1, alpha: 2 }
        return (order[a.variant] ?? 3) - (order[b.variant] ?? 3)
      })

    res.json({ success: true, apps: files })
  } catch (error) {
    console.error('[App] 获取列表失败:', error.message)
    res.json({ success: true, apps: [] })
  }
})

// GET /api/app/download/:filename — 下载 APK 文件
router.get('/download/:filename', (req, res) => {
  const { filename } = req.params
  // 安全校验：防止路径穿越
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ success: false, error: '非法文件名' })
  }
  if (!filename.endsWith('.apk')) {
    return res.status(400).json({ success: false, error: '仅支持 APK 文件' })
  }

  const filePath = path.join(APK_DIR, filename)
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: '文件不存在' })
  }

  res.download(filePath, filename)
})

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

module.exports = router
