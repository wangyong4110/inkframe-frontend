import type { Chapter, ApiResponse, CreateChapterForm, ChapterVersion } from '~/types'

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
    word_count?: number
    max_tokens?: number
    model?: string
    temperature?: number
    timeout_seconds?: number
    web_search?: boolean
    wiki_search?: boolean
    use_story_pattern?: boolean
  }) =>
    request<ApiResponse<{ task_id: string }>>(`/novels/${novelId}/chapters/generate`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const publishChapter = (novelId: number, chapterNo: number) =>
    request<ApiResponse<Chapter>>(`/novels/${novelId}/chapters/${chapterNo}/publish`, { method: 'POST' })

  const unpublishChapter = (novelId: number, chapterNo: number) =>
    request<ApiResponse<Chapter>>(`/novels/${novelId}/chapters/${chapterNo}/unpublish`, { method: 'POST' })

  const batchPublishChapters = (novelId: number) =>
    request<ApiResponse<{ published_count: number }>>(`/novels/${novelId}/chapters/batch-publish`, { method: 'POST' })

  const getVersions = (chapterId: number) =>
    request<ApiResponse<{ versions: ChapterVersion[] }>>(`/chapters/${chapterId}/versions`)

  const getVersionContent = (chapterId: number, versionId: number | string) =>
    request<ApiResponse<ChapterVersion>>(`/chapters/${chapterId}/versions/${versionId}/content`)

  const regenerateChapter = (chapterId: number, options?: {
    prompt?: string
    word_count?: number
    max_tokens?: number
    model?: string
    temperature?: number
    timeout_seconds?: number
    web_search?: boolean
    wiki_search?: boolean
    use_story_pattern?: boolean
  }) =>
    request<{ task_id: string; status: string; message: string }>(`/chapters/${chapterId}/regenerate`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    })

  return {
    getChapters,
    getChapter,
    createChapter,
    updateChapter,
    deleteChapter,
    generateChapter,
    publishChapter,
    unpublishChapter,
    batchPublishChapters,
    getVersions,
    getVersionContent,
    regenerateChapter,
  }
}
