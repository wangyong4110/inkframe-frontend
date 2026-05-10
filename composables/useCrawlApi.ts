import type { ApiResponse } from '~/types'

export interface CrawlProgress {
  novel_id: number
  status: 'running' | 'paused' | 'completed' | 'failed'
  total: number
  done: number
  failed: number
  current: string
}

export const useCrawlApi = () => {
  const { request } = useApi()

  const getCrawlStatus = (novelId: number) =>
    request<ApiResponse<CrawlProgress>>(`/novels/${novelId}/crawl/status`)

  const resumeCrawl = (novelId: number) =>
    request<ApiResponse<{ message: string }>>(`/novels/${novelId}/crawl/resume`, { method: 'POST' })

  return { getCrawlStatus, resumeCrawl }
}
