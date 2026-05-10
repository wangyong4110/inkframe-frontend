import type { Chapter, ApiResponse, CreateChapterForm } from '~/types'

export const useChapterApi = () => {
  const { request } = useApi()

  const getChapters = (novelId: number) =>
    request<ApiResponse<Chapter[]>>(`/novels/${novelId}/chapters`)

  const getChapter = (novelId: number, chapterNo: number) =>
    request<ApiResponse<Chapter>>(`/novels/${novelId}/chapters/${chapterNo}`)

  const createChapter = (novelId: number, data: CreateChapterForm) =>
    request<ApiResponse<Chapter>>(`/novels/${novelId}/chapters`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const updateChapter = (novelId: number, chapterNo: number, data: Partial<Chapter>) =>
    request<ApiResponse<Chapter>>(`/novels/${novelId}/chapters/${chapterNo}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const deleteChapter = (novelId: number, chapterNo: number) =>
    request<void>(`/novels/${novelId}/chapters/${chapterNo}`, { method: 'DELETE' })

  const generateChapter = (novelId: number, data: {
    chapter_no: number
    prompt?: string
    max_tokens?: number
    model?: string
    temperature?: number
    timeout_seconds?: number
  }) =>
    request<ApiResponse<{ task_id: string }>>(`/novels/${novelId}/chapters/generate`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

  return {
    getChapters,
    getChapter,
    createChapter,
    updateChapter,
    deleteChapter,
    generateChapter,
  }
}
