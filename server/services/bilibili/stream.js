/**
 * BilibiliService 子模块 - stream
 * 方法通过 Object.assign 混入到 BilibiliService.prototype
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const { spawn } = require('child_process');


module.exports = {

  /**
   * 获取格式的 MIME 类型
   */
  getContentType(format) {
      const types = {
          'mp4': 'video/mp4',
          'flv': 'video/x-flv',
          'mkv': 'video/x-matroska',
          'webm': 'video/webm',
          'mp3': 'audio/mpeg',
          'flac': 'audio/flac',
          'aac': 'audio/aac',
          'm4a': 'audio/mp4'
      };
      return types[format] || 'video/mp4';
  },

  /**
   * 获取格式的 ffmpeg 编码器配置
   */
  getFormatConfig(format) {
      const configs = {
          'mp4': { videoCodec: 'copy', audioCodec: 'aac' },
          'flv': { videoCodec: 'flv1', audioCodec: 'mp3' },
          'mkv': { videoCodec: 'copy', audioCodec: 'copy' },
          'webm': { videoCodec: 'libvpx-vp9', audioCodec: 'libopus' }
      };
      return configs[format] || configs['mp4'];
  },

  /**
   * 转换视频格式
   */
  async convertVideoFormat(inputPath, outputPath, format) {
      return new Promise((resolve, reject) => {
          const formatConfig = this.getFormatConfig(format);

          // 构建 ffmpeg 参数
          const args = [
              '-i', inputPath,
              '-c:v', formatConfig.videoCodec,
              '-c:a', formatConfig.audioCodec,
              '-movflags', '+faststart', // 优化 MP4 文件，支持流式播放
              '-y',
              outputPath
          ];

          // 对于某些格式，添加额外参数
          if (format === 'webm') {
              args.splice(-2, 0, '-b:v', '1M', '-b:a', '128k'); // 设置码率
          } else if (format === 'flv') {
              args.splice(-2, 0, '-f', 'flv'); // 明确指定格式
          }

          console.log(`执行 ffmpeg 转换: ffmpeg ${args.join(' ')}`);

          const ffmpeg = spawn('ffmpeg', args, {
              stdio: ['ignore', 'pipe', 'pipe']
          });

          let stderr = '';
          let hasError = false;

          ffmpeg.stderr.on('data', (data) => {
              const output = data.toString();
              stderr += output;
              // 检查是否有错误信息
              if (output.toLowerCase().includes('error') || output.toLowerCase().includes('failed')) {
                  hasError = true;
              }
          });

          ffmpeg.on('close', (code) => {
              if (code === 0 && !hasError) {
                  // 检查输出文件是否存在且有内容
                  if (fs.existsSync(outputPath)) {
                      const stats = fs.statSync(outputPath);
                      if (stats.size > 0) {
                          console.log(`格式转换成功: ${outputPath} (${stats.size} bytes)`);
                          resolve(outputPath);
                      } else {
                          reject(new Error('转换后的文件为空'));
                      }
                  } else {
                      reject(new Error('转换后的文件不存在'));
                  }
              } else {
                  reject(new Error(`ffmpeg 转换失败 (退出码: ${code}): ${stderr.substring(0, 500)}`));
              }
          });

          ffmpeg.on('error', (error) => {
              reject(new Error(`启动 ffmpeg 失败: ${error.message}`));
          });
      });
  },

  /**
   * 转换音频格式
   */
  async convertAudioFormat(inputPath, outputPath, format) {
      return new Promise((resolve, reject) => {
          const audioCodecs = {
              'mp3': ['libmp3lame', '192k'],
              'flac': ['flac', ''],
              'aac': ['aac', '192k'],
              'm4a': ['aac', '192k']
          };

          const codec = audioCodecs[format] || ['libmp3lame', '192k'];
          const args = [
              '-i', inputPath,
              '-acodec', codec[0],
              ...(codec[1] ? ['-ab', codec[1]] : []),
              '-y',
              outputPath
          ];

          console.log(`执行 ffmpeg 音频转换: ffmpeg ${args.join(' ')}`);

          const ffmpeg = spawn('ffmpeg', args, {
              stdio: ['ignore', 'pipe', 'pipe']
          });

          let stderr = '';
          let hasError = false;

          ffmpeg.stderr.on('data', (data) => {
              const output = data.toString();
              stderr += output;
              if (output.toLowerCase().includes('error') || output.toLowerCase().includes('failed')) {
                  hasError = true;
              }
          });

          ffmpeg.on('close', (code) => {
              if (code === 0 && !hasError) {
                  // 检查输出文件是否存在且有内容
                  if (fs.existsSync(outputPath)) {
                      const stats = fs.statSync(outputPath);
                      if (stats.size > 0) {
                          console.log(`音频转换成功: ${outputPath} (${stats.size} bytes)`);
                          resolve(outputPath);
                      } else {
                          reject(new Error('转换后的音频文件为空'));
                      }
                  } else {
                      reject(new Error('转换后的音频文件不存在'));
                  }
              } else {
                  reject(new Error(`ffmpeg 音频转换失败 (退出码: ${code}): ${stderr.substring(0, 500)}`));
              }
          });

          ffmpeg.on('error', (error) => {
              reject(new Error(`启动 ffmpeg 失败: ${error.message}`));
          });
      });
  },

  /**
   * 流式转换并下载（带超时和错误处理）
   */
  async streamWithFormat(url, res, filename, type, format) {
      const timestamp = Date.now();
      const tempFile = path.join(this.downloadDir, `${timestamp}_temp.${type === 'audio' ? 'm4a' : 'm4s'}`);
      const outputFile = path.join(this.downloadDir, `${timestamp}_output.${format}`);

      try {
          console.log(`开始下载并转换 ${type} 为 ${format} 格式...`);

          // 先下载到临时文件（设置超时）
          const downloadPromise = this.downloadFile(url, tempFile);
          const downloadTimeout = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('下载超时')), 60000) // 60秒超时
          );
          await Promise.race([downloadPromise, downloadTimeout]);

          console.log(`下载完成，开始转换格式...`);

          // 转换格式（设置超时）
          const convertPromise = type === 'audio'
              ? this.convertAudioFormat(tempFile, outputFile, format)
              : this.convertVideoFormat(tempFile, outputFile, format);
          const convertTimeout = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('格式转换超时')), 300000) // 5分钟超时
          );
          await Promise.race([convertPromise, convertTimeout]);

          console.log(`格式转换完成，开始发送文件...`);

          // 检查输出文件是否存在
          if (!fs.existsSync(outputFile)) {
              throw new Error('转换后的文件不存在');
          }

          // 发送转换后的文件
          const stats = fs.statSync(outputFile);
          console.log(`准备发送文件: ${filename}, 大小: ${stats.size} bytes`);

          const contentType = this.getContentType(format);
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Length', stats.size);
          res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Cache-Control', 'no-cache');

          const fileStream = fs.createReadStream(outputFile);

          // 监听数据流
          let bytesSent = 0;
          fileStream.on('data', (chunk) => {
              bytesSent += chunk.length;
          });

          fileStream.pipe(res);

          fileStream.on('end', () => {
              console.log(`文件发送完成: ${filename}, 已发送: ${bytesSent} bytes`);
              setTimeout(() => {
                  try {
                      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                      if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
                  } catch (e) {
                      console.error('清理临时文件失败:', e.message);
                  }
              }, 5000);
          });

          fileStream.on('error', (err) => {
              console.error('发送文件流错误:', err.message);
              if (!res.headersSent) {
                  res.status(500).json({ success: false, error: '发送文件失败' });
              }
          });

          res.on('close', () => {
              console.log(`客户端连接关闭: ${filename}`);
          });

      } catch (error) {
          console.error(`格式转换失败: ${error.message}`);
          console.error('错误堆栈:', error.stack);

          // 清理临时文件
          try {
              if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
              if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
          } catch (e) { }

          // 如果转换失败，返回错误信息
          if (!res.headersSent) {
              res.status(500).json({
                  success: false,
                  error: `格式转换失败: ${error.message}`,
                  suggestion: '请检查服务器是否安装了 ffmpeg，或尝试使用原始格式下载'
              });
          } else {
              throw error;
          }
      }
  },

  /**
   * 流式代理下载（不保存到服务器，直接转发）
   */
  async streamProxy(targetUrl, res, filename) {
      try {
          const response = await axios({
              method: 'GET',
              url: targetUrl,
              responseType: 'stream',
              timeout: 300000,
              headers: this.headers
          });

          // 设置响应头
          res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
          if (response.headers['content-length']) {
              res.setHeader('Content-Length', response.headers['content-length']);
          }
          res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

          // 直接管道转发
          response.data.pipe(res);
      } catch (error) {
          throw new Error(`流式代理失败: ${error.message}`);
      }
  }
};
