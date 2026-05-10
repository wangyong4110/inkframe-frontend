import type { ApiResponse } from '~/types'

export interface AnalysisStatus {
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  step: string
  error?: string
  warnings?: string[]
}

export const useAnalysisApi = () => {
  const { request } = useApi()

  const startAnalysis = (novelId: number, body?: { create_chapter_outlines?: boolean }) =>
    request<ApiResponse<{ task_id: string }>>(`/novels/${novelId}/analyze`, {
      method: 'POST',
      ...(body ? { body: JSON.stringify(body) } : {}),
    })

  return { startAnalysis }
}
