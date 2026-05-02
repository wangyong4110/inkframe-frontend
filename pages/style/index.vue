<script setup lang="ts">
import { WRITING_PRESETS, IMAGE_PRESETS, VIDEO_PRESETS } from '~/composables/useStylePresets'
import type { WritingStylePreset, ImageStylePreset, VideoStylePreset } from '~/types'

const activeTab = ref<'writing' | 'image' | 'video' | 'genre'>('genre')
const selectedWriting = ref('')
const selectedImage = ref('')
const selectedVideo = ref('')

const GENRE_LIST = [
  {
    id: 'fantasy', name: '玄幻奇幻',
    gradient: 'from-purple-500 to-blue-500',
    description: '以魔法、异能、龙兽等超自然元素为核心，构建全新世界体系，常见修炼升级、种族争霸等情节。',
    elements: ['修炼体系', '魔兽秘境', '升级争霸', '异世大陆'],
    tips: '世界观构建是核心，需设计自洽的力量体系与种族生态。',
  },
  {
    id: 'xianxia', name: '仙侠修仙',
    gradient: 'from-cyan-500 to-teal-500',
    description: '融合道家文化与武侠精神，主角修炼仙法、问道长生，历经渡劫飞升。',
    elements: ['修仙等阶', '灵气法宝', '宗门师承', '渡劫飞升'],
    tips: '注重东方美学意境，仙气飘逸；修仙等级体系需清晰，剧情围绕机缘与突破展开。',
  },
  {
    id: 'urban', name: '都市现代',
    gradient: 'from-sky-500 to-indigo-500',
    description: '以当代都市为背景，贴近现实生活，常见异能觉醒、职场商战、豪门恩怨等题材。',
    elements: ['现实背景', '都市异能', '职场商战', '豪门恩怨'],
    tips: '场景真实感强，人物关系复杂；可融合异能元素提升爽感，也可走纯现实主义路线。',
  },
  {
    id: 'romance', name: '言情爱情',
    gradient: 'from-pink-500 to-rose-500',
    description: '以男女感情为核心，注重情感细腻描写，涵盖甜文、虐文、HE/BE 等多种走向。',
    elements: ['情感张力', '甜虐并济', 'HE/BE走向', '角色魅力'],
    tips: '人物性格是灵魂，需让读者与角色共情；情感节奏控制至关重要，甜虐节点要精心设计。',
  },
  {
    id: 'historical', name: '历史古代',
    gradient: 'from-amber-500 to-orange-500',
    description: '以历史时期为背景，或完全架空，常见朝堂权谋、家族争权、宫廷秘史等题材。',
    elements: ['历史考据', '朝堂权谋', '架空历史', '家族争权'],
    tips: '需掌握基本历史常识与礼仪制度；架空历史可自由发挥，正史背景则需严谨考据。',
  },
  {
    id: 'scifi', name: '科幻未来',
    gradient: 'from-blue-500 to-cyan-400',
    description: '以科技发展为驱动，构想未来世界或宇宙图景，涵盖赛博朋克、星际文明等子类。',
    elements: ['未来科技', '星际探索', '赛博朋克', 'AI与人性'],
    tips: '硬科幻需有扎实的科学基础；软科幻侧重人文思考。科技设定要有内在逻辑。',
  },
  {
    id: 'mystery', name: '悬疑推理',
    gradient: 'from-slate-600 to-gray-700',
    description: '以谜题、案件为核心，读者随主角抽丝剥茧，注重逻辑严密与反转设计。',
    elements: ['谜题案件', '逻辑推理', '氛围营造', '意外反转'],
    tips: '线索铺设要精心，反转要有据可查；前期埋伏笔，结局揭秘时读者需有"原来如此"的满足感。',
  },
  {
    id: 'wuxia', name: '武侠江湖',
    gradient: 'from-red-600 to-orange-500',
    description: '侠客行走江湖，快意恩仇，以内功招式为核心，江湖门派争斗贯穿全篇。',
    elements: ['内功招式', '江湖门派', '侠义精神', '恩怨情仇'],
    tips: '金庸式武侠重人文厚度，古龙式武侠重意境简练；武功描写要有画面感，切忌堆砌招式名称。',
  },
  {
    id: 'horror', name: '灵异恐怖',
    gradient: 'from-gray-800 to-purple-900',
    description: '以鬼怪、超自然现象营造恐怖氛围，常见克苏鲁、鬼屋探险、灵异事件等题材。',
    elements: ['恐怖氛围', '灵异事件', '克苏鲁风', '悬念叙事'],
    tips: '恐惧源于未知，描写时留白比直白更有效；节奏控制极为重要，张弛有度方能持续制造紧张感。',
  },
  {
    id: 'game', name: '游戏竞技',
    gradient: 'from-green-500 to-emerald-600',
    description: '以游戏世界或电竞赛场为背景，主角在虚拟/现实竞技中成长、夺冠。',
    elements: ['游戏机制', '职业联赛', '副本攻略', '段位晋升'],
    tips: '游戏机制需合理，对不熟悉游戏的读者也要能轻松理解；赛事节奏要爽，成长弧线清晰。',
  },
  {
    id: 'military', name: '军事战争',
    gradient: 'from-green-700 to-lime-600',
    description: '以战争、军旅生涯为背景，展现铁血情怀与家国大义，涵盖古代战争与现代军事。',
    elements: ['战术策略', '铁血热血', '军旅生涯', '家国情怀'],
    tips: '对军事知识有一定要求；战争场面描写要有宏观与微观结合，宏大叙事与个人命运交织。',
  },
  {
    id: 'sports', name: '体育竞技',
    gradient: 'from-yellow-500 to-orange-400',
    description: '以体育运动为核心，展现运动员拼搏精神与团队协作，赛事情节爽感十足。',
    elements: ['专业训练', '赛事比拼', '团队协作', '逆境突破'],
    tips: '需了解相应运动的基本规则和专业术语；人物成长弧线和团队羁绊是核心看点。',
  },
  {
    id: 'campus', name: '青春校园',
    gradient: 'from-sky-400 to-blue-400',
    description: '以学校生活为背景，书写青春纯爱、成长烦恼与友情羁绊，清新治愈。',
    elements: ['校园生活', '青春纯爱', '成长烦恼', '友情羁绊'],
    tips: '真实还原校园生活细节；情感处理要纯粹细腻，避免过度狗血，治愈与共鸣是核心。',
  },
  {
    id: 'apocalypse', name: '末世废土',
    gradient: 'from-stone-600 to-red-800',
    description: '文明崩溃后的世界，主角在丧尸、异变、资源匮乏的绝境中求生进化。',
    elements: ['丧尸异变', '物资争夺', '基地建设', '进化升级'],
    tips: '生存压迫感是核心；世界观规则要清晰，人性刻画在极端环境下更显张力。',
  },
  {
    id: 'rebirth', name: '重生穿越',
    gradient: 'from-violet-500 to-pink-500',
    description: '主角穿越异时空或重活一世，凭借先知优势与超凡能力逆袭改命。',
    elements: ['先知优势', '逆袭改命', '金手指', '改变命运'],
    tips: '主角的"先知"优势要合理运用；注意避免主角无脑碾压，保持适当的挑战与成长。',
  },
  {
    id: 'palace', name: '宫斗宅斗',
    gradient: 'from-red-500 to-pink-600',
    description: '以后宫或大宅为舞台，深宫权谋与内宅争斗，心机算计与情感纠葛并存。',
    elements: ['深宫权谋', '心机算计', '阵营争斗', '宅门规矩'],
    tips: '人物关系网要复杂而清晰；每一步棋都要有人物动机支撑，权谋需要缜密逻辑。',
  },
  {
    id: 'system', name: '系统流',
    gradient: 'from-indigo-500 to-purple-600',
    description: '主角获得神秘系统辅助，接受任务、获取奖励、不断升级，数值成长感极强。',
    elements: ['系统面板', '任务奖励', '数值成长', '属性升级'],
    tips: '系统设定要有趣且自洽；任务设计要有挑战性，奖励要让读者有期待感，避免金手指过强。',
  },
  {
    id: 'other', name: '其他题材',
    gradient: 'from-gray-400 to-gray-500',
    description: '不属于以上主流分类的创新题材，包括美食、种田、商业文等细分品类。',
    elements: ['种田生活', '美食治愈', '商业经营', '创新题材'],
    tips: '细分题材往往有固定读者群体；找准目标受众，深耕垂直领域，做出差异化是关键。',
  },
]

const tabs = [
  { key: 'genre'   as const, label: '题材类型', count: GENRE_LIST.length },
  { key: 'writing' as const, label: '写作风格', count: WRITING_PRESETS.length },
  { key: 'image'   as const, label: '画面风格', count: IMAGE_PRESETS.length },
  { key: 'video'   as const, label: '视频风格', count: VIDEO_PRESETS.length },
]

const currentPreset = computed(() => {
  if (activeTab.value === 'writing') return WRITING_PRESETS.find(p => p.id === selectedWriting.value) ?? null
  if (activeTab.value === 'image')   return IMAGE_PRESETS.find(p => p.id === selectedImage.value)     ?? null
  return VIDEO_PRESETS.find(p => p.id === selectedVideo.value) ?? null
})

function gradientStyle(colors: string[]): string {
  if (!colors?.length) return 'background: #e5e7eb'
  return `background: linear-gradient(135deg, ${colors.join(', ')})`
}

const selectedModel = computed({
  get() {
    if (activeTab.value === 'writing') return selectedWriting.value
    if (activeTab.value === 'image')   return selectedImage.value
    return selectedVideo.value
  },
  set(v: string) {
    if (activeTab.value === 'writing') selectedWriting.value = v
    else if (activeTab.value === 'image') selectedImage.value = v
    else selectedVideo.value = v
  },
})

const voiceLabel: Record<string, string> = {
  first_person: '第一人称',
  third_limited: '第三人称（有限）',
  third_omniscient: '第三人称（全知）',
}
const distanceLabel: Record<string, string> = {
  close: '近距离', medium: '中等', distant: '远距离',
}
const toneLabel: Record<string, string> = {
  warm: '温暖', neutral: '中性', cold: '冷静',
}
const complexityLabel: Record<string, string> = {
  simple: '简洁', moderate: '适中', complex: '复杂',
}
const densityLabel: Record<string, string> = {
  minimal: '简练', moderate: '适中', rich: '丰富',
}
const genreLabel: Record<string, string> = {
  xianxia: '仙侠修仙', fantasy: '玄幻奇幻', urban: '都市现代', romance: '言情爱情',
  historical: '历史古代', scifi: '科幻未来', mystery: '悬疑推理', wuxia: '武侠江湖',
  horror: '灵异恐怖', game: '游戏竞技', military: '军事战争', sports: '体育竞技',
  campus: '青春校园', apocalypse: '末世废土', rebirth: '重生穿越', palace: '宫斗宅斗',
  system: '系统流', other: '其他',
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">风格库</h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        浏览并选择适合你作品的写作风格、画面风格和视频风格
      </p>
    </div>

    <!-- Tabs -->
    <div class="border-b border-gray-200 dark:border-gray-700">
      <nav class="flex space-x-8">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2"
          :class="[
            activeTab === tab.key
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
          ]"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
          <span class="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500">{{ tab.count }}</span>
        </button>
      </nav>
    </div>

    <!-- Writing / Image / Video tabs: picker + detail panel -->
    <div v-if="activeTab !== 'genre'" class="grid gap-6 lg:grid-cols-[1fr_320px]">
      <!-- Preset Grid -->
      <div>
        <StylePicker :type="activeTab as 'writing' | 'image' | 'video'" v-model="selectedModel" />
      </div>

      <!-- Detail panel -->
      <div>
        <div v-if="currentPreset" class="card p-5 sticky top-24 space-y-4">
          <!-- Image preview -->
          <div
            v-if="activeTab === 'image'"
            class="h-28 rounded-lg"
            :style="gradientStyle((currentPreset as ImageStylePreset).preview_colors)"
          />
          <!-- Video preview -->
          <div
            v-else-if="activeTab === 'video'"
            class="h-28 rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center"
          >
            <div class="text-center text-white">
              <p class="text-2xl font-bold">{{ (currentPreset as VideoStylePreset).aspect_ratio }}</p>
              <p class="text-sm opacity-70">{{ (currentPreset as VideoStylePreset).frame_rate }} fps</p>
            </div>
          </div>
          <!-- Writing: icon -->
          <div
            v-else
            class="h-28 rounded-lg bg-gradient-to-br from-primary-500 to-violet-600 flex items-center justify-center"
          >
            <svg class="w-12 h-12 text-white opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>

          <h3 class="text-lg font-bold text-gray-900 dark:text-white">{{ currentPreset.name }}</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400">{{ currentPreset.description }}</p>

          <!-- Tags -->
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="tag in currentPreset.tags"
              :key="tag"
              class="text-xs px-2 py-1 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
            >
              {{ tag }}
            </span>
          </div>

          <!-- Writing style config details -->
          <template v-if="activeTab === 'writing'">
            <div class="space-y-2 border-t border-gray-100 dark:border-gray-700 pt-4">
              <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider">风格参数</h4>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <div class="bg-gray-50 dark:bg-gray-800 rounded p-2">
                  <p class="text-gray-400">叙述视角</p>
                  <p class="font-medium text-gray-800 dark:text-gray-200">{{ voiceLabel[(currentPreset as WritingStylePreset).config.narrative_voice] }}</p>
                </div>
                <div class="bg-gray-50 dark:bg-gray-800 rounded p-2">
                  <p class="text-gray-400">情感基调</p>
                  <p class="font-medium text-gray-800 dark:text-gray-200">{{ toneLabel[(currentPreset as WritingStylePreset).config.emotional_tone] }}</p>
                </div>
                <div class="bg-gray-50 dark:bg-gray-800 rounded p-2">
                  <p class="text-gray-400">句式风格</p>
                  <p class="font-medium text-gray-800 dark:text-gray-200">{{ complexityLabel[(currentPreset as WritingStylePreset).config.sentence_complexity] }}</p>
                </div>
                <div class="bg-gray-50 dark:bg-gray-800 rounded p-2">
                  <p class="text-gray-400">描写密度</p>
                  <p class="font-medium text-gray-800 dark:text-gray-200">{{ densityLabel[(currentPreset as WritingStylePreset).config.description_density] }}</p>
                </div>
                <div class="bg-gray-50 dark:bg-gray-800 rounded p-2">
                  <p class="text-gray-400">叙事距离</p>
                  <p class="font-medium text-gray-800 dark:text-gray-200">{{ distanceLabel[(currentPreset as WritingStylePreset).config.narrative_distance] }}</p>
                </div>
                <div class="bg-gray-50 dark:bg-gray-800 rounded p-2">
                  <p class="text-gray-400">对话比例</p>
                  <p class="font-medium text-gray-800 dark:text-gray-200">{{ Math.round((currentPreset as WritingStylePreset).config.dialogue_ratio * 100) }}%</p>
                </div>
              </div>
              <!-- Genre affinity -->
              <div v-if="(currentPreset as WritingStylePreset).genre_affinity?.length" class="col-span-2">
                <p class="text-xs text-gray-400 mb-1.5">适合题材</p>
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="g in (currentPreset as WritingStylePreset).genre_affinity"
                    :key="g"
                    class="text-xs px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300"
                  >{{ genreLabel[g] ?? g }}</span>
                </div>
              </div>
            </div>
          </template>

          <p class="text-xs text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-700">
            在小说设置页面选择此风格，将自动生成对应的 AI 提示词。
          </p>
        </div>

        <div v-else class="card p-8 text-center sticky top-24">
          <div class="w-16 h-16 mx-auto bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-3">
            <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
          </div>
          <p class="text-sm text-gray-500">点击左侧卡片预览风格详情</p>
        </div>
      </div>
    </div>

    <!-- Genre tab: full-width grid -->
    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="genre in GENRE_LIST"
        :key="genre.id"
        class="card overflow-hidden"
      >
        <!-- Gradient header -->
        <div :class="`h-14 bg-gradient-to-br ${genre.gradient} flex items-center px-4`">
          <h3 class="text-base font-bold text-white">{{ genre.name }}</h3>
        </div>
        <!-- Body -->
        <div class="p-4 space-y-3">
          <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{{ genre.description }}</p>
          <!-- Key elements -->
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="el in genre.elements"
              :key="el"
              class="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
            >{{ el }}</span>
          </div>
          <!-- Writing tips -->
          <div class="pt-2 border-t border-gray-100 dark:border-gray-700">
            <p class="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
              <span class="font-medium text-gray-500 dark:text-gray-400">创作提示：</span>{{ genre.tips }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
