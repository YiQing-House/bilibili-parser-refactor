/**
 * BilibiliService 子模块 - tasks/quality
 * 带画质选择的下载方法（同步/异步）
 */
const fs = require('fs');
const path = require('path');

module.exports = {
  /**
   * 带画质选择的下载方法（流式传输到浏览器）
   * @param {string} url - 视频URL
   * @param {number} qn - 画质
   * @param {object} cookies - 登录cookies
   * @param {object} res - Express响应对象
   * @param {string} format - 输出格式 (mp4, flv, mkv, webm)
   * @param {string} nameFormat - 文件名格式
   * @param {string} taskId - 任务ID（用于进度追踪）
   */
  async downloadWithQuality(url, qn = 80, cookies = null, res, format = 'mp4', nameFormat = 'title', taskId = null) {
      try {
          const finalUrl = this.sanitizeBiliUrl(await this.resolveShortUrl(url));
          console.log('开始下载 B站视频:', { url: finalUrl, qn, nameFormat, hasLogin: !!cookies, taskId });

          // 检查响应头是否已发送（防止重复设置）
          if (res.headersSent) {
              console.error('响应头已发送，无法继续下载');
              throw new Error('响应头已发送，无法继续下载');
          }

          // 2024.12: 禁用 yt-dlp 对 B站的尝试（始终返回 412 错误，浪费时间）
          // 直接使用原生 API 下载（更快更稳定）
          console.log('📥 使用原生 API 快速下载...');

          // 获取视频信息
          const videoInfo = await this.getVideoInfo(finalUrl, cookies);
          const bvid = videoInfo.bvid;
          const cid = videoInfo.pages?.[0]?.cid || videoInfo.cid;

          if (!cid) {
              throw new Error('无法获取视频 CID');
          }

          // 获取播放地址（已登录时优先使用 WBI API 获取高画质）
          let playData = null;
          if (cookies) {
              console.log('🔐 已登录用户，使用 WBI API 获取高画质');
              playData = await this.getPlayUrl(bvid, cid, qn, cookies);
          }
          if (!playData) {
              playData = await this.getPlayUrlByHtml5(bvid, cid, qn, cookies);
          }
          if (!playData) {
              playData = await this.getPlayUrlByApp(bvid, cid, qn);
          }

          if (!playData || !playData.dash) {
              throw new Error('无法获取视频流信息');
          }

          const { video: videos, audio: audios } = playData.dash;

          // 选择对应画质的视频流（优先精确匹配，否则智能回退）
          let selectedVideo = videos.find(v => v.id === qn);
          if (!selectedVideo) {
              // 特殊处理：1080P 高帧率 (116/112) 互相回退
              if (qn === 116 || qn === 112) {
                  // 先尝试另一个高帧率选项
                  const altQn = qn === 116 ? 112 : 116;
                  selectedVideo = videos.find(v => v.id === altQn);
                  if (selectedVideo) {
                      console.log(`请求画质 ${qn} 不可用，自动切换到 ${altQn}`);
                  }
              }

              // 如果高帧率选项都不可用，再向下降级
              if (!selectedVideo) {
                  const lowerQualities = videos.filter(v => v.id <= qn);
                  if (lowerQualities.length > 0) {
                      selectedVideo = lowerQualities.reduce((prev, curr) => curr.id > prev.id ? curr : prev);
                  } else {
                      // 如果没有更低的画质，选择最高可用画质
                      selectedVideo = videos.reduce((prev, curr) => curr.id > prev.id ? curr : prev);
                  }
                  console.log(`请求画质 ${qn} 不可用，自动降级到 ${selectedVideo.id}`);
              }
          }

          const selectedAudio = audios && audios.length > 0 ? audios[0] : null;

          const videoUrl = selectedVideo.baseUrl || selectedVideo.base_url;
          const audioUrl = selectedAudio ? (selectedAudio.baseUrl || selectedAudio.base_url) : null;

          // 实际下载的画质名称
          const actualQn = selectedVideo.id;
          const qualityName = this.getQualityName(actualQn).replace(/\s+/g, '');

          // 根据命名格式生成文件名（画质在第一位）
          const timestamp = Date.now();
          const title = (videoInfo.title || 'video').replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
          const author = (videoInfo.owner?.name || 'UP主').replace(/[<>:"/\\|?*]/g, '_').substring(0, 20);

          let baseName;
          switch (nameFormat) {
              case 'title-author':
                  baseName = `${title} - ${author}`;
                  break;
              case 'author-title':
                  baseName = `${author} - ${title}`;
                  break;
              default: // 'title'
                  baseName = title;
          }
          const finalTitle = `${qualityName}_${baseName}`;
          const videoFile = path.join(this.downloadDir, `${timestamp}_video.m4s`);
          const audioFile = path.join(this.downloadDir, `${timestamp}_audio.m4s`);
          const outputFile = path.join(this.downloadDir, `${finalTitle}.${format}`);

          // 下载视频流
          console.log('⬇️ 开始下载视频流...');
          await this.downloadFile(videoUrl, videoFile, '视频流', taskId, 'video');

          if (audioUrl) {
              // 下载音频流
              console.log('⬇️ 开始下载音频流...');
              await this.downloadFile(audioUrl, audioFile, '音频流', taskId, 'audio');

              // 检查 ffmpeg 并合并
              const hasFfmpeg = await this.checkFfmpeg();
              console.log('FFmpeg 可用:', hasFfmpeg);

              if (hasFfmpeg) {
                  console.log(`合并音视频并转换为 ${format} 格式...`);

                  // 报告合并阶段开始
                  if (taskId && this.progressTracker) {
                      this.progressTracker.set(taskId, {
                          stage: 'merge',
                          percent: 0,
                          status: 'merging',
                          message: '正在合并音视频...'
                      });
                  }

                  await this.mergeVideoAudio(videoFile, audioFile, outputFile, format, taskId);

                  // 报告合并完成
                  if (taskId && this.progressTracker) {
                      this.progressTracker.set(taskId, {
                          stage: 'merge',
                          percent: 100,
                          status: 'complete',
                          message: '下载完成'
                      });
                  }

                  // 清理临时文件
                  try {
                      fs.unlinkSync(videoFile);
                      fs.unlinkSync(audioFile);
                  } catch (e) { }

                  // 发送合并后的文件（检查响应头是否已设置）
                  if (res.headersSent) {
                      console.error('响应头已发送，无法继续下载');
                      throw new Error('响应头已发送');
                  }
                  const stats = fs.statSync(outputFile);
                  const contentType = this.getContentType(format);
                  res.setHeader('Content-Type', contentType);
                  res.setHeader('Content-Length', stats.size);
                  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(finalTitle)}.${format}"`);

                  const fileStream = fs.createReadStream(outputFile);
                  fileStream.pipe(res);

                  fileStream.on('end', () => {
                      // 清理输出文件
                      setTimeout(() => {
                          try { fs.unlinkSync(outputFile); } catch (e) { }
                      }, 5000);
                  });

                  return;
              }
          }

          // 如果没有音频或没有 ffmpeg，只发送视频（⚠️ 会导致没有声音）
          console.log('⚠️ 警告: FFmpeg不可用或无音频，将只返回视频流（无声音）');
          // 如果指定了格式且不是 m4s，尝试转换
          if (format !== 'm4s' && format !== 'mp4') {
              const hasFfmpeg = await this.checkFfmpeg();
              if (hasFfmpeg) {
                  const convertedFile = path.join(this.downloadDir, `${finalTitle}.${format}`);
                  await this.convertVideoFormat(videoFile, convertedFile, format);
                  if (res.headersSent) {
                      throw new Error('响应头已发送');
                  }
                  const stats = fs.statSync(convertedFile);
                  const contentType = this.getContentType(format);
                  res.setHeader('Content-Type', contentType);
                  res.setHeader('Content-Length', stats.size);
                  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(finalTitle)}.${format}"`);
                  const fileStream = fs.createReadStream(convertedFile);
                  fileStream.pipe(res);
                  fileStream.on('end', () => {
                      setTimeout(() => {
                          try { fs.unlinkSync(convertedFile); fs.unlinkSync(videoFile); } catch (e) { }
                      }, 5000);
                  });
                  return;
              }
          }

          if (res.headersSent) {
              throw new Error('响应头已发送');
          }
          const stats = fs.statSync(videoFile);
          const contentType = format === 'm4s' ? 'video/mp4' : this.getContentType(format);
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Length', stats.size);
          res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(finalTitle)}.${format === 'm4s' ? 'mp4' : format}"`);

          const fileStream = fs.createReadStream(videoFile);
          fileStream.pipe(res);

          fileStream.on('end', () => {
              setTimeout(() => {
                  try { fs.unlinkSync(videoFile); } catch (e) { }
              }, 5000);
          });

      } catch (error) {
          console.error('B站下载失败:', error);
          // 报告下载失败
          if (taskId && this.progressTracker) {
              this.progressTracker.set(taskId, {
                  status: 'error',
                  stage: 'error',
                  percent: 0,
                  error: error.message
              });
          }
          throw error;
      }
  },

  /**
   * 异步下载（不通过 res 直接响应，而是保存到临时文件）
   * 用于 /api/bilibili/download-task 接口
   * @param {string} url - 视频URL
   * @param {number} qn - 画质
   * @param {object} cookies - 登录cookies
   * @param {string} format - 输出格式
   * @param {string} nameFormat - 文件名格式
   * @param {string} taskId - 任务ID
   * @returns {Promise<string>} 下载完成的文件路径
   */
  async downloadWithQualityAsync(url, qn = 80, cookies = null, format = 'mp4', nameFormat = 'title', taskId = null) {
      try {
          const finalUrl = this.sanitizeBiliUrl(await this.resolveShortUrl(url));
          console.log('开始异步下载 B站视频:', { url: finalUrl, qn, nameFormat, hasLogin: !!cookies, taskId });

          // 获取视频信息
          const videoInfo = await this.getVideoInfo(finalUrl, cookies);
          const bvid = videoInfo.bvid;
          const cid = videoInfo.pages?.[0]?.cid || videoInfo.cid;

          if (!cid) {
              throw new Error('无法获取视频 CID');
          }

          // 获取播放地址
          let playData = null;
          if (cookies) {
              playData = await this.getPlayUrl(bvid, cid, qn, cookies);
          }
          if (!playData) {
              playData = await this.getPlayUrlByHtml5(bvid, cid, qn, cookies);
          }
          if (!playData) {
              playData = await this.getPlayUrlByApp(bvid, cid, qn);
          }

          if (!playData || !playData.dash) {
              throw new Error('无法获取视频流信息');
          }

          const { video: videos, audio: audios } = playData.dash;

          // 选择对应画质的视频流
          let selectedVideo = videos.find(v => v.id === qn);
          if (!selectedVideo) {
              if (qn === 116 || qn === 112) {
                  const altQn = qn === 116 ? 112 : 116;
                  selectedVideo = videos.find(v => v.id === altQn);
              }
              if (!selectedVideo) {
                  const lowerQualities = videos.filter(v => v.id <= qn);
                  if (lowerQualities.length > 0) {
                      selectedVideo = lowerQualities.reduce((prev, curr) => curr.id > prev.id ? curr : prev);
                  } else {
                      selectedVideo = videos.reduce((prev, curr) => curr.id > prev.id ? curr : prev);
                  }
              }
          }

          const selectedAudio = audios && audios.length > 0 ? audios[0] : null;
          const videoUrl = selectedVideo.baseUrl || selectedVideo.base_url;
          const audioUrl = selectedAudio ? (selectedAudio.baseUrl || selectedAudio.base_url) : null;

          // 生成文件名
          const actualQn = selectedVideo.id;
          const qualityName = this.getQualityName(actualQn).replace(/\s+/g, '');
          const timestamp = Date.now();
          const title = (videoInfo.title || 'video').replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
          const author = (videoInfo.owner?.name || 'UP主').replace(/[<>:"/\\|?*]/g, '_').substring(0, 20);

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
          const finalTitle = `${qualityName}_${baseName}`;
          const videoFile = path.join(this.downloadDir, `${timestamp}_video.m4s`);
          const audioFile = path.join(this.downloadDir, `${timestamp}_audio.m4s`);
          const outputFile = path.join(this.downloadDir, `${finalTitle}.${format}`);

          // 下载视频流
          console.log('⬇️ 开始下载视频流...');
          await this.downloadFile(videoUrl, videoFile, '视频流', taskId, 'video');

          if (audioUrl) {
              // 下载音频流
              console.log('⬇️ 开始下载音频流...');
              await this.downloadFile(audioUrl, audioFile, '音频流', taskId, 'audio');

              // 合并
              const hasFfmpeg = await this.checkFfmpeg();
              if (hasFfmpeg) {
                  console.log(`合并音视频并转换为 ${format} 格式...`);

                  if (taskId && this.progressTracker) {
                      this.progressTracker.set(taskId, {
                          stage: 'merge',
                          percent: 0,
                          status: 'merging',
                          message: '正在合并音视频...'
                      });
                  }

                  await this.mergeVideoAudio(videoFile, audioFile, outputFile, format, taskId);

                  // 清理临时文件
                  try {
                      fs.unlinkSync(videoFile);
                      fs.unlinkSync(audioFile);
                  } catch (e) { }

                  // 报告完成，返回下载链接
                  if (taskId && this.progressTracker) {
                      this.progressTracker.set(taskId, {
                          stage: 'complete',
                          percent: 100,
                          status: 'completed',
                          message: '下载完成',
                          filePath: outputFile,
                          fileName: `${finalTitle}.${format}`,
                          downloadUrl: `/api/download-file/${encodeURIComponent(path.basename(outputFile))}`
                      });
                  }

                  return outputFile;
              }
          }

          // 没有音频或没有 ffmpeg
          if (taskId && this.progressTracker) {
              this.progressTracker.set(taskId, {
                  stage: 'complete',
                  percent: 100,
                  status: 'completed',
                  message: '下载完成（仅视频）',
                  filePath: videoFile,
                  fileName: `${finalTitle}.mp4`,
                  downloadUrl: `/api/download-file/${encodeURIComponent(path.basename(videoFile))}`
              });
          }

          return videoFile;

      } catch (error) {
          console.error('异步下载失败:', error);
          if (taskId && this.progressTracker) {
              this.progressTracker.set(taskId, {
                  status: 'error',
                  stage: 'error',
                  percent: 0,
                  error: error.message
              });
          }
          throw error;
      }
  },

  /**
   * 下载并合并（兼容旧方法）
   */
  async downloadAndMerge(url, res) {
      return this.downloadWithQuality(url, 80, null, res);
  },
};
