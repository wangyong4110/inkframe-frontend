import type {
  Video,
  StoryboardShot,
  ApiResponse,
  VideoBGMSegment,
  JamendoTrack,
  ShotSFXItem,
  ShotVoiceSegment,
  VideoPublishRecord,
  StoryboardReview,
  ReviewRecord,
} from '~/types'

export const useVideoApi = () => {
  const { request, requestBlob, requestMultipart } = useApi()

  const getVideos = (params?: { novel_id?: number; page?: number; page_size?: number }) => {
    const searchParams = new URLSearchParams()
    if (params?.novel_id) searchParams.set('novel_id', params.novel_id.toString())
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.page_size) searchParams.set('page_size', params.page_size.toString())

    const query = searchParams.toString()
    return request<ApiResponse<{ items: Video[], total: number, page: number, page_size: number, total_page: number }>>(`/videos${query ? `?${query}` : ''}`)
  }

  const getVideo = (id: number) =>
    request<ApiResponse<Video>>(`/videos/${id}`)

  const createVideo = (data: { novel_id: number; chapter_id?: number; title?: string; art_style?: string; aspect_ratio?: string; frame_rate?: number; quality_tier?: string; mode?: string; visual_mode?: string; three_d_style?: string }) =>
    request<ApiResponse<Video>>(`/novels/${data.novel_id}/videos`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const generateShot = (videoId: number, shotId: number, provider?: string) =>
    request<ApiResponse<StoryboardShot>>(`/videos/${videoId}/shots/${shotId}/generate`, {
      method: 'POST',
      body: JSON.stringify(provider ? { provider } : {}),
    })

  const batchGenerateShots = (videoId: number, shotIds: number[], qualityTier?: string, provider?: string) =>
    request<ApiResponse<{ task_id: string }>>(`/videos/${videoId}/shots/batch-generate`, {
      method: 'POST',
      body: JSON.stringify({ shot_ids: shotIds, quality_tier: qualityTier, provider }),
    })

  const batchGenerateShotImages = (videoId: number, shotIds: number[]) =>
    request<ApiResponse<{ task_id: string }>>(`/videos/${videoId}/shots/batch-images`, {
      method: 'POST',
      body: JSON.stringify({ shot_ids: shotIds }),
    })

  const batchGenerateShotClips = (videoId: number, shotIds: number[]) =>
    request<ApiResponse<{ task_id: string }>>(`/videos/${videoId}/shots/batch-clips`, {
      method: 'POST',
      body: JSON.stringify({ shot_ids: shotIds }),
    })

  const refineShotImage = (videoId: number, shotId: number, suggestion: string) =>
    request<ApiResponse<{ image_url: string }>>(`/videos/${videoId}/shots/${shotId}/refine-image`, {
      method: 'POST',
      body: JSON.stringify({ suggestion }),
    })

  const analyzeSFXTags = (videoId: number, opts?: { user_context?: string }) =>
    request<ApiResponse<{ task_id: string }>>(`/videos/${videoId}/shots/sfx-tags`, {
      method: 'POST',
      body: opts?.user_context ? JSON.stringify({ user_context: opts.user_context }) : undefined,
    })

  const batchGenerateSFX = (videoId: number, opts?: { user_context?: string }) =>
    request<ApiResponse<{ task_id: string }>>(`/videos/${videoId}/shots/sfx`, {
      method: 'POST',
      body: opts?.user_context ? JSON.stringify({ user_context: opts.user_context }) : undefined,
    })

  const batchGenerateVoice = (videoId: number, options?: { narration_voice?: string; subtitle_enabled?: boolean; max_shots?: number; skip_existing?: boolean }) =>
    request<ApiResponse<{ task_id: string; shot_count: number }>>(`/videos/${videoId}/shots/batch-voice`, {
      method: 'POST',
      body: options ? JSON.stringify(options) : undefined,
    })

  const listBGMSegments = (videoId: number) =>
    request<ApiResponse<VideoBGMSegment[]>>(`/videos/${videoId}/bgm/segments`)

  const analyzeBGMSegments = (videoId: number, opts?: { user_prompt?: string }) =>
    request<ApiResponse<{ task_id: string }>>(`/videos/${videoId}/bgm/analyze`, {
      method: 'POST',
      body: opts?.user_prompt ? JSON.stringify({ user_prompt: opts.user_prompt }) : undefined,
    })

  const generateBGM = (videoId: number, opts?: { user_prompt?: string }) =>
    request<ApiResponse<{ task_id: string }>>(`/videos/${videoId}/bgm/generate`, {
      method: 'POST',
      body: opts?.user_prompt ? JSON.stringify({ user_prompt: opts.user_prompt }) : undefined,
    })

  const jamendoSearchBGM = (videoId: number, params: {
    q?: string; tags?: string; speed?: string; bpm_min?: number; bpm_max?: number; limit?: number
  }) => {
    const qs = new URLSearchParams()
    if (params.q) qs.set('q', params.q)
    if (params.tags) qs.set('tags', params.tags)
    if (params.speed) qs.set('speed', params.speed)
    if (params.bpm_min) qs.set('bpm_min', String(params.bpm_min))
    if (params.bpm_max) qs.set('bpm_max', String(params.bpm_max))
    if (params.limit) qs.set('limit', String(params.limit))
    return request<ApiResponse<JamendoTrack[]>>(`/videos/${videoId}/bgm/search?${qs}`)
  }

  const applyBGMTrack = (videoId: number, segId: number, data: {
    url: string; track_name?: string; track_artist?: string; source?: string
  }) =>
    request<ApiResponse<{ seg_id: number }>>(`/videos/${videoId}/bgm/segments/${segId}/track`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })

  const generateShotSFX = (videoId: number, shotId: number) =>
    request<ApiResponse<{ task_id: string }>>(`/videos/${videoId}/shots/${shotId}/sfx`, { method: 'POST' })

  const listShotSFXItems = (videoId: number, shotId: number) =>
    request<ApiResponse<ShotSFXItem[]>>(`/videos/${videoId}/shots/${shotId}/sfx-items`)

  const updateShotSFXItem = (videoId: number, shotId: number, itemId: number, data: { volume: number }) =>
    request<ApiResponse<ShotSFXItem>>(`/videos/${videoId}/shots/${shotId}/sfx-items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const deleteShotSFXItem = (videoId: number, shotId: number, itemId: number) =>
    request<void>(`/videos/${videoId}/shots/${shotId}/sfx-items/${itemId}`, { method: 'DELETE' })

  const toggleShotSFXItem = (videoId: number, shotId: number, itemId: number, disabled: boolean) =>
    request<ApiResponse<{ id: number; disabled: boolean }>>(`/videos/${videoId}/shots/${shotId}/sfx-items/${itemId}/disabled`, {
      method: 'PATCH',
      body: JSON.stringify({ disabled }),
    })

  const toggleBGMSegment = (videoId: number, segId: number, disabled: boolean) =>
    request<ApiResponse<{ id: number; disabled: boolean }>>(`/videos/${videoId}/bgm/segments/${segId}/disabled`, {
      method: 'PATCH',
      body: JSON.stringify({ disabled }),
    })

  const updateBGMSegment = (videoId: number, segId: number, data: Partial<VideoBGMSegment>) =>
    request<ApiResponse<VideoBGMSegment>>(`/videos/${videoId}/bgm/segments/${segId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const updateVideo = (id: number, data: Partial<Video>) =>
    request<ApiResponse<Video>>(`/videos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const deleteVideo = (id: number) =>
    request<void>(`/videos/${id}`, { method: 'DELETE' })

  const generateStoryboard = (id: number, data?: { chapter_id?: number; provider?: string; user_prompt?: string; pacing?: string; target_duration?: number; max_tokens?: number; temperature?: number; timeout_seconds?: number; voice_mode?: string }) =>
    request<ApiResponse<{ task_id: string }>>(`/videos/${id}/storyboard/generate`, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    })

  const getVideoProviders = () =>
    request<ApiResponse<{ name: string; display_name: string }[]>>('/videos/providers')

  const getStoryboard = (id: number) =>
    request<ApiResponse<StoryboardShot[]>>(`/videos/${id}/storyboard`)

  const updateStoryboardShot = (videoId: number, shotId: number, data: Partial<StoryboardShot>) =>
    request<ApiResponse<StoryboardShot>>(`/videos/${videoId}/storyboard/${shotId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const exportCapcut = (id: number) =>
    requestBlob(`/videos/${id}/export/capcut`)

  const exportVideo = (id: number, format: string) =>
    requestBlob(`/videos/${id}/export/${format}`)

  const reviewStoryboard = (id: number, provider?: string, previousScore?: number) =>
    request<ApiResponse<{ task_id: string }>>(`/videos/${id}/storyboard/review`, {
      method: 'POST',
      body: JSON.stringify({
        ...(provider ? { provider } : {}),
        ...(previousScore ? { previous_score: previousScore } : {}),
      }),
    })

  const optimizeStoryboardFromReview = (id: number, review: object, provider?: string) =>
    request<ApiResponse<{ task_id: string }>>(`/videos/${id}/storyboard/optimize-from-review`, {
      method: 'POST',
      body: JSON.stringify({ ...review, ...(provider ? { provider } : {}) }),
    })

  const applyStoryboardDiffs = (id: number, diffs: Array<{ shot_id?: number; shot_no: number; narration?: string; description?: string }>, recordId?: number) =>
    request<ApiResponse<{ updated_shots: number }>>(`/videos/${id}/storyboard/optimize/apply`, {
      method: 'POST',
      body: JSON.stringify({ diffs, ...(recordId ? { record_id: recordId } : {}) }),
    })

  const listReviewRecords = (id: number) =>
    request<ApiResponse<ReviewRecord[]>>(`/videos/${id}/storyboard/reviews`)

  const rollbackReview = (id: number, recordId: number) =>
    request<ApiResponse<{ restored_shots: number }>>(`/videos/${id}/storyboard/reviews/${recordId}/rollback`, {
      method: 'POST',
    })

  const generateVoice = (
    videoId: number,
    shotId: number,
    narrationVoice?: string,
    subtitleEnabled?: boolean,
    subtitleConfig?: { position: string; font_size: number; color: string; bg_style: string },
  ) =>
    request<ApiResponse<{ task_id: string }>>(`/videos/${videoId}/storyboard/${shotId}/voice`, {
      method: 'POST',
      body: JSON.stringify({
        ...(narrationVoice ? { narration_voice: narrationVoice } : {}),
        subtitle_enabled: subtitleEnabled ?? false,
        ...(subtitleConfig ? { subtitle_config: subtitleConfig } : {}),
      }),
    })

  const insertShot = (videoId: number, afterShotNo: number, narration: string, description: string, duration: number) =>
    request<ApiResponse<StoryboardShot>>(`/videos/${videoId}/shots/insert`, {
      method: 'POST',
      body: JSON.stringify({ after_shot_no: afterShotNo, narration, description, duration }),
    })

  const copyShot = (videoId: number, shotId: number, afterShotNo?: number) =>
    request<ApiResponse<StoryboardShot>>(`/videos/${videoId}/shots/${shotId}/copy`, {
      method: 'POST',
      body: JSON.stringify({ after_shot_no: afterShotNo ?? -1 }),
    })

  const deleteShot = (videoId: number, shotId: number) =>
    request<void>(`/videos/${videoId}/shots/${shotId}`, { method: 'DELETE' })

  const listVoiceSegments = (videoId: number, shotId: number) =>
    request<ApiResponse<ShotVoiceSegment[]>>(`/videos/${videoId}/shots/${shotId}/segments`)

  const appendVoiceSegment = (videoId: number, shotId: number, data: { text: string; speaker?: string; voice_id?: string }) =>
    request<ApiResponse<ShotVoiceSegment>>(`/videos/${videoId}/shots/${shotId}/segments`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const insertVoiceSegment = (videoId: number, shotId: number, afterSeqNo: number, data: { text: string; speaker?: string; voice_id?: string }) =>
    request<ApiResponse<ShotVoiceSegment>>(`/videos/${videoId}/shots/${shotId}/segments/insert`, {
      method: 'POST',
      body: JSON.stringify({ after_seq_no: afterSeqNo, ...data }),
    })

  const updateVoiceSegment = (videoId: number, shotId: number, segId: number, data: { text?: string; speaker?: string; voice_id?: string }) =>
    request<ApiResponse<ShotVoiceSegment>>(`/videos/${videoId}/shots/${shotId}/segments/${segId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const deleteVoiceSegment = (videoId: number, shotId: number, segId: number) =>
    request<void>(`/videos/${videoId}/shots/${shotId}/segments/${segId}`, { method: 'DELETE' })

  const generateSegmentVoice = (videoId: number, shotId: number, segId: number) =>
    request<ApiResponse<{ task_id: string }>>(`/videos/${videoId}/shots/${shotId}/segments/${segId}/voice`, { method: 'POST' })

  const uploadShotImage = async (videoId: number, shotId: number, file: File): Promise<ApiResponse<StoryboardShot>> => {
    const uploadRes = await requestMultipart<{ url: string }>('/upload/image', file)
    const url = uploadRes?.url
    if (!url) throw new Error('图片上传失败')
    return request<ApiResponse<StoryboardShot>>(`/videos/${videoId}/storyboard/${shotId}`, {
      method: 'PUT',
      body: JSON.stringify({ image_url: url, status: 'completed' }),
    })
  }

  const synthesizeVideo = (id: number) =>
    request<ApiResponse<{ task_id: string }>>(`/videos/${id}/synthesize`, { method: 'POST' })

  const publishVideo = (id: number, body: { visibility?: 'private' | 'unlisted' | 'public' }) =>
    request<ApiResponse<Video>>(`/videos/${id}/publish`, {
      method: 'POST',
      body: JSON.stringify(body),
    })

  const unpublishVideo = (id: number) =>
    request<ApiResponse<{ unpublished: boolean }>>(`/videos/${id}/unpublish`, { method: 'POST' })

  const listPublishRecords = (id: number) =>
    request<ApiResponse<VideoPublishRecord[]>>(`/videos/${id}/publish-records`)

  const publishExternal = (id: number, body: { account_ids: number[]; title?: string; description?: string; tags?: string[]; is_public?: boolean }) =>
    request<ApiResponse<{ task_id: string }>>(`/videos/${id}/publish-external`, {
      method: 'POST',
      body: JSON.stringify(body),
    })

  return {
    getVideos,
    getVideo,
    createVideo,
    updateVideo,
    deleteVideo,
    generateStoryboard,
    getStoryboard,
    updateStoryboardShot,
    generateShot,
    batchGenerateShots,
    batchGenerateShotImages,
    batchGenerateShotClips,
    refineShotImage,
    analyzeSFXTags,
    batchGenerateSFX,
    generateShotSFX,
    listShotSFXItems,
    updateShotSFXItem,
    deleteShotSFXItem,
    toggleShotSFXItem,
    exportCapcut,
    exportVideo,
    getVideoProviders,
    generateVoice,
    reviewStoryboard,
    optimizeStoryboardFromReview,
    applyStoryboardDiffs,
    listReviewRecords,
    rollbackReview,
    insertShot,
    copyShot,
    deleteShot,
    listVoiceSegments,
    appendVoiceSegment,
    insertVoiceSegment,
    updateVoiceSegment,
    deleteVoiceSegment,
    generateSegmentVoice,
    batchGenerateVoice,
    listBGMSegments,
    analyzeBGMSegments,
    generateBGM,
    jamendoSearchBGM,
    applyBGMTrack,
    toggleBGMSegment,
    updateBGMSegment,
    uploadShotImage,
    synthesizeVideo,
    publishVideo,
    unpublishVideo,
    listPublishRecords,
    publishExternal,
  }
}
