/**
 * BilibiliService 子模块 - resolver
 * 方法通过 Object.assign 混入到 BilibiliService.prototype
 */
const axios = require('axios');
const ytdlpService = require('../ytdlpService');


module.exports = {

  // 区块4：URL 处理与解析
  // ============================================================

  /**
   * 从 URL 提取视频 ID
   */
  extractVideoId(url) {
      const bvMatch = url.match(/BV([a-zA-Z0-9]+)/i);
      const avMatch = url.match(/av(\d+)/i);

      if (bvMatch) return { bvid: `BV${bvMatch[1]}` };
      if (avMatch) return { aid: avMatch[1] };
      return null;
  },

  /**
   * 规范化B站链接，去掉分享参数，仅保留 bvid 与 p
   */
  sanitizeBiliUrl(url) {
      const id = this.extractVideoId(url);
      if (!id || !id.bvid) return url;
      const pMatch = String(url).match(/[?&]p=(\d+)/i);
      const p = pMatch ? parseInt(pMatch[1], 10) : null;
      const base = `https://www.bilibili.com/video/${id.bvid}/`;
      return p ? `${base}?p=${p}` : base;
  },

  /**
   * 从原始输入中提取 B站相关链接（优先 bilibili/b23.tv 等，过滤其他网站）
   */
  extractFirstUrl(raw) {
      if (!raw) return '';
      const str = String(raw);

      // 提取所有 URL
      const allUrls = str.match(/https?:\/\/[^\s\u4e00-\u9fa5\u3010\u3011【】]+/gi) || [];

      // B站相关域名正则
      const biliPattern = /(bilibili\.com|b23\.tv|bili22\.cn|bili2233\.cn|bili23\.cn|hdslb\.com)/i;

      // 优先查找 B站相关链接
      for (const url of allUrls) {
          if (biliPattern.test(url)) {
              return url.replace(/[】\u3011]$/, ''); // 去除可能的中文括号
          }
      }

      // 如果没有 B站链接，返回第一个 URL（兼容其他平台）
      if (allUrls.length > 0) {
          return allUrls[0].replace(/[】\u3011]$/, '');
      }

      return str.trim();
  },

  /**
   * 解析短链为真实地址（支持 b23.tv / bili22.cn / bili2233.cn / bili23.cn / btv）
   */
  async resolveShortUrl(url) {
      const normalized = this.extractFirstUrl(url);
      if (!normalized) return url;

      const needResolve = /(b23\.tv|bili22\.cn|bili2233\.cn|bili23\.cn|btv)/i;
      if (!needResolve.test(normalized)) return normalized;

      // axios 默认跟随重定向，取最终跳转地址
      try {
          const resp = await axios.get(normalized, {
              maxRedirects: 5,
              timeout: 8000,
              validateStatus: (s) => s >= 200 && s < 400 // 允许 3xx
          });
          const finalUrl = resp?.request?.res?.responseUrl || resp?.request?._currentUrl;
          if (finalUrl) return finalUrl;
      } catch (e) {
          // 再尝试一次 HEAD 获取 Location
          try {
              const headResp = await axios.head(normalized, {
                  maxRedirects: 0,
                  timeout: 5000,
                  validateStatus: (s) => s >= 200 && s < 400
              });
              const loc = headResp.headers?.location;
              if (loc) return loc.startsWith('http') ? loc : `https:${loc}`;
          } catch (e2) {
              // ignore
          }
      }
      return url;
  },

  /**
   * 通过 yt-dlp 探测最高可用分辨率（用于未登录兜底）
   * 粗略映射分辨率到 qn：>=2160 ->120, >=1080 ->80, >=720 ->64, >=480 ->32, else 16
   */
  async probeMaxQByYtdlp(url) {
      try {
          const info = await ytdlpService.getVideoInfo(url, {
              headers: {
                  'User-Agent': this.headers['User-Agent'],
                  'Referer': this.headers['Referer'],
                  'Origin': 'https://www.bilibili.com',
                  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7'
              },
              cookie: this.getEffectiveCookie()
          });
          if (!info || !info.formats || info.formats.length === 0) return null;
          const maxHeight = info.formats
              .map(f => f.height || 0)
              .reduce((a, b) => Math.max(a, b), 0);
          if (maxHeight >= 2160) return 120;
          if (maxHeight >= 1080) return 80;
          if (maxHeight >= 720) return 64;
          if (maxHeight >= 480) return 32;
          if (maxHeight > 0) return 16;
          return null;
      } catch (e) {
          console.log('yt-dlp 探测最高画质失败:', e.message);
          return null;
      }
  }
};
