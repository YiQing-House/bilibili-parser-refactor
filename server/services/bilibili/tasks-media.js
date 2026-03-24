/**
 * BilibiliService 子模块 - tasks/media
 * 音频、封面、纯视频下载 + 直接链接获取
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { spawn } = require('child_process');

module.exports = {
  /**
   * 下载音频（分离音频流）
   */
  async downloadAudio(url, qn = 80, cookies = null, res) {
      try {
          console.log('开始下载 B站音频:', { url, qn, hasLogin: !!cookies });

          // 获取视频信息
          const videoInfo = await this.getVideoInfo(url, cookies);
          const bvid = videoInfo.bvid;
          const cid = videoInfo.pages?.[0]?.cid || videoInfo.cid;

          if (!cid) {
              throw new Error('无法获取视频 CID');
          }

          // 获取播放地址
          const playData = await this.getPlayUrl(bvid, cid, qn, cookies);

          if (!playData || !playData.dash) {
              throw new Error('无法获取音频流信息');
          }

          const { audio: audios } = playData.dash;

          if (!audios || audios.length === 0) {
              throw new Error('无法获取音频流');
          }

          // 选择最佳音频
          const bestAudio = audios[0];
          const audioUrl = bestAudio.baseUrl || bestAudio.base_url;

          // 生成文件名
          const safeTitle = (videoInfo.title || 'audio').replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
          const audioFile = path.join(this.downloadDir, `${Date.now()}_audio.m4s`);
          const outputFile = path.join(this.downloadDir, `${safeTitle}.mp3`);

          // 下载音频流
          console.log('下载音频流...');
          await this.downloadFile(audioUrl, audioFile);

          // 检查 ffmpeg 并转换为 MP3
          const hasFfmpeg = await this.checkFfmpeg();
          if (hasFfmpeg) {
              console.log('转换音频为 MP3...');
              await this.convertToMp3(audioFile, outputFile);

              // 清理临时文件
              try {
                  fs.unlinkSync(audioFile);
              } catch (e) { }

              // 发送转换后的文件
              const stats = fs.statSync(outputFile);
              res.setHeader('Content-Type', 'audio/mpeg');
              res.setHeader('Content-Length', stats.size);
              res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeTitle)}.mp3"`);

              const fileStream = fs.createReadStream(outputFile);
              fileStream.pipe(res);

              fileStream.on('end', () => {
                  setTimeout(() => {
                      try { fs.unlinkSync(outputFile); } catch (e) { }
                  }, 5000);
              });
          } else {
              // 如果没有 ffmpeg，直接发送 m4s 文件
              const stats = fs.statSync(audioFile);
              res.setHeader('Content-Type', 'audio/mp4');
              res.setHeader('Content-Length', stats.size);
              res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeTitle)}.m4s"`);

              const fileStream = fs.createReadStream(audioFile);
              fileStream.pipe(res);

              fileStream.on('end', () => {
                  setTimeout(() => {
                      try { fs.unlinkSync(audioFile); } catch (e) { }
                  }, 5000);
              });
          }

      } catch (error) {
          console.error('B站音频下载失败:', error);
          throw error;
      }
  },

  /**
   * 使用 ffmpeg 转换音频为 MP3
   */
  async convertToMp3(inputPath, outputPath) {
      return new Promise((resolve, reject) => {
          const args = [
              '-i', inputPath,
              '-acodec', 'libmp3lame',
              '-ab', '192k',
              '-y',
              outputPath
          ];

          const ffmpeg = spawn('ffmpeg', args, {
              stdio: ['ignore', 'pipe', 'pipe']
          });

          let stderr = '';
          ffmpeg.stderr.on('data', (data) => {
              stderr += data.toString();
          });

          ffmpeg.on('close', (code) => {
              if (code === 0) {
                  resolve(outputPath);
              } else {
                  reject(new Error(`ffmpeg 转换失败: ${stderr}`));
              }
          });

          ffmpeg.on('error', (error) => {
              reject(new Error(`启动 ffmpeg 失败: ${error.message}`));
          });
      });
  },

  /**
   * 下载封面
   */
  async downloadCover(url, res) {
      try {
          console.log('开始下载 B站封面:', { url });

          // 获取视频信息
          const videoInfo = await this.getVideoInfo(url);

          if (!videoInfo.pic) {
              throw new Error('该视频没有封面');
          }

          // 处理封面URL
          let coverUrl = videoInfo.pic;
          if (coverUrl.startsWith('//')) {
              coverUrl = 'https:' + coverUrl;
          }

          // 生成文件名
          const safeTitle = (videoInfo.title || 'cover').replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);

          // 下载封面
          const response = await axios({
              method: 'GET',
              url: coverUrl,
              responseType: 'stream',
              timeout: 30000,
              headers: this.headers
          });

          // 设置响应头
          res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
          if (response.headers['content-length']) {
              res.setHeader('Content-Length', response.headers['content-length']);
          }
          res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeTitle)}.jpg"`);

          // 流式传输
          response.data.pipe(res);

      } catch (error) {
          console.error('B站封面下载失败:', error);
          throw error;
      }
  },

  /**
   * 下载视频（无音频）
   */
  async downloadVideoOnly(url, qn = 80, cookies = null, res) {
      try {
          console.log('开始下载 B站视频（无音频）:', { url, qn, hasLogin: !!cookies });

          // 获取视频信息
          const videoInfo = await this.getVideoInfo(url, cookies);
          const bvid = videoInfo.bvid;
          const cid = videoInfo.pages?.[0]?.cid || videoInfo.cid;

          if (!cid) {
              throw new Error('无法获取视频 CID');
          }

          // 获取播放地址
          const playData = await this.getPlayUrl(bvid, cid, qn, cookies);

          if (!playData || !playData.dash) {
              throw new Error('无法获取视频流信息');
          }

          const { video: videos } = playData.dash;

          // 选择对应画质的视频流
          let selectedVideo = videos.find(v => v.id === qn);
          if (!selectedVideo) {
              // 如果没有精确匹配，选择最接近的
              selectedVideo = videos.reduce((prev, curr) => {
                  return Math.abs(curr.id - qn) < Math.abs(prev.id - qn) ? curr : prev;
              });
          }

          const videoUrl = selectedVideo.baseUrl || selectedVideo.base_url;

          // 生成文件名
          const timestamp = Date.now();
          const safeTitle = (videoInfo.title || 'video').replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
          const videoFile = path.join(this.downloadDir, `${timestamp}_video.m4s`);

          // 下载视频流
          console.log('⬇️ 开始下载视频流（无音频）...');
          await this.downloadFile(videoUrl, videoFile, '视频流');

          // 发送视频文件
          const stats = fs.statSync(videoFile);
          res.setHeader('Content-Type', 'video/mp4');
          res.setHeader('Content-Length', stats.size);
          res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeTitle)}_video.mp4"`);

          const fileStream = fs.createReadStream(videoFile);
          fileStream.pipe(res);

          fileStream.on('end', () => {
              setTimeout(() => {
                  try { fs.unlinkSync(videoFile); } catch (e) { }
              }, 5000);
          });

      } catch (error) {
          console.error('B站视频（无音频）下载失败:', error);
          throw error;
      }
  },

  /**
   * 获取视频和音频的直接下载链接（用于浏览器直接下载）
   */
  async getDirectLinks(url, qn = 80, cookies = null) {
      try {
          const videoInfo = await this.getVideoInfo(url, cookies);
          const bvid = videoInfo.bvid;
          const cid = videoInfo.pages?.[0]?.cid || videoInfo.cid;

          if (!cid) {
              throw new Error('无法获取视频 CID');
          }

          const playData = await this.getPlayUrl(bvid, cid, qn, cookies);

          if (!playData || !playData.dash) {
              throw new Error('无法获取视频流信息');
          }

          const { video: videos, audio: audios } = playData.dash;

          // 选择对应画质的视频流
          let selectedVideo = videos.find(v => v.id === qn);
          if (!selectedVideo) {
              selectedVideo = videos.reduce((prev, curr) => {
                  return Math.abs(curr.id - qn) < Math.abs(prev.id - qn) ? curr : prev;
              });
          }

          const selectedAudio = audios && audios.length > 0 ? audios[0] : null;

          const videoUrl = selectedVideo.baseUrl || selectedVideo.base_url;
          const audioUrl = selectedAudio ? (selectedAudio.baseUrl || selectedAudio.base_url) : null;

          const safeTitle = (videoInfo.title || 'video').replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);

          return {
              title: safeTitle,
              videoUrl: videoUrl,
              audioUrl: audioUrl,
              quality: this.getQualityName(selectedVideo.id),
              qn: selectedVideo.id,
              thumbnail: videoInfo.pic,
              // 提供直接链接需要的请求头
              headers: {
                  'Referer': 'https://www.bilibili.com/',
                  'User-Agent': this.headers['User-Agent']
              }
          };
      } catch (error) {
          throw new Error(`获取直接链接失败: ${error.message}`);
      }
  }
};
