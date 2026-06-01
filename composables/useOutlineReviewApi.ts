import type { OutlineReview } from '~/types'

export const useOutlineReviewApi = () => {
  const { request } = useApi()

  // Trigger async review for one chapter; returns task_id
  const reviewChapter = (chapterId: number) =>
    request<{ task_id: string; status: string; message: string }>(`/chapters/${chapterId}/outline-review`, {
      method: 'POST',
    })

  // Get latest review result for a chapter
  const getChapterReview = (chapterId: number) =>
    request<OutlineReview>(`/chapters/${chapterId}/outline-review`)

  // Trigger async batch review for all chapters in a novel
  const batchReviewNovel = (novelId: number) =>
    request<{ task_id: string; status: string; message: string }>(`/novels/${novelId}/outline-review/batch`, {
      method: 'POST',
    })

  // Get all review results for a novel
  const listNovelReviews = (novelId: number) =>
    request<OutlineReview[]>(`/novels/${novelId}/outline-review`)

  return { reviewChapter, getChapterReview, batchReviewNovel, listNovelReviews }
}
