import type { QualityReport, ApiResponse } from '~/types'

export const useQualityApi = () => {
  const { request } = useApi()

  const checkQuality = (chapterId: number) =>
    request<ApiResponse<QualityReport>>(`/chapters/${chapterId}/quality-check`, {
      method: 'POST',
    })

  const getQualityReport = (chapterId: number) =>
    request<ApiResponse<QualityReport>>(`/chapters/${chapterId}/quality-report`)

  const refineChapter = (chapterId: number, suggestions: string[]) =>
    request<ApiResponse<{ content: string }>>(`/chapters/${chapterId}/improve`, {
      method: 'POST',
      body: JSON.stringify({ suggestions }),
    })

  return {
    checkQuality,
    getQualityReport,
    refineChapter,
  }
}
