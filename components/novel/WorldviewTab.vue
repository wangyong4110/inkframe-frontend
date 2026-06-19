<script setup lang="ts">
import type { Worldview } from '~/types'

const props = defineProps<{ novelId: number }>()

const toast = useToast()
const novelStore = useNovelStore()
const { guardAiProvider } = useAiProviderGuard()

const worldviewSections = computed(() => {
  if (!linkedWorldview.value) return []
  const wv = linkedWorldview.value
  return [
    { key: 'description', label: '概述', content: wv.description || '' },
    { key: 'magic_system', label: '修炼/魔法体系', content: wv.magic_system || '' },
    { key: 'rules', label: '世界规则', content: wv.rules || '' },
    { key: 'geography', label: '关键地点', content: wv.geography || '' },
    { key: 'history', label: '背景矛盾', content: wv.history || '' },
    { key: 'glossary', label: '术语词汇表', content: wv.glossary || '' },
  ].filter(s => !!s.content)
})

const novel = computed(() => novelStore.currentNovel)

const worldviewList = ref<{ id: number; name: string }[]>([])
const linkingWorldview = ref(false)
const generatingWorldview = ref(false)
const linkedWorldview = ref<Worldview | null>(null)
const linkedWorldviewLoading = ref(false)

async function fetchLinkedWorldview(wvId: number) {
  linkedWorldviewLoading.value = true
  try {
    const resp = await useWorldviewApi().getWorldview(wvId)
    linkedWorldview.value = resp.data?.id ? resp.data : null
  } catch {
    linkedWorldview.value = null
  } finally {
    linkedWorldviewLoading.value = false
  }
}

async function loadWorldviewList() {
  try {
    const wvResp = await useWorldviewApi().getWorldviews({ page_size: 100 })
    worldviewList.value = ((wvResp as any).data?.items ?? []).map((w: Worldview) => ({ id: w.id, name: w.name }))
  } catch { /* non-critical */ }
}

onMounted(() => {
  loadWorldviewList()
})

watch(() => novel.value?.worldview_id, (id) => {
  if (id) {
    fetchLinkedWorldview(id)
  } else {
    linkedWorldview.value = null
  }
}, { immediate: true })

async function handleGenerateWorldview() {
  if (!await guardAiProvider('LLM')) return
  if (!novel.value || generatingWorldview.value) return
  generatingWorldview.value = true
  try {
    const worldviewApi = useWorldviewApi()
    const resp = await worldviewApi.generateWorldview({ novel_id: props.novelId, genre: novel.value.genre || 'fantasy' })
    const newWv = (resp as any).data as Worldview
    // 直接更新本地 linkedWorldview，无需等待 watch 重新 fetch
    linkedWorldview.value = newWv
    await novelStore.updateNovel(props.novelId, { worldview_id: newWv.id })
    loadWorldviewList()
    toast.success('AI 世界观生成成功')
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || ''))
  } finally {
    generatingWorldview.value = false
  }
}

async function linkWorldview(worldviewId: number | null) {
  linkingWorldview.value = true
  try {
    await novelStore.updateNovel(props.novelId, { worldview_id: worldviewId ?? 0 })
    toast.success(worldviewId ? '世界观已关联' : '世界观已解除关联')
  } catch (e: any) {
    toast.error('操作失败：' + (e.message || ''))
  } finally {
    linkingWorldview.value = false
  }
}
</script>

<template>
  <div class="space-y-4">

    <!-- 已关联世界观 Header -->
    <div v-if="linkedWorldview || linkedWorldviewLoading" class="card p-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <div class="w-9 h-9 bg-primary-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945" />
            </svg>
          </div>
          <div>
            <p class="text-sm font-semibold text-gray-900 dark:text-white">
              {{ linkedWorldview?.name || worldviewList.find(w => w.id === novel?.worldview_id)?.name || `世界观 #${novel.worldview_id}` }}
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400">已关联</p>
          </div>
        </div>
        <div class="flex items-center space-x-2">
          <button
            class="btn-primary text-sm flex items-center gap-1.5"
            :disabled="generatingWorldview"
            @click="handleGenerateWorldview"
          >
            <svg v-if="generatingWorldview" class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{{ generatingWorldview ? 'AI 生成中...' : 'AI 更新' }}</span>
          </button>
          <NuxtLink :to="`/worldview/${novel.worldview_id}`" class="btn-outline text-sm">编辑</NuxtLink>
          <button class="btn-ghost text-sm text-red-500 hover:text-red-600" :disabled="linkingWorldview" @click="linkWorldview(null)">解除</button>
        </div>
      </div>
    </div>

    <!-- 世界观内容摘要 -->
    <template v-if="linkedWorldview || linkedWorldviewLoading">
      <!-- Loading -->
      <div v-if="linkedWorldviewLoading" class="card p-6 space-y-3">
        <div class="skeleton h-4 w-3/4"></div>
        <div class="skeleton h-4 w-full"></div>
        <div class="skeleton h-4 w-2/3"></div>
      </div>

      <template v-else-if="linkedWorldview">
        <!-- Sections -->
        <div v-if="worldviewSections.length === 0" class="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
          暂无内容
        </div>
        <div v-else>
          <!-- 概述 (first section, full width) -->
          <div v-if="worldviewSections[0]?.key === 'description'" class="card p-4 mb-4">
            <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">概述</h4>
            <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-4">{{ worldviewSections[0].content }}</p>
          </div>

          <!-- 核心设定 2列 -->
          <div class="grid gap-4 md:grid-cols-2">
            <div
              v-for="section in worldviewSections.filter(s => s.key !== 'description')"
              :key="section.key"
              class="card p-4"
            >
              <h4 class="text-xs font-semibold uppercase tracking-wider mb-2"
                :class="{
                  'text-purple-600 dark:text-purple-400': section.key === 'magic_system',
                  'text-red-600 dark:text-red-400': section.key === 'rules',
                  'text-green-600 dark:text-green-400': section.key === 'geography',
                  'text-amber-600 dark:text-amber-400': section.key === 'history',
                  'text-teal-600 dark:text-teal-400': section.key === 'glossary',
                }"
              >{{ section.label }}</h4>
              <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-5">{{ section.content }}</p>
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- 未关联时：AI 生成 + 选择器 -->
    <div v-else class="space-y-3">
      <!-- AI 生成 -->
      <div class="card p-5">
        <div class="flex items-start gap-4">
          <div class="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center flex-shrink-0">
            <svg class="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-gray-900 dark:text-white mb-0.5">AI 生成世界观</p>
            <p class="text-xs text-gray-500 dark:text-gray-400">根据小说类型与大纲，自动生成修炼体系、关键地点、背景矛盾等完整世界设定</p>
          </div>
          <button
            class="btn-primary text-sm flex items-center gap-1.5 flex-shrink-0"
            :disabled="generatingWorldview"
            @click="handleGenerateWorldview"
          >
            <svg v-if="generatingWorldview" class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>{{ generatingWorldview ? 'AI 生成中...' : 'AI 生成' }}</span>
          </button>
        </div>
      </div>

      <!-- 分隔线 -->
      <div class="flex items-center gap-3 px-1">
        <div class="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
        <span class="text-xs text-gray-400 dark:text-gray-500">或关联已有世界观</span>
        <div class="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
      </div>

      <!-- 已有世界观选择器 -->
      <div class="card p-4">
        <select
          class="input w-full"
          value=""
          :disabled="linkingWorldview"
          @change="(e) => { const v = parseInt((e.target as HTMLSelectElement).value); if (v) linkWorldview(v) }"
        >
          <option value="">— 选择世界观 —</option>
          <option v-for="wv in worldviewList" :key="wv.id" :value="wv.id">{{ wv.name }}</option>
        </select>
      </div>
    </div>
  </div>
</template>
