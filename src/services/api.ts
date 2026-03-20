// ============================================================
// API 基础层 - Axios 实例 + 拦截器
// ============================================================

import axios from 'axios'
import type { ApiResponse } from '@/types/api'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || window.location.origin,
  timeout: 30000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器 - 统一错误处理
api.interceptors.response.use(
  (response) => {
    const data = response.data as ApiResponse
    if (data.success === false) {
      const error = new Error(data.error || data.message || '请求失败')
      return Promise.reject(error)
    }
    return response
  },
  (error) => {
    if (error.response) {
      const status = error.response.status
      const messages: Record<number, string> = {
        400: '请求参数错误',
        401: '未授权，请先登录',
        403: '权限不足',
        404: '请求的资源不存在',
        429: '请求过于频繁，请稍后再试',
        500: '服务器内部错误',
        502: '网关错误',
        503: '服务暂不可用',
      }
      error.message = messages[status] || `请求失败 (${status})`
    } else if (error.code === 'ECONNABORTED') {
      error.message = '请求超时，请检查网络'
    } else {
      error.message = '网络连接失败'
    }
    return Promise.reject(error)
  }
)

export default api
