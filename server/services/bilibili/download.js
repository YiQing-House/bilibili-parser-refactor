/**
 * BilibiliService 子模块 - download
 * 方法通过 Object.assign 混入到 BilibiliService.prototype
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');


const execAsync = promisify(exec);

module.exports = {


  /**
   * 确保下载目录存在
   */
  ensureDownloadDir() {
      if (!fs.existsSync(this.downloadDir)) {
          fs.mkdirSync(this.downloadDir, { recursive: true });
      }
  },

  /**
   * 下载文件（带进度显示和取消支持）
   * @param {string} url - 下载地址
   * @param {string} outputPath - 输出路径
   * @param {string} label - 进度标签
   * @param {string} taskId - 任务ID（用于向前端报告进度）
   * @param {string} stage - 当前阶段（video/audio/merge）
   */
  async downloadFile(url, outputPath, label = '下载中', taskId = null, stage = null) {
      // 创建 AbortController 用于取消下载
      const abortController = new AbortController();

      // 如果有 taskId，存储到 activeDownloads 以便取消
      if (taskId) {
          const existing = this.activeDownloads.get(taskId) || { tempFiles: [] };
          existing.abortController = abortController;
          existing.tempFiles.push(outputPath);
          this.activeDownloads.set(taskId, existing);
      }

      const response = await axios({
          method: 'GET',
          url: url,
          responseType: 'stream',
          timeout: 300000,
          headers: this.headers,
          signal: abortController.signal
      });

      const writer = fs.createWriteStream(outputPath);

      // 获取文件总大小
      const totalSize = parseInt(response.headers['content-length'], 10) || 0;
      let downloadedSize = 0;
      let lastLogTime = Date.now();
      let lastDownloadedSize = 0;

      // 监听数据流显示进度
      response.data.on('data', (chunk) => {
          downloadedSize += chunk.length;
          const now = Date.now();

          // 每500ms更新一次进度
          if (now - lastLogTime >= 500) {
              const speed = ((downloadedSize - lastDownloadedSize) / ((now - lastLogTime) / 1000) / 1024 / 1024).toFixed(2);
              const downloadedMB = (downloadedSize / 1024 / 1024).toFixed(2);

              let percent = 0;
              let totalMB = '?';
              if (totalSize > 0) {
                  percent = Math.round((downloadedSize / totalSize) * 100);
                  totalMB = (totalSize / 1024 / 1024).toFixed(2);
                  // 使用 \r 让进度条在同一行更新
                  process.stdout.write(`\r📥 ${label}: ${percent}% | ${downloadedMB}/${totalMB}MB | ${speed}MB/s    `);
              } else {
                  process.stdout.write(`\r📥 ${label}: ${downloadedMB}MB | ${speed}MB/s    `);
              }

              // 向前端报告进度
              if (taskId && this.progressTracker) {
                  this.progressTracker.set(taskId, {
                      stage: stage || label,
                      percent: percent,
                      downloadedMB: downloadedMB,
                      totalMB: totalMB,
                      speed: speed + ' MB/s',
                      status: 'downloading'
                  });
              }

              lastLogTime = now;
              lastDownloadedSize = downloadedSize;
          }
      });

      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
          writer.on('finish', () => {
              const finalMB = (downloadedSize / 1024 / 1024).toFixed(2);
              console.log(`\r✅ ${label}完成: ${finalMB}MB                    `);

              // 报告该阶段完成
              if (taskId && this.progressTracker) {
                  this.progressTracker.set(taskId, {
                      stage: stage || label,
                      percent: 100,
                      downloadedMB: finalMB,
                      totalMB: finalMB,
                      speed: '0 MB/s',
                      status: 'stage_complete'
                  });
              }

              resolve(outputPath);
          });
          writer.on('error', (err) => {
              // 取消时关闭写入流
              writer.close();
              reject(err);
          });

          // 监听取消信号
          abortController.signal.addEventListener('abort', () => {
              response.data.destroy();
              writer.close();
              reject(new Error('下载已取消'));
          });
      });
  },

  /**
   * 检查 ffmpeg 是否可用
   */
  async checkFfmpeg() {
      try {
          await execAsync('ffmpeg -version', { timeout: 5000 });
          return true;
      } catch (error) {
          return false;
      }
  },

  /**
   * 使用 ffmpeg 合并视频和音频
   * @param {string} videoPath - 视频文件路径
   * @param {string} audioPath - 音频文件路径
   * @param {string} outputPath - 输出文件路径
   * @param {string} format - 输出格式 (mp4, flv, mkv, webm)
   * @param {string} taskId - 任务ID（用于取消功能）
   */
  async mergeVideoAudio(videoPath, audioPath, outputPath, format = 'mp4', taskId = null) {
      return new Promise((resolve, reject) => {
          // 根据格式选择编码器
          const formatConfig = this.getFormatConfig(format);

          const args = [
              '-i', videoPath,
              '-i', audioPath,
              '-c:v', formatConfig.videoCodec,
              '-c:a', formatConfig.audioCodec,
              '-y',
              outputPath
          ];

          const ffmpeg = spawn('ffmpeg', args, {
              stdio: ['ignore', 'pipe', 'pipe']
          });

          // 存储 ffmpeg 进程引用以便取消
          if (taskId) {
              const existing = this.activeDownloads.get(taskId) || { tempFiles: [] };
              existing.ffmpegProcess = ffmpeg;
              existing.tempFiles.push(outputPath);
              this.activeDownloads.set(taskId, existing);
          }

          let stderr = '';
          ffmpeg.stderr.on('data', (data) => {
              stderr += data.toString();
          });

          ffmpeg.on('close', (code) => {
              if (code === 0) {
                  resolve(outputPath);
              } else if (code === null) {
                  // 被终止（取消）
                  reject(new Error('合并已取消'));
              } else {
                  reject(new Error(`ffmpeg 合并失败: ${stderr}`));
              }
          });

          ffmpeg.on('error', (error) => {
              reject(new Error(`启动 ffmpeg 失败: ${error.message}`));
          });
      });
  },

  /**
   * 取消下载任务
   * @param {string} taskId - 任务ID
   * @returns {boolean} 是否成功取消
   */
  cancelDownload(taskId) {
      const task = this.activeDownloads.get(taskId);
      if (!task) {
          console.log(`取消下载: 任务 ${taskId} 不存在或已完成`);
          return false;
      }

      console.log(`取消下载任务: ${taskId}`);

      // 1. 中止 axios 下载
      if (task.abortController) {
          try {
              task.abortController.abort();
              console.log('已中止 axios 下载流');
          } catch (e) {
              console.error('中止 axios 失败:', e.message);
          }
      }

      // 2. 终止 ffmpeg 进程
      if (task.ffmpegProcess && !task.ffmpegProcess.killed) {
          try {
              task.ffmpegProcess.kill('SIGKILL');
              console.log('已终止 ffmpeg 进程');
          } catch (e) {
              console.error('终止 ffmpeg 失败:', e.message);
          }
      }

      // 3. 清理临时文件
      if (task.tempFiles && task.tempFiles.length > 0) {
          for (const file of task.tempFiles) {
              try {
                  if (fs.existsSync(file)) {
                      fs.unlinkSync(file);
                      console.log('已删除临时文件:', file);
                  }
              } catch (e) {
                  console.error('删除临时文件失败:', e.message);
              }
          }
      }

      // 4. 更新进度状态
      if (this.progressTracker) {
          this.progressTracker.set(taskId, {
              status: 'cancelled',
              stage: 'cancelled',
              percent: 0,
              message: '下载已取消'
          });
      }

      // 5. 从活动下载列表中移除
      this.activeDownloads.delete(taskId);

      return true;
  }
};
