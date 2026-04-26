import type { WritingStylePreset, ImageStylePreset, VideoStylePreset } from '~/types'

// ─── 写作风格预设 ────────────────────────────────────────────────────────────
export const WRITING_PRESETS: WritingStylePreset[] = [
  {
    id: 'xianxia_action',
    name: '快节奏爽文',
    description: '第三人称限知视角，短句推进，动作场面密集，节奏快、爽感强，适合升级打怪类',
    tags: ['快节奏', '短句', '动作密集'],
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
    name: '典雅宏叙',
    description: '第三人称全知视角，长句典雅，旁白比重高，叙事距离远，适合多线史诗叙述',
    tags: ['全知视角', '长句', '旁白为主'],
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
    name: '对话驱动',
    description: '第一人称，对话占比高，内心独白丰富，句式轻盈，情感流动自然',
    tags: ['第一人称', '对话为主', '内心独白'],
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
    name: '冷硬克制',
    description: '第三人称限知，短促克制的句式，细节与伏笔铺陈密集，情绪不外露',
    tags: ['克制', '伏笔铺陈', '信息控制'],
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
    name: '轻快吐槽流',
    description: '第一人称，吐槽与内心戏密集，括号注释多，对话活泼，节奏轻盈幽默',
    tags: ['第一人称', '吐槽', '高对话比'],
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
    name: '史诗多线',
    description: '全知视角，多视角轮换，复杂句式，场景描写丰富，叙事距离感强',
    tags: ['全知视角', '多线叙事', '场景描写'],
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
    name: '理性推演',
    description: '第三人称限知，逻辑链条严密，术语精准，情感克制，以设定和推演为主轴',
    tags: ['逻辑严密', '术语精准', '低情绪'],
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
  {
    id: 'sweet_romance',
    name: '细腻温情',
    description: '第一人称，感官细节丰富，情绪绵密，对话温柔，节奏舒缓，擅写心动瞬间',
    tags: ['第一人称', '感官细节', '情绪绵密'],
    genre_affinity: ['romance', 'urban'],
    config: {
      narrative_voice: 'first_person',
      narrative_distance: 'close',
      emotional_tone: 'warm',
      sentence_complexity: 'simple',
      description_density: 'moderate',
      dialogue_ratio: 0.5,
    },
  },
  {
    id: 'apocalypse',
    name: '高压紧绷',
    description: '第三人称限知，环境描写压抑，短句制造紧张感，人物情绪内敛，生存细节真实',
    tags: ['短句', '压迫感', '环境渲染'],
    genre_affinity: ['scifi', 'fantasy'],
    config: {
      narrative_voice: 'third_limited',
      narrative_distance: 'close',
      emotional_tone: 'cold',
      sentence_complexity: 'moderate',
      description_density: 'moderate',
      dialogue_ratio: 0.25,
    },
  },
  {
    id: 'system_power',
    name: '数值升级流',
    description: '第一人称，系统提示框穿插，数据面板描写，节奏极快，以能力成长为叙事主轴',
    tags: ['第一人称', '系统面板', '极快节奏'],
    genre_affinity: ['fantasy', 'game', 'xianxia'],
    config: {
      narrative_voice: 'first_person',
      narrative_distance: 'close',
      emotional_tone: 'warm',
      sentence_complexity: 'simple',
      description_density: 'minimal',
      dialogue_ratio: 0.35,
    },
  },
  {
    id: 'palace_intrigue',
    name: '权谋心机',
    description: '第一人称，大量心理活动与算计，对话潜台词丰富，复杂长句，信息层层递进',
    tags: ['心理描写', '潜台词', '复杂句式'],
    genre_affinity: ['historical', 'romance'],
    config: {
      narrative_voice: 'first_person',
      narrative_distance: 'close',
      emotional_tone: 'cold',
      sentence_complexity: 'complex',
      description_density: 'rich',
      dialogue_ratio: 0.4,
    },
  },
  {
    id: 'campus_youth',
    name: '清新日常',
    description: '第一人称，生活化口语，轻描淡写，情感治愈，场景细节温馨，节奏舒缓',
    tags: ['口语化', '治愈', '生活细节'],
    genre_affinity: ['urban', 'romance'],
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
    id: 'horror_ghost',
    name: '惊悚诡谲',
    description: '第一人称，氛围渲染优先，感官描写阴冷，节奏张弛有度，悬念层层压迫',
    tags: ['氛围渲染', '感官阴冷', '悬念压迫'],
    genre_affinity: ['mystery', 'horror'],
    config: {
      narrative_voice: 'first_person',
      narrative_distance: 'close',
      emotional_tone: 'cold',
      sentence_complexity: 'moderate',
      description_density: 'rich',
      dialogue_ratio: 0.2,
    },
  },
  {
    id: 'rebirth_revenge',
    name: '逆袭成长弧',
    description: '第一人称，强目标感驱动，内心独白充满规划感，节奏稳健向上，结果爽感强',
    tags: ['目标驱动', '规划感', '成长节奏'],
    genre_affinity: ['urban', 'historical', 'fantasy'],
    config: {
      narrative_voice: 'first_person',
      narrative_distance: 'close',
      emotional_tone: 'cold',
      sentence_complexity: 'moderate',
      description_density: 'moderate',
      dialogue_ratio: 0.3,
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
  {
    id: 'chinese_animation',
    name: '国漫风格',
    description: '国产动漫画风，线条硬朗，色彩鲜明，带有东方神韵',
    tags: ['国漫', '动画', '东方'],
    art_style: 'chinese_animation',
    preview_colors: ['#E74C3C', '#F39C12', '#2ECC71'],
  },
  {
    id: 'game_concept',
    name: '游戏原画',
    description: '游戏概念设计风格，精细写实与设计感兼备，视觉冲击强',
    tags: ['游戏', '原画', '概念设计'],
    art_style: 'game_concept',
    preview_colors: ['#1ABC9C', '#2980B9', '#8E44AD'],
  },
  {
    id: 'steampunk',
    name: '蒸汽朋克',
    description: '维多利亚机械美学，铜棕色调，齿轮与蒸汽，复古未来感',
    tags: ['蒸汽朋克', '复古', '机械'],
    art_style: 'steampunk',
    preview_colors: ['#8B6914', '#C5892A', '#6B4226'],
  },
  {
    id: 'sketch',
    name: '黑白素描',
    description: '铅笔素描质感，黑白灰调，艺术感强，简约而不简单',
    tags: ['素描', '黑白', '艺术'],
    art_style: 'sketch',
    preview_colors: ['#2C3E50', '#7F8C8D', '#ECF0F1'],
  },
  {
    id: 'render_3d',
    name: '3D 渲染',
    description: '三维立体渲染，光影真实，精细质感，适合奇幻科幻题材',
    tags: ['3D', '渲染', '立体'],
    art_style: 'render_3d',
    preview_colors: ['#3498DB', '#9B59B6', '#1ABC9C'],
  },
  {
    id: 'ukiyo_e',
    name: '浮世绘',
    description: '日本传统浮世绘风格，平面构成，色块明快，极具辨识度',
    tags: ['浮世绘', '日式', '传统'],
    art_style: 'ukiyo_e',
    preview_colors: ['#C0392B', '#F39C12', '#1A535C'],
  },
  {
    id: 'gothic_dark',
    name: '哥特暗黑',
    description: '暗色系哥特风格，华丽阴郁，适合恐怖灵异悬疑题材',
    tags: ['哥特', '暗黑', '恐怖'],
    art_style: 'gothic_dark',
    preview_colors: ['#1A0A2E', '#4A0E6B', '#8B1A1A'],
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
