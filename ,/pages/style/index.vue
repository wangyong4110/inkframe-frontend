<script setup lang="ts">
import { WRITING_PRESETS, IMAGE_PRESETS, VIDEO_PRESETS } from '~/composables/useStylePresets'
import type { WritingStylePreset, ImageStylePreset, VideoStylePreset } from '~/types'

const activeTab = ref<'writing' | 'image' | 'video'>('writing')
const selectedWriting = ref('')
const selectedImage = ref('')
const selectedVideo = ref('')

const tabs = [
  { key: 'writing' as const, label: '写作风格', count: WRITING_PRESETS.length },
  { key: 'image'   as const, label: '图片风格', count: IMAGE_PRESETS.length },
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
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">风格库</h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        浏览并选择适合你作品的写作风格、图片风格和视频风格
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

    <div class="grid gap-6 lg:grid-cols-[1fr_320px]">
      <!-- Preset Grid -->
      <div>
        <StylePicker :type="activeTab" v-model="selectedModel" />
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
              <div v-if="(currentPreset as WritingStylePreset).genre_affinity?.length">
                <p class="text-xs text-gray-400 mt-2">适合题材：
                  <span
                    v-for="g in (currentPreset as WritingStylePreset).genre_affinity"
                    :key="g"
                    class="ml-1 text-gray-600 dark:text-gray-300"
                  >{{ g }}</span>
                </p>
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
  </div>
</template>
