// ============================================================
// FFmpeg.wasm 浏览器端音视频合并服务
// ============================================================
// 使用 FFmpeg 的 WebAssembly 版本在用户浏览器里合并
// B站 DASH 分离的视频流和音频流为完整 MP4 文件。
// 带宽走用户端，服务器只做流式代理（防盗链 Referer）。
// ============================================================

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'

let ffmpegInstance: FFmpeg | null = null
let loadingPromise: Promise<void> | null = null

/**
 * 获取 FFmpeg 实例（懒加载，全局单例）
 */
async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegInstance.loaded) return ffmpegInstance

  if (loadingPromise) {
    await loadingPromise
    return ffmpegInstance!
  }

  ffmpegInstance = new FFmpeg()

  loadingPromise = ffmpegInstance.load({
    // 使用 CDN 加载 wasm 文件，避免本地打包体积过大
    coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
    wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
  }).then(() => {})

  await loadingPromise
  console.log('[FFmpeg] wasm 加载完成')
  return ffmpegInstance
}

export interface MergeProgress {
  stage: 'loading' | 'downloading-video' | 'downloading-audio' | 'merging' | 'done' | 'error'
  percent: number
  message: string
}

export type ProgressCallback = (progress: MergeProgress) => void

/**
 * 下载并合并视频+音频为 MP4
 *
 * @param videoUrl   视频流的代理 URL（经过服务端流式代理）
 * @param audioUrl   音频流的代理 URL
 * @param filename   输出文件名
 * @param onProgress 进度回调
 * @returns 合并后的 Blob
 */
export async function mergeVideoAudio(
  videoUrl: string,
  audioUrl: string,
  _filename: string,
  onProgress?: ProgressCallback
): Promise<Blob> {
  const report = (stage: MergeProgress['stage'], percent: number, message: string) => {
    onProgress?.({ stage, percent, message })
  }

  // 1. 加载 FFmpeg
  report('loading', 0, '加载 FFmpeg 引擎...')
  const ffmpeg = await getFFmpeg()

  // 2. 下载视频流
  report('downloading-video', 10, '下载视频流...')
  const videoData = await fetchFile(videoUrl)
  report('downloading-video', 35, '视频流下载完成')

  // 3. 下载音频流
  report('downloading-audio', 40, '下载音频流...')
  const audioData = await fetchFile(audioUrl)
  report('downloading-audio', 60, '音频流下载完成')

  // 4. 写入虚拟文件系统
  report('merging', 65, '写入文件...')
  await ffmpeg.writeFile('video.m4s', videoData)
  await ffmpeg.writeFile('audio.m4a', audioData)

  // 5. 合并（-c copy 不重新编码，速度极快）
  report('merging', 70, '合并音视频...')

  ffmpeg.on('progress', ({ progress }) => {
    const pct = Math.round(70 + progress * 25) // 70% ~ 95%
    report('merging', Math.min(pct, 95), '合并中...')
  })

  await ffmpeg.exec([
    '-i', 'video.m4s',
    '-i', 'audio.m4a',
    '-c', 'copy',
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-movflags', '+faststart',
    'output.mp4',
  ])

  // 6. 读取输出
  report('done', 98, '读取输出...')
  const outputData = await ffmpeg.readFile('output.mp4') as Uint8Array

  // 清理虚拟文件系统
  await ffmpeg.deleteFile('video.m4s')
  await ffmpeg.deleteFile('audio.m4a')
  await ffmpeg.deleteFile('output.mp4')

  const blob = new Blob([new Uint8Array(outputData)], { type: 'video/mp4' })
  report('done', 100, '完成')

  return blob
}

/**
 * 触发浏览器保存文件
 */
export function saveBlobAsFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 1000)
}

/**
 * 一站式：下载 + 合并 + 保存
 */
export async function downloadAndMerge(
  videoUrl: string,
  audioUrl: string,
  filename: string,
  onProgress?: ProgressCallback
): Promise<void> {
  const blob = await mergeVideoAudio(videoUrl, audioUrl, filename, onProgress)
  saveBlobAsFile(blob, filename)
}
