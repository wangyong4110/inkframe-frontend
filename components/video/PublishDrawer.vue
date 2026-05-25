<script setup lang="ts">
import type { PlatformAccount } from '~/types'

const props = defineProps<{
  videoId: number
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
  (e: 'published'): void
}>()

const videoStore = useVideoStore()
const toast = useToast()

const video = computed(() => videoStore.currentVideo)

const publishVisibility = ref<'private' | 'unlisted' | 'public'>('public')
const publishing = ref(false)
const publishingExternal = ref(false)
const selectedAccountIds = ref<number[]>([])
const publishExtTitle = ref('')
const publishExtDesc = ref('')
const publishExtTags = ref('')
const platformAccounts = ref<PlatformAccount[]>([])
const loadingAccounts = ref(false)

watch(() => props.open, async (isOpen) => {
  if (!isOpen) return
  publishExtTitle.value = video.value?.title ?? ''
  if (platformAccounts.value.length === 0) {
    loadingAccounts.value = true
    try {
      const platformApi = usePlatformApi()
      const res = await platformApi.listAccounts()
      platformAccounts.value = res?.data ?? []
    } catch {
      // ignore
    } finally {
      loadingAccounts.value = false
    }
  }
})

async function handlePublish() {
  publishing.value = true
  try {
    const api = useVideoApi()
    await api.publishVideo(props.videoId, { visibility: publishVisibility.value })
    toast.success('发布成功')
    await videoStore.fetchVideo(props.videoId)
    emit('published')
  } catch (e: any) {
    toast.error('发布失败：' + (e.message || ''))
  } finally {
    publishing.value = false
  }
}

async function handleUnpublish() {
  publishing.value = true
  try {
    const api = useVideoApi()
    await api.unpublishVideo(props.videoId)
    toast.success('已取消发布')
    await videoStore.fetchVideo(props.videoId)
    emit('published')
  } catch (e: any) {
    toast.error('操作失败：' + (e.message || ''))
  } finally {
    publishing.value = false
  }
}

async function handlePublishExternal() {
  if (!selectedAccountIds.value.length) {
    toast.error('请选择至少一个平台账号')
    return
  }
  publishingExternal.value = true
  try {
    const api = useVideoApi()
    const tags = publishExtTags.value.split(/[,，\s]+/).filter(Boolean)
    await api.publishExternal(props.videoId, {
      account_ids: selectedAccountIds.value,
      title: publishExtTitle.value || video.value?.title,
      description: publishExtDesc.value,
      tags,
      is_public: true,
    })
    toast.success('外部平台发布任务已提交')
  } catch (e: any) {
    toast.error('发布失败：' + (e.message || ''))
  } finally {
    publishingExternal.value = false
  }
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
    @click.self="emit('update:open', false)"
  >
    <div class="bg-white dark:bg-gray-900 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-semibold text-gray-900 dark:text-white">发布视频</h3>
        <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" @click="emit('update:open', false)">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <!-- Station publish -->
      <div class="space-y-2">
        <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">站内发布</p>
        <div class="flex gap-2">
          <button
            v-for="opt in [{ value: 'public', label: '公开' }, { value: 'unlisted', label: '不公开' }, { value: 'private', label: '私密' }]"
            :key="opt.value"
            class="flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors"
            :class="publishVisibility === opt.value
              ? 'bg-blue-600 border-blue-600 text-white'
              : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'"
            @click="publishVisibility = opt.value as typeof publishVisibility"
          >
            {{ opt.label }}
          </button>
        </div>
        <div class="flex gap-2">
          <button
            v-if="!video?.is_published"
            :disabled="publishing"
            class="flex-1 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors"
            @click="handlePublish"
          >
            {{ publishing ? '发布中...' : '确认发布' }}
          </button>
          <button
            v-else
            :disabled="publishing"
            class="flex-1 py-2 rounded-lg text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 text-gray-700 dark:text-gray-300 transition-colors"
            @click="handleUnpublish"
          >
            {{ publishing ? '处理中...' : '取消发布' }}
          </button>
        </div>
        <p v-if="video?.is_published" class="text-xs text-green-600 dark:text-green-400">已发布（{{ video.visibility }}）</p>
      </div>

      <!-- External platforms -->
      <div class="space-y-2 border-t border-gray-100 dark:border-gray-800 pt-3">
        <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">外部平台</p>
        <div v-if="loadingAccounts" class="text-xs text-gray-400 text-center py-2">加载中...</div>
        <div v-else-if="platformAccounts.length === 0" class="text-xs text-gray-400 text-center py-3">
          暂无绑定账号，<NuxtLink to="/platform/accounts" class="text-blue-500 hover:underline" @click="emit('update:open', false)">前往绑定</NuxtLink>
        </div>
        <div v-else class="space-y-1">
          <label
            v-for="acc in platformAccounts"
            :key="acc.id"
            class="flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <input
              type="checkbox"
              class="rounded text-blue-600"
              :value="acc.id"
              v-model="selectedAccountIds"
            />
            <span class="flex-1 text-sm text-gray-700 dark:text-gray-300">{{ acc.platform }} · {{ acc.account_name }}</span>
            <span
              class="text-xs px-1.5 py-0.5 rounded"
              :class="acc.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'"
            >{{ acc.status === 'active' ? '有效' : acc.status }}</span>
          </label>
        </div>
        <div v-if="platformAccounts.length > 0" class="space-y-1.5">
          <input
            v-model="publishExtTitle"
            placeholder="标题（留空使用视频标题）"
            class="w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400"
          />
          <input
            v-model="publishExtDesc"
            placeholder="简介（可选）"
            class="w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400"
          />
          <input
            v-model="publishExtTags"
            placeholder="标签（逗号分隔，可选）"
            class="w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400"
          />
          <button
            :disabled="publishingExternal || !selectedAccountIds.length"
            class="w-full py-2 rounded-lg text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white transition-colors"
            @click="handlePublishExternal"
          >
            {{ publishingExternal ? '提交中...' : '一键发布到选中平台' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
