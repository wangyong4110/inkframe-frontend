<script setup lang="ts">
import type { Asset, AssetSearchParams } from '~/types'

definePageMeta({ auth: true })

const assetApi = useAssetApi()
const toast = useToast()

// ─── State ────────────────────────────────────────────────────────────────────

const activeScope = ref<'personal' | 'public'>('personal')
const assets = ref<Asset[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const pageSize = 24

// Filters
const searchQ = ref('')
const filterType = ref('')
const filterSource = ref('')
const filterStatus = ref('')
const sortBy = ref('created_at')

// Upload dialog
const showUpload = ref(false)
const uploadFile = ref<File | null>(null)
const uploadTitle = ref('')
const uploading = ref(false)

// Selected assets (for batch ops)
const selected = ref<Set<number>>(new Set())

// ─── Load ─────────────────────────────────────────────────────────────────────

async function load() {
  loading.value = true
  try {
    const params: AssetSearchParams = {
      scope: activeScope.value,
      page: page.value,
      page_size: pageSize,
      sort: sortBy.value,
    }
    if (searchQ.value) params.q = searchQ.value
    if (filterType.value) params.type = filterType.value
    if (filterSource.value) params.source = filterSource.value
    if (filterStatus.value) params.status = filterStatus.value

    const res = await assetApi.searchAssets(params)
    assets.value = res?.data?.items ?? []
    total.value = res?.data?.total ?? 0
  } catch (e: any) {
    toast.error('加载失败：' + (e.message || ''))
  } finally {
    loading.value = false
  }
}

const totalPages = computed(() => Math.ceil(total.value / pageSize))

watch([activeScope, page, filterType, filterSource, filterStatus, sortBy], load)
onMounted(load)

// Debounced search
let searchTimer: ReturnType<typeof setTimeout>
watch(searchQ, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { page.value = 1; load() }, 400)
})

// ─── Upload ───────────────────────────────────────────────────────────────────

function onFileChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) {
    uploadFile.value = f
    if (!uploadTitle.value) uploadTitle.value = f.name.replace(/\.[^.]+$/, '')
  }
}

async function doUpload() {
  if (!uploadFile.value) return
  uploading.value = true
  try {
    await assetApi.uploadAsset(uploadFile.value, {
      title: uploadTitle.value || uploadFile.value.name,
      type: 'image',
    })
    toast.success('上传成功')
    showUpload.value = false
    uploadFile.value = null
    uploadTitle.value = ''
    page.value = 1
    await load()
  } catch (e: any) {
    toast.error('上传失败：' + (e.message || ''))
  } finally {
    uploading.value = false
  }
}

// ─── Share Workflow ───────────────────────────────────────────────────────────

async function requestShare(asset: Asset) {
  try {
    await assetApi.requestShare(asset.id)
    toast.success('已申请共享，正在自动审核...')
    await load()
  } catch (e: any) {
    toast.error('申请失败：' + (e.message || ''))
  }
}

async function withdrawShare(asset: Asset) {
  if (!confirm('确认撤回共享？素材将退出公共素材库')) return
  try {
    await assetApi.withdrawShare(asset.id)
    toast.success('已撤回共享')
    await load()
  } catch (e: any) {
    toast.error('操作失败：' + (e.message || ''))
  }
}

async function deleteAsset(asset: Asset) {
  if (!confirm(`确认删除"${asset.title}"？将移入回收站`)) return
  try {
    await assetApi.softDeleteAsset(asset.id)
    toast.success('已移入回收站')
    await load()
  } catch (e: any) {
    toast.error('删除失败：' + (e.message || ''))
  }
}

// ─── Batch ────────────────────────────────────────────────────────────────────

function toggleSelect(id: number) {
  const s = new Set(selected.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selected.value = s
}

async function batchDelete() {
  if (!selected.value.size || !confirm(`确认删除选中的 ${selected.value.size} 个素材？`)) return
  await assetApi.batchDelete([...selected.value])
  selected.value = new Set()
  toast.success('已批量删除')
  await load()
}

async function batchShare() {
  if (!selected.value.size) return
  const res = await assetApi.batchShareRequest([...selected.value])
  const r = res?.data
  toast.success(`已提交 ${r?.submitted ?? 0} 个，失败 ${r?.failed ?? 0} 个`)
  selected.value = new Set()
  await load()
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(asset: Asset) {
  if (asset.scope === 'public') return { text: '已共享', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' }
  switch (asset.status) {
    case 'pending_review': return { text: '审核中', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' }
    case 'rejected': return { text: '已拒绝', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
    case 'withdrawn': return { text: '已撤回', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' }
    default: return null
  }
}

function formatSize(bytes?: number) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">素材库</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">管理个人素材，探索公共素材库</p>
      </div>
      <div class="flex items-center gap-3">
        <NuxtLink to="/assets/crawl" class="text-sm text-blue-600 dark:text-blue-400 hover:underline">爬取管理</NuxtLink>
        <button
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          @click="showUpload = true"
        >上传素材</button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
      <button
        v-for="tab in [{ key: 'personal', label: '个人素材库' }, { key: 'public', label: '公共素材库' }]"
        :key="tab.key"
        class="px-5 py-1.5 rounded-md text-sm font-medium transition-colors"
        :class="activeScope === tab.key
          ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
        @click="activeScope = tab.key as any; page = 1; selected = new Set()"
      >{{ tab.label }}</button>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap gap-3 items-center">
      <input
        v-model="searchQ"
        type="text"
        placeholder="搜索素材..."
        class="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
      />
      <select
        v-model="filterType"
        class="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none"
      >
        <option value="">全部类型</option>
        <option value="image">图片</option>
        <option value="video">视频</option>
        <option value="audio">音频</option>
        <option value="text">文本</option>
      </select>
      <select
        v-if="activeScope === 'personal'"
        v-model="filterSource"
        class="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none"
      >
        <option value="">全部来源</option>
        <option value="platform">平台生成</option>
        <option value="uploaded">我上传</option>
      </select>
      <select
        v-model="sortBy"
        class="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none"
      >
        <option value="created_at">最新</option>
        <option v-if="activeScope === 'public'" value="use_count">最多使用</option>
        <option v-if="activeScope === 'public'" value="like_count">最多点赞</option>
        <option v-if="activeScope === 'public'" value="value_score">价值分</option>
      </select>
    </div>

    <!-- Batch action bar -->
    <Transition name="slide-up">
      <div
        v-if="selected.size > 0"
        class="flex items-center gap-4 px-4 py-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-xl"
      >
        <span class="text-sm text-blue-700 dark:text-blue-300 font-medium">已选 {{ selected.size }} 个</span>
        <button class="text-sm text-blue-600 dark:text-blue-400 hover:underline" @click="batchShare">申请共享到公共库</button>
        <button class="text-sm text-red-600 dark:text-red-400 hover:underline" @click="batchDelete">批量删除</button>
        <button class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 ml-auto" @click="selected = new Set()">取消选择</button>
      </div>
    </Transition>

    <!-- Loading -->
    <div v-if="loading && !assets.length" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
      <div v-for="i in 12" :key="i" class="aspect-square rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse" />
    </div>

    <!-- Empty -->
    <div v-else-if="!loading && !assets.length" class="text-center py-20 text-gray-400">
      <svg class="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <p>{{ activeScope === 'personal' ? '还没有素材，点击上传或平台自动生成后入库' : '公共素材库暂无内容' }}</p>
    </div>

    <!-- Grid -->
    <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
      <div
        v-for="asset in assets"
        :key="asset.id"
        class="relative group rounded-xl overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow cursor-pointer"
        :class="{ 'ring-2 ring-blue-500': selected.has(asset.id) }"
      >
        <!-- Checkbox (personal only) -->
        <div
          v-if="activeScope === 'personal'"
          class="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
          :class="{ 'opacity-100': selected.has(asset.id) }"
        >
          <input
            type="checkbox"
            :checked="selected.has(asset.id)"
            class="w-4 h-4 rounded"
            @change.stop="toggleSelect(asset.id)"
          />
        </div>

        <!-- Status badge -->
        <div
          v-if="statusBadge(asset)"
          class="absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded text-xs font-medium"
          :class="statusBadge(asset)!.cls"
        >{{ statusBadge(asset)!.text }}</div>

        <!-- Thumbnail -->
        <NuxtLink :to="`/assets/${asset.id}`">
          <div class="aspect-square bg-gray-100 dark:bg-gray-700">
            <img
              v-if="asset.thumbnail_url || asset.storage_url"
              :src="asset.thumbnail_url || asset.storage_url"
              :alt="asset.title"
              class="w-full h-full object-cover"
            />
            <div v-else class="w-full h-full flex items-center justify-center text-3xl">
              {{ asset.type === 'video' ? '🎬' : asset.type === 'audio' ? '🎵' : '📄' }}
            </div>
          </div>
        </NuxtLink>

        <!-- Info -->
        <div class="p-2">
          <p class="text-xs font-medium text-gray-900 dark:text-white truncate">{{ asset.title }}</p>
          <div class="flex items-center justify-between mt-1">
            <span class="text-xs text-gray-400 dark:text-gray-500">{{ formatSize(asset.file_size) }}</span>
            <!-- Actions -->
            <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <template v-if="activeScope === 'personal'">
                <button
                  v-if="asset.scope === 'personal' && asset.status === 'active'"
                  class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  @click.stop="requestShare(asset)"
                >共享</button>
                <button
                  v-else-if="asset.scope === 'public'"
                  class="text-xs text-orange-500 hover:underline"
                  @click.stop="withdrawShare(asset)"
                >撤回</button>
                <button
                  class="text-xs text-red-500 hover:underline"
                  @click.stop="deleteAsset(asset)"
                >删除</button>
              </template>
              <template v-else>
                <span class="flex items-center gap-0.5 text-xs text-gray-400">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                  {{ asset.like_count }}
                </span>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-center gap-2">
      <button
        :disabled="page <= 1"
        class="px-3 py-1.5 rounded-lg text-sm border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800"
        @click="page--"
      >上一页</button>
      <span class="text-sm text-gray-500 dark:text-gray-400">{{ page }} / {{ totalPages }}</span>
      <button
        :disabled="page >= totalPages"
        class="px-3 py-1.5 rounded-lg text-sm border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800"
        @click="page++"
      >下一页</button>
    </div>

    <!-- Upload Dialog -->
    <div v-if="showUpload" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="showUpload = false">
      <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md mx-4 space-y-4 shadow-xl">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">上传素材</h3>

        <div
          class="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
          @click="($refs.fileInput as HTMLInputElement)?.click()"
        >
          <input ref="fileInput" type="file" class="hidden" accept="image/*,video/*,audio/*" @change="onFileChange" />
          <p v-if="!uploadFile" class="text-gray-500 dark:text-gray-400 text-sm">点击或拖拽文件到此处</p>
          <p v-else class="text-gray-700 dark:text-gray-300 text-sm font-medium">{{ uploadFile.name }}</p>
        </div>

        <input
          v-model="uploadTitle"
          type="text"
          placeholder="素材标题"
          class="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div class="flex gap-3 justify-end">
          <button
            class="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            @click="showUpload = false"
          >取消</button>
          <button
            :disabled="!uploadFile || uploading"
            class="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors"
            @click="doUpload"
          >{{ uploading ? '上传中...' : '确认上传' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
