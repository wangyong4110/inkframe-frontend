<script setup lang="ts">
import type { Worldview } from '~/types'

const props = defineProps<{ novelId: number }>()

const toast = useToast()
const novelStore = useNovelStore()

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
    linkedWorldview.value = resp.data
  } catch { /* ignore */ } finally {
    linkedWorldviewLoading.value = false
  }
}

async function loadWorldviewList() {
  try {
    const wvResp = await useWorldviewApi().getWorldviews({ page_size: 100 })
    worldviewList.value = ((wvResp as any).data?.items ?? []).map((w: Worldview) => ({ id: w.id, name: w.name }))
  } catch { /* non-critical */ }
}

onMounted(async () => {
  await loadWorldviewList()
  if (novel.value?.worldview_id) {
    fetchLinkedWorldview(novel.value.worldview_id)
  }
})

watch(() => novel.value?.worldview_id, (id) => {
  if (id) {
    fetchLinkedWorldview(id)
  } else {
    linkedWorldview.value = null
  }
})

async function handleGenerateWorldview() {
  if (!novel.value || generatingWorldview.value) return
  generatingWorldview.value = true
  try {
    const worldviewApi = useWorldviewApi()
    const resp = await worldviewApi.generateWorldview({ novel_id: props.novelId, genre: novel.value.genre || 'fantasy' })
    const newWv = (resp as any).data as Worldview
    await novelStore.updateNovel(props.novelId, { worldview_id: newWv.id })
    const wvResp = await worldviewApi.getWorldviews({ page_size: 100 })
    worldviewList.value = ((wvResp as any).data?.items ?? []).map((w: Worldview) => ({ id: w.id, name: w.name }))
    toast.success(novel.value.worldview_id ? '世界观已 AI 更新' : 'AI 世界观生成成功')
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || ''))
  } finally {
    generatingWorldview.value = false
  }
}

async function linkWorldview(worldviewId: number | null) {
  linkingWorldview.value = true
  try {
    await novelStore.updateNovel(props.novelId, { worldview_id: worldviewId ?? undefined })
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
    <div v-if="novel?.worldview_id" class="card p-4">
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
    <template v-if="novel?.worldview_id">
      <!-- Loading -->
      <div v-if="linkedWorldviewLoading" class="card p-6 space-y-3">
        <div class="skeleton h-4 w-3/4"></div>
        <div class="skeleton h-4 w-full"></div>
        <div class="skeleton h-4 w-2/3"></div>
      </div>

      <template v-else-if="linkedWorldview">
        <!-- 概述 -->
        <div v-if="linkedWorldview.description" class="card p-4">
          <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">概述</h4>
          <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-4">{{ linkedWorldview.description }}</p>
        </div>

        <!-- 核心设定 2列 -->
        <div class="grid gap-4 md:grid-cols-2">
          <div v-if="linkedWorldview.magic_system" class="card p-4">
            <h4 class="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-2">修炼/魔法体系</h4>
            <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-5">{{ linkedWorldview.magic_system }}</p>
          </div>
          <div v-if="linkedWorldview.geography" class="card p-4">
            <h4 class="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider mb-2">地理环境</h4>
            <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-5">{{ linkedWorldview.geography }}</p>
          </div>
          <div v-if="linkedWorldview.history" class="card p-4">
            <h4 class="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">历史背景</h4>
            <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-5">{{ linkedWorldview.history }}</p>
          </div>
          <div v-if="linkedWorldview.culture" class="card p-4">
            <h4 class="text-xs font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider mb-2">文化风俗</h4>
            <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-5">{{ linkedWorldview.culture }}</p>
          </div>
          <div v-if="linkedWorldview.technology" class="card p-4">
            <h4 class="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-2">科技水平</h4>
            <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-5">{{ linkedWorldview.technology }}</p>
          </div>
          <div v-if="linkedWorldview.rules" class="card p-4">
            <h4 class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">世界规则</h4>
            <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-5">{{ linkedWorldview.rules }}</p>
          </div>
        </div>
      </template>
    </template>

    <!-- 控制区（关联/新建） -->
    <div class="card p-4 space-y-4">
      <div>
        <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          {{ novel?.worldview_id ? '更换世界观' : '关联已有世界观' }}
        </h4>
        <select
          id="worldview-select"
          class="input w-full"
          :value="novel?.worldview_id ?? ''"
          @change="(e) => { const v = parseInt((e.target as HTMLSelectElement).value); if (v) linkWorldview(v) }"
        >
          <option value="">— 选择世界观 —</option>
          <option v-for="wv in worldviewList" :key="wv.id" :value="wv.id">{{ wv.name }}</option>
        </select>
      </div>

      <div class="flex items-center gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
        <button
          class="btn-primary text-sm flex items-center gap-1.5"
          :disabled="generatingWorldview"
          @click="handleGenerateWorldview"
        >
          <svg v-if="generatingWorldview" class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {{ generatingWorldview ? 'AI 生成中...' : 'AI 生成世界观' }}
        </button>
        <NuxtLink :to="`/worldview/create?novel_id=${novelId}`" class="btn-outline text-sm flex items-center">
          <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          手动新建
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
