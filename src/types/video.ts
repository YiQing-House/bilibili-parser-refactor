// ============================================================
// 视频相关类型
// ============================================================

export interface VideoData {
  title: string
  author: string
  thumbnail: string
  duration: string
  bvid?: string
  aid?: number
  cid?: number
  url?: string
  platform?: string
  maxQuality?: number
  qualities?: QualityOption[]
}

export interface QualityOption {
  qn: number
  label: string
  needVip: boolean
  needLogin: boolean
}

export interface HistoryItem {
  id: string
  url: string
  title: string
  thumbnail?: string
  timestamp: number
}

// 画质映射
export const QUALITY_MAP: Record<number, string> = {
  120: '4K',
  116: '1080P高帧率',
  112: '1080P高帧率',
  80: '1080P',
  64: '720P',
  32: '480P',
  16: '360P'
}

// 画质选项列表
export const QUALITY_OPTIONS: QualityOption[] = [
  { qn: 120, label: '4K', needVip: true, needLogin: true },
  { qn: 116, label: '1080P高帧率', needVip: true, needLogin: true },
  { qn: 80, label: '1080P', needVip: false, needLogin: false },
  { qn: 64, label: '720P', needVip: false, needLogin: false },
  { qn: 32, label: '480P', needVip: false, needLogin: false },
  { qn: 16, label: '360P', needVip: false, needLogin: false },
]

// 处理方式 (原项目只有 3 个选项)
export type FormatType = 'video+audio' | 'video+audio-separate' | 'cover'

export const FORMAT_OPTIONS: { value: FormatType; label: string }[] = [
  { value: 'video+audio', label: '完整' },
  { value: 'video+audio-separate', label: '分离' },
  { value: 'cover', label: '封面' },
]

