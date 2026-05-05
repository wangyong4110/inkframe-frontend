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
  ai_model?: string       // LLM 模型（章节生成等文本任务）
  image_model?: string    // 图片生成模型
  video_model?: string    // 视频生成模型
  tts_model?: string      // 语音合成模型
  temperature?: number
  max_tokens?: number
  timeout_seconds?: number  // 默认超时（秒），0=使用系统默认(180s)
  style_prompt?: string
  image_style?: string      // 视觉/图片风格
  reference_style?: string  // 参考作品
  channel?: string
  target_word_count?: number
  target_chapters?: number
  video_type?: string               // 视频类型：narration(图片解说)/animation(动画)
  video_resolution?: string         // 分辨率：720p/1080p/4K
  video_fps?: number                // 帧率：24/30/60
  video_aspect_ratio?: string       // 宽高比：16:9/9:16/1:1/4:3
  char_consistency_weight?: number  // 角色一致性权重 0-1
  asset_export_path?: string        // 素材导出路径
  narration_voice?: string
  subtitle_enabled?: boolean
  subtitle_position?: 'bottom' | 'center' | 'top'
  subtitle_font_size?: number
  subtitle_color?: string
  subtitle_bg_style?: 'none' | 'shadow' | 'box'          // 旁白音色 ID
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
  chapter_hook?: string   // 章末钩子正文（供下一章生成使用）
  hook_type?: string      // 章末钩子类型（cliffhanger 等）
  word_count: number
  outline?: string
  scene_outline?: string   // JSON: [{scene_no, pov, goals, beats, tension}]
  plot_points?: PlotPoint[]
  status: ChapterStatus
  quality_score?: number
  created_at: string
  updated_at: string
}

export type ChapterStatus = 'draft' | 'generating' | 'completed' | 'published'

export interface PlotPoint {
  id: number
  tenant_id: number
  novel_id: number
  chapter_id: number
  type: PlotPointType
  description: string
  characters?: string[]
  locations?: string[]
  is_resolved: boolean
  resolved_in?: number
  created_at: string
  updated_at: string
}

export type PlotPointType = 'conflict' | 'climax' | 'resolution' | 'twist' | 'foreshadow'

// Character types
export interface CharacterAbility {
  name: string
  level?: string
  description?: string
}

export interface Character {
  id: number
  novel_id: number
  uuid: string
  name: string
  gender?: string          // "male" | "female" | "neutral"
  role: CharacterRole
  archetype?: string
  appearance?: string
  personality?: string
  personality_tags?: string[]
  background?: string
  abilities?: CharacterAbility[]
  character_arc?: string
  // three-view reference images
  three_view_front?: string
  three_view_side?: string
  three_view_back?: string
  portrait?: string
  cover_image?: string
  // 配音设置
  voice_id?: string
  voice_speed?: number
  voice_style?: string
  voice_language?: string
  voice_sample?: string
  created_at: string
  updated_at: string
}

export type CharacterRole = 'protagonist' | 'antagonist' | 'supporting' | 'minor'

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
  factions?: string
  core_conflicts?: string
  character_archetypes?: string
  religion?: string
  glossary?: string
  cover_image?: string
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
  image_url?: string
  attributes?: Record<string, any>
  created_at?: string
  updated_at?: string
}

export type EntityType = 'location' | 'organization' | 'artifact' | 'race' | 'creature' | 'other'

// Video types
export type VideoQualityTier = 'draft' | 'preview' | 'final'

export type VideoMode = 'video' | 'slideshow'
export type VideoScriptStatus = 'draft' | 'confirmed'

export interface Video {
  id: number
  novel_id: number
  chapter_id?: number
  uuid: string
  title: string
  status: VideoStatus
  script_status?: VideoScriptStatus
  mode?: VideoMode
  quality_tier?: VideoQualityTier
  frame_rate: number
  resolution: string
  aspect_ratio: string
  art_style?: string
  pacing?: 'slow' | 'normal' | 'fast'
  target_duration?: number               // 秒，0 或 undefined = 自动
  total_shots: number
  url?: string
  created_at: string
  updated_at: string
}

export type VideoStatus = 'planning' | 'generating' | 'completed' | 'failed'

export type ShotGenerationMode = 'static' | 'video'

export interface StoryboardShot {
  id: number
  video_id: number
  uuid: string
  shot_no: number
  description?: string  // 英文画面描述，供 AI 图片/视频生成
  narration?: string    // 中文旁白文案，供 TTS 朗读和字幕显示
  dialogue?: string     // 角色台词（格式："角色名：台词"），无对话时为空
  subtitle?: string     // 字幕覆盖文本，非空时优先用于导出，不影响 TTS
  camera_type: CameraType
  camera_angle: CameraAngle
  shot_size: ShotSize
  duration: number
  emotional_tone?: string
  character_configs?: ShotCharacterConfig[]
  scene_config?: ShotSceneConfig
  status: ShotStatus
  generation_mode?: ShotGenerationMode
  image_url?: string
  video_url?: string
  audio_path?: string
  audio_url?: string  // 后端转换后的可播放 URL（file:// 已转为 API 端点）
  error_message?: string  // 生成失败原因
  scene_anchor_id?: number
  character_ids?: number[]
  sfx_url?: string      // 音效文件URL
  sfx_tags?: string     // LLM提取的音效标签（JSON数组字符串）
  sfx_volume?: number   // 混音音量（0=自动）
  transition?: ShotTransition  // 过渡方式：cut/fade/dissolve/wipe
}

export type CameraType = 'static' | 'pan' | 'zoom' | 'tracking' | 'dolly' | 'crane'
export type CameraAngle = 'eye_level' | 'high' | 'low' | 'dutch' | 'overhead' | 'POV'
export type ShotSize = 'extreme_wide' | 'wide' | 'full' | 'medium' | 'close_up' | 'extreme_close_up'
export type ShotTransition = 'cut' | 'fade' | 'dissolve' | 'wipe'
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

// Async Task types
export type AsyncTaskStatus = 'pending' | 'running' | 'completed' | 'failed'
export type AsyncTaskType = 'storyboard_gen' | 'chapter_gen' | 'voice_gen' | 'image_gen' | 'three_view'

export interface AsyncTask {
  id: number
  task_id: string
  tenant_id: number
  type: AsyncTaskType | string
  status: AsyncTaskStatus
  title: string
  entity_type: string
  entity_id: number
  data?: Record<string, unknown>
  error?: string
  progress: number
  created_at: string
  updated_at: string
}

// Model types
export interface ModelProvider {
  id: number
  tenant_id: number
  name: string
  display_name?: string
  type?: string
  api_endpoint?: string
  api_key?: string
  api_secret_key?: string
  api_version?: string
  is_active: boolean
  timeout?: number              // HTTP 超时秒数，0 或未设置表示使用默认值 300s
  has_key?: boolean
  health_status?: 'healthy' | 'degraded' | 'down'
  created_at?: string
  updated_at?: string
}

export interface ProviderTemplate {
  name: string
  display_name: string
  type: string
  api_endpoint: string
  needs_secret_key: boolean
  static_models?: string[]
}

export interface AIModel {
  id: number
  provider_id: number
  provider?: ModelProvider
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

// MCP (Model Context Protocol) types
export type McpTransportType = 'http' | 'sse' | 'stdio'

export interface McpTool {
  id: number
  name: string
  display_name: string
  description?: string
  transport_type: McpTransportType
  endpoint: string
  headers?: Record<string, string>
  env?: Record<string, string>
  timeout?: number
  is_active: boolean
  is_system: boolean
  schema?: Record<string, any>
  created_at: string
  updated_at: string
}

export interface McpToolBinding {
  tool_id: number
  model_id: number
  enabled: boolean
}

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
// Item types
export type ItemCategory = 'weapon' | 'treasure' | 'tool' | 'document' | 'artifact' | 'other'
export type ItemStatus = 'active' | 'lost' | 'destroyed' | 'unknown'

export interface Item {
  id: number
  novel_id: number
  uuid: string
  name: string
  category: ItemCategory
  description?: string
  appearance?: string
  location?: string
  owner?: string
  significance?: string
  abilities?: string // JSON
  image_url?: string
  visual_prompt?: string
  reference_image_url?: string
  status: ItemStatus
  created_at: string
  updated_at: string
}

export interface ChapterItem {
  id: number
  item_id: number
  chapter_id: number
  novel_id: number
  location?: string
  owner?: string
  condition?: string // intact/damaged/broken/destroyed
  notes?: string
  created_at: string
  updated_at: string
}

export interface EffectiveItem extends Item {
  chapter_override?: ChapterItem
  effective_location: string
  effective_owner: string
}

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
  cover_image?: string
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

// Style preset types
export interface WritingStylePreset {
  id: string
  name: string
  description: string
  tags: string[]
  genre_affinity: NovelGenre[]
  config: {
    narrative_voice: 'first_person' | 'third_limited' | 'third_omniscient'
    narrative_distance: 'close' | 'medium' | 'distant'
    emotional_tone: 'warm' | 'neutral' | 'cold'
    sentence_complexity: 'simple' | 'moderate' | 'complex'
    description_density: 'minimal' | 'moderate' | 'rich'
    dialogue_ratio: number
  }
}

export interface ImageStylePreset {
  id: string
  name: string
  description: string
  tags: string[]
  art_style: string
  preview_colors: string[]
}

export interface VideoStylePreset {
  id: string
  name: string
  description: string
  tags: string[]
  art_style: string
  aspect_ratio: string
  frame_rate: number
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
