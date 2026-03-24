/**
 * BilibiliService 子模块 - info
 * 方法通过 Object.assign 混入到 BilibiliService.prototype
 */
const axios = require('axios');


module.exports = {

  // 区块5：视频信息获取
  // ============================================================

  /**
   * 获取视频信息（优化：减少超时时间提升速度）
   */
  async getVideoInfo(url, cookies = null) {
      const finalUrl = this.sanitizeBiliUrl(await this.resolveShortUrl(url));
      const videoId = this.extractVideoId(finalUrl);
      if (!videoId) {
          throw new Error('无法从链接中提取视频ID');
      }

      const params = videoId.bvid
          ? { bvid: videoId.bvid }
          : { aid: videoId.aid };

      // 使用基础Cookie或用户Cookie
      const cookieStr = this.getEffectiveCookie(cookies);
      const signedParams = await this.encWbi(params, cookies);

      const headers = {
          ...this.headers,
          'Cookie': cookieStr
      };

      const apiUrl = `https://api.bilibili.com/x/web-interface/view?${new URLSearchParams(signedParams)}`;

      const response = await axios.get(apiUrl, {
          headers,
          timeout: 15000 // 减少到15秒提升速度
      });

      if (response.data && response.data.code === 0) {
          return response.data.data;
      }

      throw new Error(`获取视频信息失败: ${response.data?.message || '未知错误'}`);
  },

  /**
   * 获取视频播放地址（优化：多重尝试获取最高画质）
   */
  async getPlayUrl(bvid, cid, qn = 80, cookies = null) {
      // 使用基础Cookie或用户Cookie
      const cookieStr = this.getEffectiveCookie(cookies);

      // 尝试多个API获取最高画质
      const apis = [
          // 标准WBI API
          {
              url: 'https://api.bilibili.com/x/player/wbi/playurl',
              needSign: true
          },
          // 旧版API（有时能获取更高画质）
          {
              url: 'https://api.bilibili.com/x/player/playurl',
              needSign: false
          }
      ];

      // 只请求一次最高画质（120），API会自动返回可用画质列表
      for (const api of apis) {
          try {
              const params = {
                  bvid: bvid,
                  cid: cid,
                  qn: 120,  // 请求最高画质，API会返回所有可用画质
                  fnval: 4048,  // DASH格式
                  fnver: 0,
                  fourk: 1,
                  platform: 'pc',
                  high_quality: 1,
                  build: 6060600,
                  device: 'pc',
                  mobi_app: 'pc',
                  ts: Math.floor(Date.now() / 1000)
              };

              const finalParams = api.needSign ? await this.encWbi(params, cookies) : params;

              const headers = {
                  ...this.headers,
                  'Cookie': cookieStr,
                  'Accept-Encoding': 'gzip, deflate, br',
                  'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7'
              };

              const apiUrl = `${api.url}?${new URLSearchParams(finalParams)}`;

              const response = await axios.get(apiUrl, {
                  headers,
                  timeout: 8000
              });

              if (response.data && response.data.code === 0) {
                  const data = response.data.data;
                  if (data.dash && data.dash.video && data.dash.video.length > 0) {
                      const maxQuality = Math.max(...data.dash.video.map(v => v.id));
                      console.log(`API ${api.url.split('/').pop()} 返回最高画质: ${maxQuality}`);
                      // 返回数据，让调用方决定使用哪个画质
                      return data;
                  }
              }
          } catch (error) {
              console.log(`API ${api.url} 失败:`, error.message);
          }
      }

      // 如果都失败，使用标准API的结果
      const params = {
          bvid: bvid,
          cid: cid,
          qn: qn,
          fnval: 4048,
          fnver: 0,
          fourk: 1,
          platform: 'pc'
      };

      const signedParams = await this.encWbi(params, cookies);
      const headers = {
          ...this.headers,
          'Cookie': cookieStr
      };

      const response = await axios.get(`https://api.bilibili.com/x/player/wbi/playurl?${new URLSearchParams(signedParams)}`, {
          headers,
          timeout: 10000
      });

      if (response.data && response.data.code === 0) {
          return response.data.data;
      }

      throw new Error(`获取播放地址失败: ${response.data?.message || '未知错误'}`);
  },

  /**
   * 解析视频（主方法）
   */
  async parseVideo(url, cookies = null) {
      try {
          const finalUrl = this.sanitizeBiliUrl(await this.resolveShortUrl(url));
          const videoInfo = await this.getVideoInfo(finalUrl, cookies);

          const bvid = videoInfo.bvid;
          const cid = videoInfo.pages?.[0]?.cid || videoInfo.cid;

          if (!cid) {
              throw new Error('无法获取视频 CID');
          }

          let playData = null;
          let downloadLinks = [];

          try {
              // 如果已登录，优先使用 WBI 签名 API（获取 1080P60/4K）
              if (cookies) {
                  console.log('🔐 已登录用户，优先使用 WBI API 获取高画质');
                  playData = await this.getPlayUrl(bvid, cid, 120, cookies);
              }

              // 如果未登录或 WBI 失败，尝试 HTML5 模式（无登录可获取 1080P）
              if (!playData) {
                  playData = await this.getPlayUrlByHtml5(bvid, cid, 120, cookies);
              }

              // 如果 HTML5 失败，尝试 APP 模式
              if (!playData) {
                  playData = await this.getPlayUrlByApp(bvid, cid, 120);
              }

              if (playData && playData.dash) {
                  const videos = playData.dash.video || [];
                  const audios = playData.dash.audio || [];

                  const qualityMap = new Map();
                  videos.forEach(video => {
                      const qn = video.id;
                      if (!qualityMap.has(qn) || video.bandwidth > qualityMap.get(qn).video.bandwidth) {
                          qualityMap.set(qn, {
                              video: video,
                              qualityName: this.getQualityName(qn),
                              needVip: qn > 80
                          });
                      }
                  });

                  const bestAudio = audios.length > 0 ? audios[0] : null;

                  qualityMap.forEach((info, qn) => {
                      downloadLinks.push({
                          quality: info.qualityName,
                          qn: qn,
                          needVip: info.needVip,
                          url: finalUrl,
                          needYtdlp: true
                      });
                  });

                  downloadLinks.sort((a, b) => b.qn - a.qn);
              }
          } catch (playError) {
              console.log('获取播放地址失败:', playError.message);
          }

          // 定义所有可能的画质选项（整合 1080P60和1080P高码率为统一选项）
          const allQualities = [
              { quality: '4K 超清', qn: 120, needVip: true },
              { quality: '1080P 高帧率', qn: 116, needVip: true },  // 优先60帧，回退到高码率(112)
              { quality: '1080P', qn: 80, needVip: false },
              { quality: '720P', qn: 64, needVip: false },
              { quality: '480P', qn: 32, needVip: false },
              { quality: '360P', qn: 16, needVip: false }
          ];

          // 获取API实际返回的画质qn列表
          const existingQns = new Set(downloadLinks.map(link => link.qn));

          // 如果API没有返回任何画质，免费画质默认可用，VIP画质不可用
          if (downloadLinks.length === 0) {
              downloadLinks = allQualities.map(q => ({
                  ...q,
                  url: finalUrl,
                  needYtdlp: true,
                  exists: !q.needVip // 免费画质(1080P及以下)默认可用
              }));
          } else {
              // 找出API返回的最高画质
              const maxExistingQn = Math.max(...existingQns);
              // 2024.12: 禁用 yt-dlp 探测（太慢且始终 412），直接使用 1080P 作为兜底
              const ensuredMaxQn = Math.max(maxExistingQn, 80); // 未登录兜底1080P

              // 补充所有可能的画质选项，标记最高可用画质（匿名也至少保留1080P）
              const finalLinks = [];
              allQualities.forEach(quality => {
                  const exists =
                      existingQns.has(quality.qn) ||
                      (!quality.needVip && quality.qn <= ensuredMaxQn);
                  finalLinks.push({
                      quality: quality.quality,
                      qn: quality.qn,
                      needVip: quality.needVip,
                      url: finalUrl,
                      needYtdlp: true,
                      exists: exists,
                      maxQuality: ensuredMaxQn // 标记视频支持的最高画质（至少1080P）
                  });
              });
              downloadLinks = finalLinks;
              downloadLinks.sort((a, b) => b.qn - a.qn);
          }

          return {
              title: videoInfo.title || 'B站视频',
              author: videoInfo.owner?.name || '未知UP主',
              duration: this.formatDuration(videoInfo.duration),
              thumbnail: videoInfo.pic || '',
              platform: 'B站',
              videoUrl: finalUrl,
              downloadLinks: downloadLinks,
              bvid: bvid,
              cid: cid
          };

      } catch (error) {
          throw new Error(`B站视频解析失败: ${error.message}`);
      }
  }
};
