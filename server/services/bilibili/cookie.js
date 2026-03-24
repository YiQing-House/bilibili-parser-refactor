/**
 * BilibiliService 子模块 - cookie
 * 方法通过 Object.assign 混入到 BilibiliService.prototype
 */
module.exports = {
  // 区块2：Cookie/ID 生成方法

  /**
   * 生成基础Cookie（参考GitHub开源项目，模拟真实浏览器获取高画质）
   */
  generateBaseCookie() {
      const buvid3 = this.generateBuvid3();
      const buvid4 = this.generateBuvid4();
      const b_nut = Date.now();
      const uuid = this.generateUUID();
      const sid = this.generateSid();
      // 完整的Cookie组合（参考BBDown等开源项目）
      return [
          `buvid3=${buvid3}`,
          `buvid4=${buvid4}`,
          `b_nut=${b_nut}`,
          `_uuid=${uuid}`,
          `buvid_fp=${this.generateBuvidFp()}`,
          `SESSDATA=`,  // 空值但保留字段
          `bili_jct=`,  // 空值但保留字段
          `DedeUserID=`, // 空值但保留字段
          `DedeUserID__ckMd5=`, // 空值但保留字段
          `sid=${sid}`,
          `CURRENT_QUALITY=80`,
          `CURRENT_FNVAL=4048`,
          `innersign=0`,
          `b_lsid=${this.generateBLsid()}`,
          `i-wanna-go-back=-1`,
          `browser_resolution=1920-1080`,
          `PVID=1`
      ].join('; ');
  },

  /**
   * 生成sid（会话ID）
   */
  generateSid() {
      const chars = '0123456789abcdef';
      let result = '';
      for (let i = 0; i < 16; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
  },

  /**
   * 生成buvid4
   */
  generateBuvid4() {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = '';
      for (let i = 0; i < 32; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
  },

  /**
   * 生成buvid_fp
   */
  generateBuvidFp() {
      const chars = '0123456789abcdef';
      let result = '';
      for (let i = 0; i < 32; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
  },

  /**
   * 读取环境变量中的登录 Cookie（可选：BILI_SESSDATA/BILI_JCT/BILI_DEDEUID）
   */
  loadEnvCookies() {
      const SESSDATA = process.env.BILI_SESSDATA || '';
      const bili_jct = process.env.BILI_JCT || '';
      const DedeUserID = process.env.BILI_DEDEUSERID || '';
      if (!SESSDATA) return null;
      return {
          SESSDATA,
          bili_jct,
          DedeUserID
      };
  },

  /**
   * 生成b_lsid
   */
  generateBLsid() {
      const chars = '0123456789ABCDEF';
      let part1 = '';
      for (let i = 0; i < 8; i++) {
          part1 += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return `${part1}_${Date.now().toString(16).toUpperCase()}`;
  },

  /**
   * 生成buvid3
   */
  generateBuvid3() {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = '';
      for (let i = 0; i < 35; i++) {
          if (i === 8 || i === 13 || i === 18 || i === 23) {
              result += '-';
          } else {
              result += chars.charAt(Math.floor(Math.random() * chars.length));
          }
      }
      return result + 'infoc';
  },

  /**
   * 生成UUID
   */
  generateUUID() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16).toUpperCase();
      }) + 'infoc';
  },

  /**
   * 格式化 cookies 对象为字符串
   */
  formatCookies(cookies) {
      if (typeof cookies === 'string') return cookies;
      return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  },

  /**
   * 获取有效的 Cookie 字符串（优先：环境 Cookie > 登录 Cookie > 基础 Cookie）
   */
  getEffectiveCookie(cookies = null) {
      if (this.envCookies?.SESSDATA) {
          const parts = [];
          if (this.envCookies.SESSDATA) parts.push(`SESSDATA=${this.envCookies.SESSDATA}`);
          if (this.envCookies.bili_jct) parts.push(`bili_jct=${this.envCookies.bili_jct}`);
          if (this.envCookies.DedeUserID) parts.push(`DedeUserID=${this.envCookies.DedeUserID}`);
          return parts.join('; ');
      }
      if (cookies) return this.formatCookies(cookies);
      return this.baseCookie;
  }
};
