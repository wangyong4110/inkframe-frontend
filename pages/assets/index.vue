<script setup lang="ts">
import type { Asset, AssetSearchParams, Tag } from '~/types'

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
const filterType = ref('image')
const filterSubType = ref('')
const filterSource = ref('')
const sortBy = ref('created_at')

// Playback
const playingAsset = ref<Asset | null>(null)

// Upload dialog
const showUpload = ref(false)
const uploadFile = ref<File | null>(null)
const uploadTitle = ref('')
const uploading = ref(false)
const uploadStep = ref<'form' | 'tags'>('form')
const uploadedAsset = ref<Asset | null>(null)
const tagsLoading = ref(false)
const assetTags = ref<Tag[]>([])
const newTagInput = ref('')
const tagSuggestions = ref<Tag[]>([])
let tagPollTimer: ReturnType<typeof setTimeout> | null = null
let tagPollCount = 0

// Type filter chips
const typeFilters = [
  { key: 'image', label: '图片', type: 'image', subType: '' },
  { key: 'video', label: '视频', type: 'video', subType: '' },
  { key: 'sfx',   label: '音效', type: 'audio', subType: 'sfx' },
  { key: 'music', label: '音乐', type: 'audio', subType: 'bgm' },
]

const activeFilterKey = computed(() =>
  typeFilters.find(f => f.type === filterType.value && f.subType === filterSubType.value)?.key ?? ''
)

function setTypeFilter(f: typeof typeFilters[number]) {
  if (activeFilterKey.value === f.key) {
    filterType.value = ''
    filterSubType.value = ''
  } else {
    filterType.value = f.type
    filterSubType.value = f.subType
  }
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
    const mime = uploadFile.value.type
    const type = mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'image'
    const res = await assetApi.uploadAsset(uploadFile.value, {
      title: uploadTitle.value || uploadFile.value.name,
      type,
    })
    uploadedAsset.value = res?.data ?? null
    assetTags.value = uploadedAsset.value?.tags ?? []
    uploadStep.value = 'tags'
    tagsLoading.value = true
    tagPollCount = 0
    pollForTags()
    page.value = 1
    load()
  } catch (e: any) {
    toast.error('上传失败：' + (e.message || ''))
  } finally {
    uploading.value = false
  }
}

function pollForTags() {
  if (!uploadedAsset.value) return
  tagPollTimer = setTimeout(async () => {
    try {
      const res = await assetApi.getAsset(uploadedAsset.value!.id)
      const fetched = res?.data
      if (fetched?.tags && fetched.tags.length > 0) {
        assetTags.value = fetched.tags
        tagsLoading.value = false
        return
      }
    } catch {}
    if (++tagPollCount < 6) pollForTags()
    else tagsLoading.value = false
  }, 2000)
}

async function removeAssetTag(tag: Tag) {
  if (!uploadedAsset.value) return
  try {
    await assetApi.removeTag(uploadedAsset.value.id, tag.id)
    assetTags.value = assetTags.value.filter(t => t.id !== tag.id)
  } catch { toast.error('删除标签失败') }
}

async function addAssetTag() {
  const name = newTagInput.value.trim()
  if (!name || !uploadedAsset.value) return
  try {
    const res = await assetApi.addTags(uploadedAsset.value.id, [name])
    for (const t of (res?.data ?? [])) {
      if (!assetTags.value.find(x => x.id === t.id)) assetTags.value.push(t)
    }
    newTagInput.value = ''
    tagSuggestions.value = []
  } catch { toast.error('添加标签失败') }
}

let suggestTimer: ReturnType<typeof setTimeout>
async function onTagInput() {
  clearTimeout(suggestTimer)
  const q = newTagInput.value.trim()
  if (!q) { tagSuggestions.value = []; return }
  suggestTimer = setTimeout(async () => {
    try {
      const res = await assetApi.suggestTags(q)
      tagSuggestions.value = (res?.data ?? []).filter((t: Tag) => !assetTags.value.find(x => x.id === t.id))
    } catch {}
  }, 300)
}

function selectSuggestion(tag: Tag) {
  newTagInput.value = tag.name
  tagSuggestions.value = []
  addAssetTag()
}

function closeUploadDialog() {
  if (tagPollTimer) clearTimeout(tagPollTimer)
  showUpload.value  = false
  uploadStep.value  = 'form'
  uploadFile.value  = null
  uploadTitle.value = ''
  uploadedAsset.value = null
  assetTags.value   = []
  newTagInput.value = ''
  tagSuggestions.value = []
  tagsLoading.value = false
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
      <div class="flex items-center gap-3">
        <NuxtLink to="/assets/crawl" class="text-sm text-blue-600 dark:text-blue-400 hover:underline">爬取管理</NuxtLink>
        <button
          v-if="activeScope === 'personal'"
          class="px-3 py-2 text-sm font-medium rounded-lg border transition-colors"
          :class="selectMode
            ? 'border-blue-500 bg-blue-600/20 text-blue-400'
            : 'border-gray-700 text-gray-300 hover:text-white hover:border-gray-500'"
          @click="toggleSelectMode"
        >{{ selectMode ? '退出批量' : '批量操作' }}</button>
        <button
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          @click="showUpload = true"
        >上传素材</button>
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
      <div v-for="i in 12" :key="i" class="aspect-square rounded-xl bg-gray-700 animate-pulse" />
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
          class="absolute top-2 left-2 z-10 transition-opacity"
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
            <div class="aspect-square bg-gray-800">
              <img
                v-if="asset.thumbnail_url || (asset.type === 'image' && asset.storage_url)"
                :src="asset.thumbnail_url || asset.storage_url"
                :alt="asset.title"
                class="w-full h-full object-cover"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-4xl">
                {{ asset.type === 'video' ? '🎬' : asset.sub_type === 'bgm' ? '🎼' : asset.type === 'audio' ? '🎵' : '📄' }}
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
              <div class="text-6xl mb-4">{{ playingAsset.sub_type === 'bgm' ? '🎼' : '🎵' }}</div>
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
        <template v-if="uploadStep === 'form'">
          <h3 class="text-lg font-semibold text-white mb-4">上传素材</h3>
          <div
            class="border-2 border-dashed border-gray-600 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 transition-colors mb-4"
            @click="($refs.fileInput as HTMLInputElement)?.click()"
          >
            <input ref="fileInput" type="file" class="hidden" accept="image/*,video/*,audio/*" @change="onFileChange" />
            <p v-if="!uploadFile" class="text-gray-400 text-sm">点击或拖拽文件到此处</p>
            <p v-else class="text-gray-300 text-sm font-medium">{{ uploadFile.name }}</p>
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
        </template>

        <template v-else>
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-white">AI 标签分析</h3>
            <span class="text-xs text-gray-400">{{ uploadedAsset?.title }}</span>
          </div>
          <div v-if="tagsLoading" class="flex items-center gap-2 py-3 mb-4">
            <svg class="w-4 h-4 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span class="text-sm text-gray-400">AI 分析中，请稍候...</span>
          </div>
          <div class="mb-4">
            <p class="text-xs text-gray-400 mb-2">{{ tagsLoading ? '' : (assetTags.length ? 'AI 已识别以下标签，可点击 × 删除：' : '未识别到标签，请手动添加') }}</p>
            <div class="flex flex-wrap gap-2 min-h-[2rem]">
              <span
                v-for="tag in assetTags"
                :key="tag.id"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                :class="tag.category === 'style'   ? 'bg-purple-900/50 text-purple-300' :
                        tag.category === 'mood'    ? 'bg-yellow-900/50 text-yellow-300' :
                        tag.category === 'subject' ? 'bg-blue-900/50 text-blue-300'   :
                        tag.category === 'color'   ? 'bg-pink-900/50 text-pink-300'   :
                        'bg-gray-700 text-gray-300'"
              >
                {{ tag.name }}
                <button class="ml-0.5 hover:text-white opacity-60 hover:opacity-100" @click="removeAssetTag(tag)">×</button>
              </span>
            </div>
          </div>
          <div class="relative mb-4">
            <div class="flex gap-2">
              <input
                v-model="newTagInput"
                type="text"
                placeholder="输入标签名称，按回车添加"
                class="flex-1 px-3 py-2 text-sm border border-gray-700 rounded-lg bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                @input="onTagInput"
                @keydown.enter.prevent="addAssetTag"
                @keydown.escape="tagSuggestions = []"
              />
              <button
                :disabled="!newTagInput.trim()"
                class="px-3 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg disabled:opacity-40"
                @click="addAssetTag"
              >添加</button>
            </div>
            <div
              v-if="tagSuggestions.length"
              class="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto"
            >
              <button
                v-for="s in tagSuggestions"
                :key="s.id"
                class="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center justify-between"
                @click="selectSuggestion(s)"
              >
                <span>{{ s.name }}</span>
                <span class="text-xs text-gray-500">{{ s.category }}</span>
              </button>
            </div>
          </div>
          <div class="flex justify-end">
            <button
              class="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              @click="closeUploadDialog"
            >完成</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.slide-up-enter-active, .slide-up-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(6px); }
</style>
