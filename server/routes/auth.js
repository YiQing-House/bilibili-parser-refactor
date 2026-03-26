/**
 * 登录系统路由
 * 二维码生成 / 扫码检查 / 登录状态 / 登出 / 用户信息
 */
const express = require('express')
const axios = require('axios')
const { BILIBILI_HEADERS, getAuthHeaders } = require('../helpers/bilibili')

module.exports = function createAuthRoutes({ loginSessions }) {
  const router = express.Router()

  // 获取登录二维码
  router.get('/bilibili/qrcode', async (req, res) => {
    try {
      const response = await axios.get(
        'https://passport.bilibili.com/x/passport-login/web/qrcode/generate',
        { headers: { ...BILIBILI_HEADERS, 'Referer': 'https://www.bilibili.com/' } }
      )
      if (response.data.code === 0) {
        const { url, qrcode_key } = response.data.data
        const qrcodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`
        res.json({ success: true, qrcodeUrl, qrcodeKey: qrcode_key })
      } else {
        throw new Error(response.data.message || '获取二维码失败')
      }
    } catch (error) {
      console.error('[QR] 获取二维码失败:', error.message)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // 检查二维码扫描状态（禁止浏览器缓存，否则轮询会用缓存的旧响应）
  router.get('/bilibili/qrcode/check', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.set('Pragma', 'no-cache')
    res.set('Expires', '0')
    try {
      const { key } = req.query
      if (!key) return res.status(400).json({ success: false, error: '缺少 qrcode_key' })

      const response = await axios.get(
        `https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${key}`,
        { headers: { ...BILIBILI_HEADERS } }
      )

      const data = response.data.data
      let status = 'waiting'
      let userInfo = null
      let isVip = false
      let vipLabel = ''

      console.log('[QR] poll code:', data.code, 'message:', data.message)

      switch (data.code) {
        case 0: {
          status = 'confirmed'
          console.log('[QR] 确认登录, url:', data.url?.substring(0, 80) + '...')
          const urlParams = new URLSearchParams(data.url.split('?')[1])
          const sessdata = decodeURIComponent(urlParams.get('SESSDATA') || '')
          const biliJct = urlParams.get('bili_jct')
          const dedeUserId = urlParams.get('DedeUserID')
          console.log('[QR] SESSDATA:', sessdata ? `${sessdata.substring(0, 10)}...` : 'NULL')
          console.log('[QR] bili_jct:', biliJct ? `${biliJct.substring(0, 10)}...` : 'NULL')
          console.log('[QR] DedeUserID:', dedeUserId)

          if (sessdata) {
            const cookies = { SESSDATA: sessdata, bili_jct: biliJct, DedeUserID: dedeUserId }

            try {
              const userRes = await axios.get('https://api.bilibili.com/x/web-interface/nav', {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                  'Cookie': `SESSDATA=${sessdata}; bili_jct=${biliJct}; DedeUserID=${dedeUserId}`,
                },
              })
              console.log('[QR] nav code:', userRes.data.code)
              if (userRes.data.code === 0) {
                const u = userRes.data.data
                const avatarProxy = `/api/proxy/avatar?url=${encodeURIComponent(u.face)}`
                userInfo = { name: u.uname, avatar: avatarProxy, mid: u.mid }
                isVip = u.vipStatus === 1
                const vipTypeMap = { 0: '', 1: '月度大会员', 2: '年度大会员' }
                vipLabel = vipTypeMap[u.vipType] || (isVip ? '大会员' : '')
                console.log('[QR] 登录成功:', u.uname, isVip ? `(${vipLabel})` : '')
              }
            } catch (e) {
              console.error('[QR] 获取用户信息失败:', e.message)
            }

            const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            loginSessions.set(sessionId, { cookies, userInfo, isVip, vipLabel, createdAt: Date.now() })
            res.cookie('bili_session', sessionId, {
              httpOnly: true,
              maxAge: 7 * 24 * 60 * 60 * 1000,
              path: '/',
              sameSite: 'lax',
            })
            console.log('[QR] session 已创建:', sessionId.substring(0, 20) + '...')
          } else {
            console.error('[QR] SESSDATA 为空！无法建立会话')
          }
          break
        }
        case 86038: status = 'expired'; break
        case 86090: status = 'scanned'; break
        case 86101: status = 'waiting'; break
      }

      res.json({ success: true, status, userInfo, isVip, vipLabel })
    } catch (error) {
      console.error('[QR] check 错误:', error.message)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // 检查登录状态
  router.get('/bilibili/status', (req, res) => {
    const sessionId = req.cookies?.bili_session
    if (sessionId && loginSessions.has(sessionId)) {
      const session = loginSessions.get(sessionId)
      res.json({ success: true, isLoggedIn: true, isVip: session.isVip, vipLabel: session.vipLabel || '', userInfo: session.userInfo })
    } else {
      res.json({ success: true, isLoggedIn: false })
    }
  })

  // 退出登录
  router.post('/bilibili/logout', (req, res) => {
    const sessionId = req.cookies?.bili_session
    if (sessionId) {
      loginSessions.delete(sessionId)
      res.clearCookie('bili_session')
    }
    res.json({ success: true })
  })

  // 获取用户详细信息
  router.get('/bilibili/userinfo', async (req, res) => {
    try {
      const sessionId = req.cookies?.bili_session
      if (!sessionId || !loginSessions.has(sessionId)) {
        return res.status(401).json({ success: false, error: '未登录' })
      }
      const session = loginSessions.get(sessionId)
      const { cookies } = session
      const headers = getAuthHeaders(cookies)

      const [navRes, upstatRes] = await Promise.all([
        axios.get('https://api.bilibili.com/x/web-interface/nav', { headers }),
        axios.get(`https://api.bilibili.com/x/space/upstat?mid=${cookies.DedeUserID}`, { headers }),
      ])

      const nav = navRes.data?.data || {}
      const upstat = upstatRes.data?.data || {}

      res.json({
        success: true,
        data: {
          coins: nav.money || 0,
          level: nav.level_info?.current_level || 0,
          currentExp: nav.level_info?.current_exp || 0,
          nextLevelExp: nav.level_info?.next_exp || 1,
          totalLikes: upstat.likes || 0,
          mid: nav.mid || cookies.DedeUserID,
        },
      })
    } catch (error) {
      console.error('[UserInfo] 获取失败:', error.message)
      res.status(500).json({ success: false, error: '获取用户信息失败' })
    }
  })

  return router
}
