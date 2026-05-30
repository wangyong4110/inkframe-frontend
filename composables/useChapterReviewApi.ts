import type { ApiResponse, ChapterReview, ChapterReviewRecord, ChapterIgnoredIssue } from '~/types'

export const useChapterReviewApi = () => {
  const { request } = useApi()

  const reviewChapter = (id: number, provider?: string) =>
    request<ApiResponse<{ task_id: string }>>(`/chapters/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ ...(provider ? { provider } : {}) }),
    })

  const listReviewRecords = (id: number) =>
    request<ApiResponse<ChapterReviewRecord[]>>(`/chapters/${id}/reviews`)

  const getReviewRecord = (id: number, rid: number) =>
    request<ApiResponse<ChapterReviewRecord>>(`/chapters/${id}/reviews/${rid}`)

  const rollbackReview = (id: number, rid: number) =>
    request<ApiResponse<{ rolled_back: boolean }>>(`/chapters/${id}/reviews/${rid}/rollback`, {
      method: 'POST',
    })

  const applyDiffs = (
    id: number,
    diffs: { index: number; new_content: string; orig_text?: string }[],
    recordId?: number,
  ) =>
    request<ApiResponse<{ updated_paragraphs: number }>>(`/chapters/${id}/review/apply-diffs`, {
      method: 'POST',
      body: JSON.stringify({ diffs, ...(recordId ? { record_id: recordId } : {}) }),
    })

  const listIgnoredIssues = (id: number) =>
    request<ApiResponse<ChapterIgnoredIssue[]>>(`/chapters/${id}/ignored-issues`)

  const ignoreIssue = (id: number, issueText: string, note?: string) =>
    request<ApiResponse<{ ignored: boolean }>>(`/chapters/${id}/ignored-issues`, {
      method: 'POST',
      body: JSON.stringify({ issue_text: issueText, ...(note ? { note } : {}) }),
    })

  const unignoreIssue = (id: number, issueId: number) =>
    request<ApiResponse<null>>(`/chapters/${id}/ignored-issues/${issueId}`, {
      method: 'DELETE',
    })

  return {
    reviewChapter,
    listReviewRecords,
    getReviewRecord,
    rollbackReview,
    applyDiffs,
    listIgnoredIssues,
    ignoreIssue,
    unignoreIssue,
  }
}
