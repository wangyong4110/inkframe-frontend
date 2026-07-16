<script setup lang="ts">
import type { Asset, AssetSearchParams } from '~/types'
// NuxtLink 的自动导入只对模板里直接写 <NuxtLink> 标签生效，:is="... : NuxtLink" 这种
// 动态组件绑定需要把它当成真正的 JS 变量引用，必须显式 import，否则求值为 undefined。
import { NuxtLink } from '#components'

definePageMeta({ auth: true })

const assetApi = useAssetApi()
const toast = useToast()
const route = useRoute()
const router = useRouter()

// ─── State ────────────────────────────────────────────────────────────────────

// Type filter chips (defined early so URL init can use it)
const typeFilters = [
  { key: 'image', label: '图片', type: 'image', subType: '' },
  { key: 'video', label: '视频', type: 'video', subType: '' },
  { key: 'sfx',   label: '音效', type: 'audio', subType: 'sfx' },
  { key: 'music', label: '音乐', type: 'audio', subType: 'bgm' },
]

// Initialize from URL query params so the page is shareable / bookmarkable.
const _initScope = route.query.scope === 'public' ? 'public' : 'personal'
const _initTypeKey = String(route.query.type || 'image')
const _initFilter = typeFilters.find(f => f.key === _initTypeKey) ?? typeFilters[0]

const activeScope = ref<'personal' | 'public'>(_initScope)
const assets = ref<Asset[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const pageSize = 24

// Filters
const searchQ = ref('')
const filterType = ref(_initFilter.type)
const filterSubType = ref(_initFilter.subType)
const filterSource = ref('')
const sortBy = ref('created_at')

// Playback
const playingAsset = ref<Asset | null>(null)

// Upload dialog
const showUpload = ref(false)
const uploadFile = ref<File | null>(null)
const uploadPreviewUrl = ref('')
const uploadTitle = ref('')
const uploading = ref(false)

const activeFilterKey = computed(() =>
  typeFilters.find(f => f.type === filterType.value && f.subType === filterSubType.value)?.key ?? ''
)

// 当前 type chip 对应的文件 accept 和素材类型
const uploadAccept = computed(() => {
  switch (activeFilterKey.value) {
    case 'image': return 'image/*'
    case 'video': return 'video/*'
    case 'sfx':
    case 'music': return 'audio/*'
    default: return 'image/*,video/*,audio/*'
  }
})
const uploadTypeLabel = computed(() => {
  switch (activeFilterKey.value) {
    case 'image': return '图片'
    case 'video': return '视频'
    case 'sfx':   return '音效'
    case 'music': return '音乐'
    default: return '素材'
  }
})

function setTypeFilter(f: typeof typeFilters[number]) {
  // 素材类型必须始终有且只有一个选中，再次点击当前已选中的按钮不做任何事（不能取消选中）。
  if (activeFilterKey.value === f.key) return
  filterType.value = f.type
  filterSubType.value = f.subType
  page.value = 1
}

// ─── Batch selection ──────────────────────────────────────────────────────────

const selected = ref<Set<number>>(new Set())
const selectMode = ref(false)

const allSelected = computed(() =>
  assets.value.length > 0 && assets.value.every(a => selected.value.has(a.id))
)
const anySelected = computed(() => selected.value.size > 0)
const indeterminate = computed(() => anySelected.value && !allSelected.value)

// sync indeterminate DOM property (not an HTML attribute)
const selectAllRef = ref<HTMLInputElement | null>(null)
watchEffect(() => {
  if (selectAllRef.value) selectAllRef.value.indeterminate = indeterminate.value
})

function toggleSelectMode() {
  selectMode.value = !selectMode.value
  if (!selectMode.value) selected.value = new Set()
}

function toggleSelect(id: number) {
  const s = new Set(selected.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selected.value = s
}

function toggleSelectAll() {
  selected.value = allSelected.value ? new Set() : new Set(assets.value.map(a => a.id))
}

function handleCardClick(asset: Asset) {
  if (selectMode.value && activeScope.value === 'personal') toggleSelect(asset.id)
}

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
    if (searchQ.value)       params.q        = searchQ.value
    if (filterType.value)    params.type     = filterType.value
    if (filterSubType.value) params.sub_type = filterSubType.value
    if (filterSource.value)  params.source   = filterSource.value

    const res = await assetApi.searchAssets(params)
    assets.value = res?.data?.items ?? []
    total.value  = res?.data?.total ?? 0
  } catch (e: any) {
    toast.error('加载失败：' + (e.message || ''))
  } finally {
    loading.value = false
  }
}

const totalPages = computed(() => Math.ceil(total.value / pageSize))

watch([activeScope, page, filterType, filterSubType, filterSource, sortBy], load)
onMounted(load)

// Sync scope + type filter to URL so the page is bookmarkable.
watch([activeScope, activeFilterKey], ([scope, typeKey]) => {
  router.replace({ query: { scope, type: typeKey || undefined } })
})

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
    if (uploadPreviewUrl.value) URL.revokeObjectURL(uploadPreviewUrl.value)
    uploadPreviewUrl.value = (f.type.startsWith('image/') || f.type.startsWith('video/'))
      ? URL.createObjectURL(f)
      : ''
  }
}

async function doUpload() {
  if (!uploadFile.value) return
  uploading.value = true
  try {
    const mime = uploadFile.value.type
    const type = mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'image'
    const subType = filterSubType.value || undefined
    await assetApi.uploadAsset(uploadFile.value, {
      title: uploadTitle.value || uploadFile.value.name,
      type,
      sub_type: subType,
    })
    toast.success('上传成功')
    closeUploadDialog()
    page.value = 1
    load()
  } catch (e: any) {
    toast.error('上传失败：' + (e.message || ''))
  } finally {
    uploading.value = false
  }
}

function closeUploadDialog() {
  if (uploadPreviewUrl.value) URL.revokeObjectURL(uploadPreviewUrl.value)
  uploadPreviewUrl.value = ''
  showUpload.value  = false
  uploadFile.value  = null
  uploadTitle.value = ''
}

// ─── Single asset actions ─────────────────────────────────────────────────────

async function requestShare(asset: Asset) {
  try {
    await assetApi.requestShare(asset.id)
    toast.success('已申请共享，正在自动审核...')
    await load()
  } catch (e: any) { toast.error('申请失败：' + (e.message || '')) }
}

async function withdrawShare(asset: Asset) {
  if (!confirm('确认撤回共享？素材将退出公共素材库')) return
  try {
    await assetApi.withdrawShare(asset.id)
    toast.success('已撤回共享')
    await load()
  } catch (e: any) { toast.error('操作失败：' + (e.message || '')) }
}

async function deleteAsset(asset: Asset) {
  if (!confirm(`确认删除"${asset.title}"？将移入回收站`)) return
  try {
    await assetApi.softDeleteAsset(asset.id)
    toast.success('已移入回收站')
    await load()
  } catch (e: any) { toast.error('删除失败：' + (e.message || '')) }
}

// ─── Batch actions ────────────────────────────────────────────────────────────

async function batchDelete() {
  if (!anySelected.value || !confirm(`确认删除选中的 ${selected.value.size} 个素材？将移入回收站`)) return
  try {
    await assetApi.batchDelete([...selected.value])
    selected.value = new Set()
    toast.success('已批量删除')
    await load()
  } catch (e: any) { toast.error('批量删除失败：' + (e.message || '')) }
}

async function batchShare() {
  if (!anySelected.value) return
  try {
    const res = await assetApi.batchShareRequest([...selected.value])
    const r = res?.data
    toast.success(`已提交 ${r?.submitted ?? 0} 个，失败 ${r?.failed ?? 0} 个`)
    selected.value = new Set()
    await load()
  } catch (e: any) { toast.error('批量申请共享失败：' + (e.message || '')) }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(asset: Asset) {
  if (asset.scope === 'public') return { text: '已共享', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' }
  switch (asset.status) {
    case 'pending_review': return { text: '审核中',  cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' }
    case 'rejected':       return { text: '已拒绝',  cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
    case 'withdrawn':      return { text: '已撤回',  cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' }
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
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-white">素材</h1>
        <p class="text-sm text-gray-400 mt-0.5">管理个人素材，探索公共素材库</p>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 bg-gray-800 rounded-lg p-1 w-fit">
      <button
        v-for="tab in [{ key: 'personal', label: '个人素材库' }, { key: 'public', label: '公共素材库' }]"
        :key="tab.key"
        class="px-5 py-1.5 rounded-md text-sm font-medium transition-colors"
        :class="activeScope === tab.key
          ? 'bg-gray-700 text-white shadow-sm'
          : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
        @click="activeScope = tab.key as any; page = 1; selected = new Set(); selectMode = false"
      >{{ tab.label }}</button>
    </div>

    <!-- Type filter chips -->
    <div class="flex gap-2 flex-wrap">
      <button
        v-for="t in typeFilters"
        :key="t.key"
        class="px-3 py-1 text-sm rounded-full border transition-colors"
        :class="activeFilterKey === t.key
          ? 'border-blue-500 bg-blue-600/20 text-blue-400'
          : 'border-gray-700 text-gray-400 hover:text-gray-200'"
        @click="setTypeFilter(t)"
      >{{ t.label }}</button>
    </div>

    <!-- Filters row -->
    <div class="flex flex-wrap gap-3 items-center">
      <input
        v-model="searchQ"
        type="text"
        placeholder="搜索素材..."
        class="px-3 py-1.5 text-sm border border-gray-700 rounded-lg bg-gray-900 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
      />
      <select
        v-if="activeScope === 'personal'"
        v-model="filterSource"
        class="px-3 py-1.5 text-sm border border-gray-700 rounded-lg bg-gray-900 text-white focus:outline-none"
      >
        <option value="">全部来源</option>
        <option value="platform">平台生成</option>
        <option value="uploaded">我上传</option>
      </select>
      <select
        v-model="sortBy"
        class="px-3 py-1.5 text-sm border border-gray-700 rounded-lg bg-gray-900 text-white focus:outline-none"
      >
        <option value="created_at">最新</option>
        <option v-if="activeScope === 'public'" value="use_count">最多使用</option>
        <option v-if="activeScope === 'public'" value="like_count">最多点赞</option>
        <option v-if="activeScope === 'public'" value="value_score">价值分</option>
      </select>
      <!-- 快速上传当前类型素材 -->
      <button
        v-if="activeScope === 'personal'"
        class="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-700 rounded-lg text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
        :title="`上传${uploadTypeLabel}`"
        @click="showUpload = true"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
        </svg>
        上传{{ uploadTypeLabel }}
      </button>
    </div>

    <!-- Batch action bar -->
    <Transition name="slide-up">
      <div
        v-if="selectMode && activeScope === 'personal'"
        class="flex items-center gap-3 px-4 py-2.5 bg-blue-950/60 border border-blue-800 rounded-xl"
      >
        <!-- Select all checkbox (indeterminate handled via ref + watchEffect) -->
        <input
          ref="selectAllRef"
          type="checkbox"
          class="w-4 h-4 rounded cursor-pointer accent-blue-500"
          :checked="allSelected"
          @change="toggleSelectAll"
        />
        <span class="text-sm text-blue-300 font-medium w-24 shrink-0">
          {{ anySelected ? `已选 ${selected.size} 个` : `共 ${assets.length} 个` }}
        </span>
        <div class="h-4 w-px bg-blue-800 shrink-0" />
        <button
          :disabled="!anySelected"
          class="text-sm text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          @click="batchShare"
        >申请共享</button>
        <button
          :disabled="!anySelected"
          class="text-sm text-red-400 hover:text-red-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          @click="batchDelete"
        >删除</button>
        <button
          class="text-sm text-gray-500 hover:text-gray-300 transition-colors ml-auto"
          @click="selected = new Set()"
        >取消选择</button>
      </div>
    </Transition>

    <!-- Loading skeleton -->
    <div v-if="loading && !assets.length" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
      <div v-for="i in 12" :key="i" style="aspect-ratio: 3/4" class="rounded-xl bg-gray-700 animate-pulse" />
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
        class="relative group rounded-xl overflow-hidden bg-gray-900 border transition-all cursor-pointer"
        :class="selected.has(asset.id)
          ? 'border-blue-500 ring-2 ring-blue-500'
          : 'border-gray-700 hover:border-gray-500 hover:shadow-md'"
        @click="handleCardClick(asset)"
      >
        <!-- Checkbox overlay (personal only) -->
        <div
          v-if="activeScope === 'personal'"
          class="absolute top-2 left-2 z-10 transition-opacity bg-black/50 rounded p-0.5"
          :class="selectMode || selected.has(asset.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
          @click.stop="toggleSelect(asset.id)"
        >
          <input
            type="checkbox"
            :checked="selected.has(asset.id)"
            class="w-4 h-4 rounded cursor-pointer accent-blue-500"
            @change.stop="toggleSelect(asset.id)"
          />
        </div>

        <!-- Status badge -->
        <div
          v-if="statusBadge(asset)"
          class="absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded text-xs font-medium"
          :class="statusBadge(asset)!.cls"
        >{{ statusBadge(asset)!.text }}</div>

        <!-- Thumbnail — NuxtLink disabled in selectMode to prevent navigation -->
        <div class="relative">
          <component
            :is="selectMode && activeScope === 'personal' ? 'div' : NuxtLink"
            v-bind="selectMode && activeScope === 'personal' ? {} : { to: `/assets/${asset.id}` }"
          >
            <div style="aspect-ratio: 3/2; min-height: 60px" class="bg-gray-800">
              <img
                v-if="asset.thumbnail_url || (asset.type === 'image' && asset.storage_url)"
                :src="asset.thumbnail_url || asset.storage_url"
                :alt="asset.title"
                class="w-full h-full object-cover"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-gray-500">
                <!-- 用 SVG 而不是 emoji 字符：emoji 依赖系统装了彩色 emoji 字体，
                     没装的环境会用兜底字体渲染出异常放大、走样的字形，撑破卡片布局。 -->
                <svg v-if="asset.type === 'video'" class="w-10 h-10" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                </svg>
                <svg v-else-if="asset.type === 'audio'" class="w-10 h-10" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4.5a.75.75 0 01.9-.735l9 1.8a.75.75 0 01.6.735V15" />
                  <circle cx="7" cy="17" r="2.5" stroke-linecap="round" stroke-linejoin="round" />
                  <circle cx="17.5" cy="15" r="2.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <svg v-else class="w-10 h-10" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
            </div>
          </component>

          <!-- Play button for video/audio (hidden in selectMode) -->
          <button
            v-if="!selectMode && (asset.type === 'video' || asset.type === 'audio')"
            class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30"
            @click.stop="playingAsset = asset"
          >
            <div class="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
              <svg class="w-5 h-5 text-gray-900 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </button>

          <!-- Duration badge -->
          <div
            v-if="asset.duration && (asset.type === 'video' || asset.type === 'audio')"
            class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/70 text-white"
          >{{ asset.duration >= 60 ? Math.floor(asset.duration/60) + ':' + String(Math.round(asset.duration%60)).padStart(2,'0') : asset.duration.toFixed(0) + 's' }}</div>
        </div>

        <!-- Info -->
        <div class="p-2">
          <p class="text-xs font-medium text-white truncate">{{ asset.title }}</p>
          <div class="flex items-center justify-between mt-1">
            <span class="text-xs text-gray-400">{{ formatSize(asset.file_size) }}</span>
            <!-- Per-card actions (hidden in selectMode) -->
            <div v-if="!selectMode" class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <template v-if="activeScope === 'personal'">
                <button
                  v-if="asset.scope === 'personal' && asset.status === 'active'"
                  class="text-xs text-blue-400 hover:underline"
                  @click.stop="requestShare(asset)"
                >共享</button>
                <button
                  v-else-if="asset.scope === 'public'"
                  class="text-xs text-orange-400 hover:underline"
                  @click.stop="withdrawShare(asset)"
                >撤回</button>
                <button
                  class="text-xs text-red-400 hover:underline"
                  @click.stop="deleteAsset(asset)"
                >删除</button>
              </template>
              <template v-else>
                <span class="flex items-center gap-0.5 text-xs text-gray-400">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
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
        class="px-3 py-1.5 rounded-lg text-sm border border-gray-700 disabled:opacity-40 hover:bg-gray-800 transition-colors"
        @click="page--"
      >上一页</button>
      <span class="text-sm text-gray-400">{{ page }} / {{ totalPages }}</span>
      <button
        :disabled="page >= totalPages"
        class="px-3 py-1.5 rounded-lg text-sm border border-gray-700 disabled:opacity-40 hover:bg-gray-800 transition-colors"
        @click="page++"
      >下一页</button>
    </div>

    <!-- Media Player Modal -->
    <Teleport to="body">
      <div v-if="playingAsset" class="fixed inset-0 z-[400] flex items-center justify-center p-4" @click.self="playingAsset = null">
        <div class="absolute inset-0 bg-black/80" @click="playingAsset = null" />
        <div class="relative max-w-3xl w-full">
          <button
            class="absolute -top-10 right-0 text-white/70 hover:text-white text-sm flex items-center gap-1"
            @click="playingAsset = null"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
            关闭
          </button>
          <template v-if="playingAsset.type === 'video'">
            <video :src="playingAsset.storage_url" controls autoplay class="w-full rounded-xl shadow-2xl bg-black max-h-[75vh]" @click.stop />
            <p class="text-white/70 text-sm mt-2 text-center truncate">{{ playingAsset.title }}</p>
          </template>
          <template v-else-if="playingAsset.type === 'audio'">
            <div class="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center shadow-2xl" @click.stop>
              <svg class="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4.5a.75.75 0 01.9-.735l9 1.8a.75.75 0 01.6.735V15" />
                <circle cx="7" cy="17" r="2.5" stroke-linecap="round" stroke-linejoin="round" />
                <circle cx="17.5" cy="15" r="2.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <p class="text-white font-semibold text-lg mb-1 truncate">{{ playingAsset.title }}</p>
              <p class="text-gray-400 text-sm mb-6">
                {{ playingAsset.sub_type === 'bgm' ? '背景音乐' : '音效' }}
                <span v-if="playingAsset.duration" class="ml-2">
                  {{ playingAsset.duration >= 60
                    ? Math.floor(playingAsset.duration/60) + ':' + String(Math.round(playingAsset.duration%60)).padStart(2,'0')
                    : playingAsset.duration.toFixed(0) + 's' }}
                </span>
              </p>
              <audio :src="playingAsset.storage_url" controls autoplay :loop="playingAsset.sub_type === 'bgm'" class="w-full" />
            </div>
          </template>
        </div>
      </div>
    </Teleport>

    <!-- Upload Dialog -->
    <div v-if="showUpload" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="closeUploadDialog">
      <div class="bg-gray-900 rounded-2xl p-6 w-full max-w-md mx-4 shadow-xl">
        <h3 class="text-lg font-semibold text-white mb-4">上传{{ uploadTypeLabel }}</h3>
        <div
          class="border-2 border-dashed border-gray-600 rounded-xl p-4 text-center cursor-pointer hover:border-blue-400 transition-colors mb-4 overflow-hidden"
          :class="uploadFile ? '' : 'p-8'"
          @click="($refs.fileInput as HTMLInputElement)?.click()"
        >
          <input ref="fileInput" type="file" class="hidden" :accept="uploadAccept" @change="onFileChange" />
          <p v-if="!uploadFile" class="text-gray-400 text-sm">点击或拖拽文件到此处</p>
          <template v-else>
            <img v-if="uploadPreviewUrl && uploadFile.type.startsWith('image/')" :src="uploadPreviewUrl" class="max-h-48 mx-auto rounded-lg object-contain" />
            <video v-else-if="uploadPreviewUrl && uploadFile.type.startsWith('video/')" :src="uploadPreviewUrl" class="max-h-48 mx-auto rounded-lg" controls />
            <p class="text-gray-300 text-sm font-medium mt-2 truncate">{{ uploadFile.name }}</p>
          </template>
        </div>
        <input
          v-model="uploadTitle"
          type="text"
          placeholder="素材标题（可选）"
          class="w-full px-3 py-2 text-sm border border-gray-700 rounded-lg bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
        />
        <div class="flex gap-3 justify-end">
          <button class="px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-lg" @click="closeUploadDialog">取消</button>
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

<style scoped>
.slide-up-enter-active, .slide-up-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(6px); }
</style>
