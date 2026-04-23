// ============================================
// Enhancement API - 增强功能 API 调用封装
// ============================================

import type {
  ApiResponse,
} from '~/types'

const config = useRuntimeConfig()

const request = async <T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const url = `${config.public.apiBase}${endpoint}`
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
    },
  })
  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}`)
  }
  return response.json()
}

// ============================================
// Foreshadow API - 伏笔追踪
// ============================================

export const useForeshadowApi = () => {
  const getForeshadows = (novelId: number, chapterNo?: number) => {
    const params = new URLSearchParams()
    if (chapterNo) params.set('chapter_no', String(chapterNo))
    return request<ApiResponse<{
      pending: ForeshadowItem[]
      fulfilled: ForeshadowItem[]
      total: number
    }>>(`/novels/${novelId}/foreshadows?${params}`)
  }

  const markFulfilled = (novelId: number, foreshadowId: number, chapterId: number) => {
    return request<void>(`/novels/${novelId}/foreshadows/${foreshadowId}/fulfill`, {
      method: 'POST',
      body: JSON.stringify({ chapter_id: chapterId }),
    })
  }

  return { getForeshadows, markFulfilled }
}

// ============================================
// Timeline API - 时间线
// ============================================

export const useTimelineApi = () => {
  const getTimeline = (novelId: number) => {
    return request<ApiResponse<Timeline>>(`/novels/${novelId}/timeline`)
  }

  return { getTimeline }
}

// ============================================
// Character Arc API - 角色弧光
// ============================================

export const useCharacterArcApi = () => {
  const getCharacterArc = (novelId: number, characterId: number) => {
    return request<ApiResponse<CharacterArc>>(`/novels/${novelId}/character-arcs/${characterId}`)
  }

  const getAllArcs = (novelId: number) => {
    return request<ApiResponse<{ arcs: CharacterArc[] }>>(`/novels/${novelId}/character-arcs`)
  }

  return { getCharacterArc, getAllArcs }
}

// ============================================
// Style API - 风格控制
// ============================================

export const useStyleEndpointApi = () => {
  const getDefaultStyle = () => {
    return request<ApiResponse<StyleConfig>>('/styles/default')
  }

  const getStylePrompt = (config: StyleConfig) => {
    return request<ApiResponse<{ prompt: string }>>('/styles/prompt', {
      method: 'POST',
      body: JSON.stringify(config),
    })
  }

  return { getDefaultStyle, getStylePrompt }
}

// ============================================
// Generation Context API - 生成上下文
// ============================================

export const useGenerationContextApi = () => {
  const getContext = (novelId: number, chapterNo: number) => {
    return request<ApiResponse<GenerationContext>>(`/novels/${novelId}/context?chapter_no=${chapterNo}`)
  }

  const buildPrompt = (novelId: number, data: {
    chapter_no: number
    style?: StyleConfig
    extra_prompt?: string
  }) => {
    return request<ApiResponse<{ prompt: string; context: GenerationContext }>>(`/novels/${novelId}/prompt`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  return { getContext, buildPrompt }
}

// ============================================
// Storyboard API - 智能分镜
// ============================================

export const useStoryboardApi = () => {
  const generateShots = (data: {
    content: string
    characters: string[]
    scene?: string
  }) => {
    return request<ApiResponse<{
      shots: StoryboardShot[]
      total: number
      total_duration: number
    }>>('/storyboard/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  const analyzeEmotions = (content: string) => {
    return request<ApiResponse<EmotionalAnalysis>>('/storyboard/analyze-emotions', {
      method: 'POST',
      body: JSON.stringify({ content }),
    })
  }

  return { generateShots, analyzeEmotions }
}

// ============================================
// Video Enhancement API - 视频增强
// ============================================

export const useVideoEnhancementApi = () => {
  const enhanceVideo = (data: {
    video_url: string
    enhancements: Enhancement[]
  }) => {
    return request<ApiResponse<{ jobs: EnhancementJob[] }>>('/video/enhance', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  const getRecommendations = (videoInfo: {
    fps: number
    resolution: string
    duration: number
    style: string
  }) => {
    return request<ApiResponse<{ recommendations: EnhancementConfig[] }>>('/video/recommendations', {
      method: 'POST',
      body: JSON.stringify(videoInfo),
    })
  }

  return { enhanceVideo, getRecommendations }
}

// ============================================
// Consistency API - 一致性控制
// ============================================

export const useConsistencyApi = () => {
  const getDefaultConfig = () => {
    return request<ApiResponse<ConsistencyLevel>>('/consistency/default')
  }

  const calculateScore = (referenceImage: string, generatedImages: string[]) => {
    return request<ApiResponse<ConsistencyScore>>('/consistency/score', {
      method: 'POST',
      body: JSON.stringify({ reference_image: referenceImage, generated_images: generatedImages }),
    })
  }

  return { getDefaultConfig, calculateScore }
}

// ============================================
// Types - 类型定义
// ============================================

export interface ForeshadowItem {
  id: number
  chapter_id: number
  chapter_no: number
  type: string
  description: string
  hint: string
  resolution?: string
  is_fulfilled: boolean
  fulfilled_in?: number
  fulfilled_at?: string
}

export interface Timeline {
  novel_id: number
  start_date?: string
  end_date?: string
  events: TimelineEvent[]
  conflicts: TimelineConflict[]
}

export interface TimelineEvent {
  chapter_no: number
  title: string
  time_point?: string
  day_offset: number
  description?: string
  type: string
}

export interface TimelineConflict {
  event1: TimelineEvent
  event2: TimelineEvent
  type: string
  description: string
}

export interface CharacterArc {
  character_id: number
  character_name: string
  arc_type: string
  stages: CharacterArcStage[]
  current_stage: number
}

export interface CharacterArcStage {
  chapter_no: number
  title: string
  state: string
  power_level: number
  mood: string
  relationships?: string
  note?: string
}

export interface StyleConfig {
  narrative_voice?: string
  narrative_distance?: string
  emotional_tone?: string
  sentence_complexity?: string
  dialogue_ratio?: number
  description_density?: string
}

export interface GenerationContext {
  novel: any
  characters: any[]
  recent_chapters: any[]
  foreshadows: ForeshadowItem[]
  timeline: Timeline
  character_arcs: Record<number, CharacterArc>
  global_summary: string
}

export interface StoryboardShot {
  shot_no: number
  description: string
  emotion: string
  beat: string
  shot_type: string
  shot_size: string
  shot_angle: string
  duration: number
  characters: string[]
  location?: string
  time_of_day?: string
  weather?: string
  lighting?: string
  dialogue?: string
  action?: string
  camera_movement?: string
  transition?: string
  visual_notes?: string
}

export interface EmotionalAnalysis {
  overall_emotion: string
  emotion_curve: EmotionBeat[]
  peak_moments: number[]
  calm_moments: number[]
}

export interface EmotionBeat {
  position: number
  emotion: string
  intensity: number
  rhythm_change: string
}

export interface EnhancementJob {
  id: string
  video_id: number
  type: string
  status: string
  progress: number
  result_url?: string
  error?: string
  created_at: string
}

export interface EnhancementConfig {
  type: string
  target_fps?: number
  scale_factor?: number
  color_grade_preset?: string
  style_preset?: string
}

export interface Enhancement {
  type: string
  target_fps?: number
  scale_factor?: number
  color_grade_preset?: string
  style_preset?: string
}

export interface ConsistencyLevel {
  lora?: {
    model_id?: string
    weight: number
    injection_method?: string
  }
  ip_adapter?: {
    weight: number
    style_template?: string
  }
  control_net?: {
    pose: boolean
    face: boolean
    depth: boolean
  }
  human_review?: {
    auto_approve_threshold: number
    require_approval: boolean
  }
}

export interface ConsistencyScore {
  overall_score: number
  visual_score: number
  feature_score: number
  expression_score: number
}
