const path = require('path');
const os = require('os');

// 子模块
const cookieMethods = require('./bilibili/cookie');
const signMethods = require('./bilibili/sign');
const resolverMethods = require('./bilibili/resolver');
const infoMethods = require('./bilibili/info');
const downloadMethods = require('./bilibili/download');
const taskYtdlpMethods = require('./bilibili/tasks-ytdlp');
const taskQualityMethods = require('./bilibili/tasks-quality');
const taskMediaMethods = require('./bilibili/tasks-media');
const streamMethods = require('./bilibili/stream');

/**
 * ============================================================
 * B站视频解析服务 (BilibiliService)
 * ============================================================
 *
 * 拆分为 7 个子模块：cookie / sign / resolver / info / download / tasks / stream
 * 本文件为组合入口，外部调用接口不变。
 *
 * ============================================================
 */
class BilibiliService {
    constructor() {
        // 下载目录（使用系统临时目录）
        this.downloadDir = path.join(os.tmpdir(), 'bilibili-downloads');
        this.ensureDownloadDir();

        // WBI 签名所需的混淆表
        this.mixinKeyEncTab = [
            46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
            27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
            37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
            22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
        ];

        // 缓存 WBI keys
        this.wbiKeys = null;
        this.wbiKeysExpire = 0;

        // 存储活动的下载任务（用于取消功能）
        // key: taskId, value: { abortController, ffmpegProcess, tempFiles }
        this.activeDownloads = new Map();

        // 进度追踪器（由 index.js 通过 setProgressTracker 注入）
        this.progressTracker = null;

        // 通用请求头（模拟真实Chrome浏览器）
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
            'Referer': 'https://www.bilibili.com/',
            'Origin': 'https://www.bilibili.com',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site',
            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Microsoft Edge";v="120"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"'
        };

        // 生成基础Cookie（提升未登录用户画质到1080P）
        this.baseCookie = this.generateBaseCookie();
        // 环境提供的 SESSDATA，便于绕过 412/限清晰度（不持久存储）
        this.envCookies = this.loadEnvCookies();

        // TV 接口 appkey 与签名密钥（参考 BBDown）
        this.tvAppKey = '4409e2ce8ffd0b60';
        this.tvAppSecret = '59b43e04ad6965f34319062b478f83dd';
        // 环境提供的 TV access_key（可选）
        this.tvAccessKey = process.env.BILI_TV_ACCESS_KEY || '';
    }

    /**
     * 注入进度追踪器（由 index.js 调用，替代 global 污染）
     */
    setProgressTracker(tracker) {
        this.progressTracker = tracker;
    }

    /**
     * 画质名称映射
     */
    /**
     * 获取清晰度名称（整合 1080P60 和 1080P高码率为 1080P 高帧率）
     */
    getQualityName(qn) {
        const qualityMap = {
            127: '8K 超高清',
            126: '杜比视界',
            125: 'HDR 真彩',
            120: '4K 超清',
            116: '1080P 高帧率',  // 整合60帧和高码率
            112: '1080P 高帧率',  // 回退到高码率时也显示同样名称
            80: '1080P',
            74: '720P60',
            64: '720P',
            32: '480P',
            16: '360P'
        };
        return qualityMap[qn] || `清晰度 ${qn}`;
    }

    /**
     * 格式化时长（秒 -> HH:MM:SS / MM:SS）
     */
    /**
     * 格式化时长
     */
    formatDuration(seconds) {
        if (!seconds) return '00:00';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
    
        if (hours > 0) {
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}

// 混入子模块方法到 prototype
const modules = [cookieMethods, signMethods, resolverMethods, infoMethods, downloadMethods, taskYtdlpMethods, taskQualityMethods, taskMediaMethods, streamMethods];
for (const mod of modules) {
    Object.assign(BilibiliService.prototype, mod);
}

module.exports = new BilibiliService();
