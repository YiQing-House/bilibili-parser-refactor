// ============================================================
// B站视频解析 API
// ============================================================

import api from './api'
import type { VideoData } from '@/types/video'
import type { DownloadTaskResponse, DownloadProgress, BatchResult } from '@/types/api'

/**
 * 解析单个视频
 */
export async function parseVideo(url: string): Promise<VideoData> {
  const { data } = await api.post('/api/parse', { url })
  return data.data
}

/**
 * 批量解析视频
 */
export async function parseBatch(urls: string[]): Promise<BatchResult> {
  const { data } = await api.post('/api/parse/batch', { urls })
  return data
}

/**
 * 获取收藏夹视频列表
 */
export async function getFavorites(id: string): Promise<VideoData[]> {
  const { data } = await api.get('/api/bilibili/favorites', { params: { id } })
  return data.data || data.results || []
}

/**
 * 获取用户投稿视频列表
 */
export async function getUserVideos(uid: string): Promise<VideoData[]> {
  const { data } = await api.get('/api/bilibili/user-videos', { params: { uid } })
  return data.data || data.results || []
}

/**
 * 创建异步下载任务
 */
export async function createDownloadTask(params: {
  url: string
  qn?: number
  format?: string
  nameFormat?: string
}): Promise<DownloadTaskResponse> {
  const { data } = await api.post('/api/bilibili/download-task', {
    url: params.url,
    qn: params.qn || 80,
    format: params.format || 'mp4',
    nameFormat: params.nameFormat || 'title',
  })
  return data
}

/**
 * 查询下载进度
 */
export async function getDownloadProgress(taskId: string): Promise<DownloadProgress> {
  const { data } = await api.get(`/api/download-progress/${taskId}`)
  return data.data
}

/**
 * 取消下载任务
 */
export async function cancelDownload(taskId: string): Promise<void> {
  await api.post(`/api/cancel-download/${taskId}`)
}

/**
 * 获取视频直接链接
 */
export async function getDirectLinks(url: string, qn: number = 80) {
  const { data } = await api.get('/api/bilibili/direct-links', { params: { url, qn } })
  return data.data
}

/**
 * 构建下载 URL
 */
export function buildDownloadUrl(url: string, qn: number = 80, format: string = 'mp4'): string {
  const base = import.meta.env.VITE_API_BASE_URL || window.location.origin
  return `${base}/api/bilibili/download?url=${encodeURIComponent(url)}&qn=${qn}&format=${format}`
}

/**
 * 构建流式下载 URL
 */
export function buildStreamUrl(url: string, type: 'video' | 'audio', qn: number = 80): string {
  const base = import.meta.env.VITE_API_BASE_URL || window.location.origin
  return `${base}/api/bilibili/stream?url=${encodeURIComponent(url)}&qn=${qn}&type=${type}`
}

/**
 * 构建封面下载 URL
 */
export function buildCoverUrl(url: string): string {
  const base = import.meta.env.VITE_API_BASE_URL || window.location.origin
  return `${base}/api/bilibili/download/cover?url=${encodeURIComponent(url)}`
}
