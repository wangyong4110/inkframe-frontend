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
  top_p?: number
  top_k?: number
  max_tokens?: number
  timeout_seconds?: number  // 默认超时（秒），0=使用系统默认(180s)
  style_prompt?: string
  image_style?: string      // 视觉/图片风格
  prompt_language?: string  // AI提示词语言：zh（中文，默认）/ en（英文）
  chapter_mode?: string     // sequential=连贯剧情（默认）/ independent=独立成篇
  auto_review_rounds?: number    // 生成后自动审查轮次：0=关闭，1-3=开启
  auto_review_min_score?: number // 提前停止阈值（0-100），默认80
  core_theme?: string  // 全书核心主题（如"信任比力量更难获得"）
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
  color_grade?: string        // 调色预设：none/cinematic/warm/cool/teal_orange/vintage/noir
  contrast_level?: number     // 对比度调节 -1~1，0 = 不调整
  saturation?: number         // 饱和度倍率 0~2，1 = 原色
  // 镜头特效
  film_grain?: boolean
  vignette?: boolean
  chromatic_aberration?: boolean
  // Kling 专业模式
  kling_pro_for_action?: boolean
  subtitle_font?: string
  // 广场社交字段
  is_published?: boolean
  published_at?: string
  visibility?: 'private' | 'unlisted' | 'public'
  view_count?: number
  like_count?: number
  comment_count?: number
  hot_score?: number
  plaza_tags?: string[]
  created_at: string
  updated_at: string
}

export interface NovelComment {
  id: number
  novel_id: number
  user_id: number
  nickname?: string
  content: string
  parent_id?: number
  created_at: string
}

export interface ChapterComment {
  id: number
  chapter_id: number
  novel_id: number
  user_id: number
  nickname?: string
  content: string
  parent_id?: number
  created_at: string
}

export interface ReadingProgress {
  user_id: number
  novel_id: number
  chapter_no: number
  chapter_id: number
  scroll_pct: number
  updated_at: string
  created_at?: string
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
  /** 内容状态：draft=草稿 | generating=生成中 | completed=已完成 */
  status: ChapterStatus
  /** 是否已发布到作品集（与内容状态独立） */
  is_published?: boolean
  published_at?: string
  quality_score?: number
  quality_status?: 'ok' | 'low'  // 质量评级：ok=正常，low=需改善
  quality_issues?: string          // 质量问题 JSON 摘要
  /** 连贯性检查发现 high/critical 问题时为 true，提示用户审查 */
  continuity_blocked?: boolean
  /** 章末读者悬念（JSON 字符串数组），供下章生成时作为首要约束 */
  reader_expectations?: string
  /** 章末精确状态快照（结构化 JSON），供下章生成时作为连续性锚点 */
  chapter_end_state?: string
  like_count?: number
  created_at: string
  updated_at: string
}

/** 章节内容状态（不含发布状态） */
export type ChapterStatus = 'draft' | 'generating' | 'completed'

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
  role: CharacterRole
  gender?: string            // male / female / neutral
  age?: string               // 如 "16" / "约25岁" / "少年"
  description?: string       // 统一描述（外貌、性格、背景、说话风格等）
  inner_conflict?: string    // 内在矛盾
  core_desire?: string       // 核心渴望
  arc_design?: string        // 弧光设计 JSON
  current_arc_stage?: string // 当前弧光阶段（起点/考验/最低点/转折/终点）
  default_look_id?: number     // 默认形象 ID
  default_three_view?: string  // 默认形象的三视图（由服务层注入）
  portrait?: string
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

// CharacterLook 角色形象（不同时期的外观版本）
export interface CharacterLook {
  id: number
  character_id: number
  novel_id: number
  label: string         // 形象名称，如"少年时期""成年装束""伪装后"
  chapter_from: number  // 起始章节（含），0 表示从头
  chapter_to: number    // 结束章节（含），0 表示无限延伸
  sort_order: number
  description?: string  // 外观描述（中文）
  visual_prompt?: string // AI 图像生成英文 Prompt
  three_view_sheet?: string
  face_closeup?: string
  portrait?: string
  created_at: string
  updated_at: string
}

export interface CreateCharacterLookForm {
  label: string
  chapter_from: number
  chapter_to: number
  set_as_default?: boolean
  sort_order?: number
  description?: string
  visual_prompt?: string
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
  rules?: string
  glossary?: string
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
  visual_mode?: 'standard' | 'hd' | '3d' | 'hd_3d'   // 视觉模式
  three_d_style?: 'cg' | 'pixar' | 'anime3d' | 'realistic3d' // 3D 风格
  total_shots: number
  url?: string
  // 合成与发布
  final_video_url?: string
  cover_url?: string
  is_published?: boolean
  published_at?: string
  view_count?: number
  visibility?: 'private' | 'unlisted' | 'public'
  // 广场社交字段
  like_count?: number
  comment_count?: number
  hot_score?: number
  tags?: string[]       // JSON 解析后的标签数组，如 ["玄幻","古风"]
  duration?: number     // 视频总时长（秒）
  novel?: { id: number; title: string; genre?: string }
  created_at: string
  updated_at: string
}

export interface VideoComment {
  id: number
  video_id: number
  user_id: number
  nickname?: string
  content: string
  parent_id?: number
  created_at: string
}

export interface PlatformAccount {
  id: number
  platform: string
  account_name: string
  uid: string
  status: 'active' | 'expired' | 'revoked'
  expires_at?: string
  created_at: string
}

export interface VideoPublishRecord {
  id: number
  video_id: number
  platform: string
  account_id: number
  external_id?: string
  external_url?: string
  status: string
  error_msg?: string
  published_at?: string
  created_at: string
}

export type VideoStatus = 'planning' | 'generating' | 'completed' | 'failed'

export type ShotGenerationMode = 'static' | 'video'

export interface StoryboardShot {
  id: number
  video_id: number
  uuid: string
  shot_no: number
  description?: string  // 画面场景描述（叙事参考，不直接用于生图）
  prompt?: string       // 图片生成提示词（实际传给图片AI，英文结构化 prompt）
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
  negative_prompt?: string
  motion_prompt?: string
  shot_task_id?: string  // 正在生成中的任务ID，用于取消
}

// SFX tag item (sfx_tags JSON field on StoryboardShot)
export interface SFXTagItem {
  tag: string                              // 搜索词（英文：Freesound格式；中文：Kling SFX）
  type: 'action' | 'ambient' | 'emotion'  // 音效分类
  prompt?: string                          // AI 生成提示词（Kling SFX / ElevenLabs 专用）
}

export interface ShotSFXItem {
  id: number
  shot_id: number
  seq_no: number
  tag: string         // 音效标签，如 "rain_heavy"
  url: string         // 音效文件原始 URL（可能是 file:// 或过期 CDN 链接）
  audio_url?: string  // 后端转换后可播放的 URL（file:// 已转为代理接口）
  volume: number      // 混音音量（0.1–1.0）
  source: string      // local/freesound/elevenlabs/ai-sfx
  disabled?: boolean
  start_offset?: number  // 在分镜中的开始时间（秒，0=分镜起始）
  duration_secs?: number // 音效时长（秒，0=未知）
  // v2 字段
  sfx_type?: 'action' | 'ambient' | 'emotion'  // 音效分类
  loop_enabled?: boolean  // 是否循环播放（ambient 默认 true）
  fade_in_ms?: number     // 淡入时长（毫秒）
  fade_out_ms?: number    // 淡出时长（毫秒）
  created_at?: string
}

export interface ShotVoiceSegment {
  id: number
  shot_id: number
  seq_no: number
  text: string
  speaker?: string
  voice_id?: string
  audio_path?: string
  duration_secs?: number
}

export interface JamendoTrack {
  id: string
  name: string
  artist_name: string
  duration: number       // seconds
  audio: string          // streaming URL
  audiodownload: string  // download URL
  audiodownload_allowed: boolean
  tags?: string[]
}

export interface VideoBGMSegment {
  id: number
  video_id: number
  seq_no: number
  start_shot_no: number
  end_shot_no: number
  mood: string
  tempo: 'fast' | 'medium' | 'slow'
  search_queries: string // JSON array string
  url?: string
  volume: number
  duration_secs?: number
  track_name?: string
  track_artist?: string
  source?: string   // jamendo/pixabay/local/none
  disabled?: boolean
  ducking_enabled?: boolean
  ducking_level?: number
  created_at?: string
  updated_at?: string
}

export type CameraType = 'static' | 'push' | 'pull' | 'pan' | 'track' | 'crane_up' | 'crane_down' | 'follow' | 'arc' | 'tilt' | 'whip_pan' | 'zoom' | 'tracking' | 'dolly' | 'crane'
export type CameraAngle = 'eye_level' | 'high' | 'low' | 'dutch' | 'overhead' | 'POV'
export type ShotSize = 'extreme_wide' | 'wide' | 'full' | 'medium' | 'close_up' | 'extreme_close_up'
export type ShotTransition = 'cut' | 'j-cut' | 'l-cut' | 'fade' | 'dissolve' | 'dip-black' | 'dip-white' | 'wipe' | 'push' | 'slide' | 'zoom' | 'whip-pan' | 'spin' | 'flash' | 'glitch' | 'blur' | 'morph'
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
export type AsyncTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
export type AsyncTaskType =
  | 'storyboard_gen'
  | 'chapter_gen'
  | 'voice_gen'
  | 'image_gen'
  | 'three_view'
  | 'face_closeup'
  | 'char_gen'
  | 'item_extract'
  | 'plot_extract'
  | 'asset_gen'
  | 'scene_anchor_extract'
  | 'chapter_summary_batch'
  | 'sfx_gen'
  | 'storyboard_review'
  | 'storyboard_optimize'
  | 'import'
  | 'novel_analysis'
  | 'rewrite_analysis'
  | 'rewrite_chapters'
  | 'chapter_char_extract'
  | 'chapter_scene_extract'

export interface AsyncTask {
  id: number
  task_id: string
  tenant_id: number
  type: AsyncTaskType
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
  concurrency?: number          // 最大并发调用数，0 或未设置表示不限制
  rate_limit?: number           // 请求/分钟限速，0 或未设置表示不限制
  max_tokens?: number           // 最大输出 token 数，0 或未设置表示使用模型默认值
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
  suitable_tasks?: string
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
  description?: string       // 统一描述（含外观、功能等）
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

// Scene anchor types (mirrors useSceneAnchorApi.ts)
export type SceneAnchorType = 'interior' | 'exterior' | 'imaginary'

export interface SceneAnchor {
  id: number
  tenant_id: number
  novel_id: number
  name: string
  type: SceneAnchorType
  description: string
  ref_image_url: string
  ref_image_locked_at?: string
  prompt_lock?: string
  usage_count: number
  avg_cons_score: number
  parent_anchor_id?: number
  variant?: string
  created_at: string
  updated_at: string
}

export interface CreateSceneAnchorPayload {
  name: string
  type?: SceneAnchorType
  description?: string
  variant?: string
  parent_anchor_id?: number
}

export type UpdateSceneAnchorPayload = Partial<CreateSceneAnchorPayload>

export interface ConsistencyLog {
  id: number
  shot_id: number
  anchor_id: number
  overall_score: number
  arch_score: number
  light_score: number
  atmo_score: number
  passed: boolean
  attempt: number
  created_at: string
}

export interface ApiResponse<T> {
  data: T
  message?: string
  code: number
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

// Novel Rewriting Types
export interface RewriteProject {
  id: number
  tenant_id: number
  novel_id: number
  name: string
  level: 1 | 2 | 3 | 4 | 5
  status: 'pending' | 'analyzing' | 'bible_ready' | 'rewriting' | 'reviewing' | 'completed' | 'failed'
  progress: number
  total_chapters: number
  done_chapters: number
  error_msg?: string
  created_at: string
  updated_at: string
}

export interface LiteraryAnalysis {
  id: number
  project_id: number
  voice_fingerprint: string // JSON string
  scene_architecture: string
  character_psych: string
  theme_core: string
  world_logic: string
  high_risk_markers: string
  created_at: string
}

export interface RewriteBible {
  id: number
  project_id: number
  new_world_name: string
  naming_style: string
  new_char_names: string       // JSON: {oldName: newName}
  plot_transform: string
  props_transform: string
  voice_strategy: string
  style_guide: string
  imagery_transform: string    // JSON: {originalSymbol: newSymbol}
  forbidden_phrases: string    // JSON: string[]
  forbidden_dialogues: string  // JSON: {pattern, excerpt, rewrite_guide}[]
  forbidden_elems: string
  created_at: string
  updated_at: string
}

export interface ChapterRewriteTask {
  id: number
  project_id: number
  chapter_id: number
  chapter_no: number
  status: 'pending' | 'rewriting' | 'reviewing' | 'completed' | 'failed'
  original_content: string
  rewritten_content: string
  attempt_content?: string
  similarity_score: number
  lexical_sim: number
  structural_sim: number
  semantic_sim: number         // 语义泄漏率：原始实体残留比例（越低越好）
  passed: boolean
  retry_count: number
  error_msg: string
  quality_score: number
  deai_applied: boolean
  consistency_issues: string   // JSON array string
  created_at: string
  updated_at: string
}

export interface ChapterComplianceItem {
  chapter_no: number
  passed: boolean
  lexical_sim: number
  structural_sim: number
  semantic_sim: number
  quality_score: number
  rating: 'green' | 'yellow' | 'red'
}

export interface ComplianceReport {
  project_id: number
  level: number
  total_chapters: number
  done_chapters: number
  passed_chapters: number
  avg_lexical_sim: number
  avg_structural_sim: number
  avg_semantic_sim: number
  avg_quality_score: number
  overall_rating: 'green' | 'yellow' | 'red'
  chapters: ChapterComplianceItem[]
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

// ─── Asset Library ────────────────────────────────────────────────────────────

export interface Asset {
  id: number
  scope: 'personal' | 'public'
  tenant_id: number
  creator_id: number
  title: string
  description?: string
  type: 'image' | 'video' | 'audio' | 'text'
  sub_type: string
  source: 'platform' | 'crawled' | 'uploaded'
  storage_url: string
  thumbnail_url?: string
  preview_url?: string
  waveform_url?: string
  hls_url?: string
  source_url?: string
  external_id?: string
  license: string
  license_url?: string
  attribution?: string
  width?: number
  height?: number
  duration?: number
  file_size?: number
  mime_type?: string
  aspect_ratio?: string
  quality_score?: number
  quality_issues?: string[]
  safety_score?: number
  safety_checked?: boolean
  dominant_color?: string
  color_palette?: string[]
  use_count: number
  like_count: number
  value_score?: number
  shared_at?: string
  shared_by?: number
  review_note?: string
  novel_id?: number
  video_id?: number
  shot_id?: number
  status: 'active' | 'pending_review' | 'rejected' | 'trash' | 'withdrawn'
  created_at: string
  updated_at: string
  tags?: Tag[]
}

export interface Tag {
  id: number
  name: string
  slug: string
  category: string
  use_count: number
  is_system: boolean
}

export interface AssetShareRequest {
  id: number
  asset_id: number
  requested_by: number
  status: 'pending' | 'approved' | 'rejected'
  auto_passed: boolean
  review_note?: string
  reviewed_at?: string
  created_at: string
}

export interface AssetVersion {
  id: number
  asset_id: number
  version_no: number
  storage_url: string
  thumbnail_url?: string
  file_size: number
  change_note: string
  created_by: number
  created_at: string
}

export interface AssetCollection {
  id: number
  scope: 'personal' | 'public'
  tenant_id: number
  name: string
  description?: string
  cover_url?: string
  asset_count: number
  creator_id: number
  created_at: string
  updated_at: string
}

export interface Foreshadow {
  id: number
  novel_id: number
  title: string
  description?: string
  planted_chapter_id?: number
  payoff_chapter_id?: number
  status: 'planted' | 'paid_off' | 'abandoned'
  tags?: string
  planted_chapter_no: number
  payoff_chapter_no: number
  actual_payoff_chapter_no: number
  level: 'main' | 'sub' | 'detail'
  foreshadow_type: 'prop' | 'dialogue' | 'behavior' | 'scene' | 'prophecy' | ''
  importance: 'critical' | 'major' | 'normal' | 'minor'
  linked_hook_id?: number
  linked_arc_id?: number
  confidence?: 'high' | 'medium' | 'low'
  parent_id?: number
  character_ids?: string
  reinforcement_chapters?: string
  payoff_quality?: number
  payoff_notes?: string
  created_at: string
  updated_at: string
}

export interface ForeshadowStats {
  total: number
  planted: number
  paid_off: number
  abandoned: number
  overdue: number
  narrative_debt: number
  by_level: Record<string, number>
  by_type: Record<string, number>
  by_confidence: Record<string, number>
}

export interface WebhookSubscription {
  id: number
  tenant_id: number
  url: string
  events: string[]
  is_active: boolean
  fail_count: number
  last_error?: string
  created_at: string
}

export interface AuditLog {
  id: number
  tenant_id: number
  user_id: number
  action: string
  entity_type: string
  entity_id: number
  ip_address?: string
  user_agent?: string
  detail?: Record<string, unknown>
  created_at: string
}

export interface BatchDeleteRequest {
  ids: number[]
}

export interface CrawlJob {
  id: number
  source: string
  query: string
  asset_type: string
  license: string
  limit: number
  crawl_depth?: number
  url_pattern?: string
  status: string
  total_found: number
  imported: number
  skipped: number
  failed: number
  error_msg?: string
  started_at?: string
  completed_at?: string
  created_at: string
}

export interface AssetComment {
  id: number
  asset_id: number
  user_id: number
  content: string
  parent_id?: number
  x_ratio?: number
  y_ratio?: number
  created_at: string
  updated_at: string
}

export interface ShareLink {
  id: number
  token: string
  asset_id?: number
  collection_id?: number
  expires_at?: string
  view_count: number
  download_allowed: boolean
  created_at: string
}

export interface AssetStorageQuota {
  tenant_id: number
  storage_used_bytes: number
  storage_limit_bytes: number
  crawl_used_this_month: number
  crawl_limit_per_month: number
}

export interface AssetSearchParams {
  scope?: 'personal' | 'public' | 'all'
  q?: string
  type?: string
  sub_type?: string
  source?: string
  license?: string
  tags?: string[]
  sort?: string
  page?: number
  page_size?: number
  status?: string
}

export interface ShotReviewFeedback {
  shot_no: number
  issues: string[]
  suggestion: string
  severity: 'info' | 'warning' | 'error'
  suggested_narration?: string
  suggested_dialogue?: string
  suggested_description?: string
}

export interface ShotInsertSuggestion {
  after_shot_no: number
  narration: string
  dialogue?: string
  description: string
  duration: number
  shot_size?: string
  camera_type?: string
  reason: string
}

export interface ShotDeleteSuggestion {
  shot_no: number
  reason: string
}

export interface StoryboardReview {
  overall_score: number
  narrative_score: number
  visual_score: number
  pacing_score: number
  voiceover_score: number
  summary: string
  strengths: string[]
  weaknesses: string[]
  global_suggestions: string[]
  shot_feedback: ShotReviewFeedback[]
  suggested_inserts?: ShotInsertSuggestion[]
  suggested_deletes?: ShotDeleteSuggestion[]
  record_id?: number
}

export interface ReviewRecord {
  id: number
  created_at: string
  overall_score: number
  status: 'pending' | 'applied' | 'rolled_back'
  applied_at?: string
  review?: StoryboardReview
}

export interface IgnoredSuggestion {
  id: number
  video_id: number
  shot_no: number
  issue_text: string
  issue_hash: string
  note: string
  created_at: string
}

// ─── Chapter AI Review ──────────────────────────────────────────────────────

export interface WeaknessItem {
  issue: string
  suggestion: string
}

export interface ParagraphFeedback {
  index: number
  orig_text: string
  issues: string[]
  suggestion: string
  action?: 'rewrite' | 'delete' | 'restructure'
  suggested_rewrite: string
  severity: 'info' | 'warning' | 'error'
  narrative_impact?: 'plot_critical' | 'quality' | 'style'
  preserved_function?: string
}

export interface SceneAnalysisItem {
  scene_no: number
  start_index: number
  end_index: number
  goal: string
  conflict: string
  change: string
  c3_score: number
  note?: string
}

export interface HookAnalysis {
  type: 'cliffhanger' | 'emotional' | 'action' | 'reversal' | 'none'
  strength: number
  hook_text: string
  next_chapter_setup: string
}

export interface ChapterReview {
  overall_score: number
  narrative_score: number
  character_score: number
  writing_score: number
  pacing_score: number
  dramatic_score: number
  narrative_necessity?: number
  emotional_resonance?: number
  visual_potential: number
  summary: string
  strengths: string[]
  weaknesses: WeaknessItem[]
  global_suggestions: string[]
  hook_analysis?: HookAnalysis
  scene_analysis?: SceneAnalysisItem[]
  paragraph_feedback: ParagraphFeedback[]
  record_id?: number
}

export interface ChapterReviewRecord {
  id: number
  created_at: string
  overall_score: number
  status: 'pending' | 'applied' | 'rolled_back'
  applied_at?: string
  review?: ChapterReview
}

export interface ChapterIgnoredIssue {
  id: number
  entity_id: number
  issue_text: string
  issue_hash: string
  note: string
  created_at: string
}

export interface AnalysisStatus {
  novel_id?: number
  status: 'not_started' | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number
  current_step?: string
  error?: string
  updated_at?: string
}

export interface KnowledgeBase {
  id: number
  type: string
  title: string
  content: string
  tags?: string
  novel_id?: number
  created_at: string
}

export interface ChapterVersion {
  id: number
  chapter_id: number
  version_no: number
  content: string
  change_type: string
  change_description?: string
  quality_score?: number
  consistency_score?: number
  created_at: string
}

export interface NovelOutlineVersion {
  id: number
  novel_id: number
  version: number
  outline: string
  created_at: string
}

// ─── Outline Review ────────────────────────────────────────────────────────────

export interface OutlineIssue {
  dimension: 'structure' | 'pacing' | 'continuity' | 'character' | 'conflict' | 'hook'
  severity: 'error' | 'warning' | 'info'
  description: string
  suggestion: string
}

export interface OutlineReview {
  id: number
  novel_id: number
  chapter_id: number
  chapter_no: number
  status: 'pending' | 'reviewing' | 'passed' | 'warning' | 'failed'
  overall_score: number
  structure_score: number
  pacing_score: number
  continuity_score: number
  character_score: number
  conflict_score: number
  hook_score: number
  issues_json: string
  highlights_json: string
  suggestion: string
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface TensionPoint {
  chapter_no: number
  planned_level: number
  score: number
  status: string
}

export interface ArcBalance {
  act1_count: number
  act2_count: number
  act3_count: number
  act1_avg_score: number
  act2_avg_score: number
  act3_avg_score: number
  assessment: string
  suggestion: string
}

export interface ChapterAdvice {
  chapter_no: number
  title: string
  score: number
  status: string
  key_issue: string
  suggestion: string
}

export interface NovelOutlineSynthesis {
  id: number
  novel_id: number
  total_chapters: number
  reviewed_count: number
  passed_count: number
  warning_count: number
  failed_count: number
  avg_score: number
  tension_curve_json: string
  arc_balance_json: string
  recurring_issues_json: string
  chapter_advices_json: string
  global_suggestion: string
  status: 'partial' | 'completed'
  synthesized_at: string
}

// ─── Collaboration ──────────────────────────────────────────────────────────

export interface NovelMember {
  id: number
  novel_id: number
  user_id: number
  role: 'owner' | 'editor' | 'viewer'
  status: 'active' | 'pending'
  nickname: string
  email: string
  avatar?: string
  joined_at?: string
  invite_expires_at?: string
}

export interface EditingLock {
  id: number
  entity_type: string
  entity_id: number
  locked_by: number
  locked_by_name: string
  expires_at: string
}

export interface CollabEvent {
  type: string
  entity_id?: number
  user_id?: number
  user?: string
  summary?: string
  data?: Record<string, unknown>
}
