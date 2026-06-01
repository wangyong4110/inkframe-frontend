import type { ApiResponse } from '~/types'

// Panel-specific analysis status shape (task-based, includes step + warnings)
export interface AnalysisStatus {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
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

  const getAnalysisStatus = (novelId: number) =>
    request<ApiResponse<AnalysisStatus>>(`/novels/${novelId}/analysis/status`)

  return { startAnalysis, getAnalysisStatus }
}
