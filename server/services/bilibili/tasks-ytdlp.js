/**
 * BilibiliService 子模块 - tasks/ytdlp
 * yt-dlp 下载方案
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ytdlpService = require('../ytdlpService');

module.exports = {
  /**
   * 使用 yt-dlp 下载（优先方案，支持高画质）
   */
  async downloadWithYtdlp(url, qn = 80, res, format = 'mp4', nameFormat = 'title') {
      try {
          const finalUrl = this.sanitizeBiliUrl(await this.resolveShortUrl(url));
          // 获取视频信息用于生成文件名（携带基础Header/Cookie，避免412）
          const videoInfo = await this.getVideoInfo(finalUrl, null);
          const title = (videoInfo.title || 'video').replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
          const author = (videoInfo.owner?.name || 'UP主').replace(/[<>:"/\\|?*]/g, '_').substring(0, 20);

          // 根据命名格式生成文件名
          let baseName;
          switch (nameFormat) {
              case 'title-author':
                  baseName = `${title} - ${author}`;
                  break;
              case 'author-title':
                  baseName = `${author} - ${title}`;
                  break;
              default:
                  baseName = title;
          }

          // 画质映射到yt-dlp格式选择器
          const qualityMap = {
              120: 'bestvideo[height<=2160]+bestaudio/best[height<=2160]',  // 4K
              116: 'bestvideo[height<=1080][fps>30]+bestaudio/best[height<=1080][fps>30]',  // 1080P60
              112: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',  // 1080P+
              80: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',   // 1080P
              64: 'bestvideo[height<=720]+bestaudio/best[height<=720]',      // 720P
              32: 'bestvideo[height<=480]+bestaudio/best[height<=480]',      // 480P
              16: 'bestvideo[height<=360]+bestaudio/best[height<=360]'       // 360P
          };

          const formatSelector = qualityMap[qn] || qualityMap[80];

          // 画质名称（用于文件名）
          const qNameMap = {
              120: '4K', 116: '1080P60', 112: '1080P+', 80: '1080P',
              64: '720P', 32: '480P', 16: '360P'
          };
          const qualityName = qNameMap[qn] || '1080P';
          const finalName = `${qualityName}_${baseName}`;

          console.log(`yt-dlp 下载: 画质=${qn}, 格式选择器=${formatSelector}`);

          // 注意：延迟设置响应头，等确认yt-dlp成功后再设置，以便失败时可以回退

          // 构建yt-dlp命令（添加Cookie和User-Agent绕过412错误）
          const check = await ytdlpService.checkAvailable();
          const userAgent = this.headers['User-Agent'];
          const referer = this.headers['Referer'];
          const origin = 'https://www.bilibili.com';
          const acceptLang = 'zh-CN,zh;q=0.9,en;q=0.7';
          const cookieStr = this.getEffectiveCookie(null);
          const cookieFile = cookieStr ? ytdlpService.buildCookieFile(cookieStr) : null;

          const args = [
              '-f', formatSelector,
              '--merge-output-format', format,
              '--no-playlist',
              '--add-header', `User-Agent:${userAgent}`,
              '--add-header', `Referer:${referer}`,
              '--add-header', `Origin:${origin}`,
              '--add-header', `Accept-Language:${acceptLang}`,
              '--no-warnings',
              '--quiet',
              '--progress',
              '-o', '-',  // 输出到stdout
              finalUrl
          ];
          if (cookieFile) {
              args.push('--cookies', cookieFile);
          } else if (cookieStr) {
              args.push('--add-header', `Cookie:${cookieStr}`);
          }

          const ytdlp = spawn(check.command, args, {
              stdio: ['ignore', 'pipe', 'pipe']
          });

          // 收集错误信息
          let errorOutput = '';
          let hasError = false;
          let headersSet = false;

          // 使用Promise包装以便捕获错误
          return new Promise((resolve, reject) => {
              // 先监听错误，如果立即出错就不pipe
              const errorTimeout = setTimeout(() => {
                  // 3秒后如果还没开始输出，检查是否有错误
                  if (errorOutput.includes('412') || errorOutput.includes('Precondition Failed')) {
                      ytdlp.kill();
                      reject(new Error('YTDLP_412_ERROR'));
                  }
              }, 3000);

              // 错误处理（在pipe之前监听）
              ytdlp.stderr.on('data', (data) => {
                  const msg = data.toString();
                  errorOutput += msg;
                  // 检查是否是412错误
                  if (msg.includes('412') || msg.includes('Precondition Failed')) {
                      hasError = true;
                      console.error('yt-dlp 遇到412错误:', msg);
                      clearTimeout(errorTimeout);
                      ytdlp.kill();
                      // 如果还没设置响应头，可以安全回退
                      if (!headersSet) {
                          reject(new Error('YTDLP_412_ERROR'));
                      } else {
                          // 已经设置了响应头，无法回退
                          reject(new Error('YTDLP_ALREADY_STARTED'));
                      }
                      return;
                  }
                  // 只记录重要信息
                  if (!msg.includes('[download]') && !msg.includes('ETA') && !msg.includes('of') && !msg.includes('Deprecated')) {
                      console.log('yt-dlp:', msg.trim());
                  }
              });

              ytdlp.on('error', (error) => {
                  clearTimeout(errorTimeout);
                  console.error('yt-dlp 执行错误:', error);
                  hasError = true;
                  reject(error);
              });

              // 成功开始输出后设置响应头并pipe
              ytdlp.stdout.once('data', (firstChunk) => {
                  clearTimeout(errorTimeout);
                  // 确认成功开始后设置响应头
                  if (!headersSet && !res.headersSent) {
                      res.setHeader('Content-Type', 'video/mp4');
                      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(finalName)}.${format}"`);
                      headersSet = true;
                  }
                  // 发送第一个数据块
                  if (headersSet) {
                      res.write(firstChunk);
                      // 将后续输出pipe到响应
                      ytdlp.stdout.pipe(res, { end: false });
                      ytdlp.stdout.on('end', () => {
                          res.end();
                      });
                  }
              });

              ytdlp.on('close', (code) => {
                  clearTimeout(errorTimeout);
                  // 清理临时 cookie 文件
                  if (cookieFile) { try { fs.unlinkSync(cookieFile) } catch {} }
                  if (code !== 0 || hasError) {
                      console.error(`yt-dlp 退出码: ${code}, 错误输出: ${errorOutput.substring(0, 200)}`);
                      // 如果是412错误且还没设置响应头，可以回退
                      if ((errorOutput.includes('412') || errorOutput.includes('Precondition Failed')) && !headersSet) {
                          console.log('yt-dlp 遇到412错误，回退到原生API');
                          reject(new Error('YTDLP_412_ERROR'));
                          return;
                      }
                      if (!headersSet && !res.headersSent) {
                          res.status(500).json({ success: false, error: `yt-dlp 下载失败: ${errorOutput.substring(0, 200)}` });
                      }
                      reject(new Error(`yt-dlp 下载失败，退出码: ${code}`));
                  } else {
                      console.log('yt-dlp 下载完成');
                      if (!headersSet && !res.headersSent) {
                          res.setHeader('Content-Type', 'video/mp4');
                          res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(finalName)}.${format}"`);
                      }
                      resolve();
                  }
              });

              // 处理客户端断开连接
              res.on('close', () => {
                  clearTimeout(errorTimeout);
                  if (!ytdlp.killed) {
                      ytdlp.kill();
                  }
              });
          });

      } catch (error) {
          // 如果是412错误，重新抛出以便上层处理
          if (error.message === 'YTDLP_412_ERROR') {
              throw error;
          }
          console.error('yt-dlp 下载失败:', error);
          throw error;
      }
  },
};
