import type { OutlineReview, NovelOutlineSynthesis } from '~/types'

export const useOutlineReviewApi = () => {
  const { request } = useApi()

  const reviewChapter = (chapterId: number) =>
    request<{ task_id: string; status: string; message: string }>(`/chapters/${chapterId}/outline-review`, {
      method: 'POST',
    })

  const getChapterReview = (chapterId: number) =>
    request<OutlineReview>(`/chapters/${chapterId}/outline-review`)

  const batchReviewNovel = (novelId: number) =>
    request<{ task_id: string; status: string; message: string }>(`/novels/${novelId}/outline-review/batch`, {
      method: 'POST',
    })

  const listNovelReviews = (novelId: number) =>
    request<OutlineReview[]>(`/novels/${novelId}/outline-review`)

  const getSynthesis = (novelId: number) =>
    request<NovelOutlineSynthesis>(`/novels/${novelId}/outline-review/synthesis`)

  return { reviewChapter, getChapterReview, batchReviewNovel, listNovelReviews, getSynthesis }
}
