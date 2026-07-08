import type { Chapter, ApiResponse, CreateChapterForm, ChapterVersion } from '~/types'
import { getAuthToken } from '~/utils/auth'

export const useChapterApi = () => {
  const { request } = useApi()
  const config = useRuntimeConfig()
  const apiBase = config.public.apiBase as string

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
    is_standalone?: boolean
  }) =>
    request<ApiResponse<{ task_id: string }>>(`/novels/${novelId}/chapters/generate`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const publishChapter = (novelId: number, chapterNo: number) =>
    request<ApiResponse<Chapter>>(`/novels/${novelId}/chapters/${chapterNo}/publish`, { method: 'POST' })

  const unpublishChapter = (novelId: number, chapterNo: number) =>
    request<ApiResponse<Chapter>>(`/novels/${novelId}/chapters/${chapterNo}/unpublish`, { method: 'POST' })

  const reorderChapters = (novelId: number, orders: Array<{ chapter_id: number; chapter_no: number }>) =>
    request<ApiResponse<null>>(`/novels/${novelId}/chapters/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ orders }),
    })

  const insertChapterAfter = (novelId: number, afterChapterNo: number) =>
    request<ApiResponse<Chapter>>(`/novels/${novelId}/chapters/insert`, {
      method: 'POST',
      body: JSON.stringify({ after_chapter_no: afterChapterNo }),
    })

  const batchPublishChapters = (novelId: number) =>
    request<ApiResponse<{ published_count: number }>>(`/novels/${novelId}/chapters/batch-publish`, { method: 'POST' })

  const getVersions = (chapterId: number) =>
    request<ApiResponse<{ versions: ChapterVersion[] }>>(`/chapters/${chapterId}/versions`)

  const getVersionContent = (chapterId: number, versionId: number | string) =>
    request<ApiResponse<ChapterVersion>>(`/chapters/${chapterId}/versions/${versionId}/content`)

  const batchGenerateChapters = (novelId: number, options?: {
    skip_existing?: boolean
    word_count?: number
    max_tokens?: number
    start_chapter_no?: number
    end_chapter_no?: number
    model?: string
    enabled_tools?: string[]
  }) =>
    request<{ task_id: string; total: number; message: string }>(`/novels/${novelId}/chapters/batch-generate`, {
      method: 'POST',
      body: JSON.stringify({ skip_existing: true, ...options }),
    })

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

  const generateChapterOutline = (novelId: number, chapterNo: number, prompt?: string) =>
    request<ApiResponse<Chapter>>(`/novels/${novelId}/chapters/${chapterNo}/outline`, {
      method: 'POST',
      body: JSON.stringify({ prompt: prompt || '' }),
    })

  const rewriteChapterByInstruction = (chapterId: number, instruction: string) =>
    request<{ task_id: string; status: string; message: string }>(`/chapters/${chapterId}/rewrite`, {
      method: 'POST',
      body: JSON.stringify({ instruction }),
    })

  const refineSelection = (chapterId: number, selectedText: string, instruction: string) =>
    request<ApiResponse<{ refined_text: string }>>(`/chapters/${chapterId}/refine-selection`, {
      method: 'POST',
      body: JSON.stringify({ selected_text: selectedText, instruction }),
    })

  const chapterChatStream = async (
    chapterId: number,
    messages: Array<{ role: string; content: string }>,
    callbacks: {
      onDelta: (delta: string) => void
      onDone: (modifiedContent?: string) => void
      onError: (err: string) => void
    },
  ): Promise<void> => {
    const token = getAuthToken()
    const response = await fetch(`${apiBase}/chapters/${chapterId}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ messages }),
    })

    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => '')
      throw new Error(errText || `HTTP ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6).trim()
        if (!raw) continue
        try {
          const evt = JSON.parse(raw)
          if (evt.error) {
            callbacks.onError(evt.error)
            return
          }
          if (evt.delta) callbacks.onDelta(evt.delta)
          if (evt.done) callbacks.onDone(evt.modified_content || undefined)
        } catch {
          // ignore malformed chunks
        }
      }
    }
  }

  return {
    getChapters,
    getChapter,
    createChapter,
    updateChapter,
    deleteChapter,
    generateChapter,
    generateChapterOutline,
    reorderChapters,
    insertChapterAfter,
    publishChapter,
    unpublishChapter,
    batchPublishChapters,
    getVersions,
    getVersionContent,
    regenerateChapter,
    batchGenerateChapters,
    chapterChatStream,
    rewriteChapterByInstruction,
    refineSelection,
  }
}
