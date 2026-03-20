// ============================================================
// 登录认证 Store
// ============================================================

import { defineStore } from 'pinia'
import * as authApi from '@/services/auth'

interface UserInfo {
  name: string
  avatar: string
  mid: number
}

interface UserDetail {
  coins: number
  level: number
  currentExp: number
  nextLevelExp: number
  totalLikes: number
  mid: number
}

interface AuthState {
  isLoggedIn: boolean
  isVip: boolean
  vipLabel: string
  userInfo: UserInfo | null
  userDetail: UserDetail | null
  userDetailLoading: boolean
  userDetailError: string
  profilePanelOpen: boolean
  qrCheckInterval: ReturnType<typeof setInterval> | null
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    isLoggedIn: false,
    isVip: false,
    vipLabel: '',
    userInfo: null,
    userDetail: null,
    userDetailLoading: false,
    userDetailError: '',
    profilePanelOpen: false,
    qrCheckInterval: null,
  }),

  actions: {
    /** 检查当前登录状态 */
    async checkStatus() {
      try {
        const res = await authApi.checkLoginStatus()
        this.isLoggedIn = res.isLoggedIn
        this.isVip = res.isVip || false
        this.vipLabel = res.vipLabel || ''
        this.userInfo = res.userInfo || null
      } catch {
        this.isLoggedIn = false
        this.isVip = false
        this.vipLabel = ''
        this.userInfo = null
      }
    },

    /** 获取登录二维码 */
    async getQRCode() {
      return await authApi.getQRCode()
    },

    /** 轮询扫码状态 */
    startQRPolling(key: string, callbacks: {
      onScanned?: () => void
      onConfirmed?: (userInfo: UserInfo | null, isVip: boolean) => void
      onExpired?: () => void
    }) {
      this.stopQRPolling()

      this.qrCheckInterval = setInterval(async () => {
        try {
          const res = await authApi.checkQRStatus(key)

          switch (res.status) {
            case 'scanned':
              callbacks.onScanned?.()
              break
            case 'confirmed':
              this.stopQRPolling()
              this.isLoggedIn = true
              this.isVip = res.isVip || false
              this.vipLabel = res.vipLabel || ''
              this.userInfo = res.userInfo || null
              callbacks.onConfirmed?.(res.userInfo || null, res.isVip || false)
              break
            case 'expired':
              this.stopQRPolling()
              callbacks.onExpired?.()
              break
          }
        } catch {
          // 继续轮询
        }
      }, 2000)
    },

    /** 停止轮询 */
    stopQRPolling() {
      if (this.qrCheckInterval) {
        clearInterval(this.qrCheckInterval)
        this.qrCheckInterval = null
      }
    },

    /** 退出登录 */
    async logout() {
      try {
        await authApi.logout()
      } finally {
        this.isLoggedIn = false
        this.isVip = false
        this.vipLabel = ''
        this.userInfo = null
        this.userDetail = null
        this.profilePanelOpen = false
      }
    },

    /** 切换个人中心侧边栏 */
    toggleProfile() {
      this.profilePanelOpen = !this.profilePanelOpen
      if (this.profilePanelOpen && !this.userDetail) {
        this.fetchUserDetail()
      }
    },

    /** 获取用户详细信息 */
    async fetchUserDetail() {
      this.userDetailLoading = true
      this.userDetailError = ''
      try {
        this.userDetail = await authApi.getUserDetail()
      } catch (e: any) {
        this.userDetailError = e.message || '加载失败'
      } finally {
        this.userDetailLoading = false
      }
    },
  },
})
