import type { WritingStylePreset, ImageStylePreset, VideoStylePreset } from '~/types'

// ─── 写作风格预设 ────────────────────────────────────────────────────────────
export const WRITING_PRESETS: WritingStylePreset[] = [
  {
    id: 'xianxia_action',
    name: '热血修仙',
    description: '主角成长线明确，战斗激烈，升级爽文风格，情节推进快速',
    tags: ['修仙', '热血', '升级流'],
    genre_affinity: ['xianxia', 'fantasy'],
    config: {
      narrative_voice: 'third_limited',
      narrative_distance: 'close',
      emotional_tone: 'warm',
      sentence_complexity: 'moderate',
      description_density: 'moderate',
      dialogue_ratio: 0.35,
    },
  },
  {
    id: 'classic_wuxia',
    name: '经典武侠',
    description: '宏大叙事，武功描写细腻，江湖情仇，文笔典雅大气',
    tags: ['武侠', '江湖', '侠义'],
    genre_affinity: ['xianxia', 'fantasy', 'historical'],
    config: {
      narrative_voice: 'third_omniscient',
      narrative_distance: 'distant',
      emotional_tone: 'neutral',
      sentence_complexity: 'complex',
      description_density: 'rich',
      dialogue_ratio: 0.2,
    },
  },
  {
    id: 'urban_romance',
    name: '都市言情',
    description: '第一人称带入感强，对话丰富，情感细腻，甜文爽文风格',
    tags: ['言情', '都市', '甜文'],
    genre_affinity: ['urban', 'romance'],
    config: {
      narrative_voice: 'first_person',
      narrative_distance: 'close',
      emotional_tone: 'warm',
      sentence_complexity: 'simple',
      description_density: 'moderate',
      dialogue_ratio: 0.45,
    },
  },
  {
    id: 'mystery_thriller',
    name: '悬疑推理',
    description: '节奏紧凑，细节伏笔铺陈，解谜反转，冷静克制的叙述',
    tags: ['悬疑', '推理', '反转'],
    genre_affinity: ['mystery', 'urban'],
    config: {
      narrative_voice: 'third_limited',
      narrative_distance: 'medium',
      emotional_tone: 'cold',
      sentence_complexity: 'moderate',
      description_density: 'rich',
      dialogue_ratio: 0.25,
    },
  },
  {
    id: 'light_novel',
    name: '轻小说',
    description: '第一人称，吐槽+内心戏丰富，对话活泼，节奏轻快有趣',
    tags: ['轻小说', '幽默', '日系'],
    genre_affinity: ['fantasy', 'urban'],
    config: {
      narrative_voice: 'first_person',
      narrative_distance: 'close',
      emotional_tone: 'warm',
      sentence_complexity: 'simple',
      description_density: 'minimal',
      dialogue_ratio: 0.5,
    },
  },
  {
    id: 'epic_fantasy',
    name: '史诗奇幻',
    description: '世界观宏大，全知视角，多线叙事，文笔沉稳富有史诗感',
    tags: ['奇幻', '史诗', '宏大'],
    genre_affinity: ['fantasy'],
    config: {
      narrative_voice: 'third_omniscient',
      narrative_distance: 'distant',
      emotional_tone: 'neutral',
      sentence_complexity: 'complex',
      description_density: 'rich',
      dialogue_ratio: 0.15,
    },
  },
  {
    id: 'hard_scifi',
    name: '硬核科幻',
    description: '科技设定严谨，逻辑严密，冷静克制，专注设定与逻辑推演',
    tags: ['科幻', '硬科幻', '严谨'],
    genre_affinity: ['scifi'],
    config: {
      narrative_voice: 'third_limited',
      narrative_distance: 'medium',
      emotional_tone: 'cold',
      sentence_complexity: 'complex',
      description_density: 'moderate',
      dialogue_ratio: 0.2,
    },
  },
]

// ─── 图片/美术风格预设 ────────────────────────────────────────────────────────
export const IMAGE_PRESETS: ImageStylePreset[] = [
  {
    id: 'anime',
    name: '动漫风格',
    description: '日系动漫画风，色彩鲜艳，线条流畅，角色表情丰富',
    tags: ['动漫', '日系', '鲜艳'],
    art_style: 'anime',
    preview_colors: ['#FF6B9D', '#C44FDB', '#4FACFE'],
  },
  {
    id: 'realistic',
    name: '写实风格',
    description: '真实感强烈，光影细腻，适合现代都市及写实场景',
    tags: ['写实', '真实', '细腻'],
    art_style: 'realistic',
    preview_colors: ['#8B7355', '#C4A882', '#E8D5B7'],
  },
  {
    id: 'ink_painting',
    name: '水墨中国风',
    description: '水墨丹青，意境悠远，适合古典仙侠武侠等东方题材',
    tags: ['水墨', '国风', '古典'],
    art_style: 'ink_painting',
    preview_colors: ['#1A1A2E', '#4A4A6A', '#C9B8A8'],
  },
  {
    id: 'cyberpunk',
    name: '赛博朋克',
    description: '霓虹灯光，高科技低生活，蓝紫色调，未来感强烈',
    tags: ['赛博朋克', '科幻', '霓虹'],
    art_style: 'cyberpunk',
    preview_colors: ['#6C63FF', '#FF2D55', '#00CFFD'],
  },
  {
    id: 'xianxia_style',
    name: '古典仙侠',
    description: '仙气飘渺，青绿色调，云雾缭绕，仙侠特有的飘逸感',
    tags: ['仙侠', '飘逸', '古典'],
    art_style: 'xianxia_style',
    preview_colors: ['#2ECC71', '#A8E6CF', '#F7E7CE'],
  },
  {
    id: 'oil_painting',
    name: '油画风格',
    description: '厚重质感，色彩浓郁，艺术性强，适合史诗奇幻题材',
    tags: ['油画', '艺术', '厚重'],
    art_style: 'oil_painting',
    preview_colors: ['#8B2252', '#C0392B', '#E67E22'],
  },
  {
    id: 'watercolor',
    name: '水彩插画',
    description: '轻盈通透，色彩柔和，清新风格，适合言情轻小说',
    tags: ['水彩', '清新', '柔和'],
    art_style: 'watercolor',
    preview_colors: ['#FFB3BA', '#FFDFBA', '#FFFFBA'],
  },
  {
    id: 'pixel_art',
    name: '像素风格',
    description: '复古像素画风，方块感十足，游戏风格，适合轻松题材',
    tags: ['像素', '复古', '游戏风'],
    art_style: 'pixel_art',
    preview_colors: ['#FF5252', '#FFEB3B', '#4CAF50'],
  },
]

// ─── 视频风格预设 ─────────────────────────────────────────────────────────────
export const VIDEO_PRESETS: VideoStylePreset[] = [
  {
    id: 'cinematic',
    name: '电影宽屏',
    description: '标准电影比例，24fps 胶片感，适合史诗叙事和大场面',
    tags: ['电影', '宽屏', '大场面'],
    art_style: 'cinematic',
    aspect_ratio: '16:9',
    frame_rate: 24,
  },
  {
    id: 'short_video',
    name: '竖屏短视频',
    description: '适配手机竖屏，30fps 流畅，适合社交平台分享',
    tags: ['短视频', '竖屏', '社交'],
    art_style: 'vibrant',
    aspect_ratio: '9:16',
    frame_rate: 30,
  },
  {
    id: 'square_social',
    name: '方形社交',
    description: '1:1 正方形，适合微博、Instagram 等图文平台',
    tags: ['方形', '社交', '通用'],
    art_style: 'vivid',
    aspect_ratio: '1:1',
    frame_rate: 30,
  },
  {
    id: 'hd_epic',
    name: '高清长片',
    description: '4K 高清，60fps 超流畅，适合精品内容创作',
    tags: ['高清', '长片', '精品'],
    art_style: 'realistic',
    aspect_ratio: '16:9',
    frame_rate: 60,
  },
]

// ─── Style API composable ─────────────────────────────────────────────────────
export function useStyleApi() {
  const config = useRuntimeConfig()
  const apiBase = config.public.apiBase

  async function buildWritingPrompt(cfg: WritingStylePreset['config']): Promise<string> {
    const res = await fetch(`${apiBase}/styles/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    })
    const json = await res.json()
    return (json.data?.prompt as string) ?? ''
  }

  async function applyWritingPreset(name: string): Promise<WritingStylePreset['config'] | null> {
    const res = await fetch(`${apiBase}/styles/presets/${name}/apply`, {
      method: 'POST',
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.data ?? null
  }

  return { buildWritingPrompt, applyWritingPreset }
}
