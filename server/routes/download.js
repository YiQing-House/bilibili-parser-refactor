/**
 * 下载路由
 * download/progress/cancel/task/file/audio/cover/video-only/direct-links/stream/yt-dlp download
 */
const express = require('express')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { getSessionCookies } = require('../helpers/bilibili')
const bilibiliService = require('../services/bilibiliService')
const ytdlpService = require('../services/ytdlpService')

module.exports = function createDownloadRoutes({ loginSessions, downloadProgress }) {
  const router = express.Router()

  // 视频下载（支持画质选择）
  router.get('/bilibili/download', async (req, res) => {
    try {
      const { url, qn = 80, format = 'mp4', nameFormat = 'title' } = req.query
      if (!url) return res.status(400).json({ success: false, error: '请提供视频链接' })

      const cookies = getSessionCookies(req, loginSessions)
      const taskId = `download_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      downloadProgress.set(taskId, { status: 'starting', percent: 0, stage: '准备中...', videoPercent: 0, audioPercent: 0 })
      await bilibiliService.downloadWithQuality(url, parseInt(qn), cookies, res, format, nameFormat, taskId)
    } catch (error) {
      console.error('[Download] 错误:', error.message)
      if (!res.headersSent) res.status(500).json({ success: false, error: error.message })
    }
  })

  // 获取下载进度
  router.get('/download-progress/:taskId', (req, res) => {
    const progress = downloadProgress.get(req.params.taskId)
    res.json({ success: true, data: progress || { status: 'unknown', percent: 0 } })
  })

  // 取消下载任务
  router.post('/cancel-download/:taskId', (req, res) => {
    try {
      const { taskId } = req.params
      const cancelled = bilibiliService.cancelDownload(taskId)
      downloadProgress.set(taskId, { status: 'cancelled', stage: 'cancelled', percent: 0, message: '下载已取消', updatedAt: Date.now() })
      res.json({ success: true, cancelled })
    } catch (error) {
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // 创建下载任务（异步，返回 taskId 供前端轮询）
  router.post('/bilibili/download-task', async (req, res) => {
    try {
      const { url, qn = 80, format = 'mp4', nameFormat = 'title' } = req.body
      if (!url) return res.status(400).json({ success: false, error: '请提供视频链接' })

      const cookies = getSessionCookies(req, loginSessions)
      const taskId = `download_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      downloadProgress.set(taskId, { status: 'starting', percent: 0, stage: '准备中...', videoPercent: 0, audioPercent: 0 })
      res.json({ success: true, taskId })

      bilibiliService.downloadWithQualityAsync(url, parseInt(qn), cookies, format, nameFormat, taskId)
        .then((filePath) => {
          const currentProgress = downloadProgress.get(taskId)
          if (!currentProgress || currentProgress.status !== 'completed') {
            downloadProgress.set(taskId, {
              status: 'completed', percent: 100, stage: '下载完成', filePath,
              fileName: path.basename(filePath),
              downloadUrl: `/api/download-file/${encodeURIComponent(path.basename(filePath))}`,
            })
          }
        })
        .catch((error) => {
          downloadProgress.set(taskId, { status: 'error', percent: 0, stage: '下载失败', error: error.message })
        })
    } catch (error) {
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // 下载已完成的文件
  router.get('/download-file/:filename', (req, res) => {
    try {
      const { filename } = req.params
      const downloadDir = path.join(os.tmpdir(), 'bilibili-downloads')
      const filePath = path.join(downloadDir, decodeURIComponent(filename))
      if (!filePath.startsWith(downloadDir)) return res.status(403).json({ success: false, error: '访问被拒绝' })
      if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: '文件不存在或已过期' })

      const stats = fs.statSync(filePath)
      const ext = path.extname(filename).toLowerCase()
      const mimeTypes = { '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.flv': 'video/x-flv', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4' }
      res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream')
      res.setHeader('Content-Length', stats.size)
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
      const fileStream = fs.createReadStream(filePath)
      fileStream.pipe(res)
      res.on('finish', () => { setTimeout(() => { try { fs.unlinkSync(filePath) } catch {} }, 300000) })
    } catch (error) {
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // 音频下载
  router.get('/bilibili/download/audio', async (req, res) => {
    try {
      const { url, qn = 80 } = req.query
      if (!url) return res.status(400).json({ success: false, error: '请提供视频链接' })
      const cookies = getSessionCookies(req, loginSessions)
      await bilibiliService.downloadAudio(url, parseInt(qn), cookies, res)
    } catch (error) {
      if (!res.headersSent) res.status(500).json({ success: false, error: error.message })
    }
  })

  // 封面下载
  router.get('/bilibili/download/cover', async (req, res) => {
    try {
      const { url } = req.query
      if (!url) return res.status(400).json({ success: false, error: '请提供视频链接' })
      await bilibiliService.downloadCover(url, res)
    } catch (error) {
      if (!res.headersSent) res.status(500).json({ success: false, error: error.message })
    }
  })

  // 视频下载（无音频）
  router.get('/bilibili/download/video-only', async (req, res) => {
    try {
      const { url, qn = 80 } = req.query
      if (!url) return res.status(400).json({ success: false, error: '请提供视频链接' })
      const cookies = getSessionCookies(req, loginSessions)
      await bilibiliService.downloadVideoOnly(url, parseInt(qn), cookies, res)
    } catch (error) {
      if (!res.headersSent) res.status(500).json({ success: false, error: error.message })
    }
  })

  // 获取视频/音频直接下载链接
  router.get('/bilibili/direct-links', async (req, res) => {
    try {
      const { url, qn = 80 } = req.query
      if (!url) return res.status(400).json({ success: false, error: '请提供视频链接' })
      const cookies = getSessionCookies(req, loginSessions)
      const links = await bilibiliService.getDirectLinks(url, parseInt(qn), cookies)
      res.json({ success: true, data: links })
    } catch (error) {
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // 流式代理下载
  router.get('/bilibili/stream', async (req, res) => {
    try {
      const { url, qn = 80, type = 'video', format } = req.query
      if (!url) return res.status(400).json({ success: false, error: '请提供视频链接' })
      const cookies = getSessionCookies(req, loginSessions)
      const links = await bilibiliService.getDirectLinks(url, parseInt(qn), cookies)
      const targetUrl = type === 'audio' ? links.audioUrl : links.videoUrl
      if (!targetUrl) return res.status(400).json({ success: false, error: `无法获取${type === 'audio' ? '音频' : '视频'}链接` })
      const ext = format || (type === 'audio' ? 'm4a' : 'm4s')
      const filename = `${links.title}_${type}.${ext}`
      if (format && format !== (type === 'audio' ? 'm4a' : 'm4s')) {
        await bilibiliService.streamWithFormat(targetUrl, res, filename, type, format)
      } else {
        await bilibiliService.streamProxy(targetUrl, res, filename)
      }
    } catch (error) {
      if (!res.headersSent) res.status(500).json({ success: false, error: error.message })
    }
  })

  // 用户投稿处理（旧版兼容）
  router.get('/bilibili/user-videos', async (req, res) => {
    try {
      const { uid } = req.query
      if (!uid) return res.status(400).json({ success: false, error: '请提供用户UID' })
      const cookies = getSessionCookies(req, loginSessions)
      const result = await multiPlatformService.parseBilibiliUserVideos(uid, cookies)
      res.json(result)
    } catch (error) {
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // yt-dlp 下载
  router.get('/ytdlp/download', async (req, res) => {
    try {
      let { url, format = 'best' } = req.query
      if (!url) return res.status(400).json({ success: false, error: '请提供视频链接' })
      const isBilibili = url.includes('bilibili.com') || url.includes('b23.tv')
      if (isBilibili) {
        try { await bilibiliService.downloadAndMerge(url, res); return } catch { /* fallback to yt-dlp */ }
      }
      const check = await ytdlpService.checkAvailable()
      if (!check.available) return res.status(503).json({ success: false, error: '服务器未配置此下载功能' })
      await ytdlpService.downloadVideoStream(url, format, res)
    } catch (error) {
      if (!res.headersSent) res.status(500).json({ success: false, error: error.message })
    }
  })

  return router
}
