// ============================================================
// API 相关类型
// ============================================================

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface QRCodeData {
  qrcodeUrl: string
  qrcodeKey: string
}

export type LoginStatus = 'waiting' | 'scanned' | 'confirmed' | 'expired'

export interface LoginCheckResponse {
  success: boolean
  status: LoginStatus
  userInfo?: {
    name: string
    avatar: string
    mid: number
  }
  isVip?: boolean
  vipLabel?: string
}

export interface AuthStatusResponse {
  success: boolean
  isLoggedIn: boolean
  isVip?: boolean
  vipLabel?: string
  userInfo?: {
    name: string
    avatar: string
    mid: number
  }
}

export interface DownloadTaskResponse {
  success: boolean
  taskId: string
}

export interface DownloadProgress {
  status: 'starting' | 'processing' | 'downloading' | 'completed' | 'error' | 'cancelled' | 'unknown'
  percent: number
  stage: string
  speed?: string
  downloadedMB?: string
  totalMB?: string
  downloadUrl?: string
  fileName?: string
  error?: string
  message?: string
}

export interface BatchResult {
  success: boolean
  total: number
  results: Array<{
    url: string
    success: boolean
    data?: import('./video').VideoData
    error?: string
    retryable?: boolean
  }>
}
