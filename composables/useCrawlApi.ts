import type { ApiResponse } from '~/types'

export interface CrawlProgress {
  novel_id: number
  status: 'running' | 'paused' | 'completed' | 'failed'
  total: number
  done: number
  failed: number
  current: string
  // Crawler stats (populated every 5 chapters)
  bytes_downloaded: number
  pages_visited: number
  elapsed_secs: number
  speed_cps: number // bytes/sec (proxy for chars/sec)
}

export interface CrawlConfig {
  concurrency: number       // parallel chapter fetches (1–5)
  delay_ms: number          // base delay between requests in ms
  random_delay_ms: number   // extra random jitter in ms
  ua_rotation: boolean      // rotate browser User-Agents
  detect_charset: boolean   // auto-detect GBK/GB2312 encoding
  cache_enabled: boolean    // disk-cache responses
  cache_dir?: string        // disk cache path
  max_retries: number       // retry attempts on error
  proxy_url?: string        // optional HTTP/SOCKS5 proxy
  skip_vip_chaps: boolean   // skip paid chapters
}

export function defaultCrawlConfig(): CrawlConfig {
  return {
    concurrency: 1,
    delay_ms: 2000,
    random_delay_ms: 3000,
    ua_rotation: true,
    detect_charset: true,
    cache_enabled: false,
    max_retries: 3,
    skip_vip_chaps: false,
  }
}

export const useCrawlApi = () => {
  const { request } = useApi()

  const getCrawlStatus = (novelId: number) =>
    request<ApiResponse<CrawlProgress>>(`/novels/${novelId}/crawl/status`)

  const resumeCrawl = (novelId: number) =>
    request<ApiResponse<{ message: string }>>(`/novels/${novelId}/crawl/resume`, { method: 'POST' })

  return { getCrawlStatus, resumeCrawl }
}
