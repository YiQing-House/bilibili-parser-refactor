/**
 * BilibiliService 子模块 - sign
 * 方法通过 Object.assign 混入到 BilibiliService.prototype
 */
const axios = require('axios');
const crypto = require('crypto');


module.exports = {

  // 区块3：API 签名方法 (TV/APP/WBI)
  // ============================================================

  /**
   * TV 接口签名
   */
  signTvParams(params) {
      const ordered = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
      const md5 = crypto.createHash('md5').update(ordered + this.tvAppSecret).digest('hex');
      return md5;
  },

  /**
   * 尝试使用 APP 接口获取播放地址（高画质方案）
   * 参考 BBDown 和 bilibili-API-collect 项目
   */
  async getPlayUrlByApp(bvid, cid, qn = 80) {
      // Android APP 端的 appkey 和 appsec（取流专用）
      const appkey = '1d8b6e7d45233436';
      const appsec = '560c52ccd288fed045859ed18bffd973';

      try {
          const params = {
              appkey: appkey,
              cid: String(cid),
              bvid: bvid,
              qn: String(qn),
              fnval: '4048',  // DASH格式 + HDR + 4K + AV1 + 8K
              fourk: '1',
              session: this.generateSid(),
              mobi_app: 'android',
              platform: 'android',
              build: '6800300',
              device: 'android',
              ts: String(Math.floor(Date.now() / 1000))
          };

          // APP 签名算法
          const sign = this.signAppParams(params, appsec);
          params.sign = sign;

          const headers = {
              'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 12; SM-G9750 Build/SP1A.210812.016) 6.80.0 os/android model/SM-G9750 mobi_app/android build/6800300 channel/bili innerVer/6800310 osVer/12 network/2',
              'Referer': 'https://www.bilibili.com/',
              'App-Key': 'android'
          };

          // 使用官方 APP API
          const apiUrl = `https://api.bilibili.com/x/player/playurl?${new URLSearchParams(params)}`;
          const resp = await axios.get(apiUrl, {
              headers,
              timeout: 8000
          });

          if (resp.data && resp.data.code === 0 && resp.data.data) {
              const data = resp.data.data;
              if (data.dash && data.dash.video && data.dash.video.length > 0) {
                  const maxQuality = Math.max(...data.dash.video.map(v => v.id));
                  console.log(`APP playurl 返回最高画质: ${maxQuality}`);
                  return data;
              }
          }
      } catch (e) {
          console.log('APP playurl 失败:', e.message);
      }
      return null;
  },

  /**
   * APP API 签名算法
   * 参考 bilibili-API-collect 官方 TypeScript 示例
   * https://socialsisteryi.github.io/bilibili-API-collect/docs/misc/sign/APP.html
   */
  signAppParams(params, appsec) {
      // 使用官方文档推荐的 URLSearchParams 方法
      const searchParams = new URLSearchParams(params);
      searchParams.sort();  // 关键：按 key 排序
      return crypto.createHash('md5').update(searchParams.toString() + appsec).digest('hex');
  },

  /**
   * 使用 HTML5 模式获取播放地址（支持登录用户获取更高画质）
   * 参考 hellotik.app 等网站的实现方式
   */
  async getPlayUrlByHtml5(bvid, cid, qn = 80, cookies = null) {
      try {
          // 方案1: 使用 platform=html5 + high_quality=1 + try_look=1
          const params = {
              bvid: bvid,
              cid: cid,
              qn: 127,  // 请求最高画质
              fnval: 4048,  // DASH 格式
              fnver: 0,
              fourk: 1,
              platform: 'pc',  // 使用 pc 而非 html5
              high_quality: 1,    // 关键参数！
              try_look: 1,  // 尝试无登录获取高画质
              otype: 'json'
          };

          // 关键修复：使用用户登录 Cookie（如果有）
          const cookieStr = this.getEffectiveCookie(cookies);
          // 调试日志：检查 Cookie 是否包含 SESSDATA
          const hasSessData = cookieStr.includes('SESSDATA=') && !cookieStr.includes('SESSDATA=;') && !cookieStr.includes('SESSDATA=,');
          console.log(`🔑 Cookie 状态: ${hasSessData ? '已登录 (含SESSDATA)' : '未登录'}`);

          const headers = {
              ...this.headers,
              'Cookie': cookieStr
          };

          const apiUrl = `https://api.bilibili.com/x/player/playurl?${new URLSearchParams(params)}`;
          console.log('HTML5 API 请求:', apiUrl);

          const resp = await axios.get(apiUrl, {
              headers,
              timeout: 10000
          });

          if (resp.data && resp.data.code === 0 && resp.data.data) {
              const data = resp.data.data;
              if (data.dash && data.dash.video && data.dash.video.length > 0) {
                  const maxQuality = Math.max(...data.dash.video.map(v => v.id));
                  console.log(`HTML5 playurl 返回最高画质: ${maxQuality}`);
                  return data;
              }
              // 如果没有 DASH，尝试使用 durl
              if (data.durl && data.durl.length > 0) {
                  console.log(`HTML5 playurl 返回 FLV 格式, 画质: ${data.quality}`);
                  return data;
              }
          }
      } catch (e) {
          console.log('HTML5 playurl 失败:', e.message);
      }

      // 方案2: 尝试使用 pgc 接口（番剧/电影接口，有时候限制较少）
      try {
          const pgcParams = {
              bvid: bvid,
              cid: cid,
              qn: 80,
              fnval: 4048,
              fnver: 0,
              fourk: 1,
              support_multi_audio: true,
              drm_tech_type: 2
          };

          const pgcUrl = `https://api.bilibili.com/pgc/player/web/playurl?${new URLSearchParams(pgcParams)}`;

          const resp2 = await axios.get(pgcUrl, {
              headers: { ...this.headers, Cookie: cookieStr },
              timeout: 8000
          });

          if (resp2.data && resp2.data.code === 0 && resp2.data.result) {
              const data = resp2.data.result;
              if (data.dash && data.dash.video && data.dash.video.length > 0) {
                  const maxQuality = Math.max(...data.dash.video.map(v => v.id));
                  console.log(`PGC playurl 返回最高画质: ${maxQuality}`);
                  return data;
              }
          }
      } catch (e) {
          console.log('PGC playurl 失败:', e.message);
      }

      return null;
  },

  /**
   * 获取 bili_ticket（可降低风控概率）
   * 参考 bilibili-API-collect 文档
   */
  async getBiliTicket() {
      const now = Date.now();

      // 缓存 3 天
      if (this.biliTicket && now < this.biliTicketExpire) {
          return this.biliTicket;
      }

      try {
          const ts = Math.floor(now / 1000);
          const hexSign = crypto.createHmac('sha256', 'XgwSnGZ1p')
              .update(`ts${ts}`)
              .digest('hex');

          const params = new URLSearchParams({
              key_id: 'ec02',
              hexsign: hexSign,
              'context[ts]': ts,
              csrf: ''
          });

          const url = `https://api.bilibili.com/bapis/bilibili.api.ticket.v1.Ticket/GenWebTicket?${params.toString()}`;

          const response = await axios.post(url, null, {
              headers: {
                  'User-Agent': this.headers['User-Agent'],
                  'Referer': 'https://www.bilibili.com/'
              },
              timeout: 10000
          });

          if (response.data?.code === 0 && response.data?.data?.ticket) {
              this.biliTicket = response.data.data.ticket;
              this.biliTicketExpire = now + 259000 * 1000; // 259000秒 ≈ 3天，接近官方 ticket 有效期
              console.log('✅ 获取 bili_ticket 成功');
              return this.biliTicket;
          }
      } catch (error) {
          console.log('获取 bili_ticket 失败:', error.message);
      }

      return null;
  },

  /**
   * 获取带 bili_ticket 的完整 Cookie（用于风控敏感接口）
   */
  async getEffectiveCookieWithTicket(cookies = null) {
      // 始终使用 baseCookie 包含 buvid3/buvid4 等风控必需字段
      let fullCookie = this.baseCookie;

      // 追加登录信息
      if (this.envCookies?.SESSDATA) {
          fullCookie += `; SESSDATA=${this.envCookies.SESSDATA}`;
          if (this.envCookies.bili_jct) fullCookie += `; bili_jct=${this.envCookies.bili_jct}`;
          if (this.envCookies.DedeUserID) fullCookie += `; DedeUserID=${this.envCookies.DedeUserID}`;
      } else if (cookies) {
          fullCookie += `; ${this.formatCookies(cookies)}`;
      }

      // 追加 bili_ticket
      const ticket = await this.getBiliTicket();
      if (ticket) {
          fullCookie += `; bili_ticket=${ticket}`;
      }

      return fullCookie;
  },

  /**
   * 获取 WBI keys（优化：减少超时+使用基础Cookie）
   */
  async getWbiKeys(cookies = null) {
      const now = Date.now();

      // 延长缓存时间到2小时
      if (this.wbiKeys && now < this.wbiKeysExpire) {
          return this.wbiKeys;
      }

      try {
          const cookieStr = cookies ? this.formatCookies(cookies) : this.baseCookie;
          const headers = {
              ...this.headers,
              'Cookie': cookieStr
          };

          const response = await axios.get('https://api.bilibili.com/x/web-interface/nav', {
              headers,
              timeout: 10000 // 减少到10秒
          });

          if (response.data && response.data.code === 0) {
              const { img_url, sub_url } = response.data.data.wbi_img;
              const imgKey = img_url.split('/').pop().split('.')[0];
              const subKey = sub_url.split('/').pop().split('.')[0];

              this.wbiKeys = { imgKey, subKey };
              this.wbiKeysExpire = now + 2 * 60 * 60 * 1000; // 缓存2小时

              return this.wbiKeys;
          }
      } catch (error) {
          console.log('获取 WBI keys 失败:', error.message);
          // 使用备用的硬编码keys（不常变化）
          return this.getFallbackWbiKeys();
      }

      return this.getFallbackWbiKeys();
  },

  /**
   * 获取备用WBI keys（当API失败时使用）
   */
  getFallbackWbiKeys() {
      // B站WBI keys不常变化，可以使用固定值作为备用
      return {
          imgKey: '7cd084941338484aae1ad9425b84077c',
          subKey: '4932caff0ff746eab6f01bf08b70ac45'
      };
  },

  /**
   * 获取混淆后的 key
   */
  getMixinKey(orig) {
      let temp = '';
      for (let i = 0; i < this.mixinKeyEncTab.length; i++) {
          temp += orig[this.mixinKeyEncTab[i]];
      }
      return temp.slice(0, 32);
  },

  /**
   * 对参数进行 WBI 签名
   */
  async encWbi(params, cookies = null) {
      const wbiKeys = await this.getWbiKeys(cookies);
      if (!wbiKeys) {
          return params;
      }

      const { imgKey, subKey } = wbiKeys;
      const mixinKey = this.getMixinKey(imgKey + subKey);

      const currTime = Math.round(Date.now() / 1000);
      const newParams = { ...params, wts: currTime };

      const keys = Object.keys(newParams).sort();
      const query = keys.map(key => {
          const value = String(newParams[key]).replace(/[!'()*]/g, '');
          return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
      }).join('&');

      const wRid = crypto.createHash('md5').update(query + mixinKey).digest('hex');

      return { ...newParams, w_rid: wRid };
  }
};
