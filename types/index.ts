// Novel types
export interface Novel {
  id: number
  uuid: string
  title: string
  description?: string
  genre: NovelGenre
  status: NovelStatus
  total_words: number
  chapter_count: number
  worldview_id?: number
  cover_image?: string
  ai_model?: string
  temperature?: number
  created_at: string
  updated_at: string
}

export type NovelGenre = 'fantasy' | 'xianxia' | 'urban' | 'scifi' | 'romance' | 'mystery' | 'historical'

export type NovelStatus = 'planning' | 'writing' | 'paused' | 'completed' | 'archived'

// Chapter types
export interface Chapter {
  id: number
  novel_id: number
  uuid: string
  chapter_no: number
  title: string
  content?: string
  summary?: string
  word_count: number
  outline?: string
  plot_points?: PlotPoint[]
  status: ChapterStatus
  quality_score?: number
  created_at: string
  updated_at: string
}

export type ChapterStatus = 'draft' | 'generating' | 'completed' | 'published'

export interface PlotPoint {
  id: number
  chapter_id: number
  type: PlotPointType
  description: string
  characters?: string[]
  locations?: string[]
  is_resolved: boolean
  resolved_in?: number
}

export type PlotPointType = 'conflict' | 'climax' | 'resolution' | 'twist' | 'foreshadow'

// Character types
export interface Character {
  id: number
  novel_id: number
  uuid: string
  name: string
  role: CharacterRole
  archetype?: string
  appearance?: string
  personality?: string
  background?: string
  abilities?: string[]
  character_arc?: string
  visual_design?: CharacterVisualDesign
  created_at: string
  updated_at: string
}

export type CharacterRole = 'protagonist' | 'antagonist' | 'supporting' | 'minor'

export interface CharacterVisualDesign {
  id: number
  character_id: number
  appearance_description?: string
  reference_image_urls?: string[]
  lora_model_id?: string
  expressions?: CharacterExpression[]
  poses?: CharacterPose[]
  angles?: CharacterAngle[]
}

export interface CharacterExpression {
  type: string
  description: string
  image_url: string
}

export interface CharacterPose {
  type: string
  description: string
  image_url: string
}

export interface CharacterAngle {
  type: string
  description: string
  image_url: string
}

// Worldview types
export interface Worldview {
  id: number
  name: string
  description?: string
  genre: NovelGenre
  magic_system?: string
  geography?: string
  history?: string
  culture?: string
  technology?: string
  rules?: string
  entities?: WorldviewEntity[]
  created_at: string
  updated_at: string
}

export interface WorldviewEntity {
  id: number
  worldview_id: number
  type: EntityType
  name: string
  description?: string
  attributes?: Record<string, any>
}

export type EntityType = 'location' | 'organization' | 'artifact' | 'race' | 'other'

// Video types
export interface Video {
  id: number
  novel_id: number
  chapter_id?: number
  uuid: string
  title: string
  status: VideoStatus
  frame_rate: number
  resolution: string
  aspect_ratio: string
  total_shots: number
  url?: string
  created_at: string
  updated_at: string
}

export type VideoStatus = 'planning' | 'generating' | 'completed' | 'failed'

export interface StoryboardShot {
  id: number
  video_id: number
  uuid: string
  shot_no: number
  description?: string
  dialogue?: string
  camera_type: CameraType
  camera_angle: CameraAngle
  shot_size: ShotSize
  duration: number
  character_configs?: ShotCharacterConfig[]
  scene_config?: ShotSceneConfig
  status: ShotStatus
  image_url?: string
}

export type CameraType = 'static' | 'pan' | 'zoom' | 'tracking' | 'dolly' | 'crane'
export type CameraAngle = 'eye_level' | 'high' | 'low' | 'dutch' | 'overhead' | 'POV'
export type ShotSize = 'extreme_wide' | 'wide' | 'full' | 'medium' | 'close_up' | 'extreme_close_up'
export type ShotStatus = 'pending' | 'generating' | 'completed' | 'failed'

export interface ShotCharacterConfig {
  character_id: number
  expression?: string
  pose?: string
  position?: { x: number; y: number }
}

export interface ShotSceneConfig {
  scene_id?: number
  time_of_day?: string
  weather?: string
  lighting?: string
}

// Model types
export interface ModelProvider {
  id: number
  name: string
  endpoint?: string
  api_key?: string
  health_status: 'healthy' | 'degraded' | 'down'
  models: AIModel[]
  created_at: string
}

export interface AIModel {
  id: number
  provider_id: number
  name: string
  display_name: string
  description?: string
  is_active: boolean
  is_available: boolean
  quality: number
  cost_per_1k: number
  context_window: number
  suitable_tasks: string[]
}

export interface TaskModelConfig {
  id: number
  task_type: string
  primary_model_id: number
  fallback_model_ids?: number[]
  strategy: SelectionStrategy
  is_active: boolean
}

export type SelectionStrategy = 'quality_first' | 'cost_first' | 'balanced' | 'custom'

export interface ModelComparisonExperiment {
  id: number
  name: string
  description?: string
  task_type: string
  prompt: string
  model_ids: number[]
  results?: ExperimentResult[]
  status: 'pending' | 'running' | 'completed' | 'failed'
  winner_id?: number
  created_at: string
}

export interface ExperimentResult {
  id: number
  experiment_id: number
  model_id: number
  output: string
  quality_score: number
  latency_ms: number
  cost: number
}

// Quality types
export interface QualityReport {
  id: number
  chapter_id: number
  overall_score: number
  consistency_score: number
  quality_score: number
  logic_score: number
  style_score: number
  issues: QualityIssue[]
  suggestions?: string[]
  created_at: string
}

export interface QualityIssue {
  id: number
  type: IssueType
  severity: IssueSeverity
  description: string
  location?: string
  suggestion?: string
  status: 'open' | 'fixed' | 'ignored'
}

export type IssueType = 'consistency' | 'quality' | 'logic' | 'style'
export type IssueSeverity = 'high' | 'medium' | 'low'

// Review types
export interface ReviewTask {
  id: number
  novel_id: number
  chapter_id?: number
  task_type: string
  priority: 'high' | 'medium' | 'low'
  description: string
  status: ReviewStatus
  reviewer_note?: string
  created_at: string
  completed_at?: string
}

export type ReviewStatus = 'pending' | 'in_progress' | 'completed' | 'rejected'

// API Response types
export interface ApiResponse<T> {
  data: T
  message?: string
  code: number
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  size: number
}

export interface ApiError {
  message: string
  code: number
  details?: Record<string, string[]>
}

// Form types
export interface CreateNovelForm {
  title: string
  description?: string
  genre: NovelGenre
  worldview_id?: number
}

export interface CreateChapterForm {
  chapter_no: number
  title?: string
}

export interface CreateCharacterForm {
  name: string
  role: CharacterRole
  description?: string
}

export interface CreateWorldviewForm {
  name: string
  genre: NovelGenre
  description?: string
}

// UI types
export interface SelectOption {
  label: string
  value: string | number
}

export interface BreadcrumbItem {
  label: string
  to?: string
  icon?: string
}

export interface TabItem {
  key: string
  label: string
  icon?: string
  count?: number
}
