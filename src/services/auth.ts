// ============================================================
// 登录认证 API
// ============================================================

import api from './api'
import type { QRCodeData, LoginCheckResponse, AuthStatusResponse } from '@/types/api'

/**
 * 获取登录二维码
 */
export async function getQRCode(): Promise<QRCodeData> {
  const { data } = await api.get('/api/bilibili/qrcode')
  return data
}

/**
 * 检查二维码扫描状态
 */
export async function checkQRStatus(key: string): Promise<LoginCheckResponse> {
  const { data } = await api.get('/api/bilibili/qrcode/check', { params: { key } })
  return data
}

/**
 * 检查登录状态
 */
export async function checkLoginStatus(): Promise<AuthStatusResponse> {
  const { data } = await api.get('/api/bilibili/status')
  return data
}

/**
 * 退出登录
 */
export async function logout(): Promise<void> {
  await api.post('/api/bilibili/logout')
}

/**
 * 获取用户详细信息（硬币/等级/经验/获赞）
 */
export async function getUserDetail() {
  const { data } = await api.get('/api/bilibili/userinfo')
  return data.data
}

/** 获取用户投稿视频 */
export async function getSubmissions(page = 1) {
  const { data } = await api.get('/api/bilibili/submissions', { params: { page } })
  return data.data
}

/** 获取收藏夹列表 */
export async function getFavorites() {
  const { data } = await api.get('/api/bilibili/favorites')
  return data.data
}

/** 获取收藏夹内视频 */
export async function getFavoriteVideos(folderId: number, page = 1) {
  const { data } = await api.get(`/api/bilibili/favorites/${folderId}`, { params: { page } })
  return data.data
}

/** 获取观看历史（cursor 分页） */
export async function getHistory(max = 0, viewAt = 0) {
  const params: any = {}
  if (max) { params.max = max; params.view_at = viewAt }
  const { data } = await api.get('/api/bilibili/history', { params })
  return data.data
}

/** 获取点赞视频 */
export async function getLikedVideos(page = 1) {
  const { data } = await api.get('/api/bilibili/liked', { params: { page } })
  return data.data
}
