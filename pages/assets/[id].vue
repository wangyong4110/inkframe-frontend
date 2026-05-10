<script setup lang="ts">
import type { Asset, AssetVersion, AssetComment, Tag, ShareLink } from '~/types'

definePageMeta({ auth: true })

const route = useRoute()
const assetApi = useAssetApi()
const authStore = useAuthStore()

const assetId = computed(() => Number(route.params.id))
const asset = ref<Asset | null>(null)
const versions = ref<AssetVersion[]>([])
const comments = ref<AssetComment[]>([])
const shareLinks = ref<ShareLink[]>([])
const loading = ref(true)
const error = ref('')

// Edit mode (personal assets)
const editing = ref(false)
const editTitle = ref('')
const editDescription = ref('')
const saving = ref(false)

// Tag management
const tagInput = ref('')
const addingTag = ref(false)

// Comment
const commentText = ref('')
const postingComment = ref(false)

// Share
const showShareDialog = ref(false)
const newShareExpiry = ref(7)
const newShareDownload = ref(false)
const creatingLink = ref(false)

// Version upload
const showVersionDialog = ref(false)
const versionFile = ref<File | null>(null)
const versionNote = ref('')
const uploadingVersion = ref(false)

// Share request
const shareRequestStatus = ref<string>('')
const processingShare = ref(false)

const isOwner = computed(() => asset.value?.creator_id === authStore.user?.id)
const isPublic = computed(() => asset.value?.scope === 'public')
const isPersonal = computed(() => asset.value?.scope === 'personal')

const statusBadge = computed(() => {
  switch (asset.value?.status) {
    case 'pending_review': return { label: '审核中', cls: 'bg-yellow-100 text-yellow-800' }
    case 'rejected': return { label: '已拒绝', cls: 'bg-red-100 text-red-800' }
    case 'withdrawn': return { label: '已撤回', cls: 'bg-gray-100 text-gray-600' }
    case 'trash': return { label: '回收站', cls: 'bg-red-100 text-red-800' }
    default: return null
  }
})

const licenseBadge = computed(() => {
  const l = asset.value?.license
  if (!l) return null
  const map: Record<string, string> = {
    CC0: 'bg-green-100 text-green-800',
    'CC-BY': 'bg-blue-100 text-blue-800',
    'CC-BY-SA': 'bg-blue-100 text-blue-800',
    'CC-BY-NC': 'bg-purple-100 text-purple-800',
    PD: 'bg-green-100 text-green-800',
    platform: 'bg-indigo-100 text-indigo-800',
    unsplash: 'bg-gray-100 text-gray-800',
    pexels: 'bg-gray-100 text-gray-800',
    pixabay: 'bg-gray-100 text-gray-800',
  }
  return { label: l.toUpperCase(), cls: map[l] ?? 'bg-gray-100 text-gray-700' }
})

async function loadAsset() {
  loading.value = true
  error.value = ''
  try {
    const res = await assetApi.getAsset(assetId.value)
    asset.value = res.data
    editTitle.value = res.data.title
    editDescription.value = res.data.description ?? ''
    if (res.data.status) shareRequestStatus.value = res.data.status
  } catch {
    error.value = '加载素材失败'
  } finally {
    loading.value = false
  }
}

async function loadVersions() {
  if (!isOwner.value) return
  const res = await assetApi.listVersions(assetId.value)
  versions.value = res.data ?? []
}

async function loadComments() {
  const res = await assetApi.listComments(assetId.value)
  comments.value = res.data ?? []
}

async function loadShareLinks() {
  if (!isOwner.value) return
  const res = await assetApi.listShareLinks()
  shareLinks.value = (res.data ?? []).filter(l => l.asset_id === assetId.value)
}

onMounted(async () => {
  await loadAsset()
  if (asset.value) {
    await Promise.all([loadVersions(), loadComments(), loadShareLinks()])
  }
})

// Edit
async function saveEdit() {
  saving.value = true
  try {
    const res = await assetApi.updateAsset(assetId.value, {
      title: editTitle.value,
      description: editDescription.value,
    })
    asset.value = res.data
    editing.value = false
  } finally {
    saving.value = false
  }
}

// Tags
async function addTag() {
  const name = tagInput.value.trim()
  if (!name) return
  addingTag.value = true
  try {
    const res = await assetApi.addTags(assetId.value, [name])
    if (asset.value) asset.value.tags = res.data
    tagInput.value = ''
  } finally {
    addingTag.value = false
  }
}

async function removeTag(tagId: number) {
  await assetApi.removeTag(assetId.value, tagId)
  if (asset.value?.tags) {
    asset.value.tags = asset.value.tags.filter(t => t.id !== tagId)
  }
}

// Share request
async function requestShare() {
  processingShare.value = true
  try {
    await assetApi.requestShare(assetId.value)
    if (asset.value) asset.value.status = 'pending_review'
  } finally {
    processingShare.value = false
  }
}

async function cancelShare() {
  processingShare.value = true
  try {
    await assetApi.cancelShareRequest(assetId.value)
    if (asset.value) asset.value.status = 'active'
  } finally {
    processingShare.value = false
  }
}

async function withdrawShare() {
  if (!confirm('确认撤回共享？素材将退出公共库。')) return
  processingShare.value = true
  try {
    const res = await assetApi.withdrawShare(assetId.value)
    asset.value = res.data
  } finally {
    processingShare.value = false
  }
}

// Like
async function toggleLike() {
  const res = await assetApi.toggleLike(assetId.value)
  if (asset.value) {
    asset.value.like_count += res.data.liked ? 1 : -1
  }
}

// Comments
async function postComment() {
  const text = commentText.value.trim()
  if (!text) return
  postingComment.value = true
  try {
    const res = await assetApi.addComment(assetId.value, { content: text })
    comments.value.unshift(res.data)
    commentText.value = ''
  } finally {
    postingComment.value = false
  }
}

async function deleteComment(cid: number) {
  await assetApi.deleteComment(assetId.value, cid)
  comments.value = comments.value.filter(c => c.id !== cid)
}

// Version
async function uploadVersion() {
  if (!versionFile.value) return
  uploadingVersion.value = true
  try {
    await assetApi.createVersion(assetId.value, versionFile.value, versionNote.value)
    await loadVersions()
    showVersionDialog.value = false
    versionFile.value = null
    versionNote.value = ''
  } finally {
    uploadingVersion.value = false
  }
}

async function restoreVersion(versionNo: number) {
  if (!confirm(`确认回退到版本 v${versionNo}？`)) return
  await assetApi.restoreVersion(assetId.value, versionNo)
  await loadAsset()
}

// Share link
async function createShareLink() {
  creatingLink.value = true
  try {
    const res = await assetApi.createShareLink({
      asset_id: assetId.value,
      expires_in: newShareExpiry.value * 24 * 3600,
      download_allowed: newShareDownload.value,
    })
    shareLinks.value.unshift(res.data)
    showShareDialog.value = false
  } finally {
    creatingLink.value = false
  }
}

async function revokeLink(token: string) {
  await assetApi.revokeShareLink(token)
  shareLinks.value = shareLinks.value.filter(l => l.token !== token)
}

function copyLink(token: string) {
  const url = `${window.location.origin}/share/${token}`
  navigator.clipboard.writeText(url)
}

function formatBytes(b?: number) {
  if (!b) return '-'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(s?: string) {
  if (!s) return '-'
  return new Date(s).toLocaleString('zh-CN')
}
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-6">
    <!-- Back -->
    <div class="mb-4">
      <NuxtLink to="/assets" class="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
        ← 返回素材库
      </NuxtLink>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-20 text-gray-400">加载中...</div>
    <div v-else-if="error" class="text-center py-20 text-red-500">{{ error }}</div>

    <div v-else-if="asset" class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left: Preview -->
      <div class="lg:col-span-2 space-y-4">
        <!-- Preview card -->
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
          <!-- Image -->
          <div v-if="asset.type === 'image'" class="bg-gray-100 dark:bg-gray-700 flex items-center justify-center min-h-64">
            <img :src="asset.storage_url" :alt="asset.title" class="max-w-full max-h-[600px] object-contain" />
          </div>
          <!-- Video -->
          <div v-else-if="asset.type === 'video'" class="bg-black">
            <video :src="asset.hls_url || asset.storage_url" controls class="w-full max-h-[500px]" />
          </div>
          <!-- Audio -->
          <div v-else-if="asset.type === 'audio'" class="p-6">
            <div v-if="asset.waveform_url" class="mb-4">
              <img :src="asset.waveform_url" alt="waveform" class="w-full h-20 object-cover rounded" />
            </div>
            <audio :src="asset.storage_url" controls class="w-full" />
          </div>
          <!-- Text -->
          <div v-else class="p-6 bg-gray-50 dark:bg-gray-700 min-h-32 flex items-center justify-center text-gray-500">
            文本素材
          </div>
        </div>

        <!-- Comments -->
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
          <h3 class="font-semibold text-gray-800 dark:text-gray-200 mb-4">评论 ({{ comments.length }})</h3>
          <!-- Add comment -->
          <div class="flex gap-2 mb-4">
            <textarea
              v-model="commentText"
              rows="2"
              placeholder="添加评论..."
              class="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 resize-none"
            />
            <button
              :disabled="!commentText.trim() || postingComment"
              @click="postComment"
              class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm disabled:opacity-50 self-end"
            >发送</button>
          </div>
          <!-- Comment list -->
          <div class="space-y-3">
            <div v-for="c in comments" :key="c.id" class="flex gap-3">
              <div class="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-xs font-medium text-indigo-700 dark:text-indigo-300 shrink-0">
                {{ c.user_id }}
              </div>
              <div class="flex-1">
                <p class="text-sm text-gray-700 dark:text-gray-300">{{ c.content }}</p>
                <div class="flex items-center gap-3 mt-1">
                  <span class="text-xs text-gray-400">{{ formatDate(c.created_at) }}</span>
                  <button
                    v-if="c.user_id === authStore.user?.id"
                    @click="deleteComment(c.id)"
                    class="text-xs text-red-400 hover:text-red-600"
                  >删除</button>
                </div>
              </div>
            </div>
            <p v-if="!comments.length" class="text-sm text-gray-400 text-center py-4">暂无评论</p>
          </div>
        </div>
      </div>

      <!-- Right: Info panel -->
      <div class="space-y-4">
        <!-- Title & Actions -->
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
          <!-- Scope badge -->
          <div class="flex items-center gap-2 mb-2">
            <span :class="isPublic ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-700'"
              class="text-xs px-2 py-0.5 rounded-full font-medium">
              {{ isPublic ? '公共库' : '个人库' }}
            </span>
            <span v-if="statusBadge" :class="statusBadge.cls" class="text-xs px-2 py-0.5 rounded-full font-medium">
              {{ statusBadge.label }}
            </span>
          </div>

          <!-- Title -->
          <div v-if="editing" class="mb-2">
            <input v-model="editTitle" class="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700" />
            <textarea v-model="editDescription" rows="3" placeholder="描述（可选）"
              class="mt-2 w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 resize-none" />
            <div class="flex gap-2 mt-2">
              <button @click="saveEdit" :disabled="saving"
                class="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm disabled:opacity-50">
                {{ saving ? '保存中...' : '保存' }}
              </button>
              <button @click="editing = false" class="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded text-sm">取消</button>
            </div>
          </div>
          <div v-else>
            <h1 class="text-lg font-bold text-gray-900 dark:text-gray-100">{{ asset.title }}</h1>
            <p v-if="asset.description" class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ asset.description }}</p>
          </div>

          <!-- Stats row -->
          <div class="flex items-center gap-4 mt-3 text-sm text-gray-500">
            <span>{{ asset.use_count }} 次使用</span>
            <span>{{ asset.like_count }} 点赞</span>
          </div>

          <!-- Action buttons -->
          <div class="mt-4 space-y-2">
            <!-- Personal library owner actions -->
            <template v-if="isOwner && isPersonal">
              <button v-if="!editing" @click="editing = true"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                编辑信息
              </button>
              <button v-if="asset.status === 'active'" :disabled="processingShare" @click="requestShare"
                class="w-full px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm disabled:opacity-50">
                {{ processingShare ? '处理中...' : '申请共享到公共库' }}
              </button>
              <button v-if="asset.status === 'pending_review'" :disabled="processingShare" @click="cancelShare"
                class="w-full px-3 py-2 border border-yellow-400 text-yellow-700 rounded-lg text-sm disabled:opacity-50">
                {{ processingShare ? '处理中...' : '撤回共享申请' }}
              </button>
              <button @click="showVersionDialog = true"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                上传新版本
              </button>
              <button @click="showShareDialog = true"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                生成分享链接
              </button>
            </template>

            <!-- Public library: withdraw for owner -->
            <template v-if="isOwner && isPublic">
              <button :disabled="processingShare" @click="withdrawShare"
                class="w-full px-3 py-2 border border-red-300 text-red-600 rounded-lg text-sm disabled:opacity-50">
                {{ processingShare ? '处理中...' : '撤回共享' }}
              </button>
            </template>

            <!-- Public library interactions for all users -->
            <template v-if="isPublic">
              <button @click="toggleLike"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center gap-1">
                ♥ 点赞 ({{ asset.like_count }})
              </button>
            </template>
          </div>
        </div>

        <!-- Metadata -->
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
          <h3 class="font-semibold text-gray-800 dark:text-gray-200 mb-3">素材信息</h3>
          <dl class="space-y-2 text-sm">
            <div class="flex justify-between">
              <dt class="text-gray-500">类型</dt>
              <dd class="text-gray-800 dark:text-gray-200">{{ asset.type }} / {{ asset.sub_type || '-' }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-gray-500">来源</dt>
              <dd class="text-gray-800 dark:text-gray-200">{{ asset.source || '-' }}</dd>
            </div>
            <div v-if="asset.width" class="flex justify-between">
              <dt class="text-gray-500">尺寸</dt>
              <dd class="text-gray-800 dark:text-gray-200">{{ asset.width }} × {{ asset.height }}</dd>
            </div>
            <div v-if="asset.duration" class="flex justify-between">
              <dt class="text-gray-500">时长</dt>
              <dd class="text-gray-800 dark:text-gray-200">{{ asset.duration.toFixed(1) }}s</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-gray-500">大小</dt>
              <dd class="text-gray-800 dark:text-gray-200">{{ formatBytes(asset.file_size) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-gray-500">上传时间</dt>
              <dd class="text-gray-800 dark:text-gray-200">{{ formatDate(asset.created_at) }}</dd>
            </div>
            <div v-if="asset.shared_at" class="flex justify-between">
              <dt class="text-gray-500">共享时间</dt>
              <dd class="text-gray-800 dark:text-gray-200">{{ formatDate(asset.shared_at) }}</dd>
            </div>
          </dl>

          <!-- License -->
          <div v-if="asset.license" class="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <h4 class="text-xs font-medium text-gray-500 mb-2">版权信息</h4>
            <span v-if="licenseBadge" :class="licenseBadge.cls" class="inline-block text-xs px-2 py-0.5 rounded font-medium">
              {{ licenseBadge.label }}
            </span>
            <p v-if="asset.attribution" class="mt-2 text-xs text-gray-500">{{ asset.attribution }}</p>
            <a v-if="asset.source_url" :href="asset.source_url" target="_blank"
              class="mt-1 block text-xs text-indigo-500 hover:underline truncate">原始来源 ↗</a>
            <a v-if="asset.license_url" :href="asset.license_url" target="_blank"
              class="mt-1 block text-xs text-gray-400 hover:underline">查看许可证 ↗</a>
          </div>
        </div>

        <!-- Tags -->
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
          <h3 class="font-semibold text-gray-800 dark:text-gray-200 mb-3">标签</h3>
          <div class="flex flex-wrap gap-1.5 mb-3">
            <span
              v-for="tag in (asset.tags || [])"
              :key="tag.id"
              class="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs rounded-full"
            >
              {{ tag.name }}
              <button v-if="isOwner" @click="removeTag(tag.id)" class="hover:text-red-500">×</button>
            </span>
            <span v-if="!asset.tags?.length" class="text-xs text-gray-400">暂无标签</span>
          </div>
          <div v-if="isOwner" class="flex gap-2">
            <input
              v-model="tagInput"
              @keyup.enter="addTag"
              placeholder="添加标签..."
              class="flex-1 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-700"
            />
            <button :disabled="!tagInput.trim() || addingTag" @click="addTag"
              class="px-2 py-1 bg-indigo-600 text-white rounded text-xs disabled:opacity-50">
              +
            </button>
          </div>
        </div>

        <!-- Color palette -->
        <div v-if="asset.color_palette?.length" class="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
          <h3 class="font-semibold text-gray-800 dark:text-gray-200 mb-3">主色调</h3>
          <div class="flex gap-2">
            <div
              v-for="color in asset.color_palette"
              :key="color"
              :style="{ backgroundColor: color }"
              class="w-8 h-8 rounded-full border-2 border-white shadow"
              :title="color"
            />
          </div>
        </div>

        <!-- Version history (personal owner) -->
        <div v-if="isOwner && versions.length" class="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
          <h3 class="font-semibold text-gray-800 dark:text-gray-200 mb-3">版本历史</h3>
          <div class="space-y-2">
            <div v-for="v in versions" :key="v.id" class="flex items-center justify-between text-sm">
              <div>
                <span class="font-medium text-gray-700 dark:text-gray-300">v{{ v.version_no }}</span>
                <span v-if="v.change_note" class="ml-2 text-gray-400 text-xs">{{ v.change_note }}</span>
              </div>
              <div class="flex items-center gap-2 text-gray-400 text-xs">
                <span>{{ formatBytes(v.file_size) }}</span>
                <button @click="restoreVersion(v.version_no)"
                  class="text-indigo-500 hover:text-indigo-700">回退</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Share links (personal owner) -->
        <div v-if="isOwner" class="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-gray-800 dark:text-gray-200">分享链接</h3>
            <button @click="showShareDialog = true" class="text-xs text-indigo-600 hover:underline">+ 新建</button>
          </div>
          <div class="space-y-2">
            <div v-for="link in shareLinks" :key="link.token"
              class="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
              <div>
                <span>{{ link.download_allowed ? '可下载' : '仅查看' }}</span>
                <span v-if="link.expires_at" class="ml-2 text-gray-400">{{ formatDate(link.expires_at) }}到期</span>
                <span v-else class="ml-2 text-gray-400">永久</span>
              </div>
              <div class="flex gap-2">
                <button @click="copyLink(link.token)" class="text-indigo-500 hover:text-indigo-700">复制</button>
                <button @click="revokeLink(link.token)" class="text-red-400 hover:text-red-600">撤销</button>
              </div>
            </div>
            <p v-if="!shareLinks.length" class="text-xs text-gray-400">暂无分享链接</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Version upload dialog -->
    <div v-if="showVersionDialog" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" @click.self="showVersionDialog = false">
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">上传新版本</h3>
        <div class="space-y-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">文件</label>
            <input type="file" @change="(e) => versionFile = (e.target as HTMLInputElement).files?.[0] ?? null"
              class="w-full text-sm text-gray-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">变更说明</label>
            <input v-model="versionNote" type="text" placeholder="简要描述改动..."
              class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700" />
          </div>
        </div>
        <div class="mt-4 flex gap-2 justify-end">
          <button @click="showVersionDialog = false"
            class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300">取消</button>
          <button :disabled="!versionFile || uploadingVersion" @click="uploadVersion"
            class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm disabled:opacity-50">
            {{ uploadingVersion ? '上传中...' : '上传' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Share link dialog -->
    <div v-if="showShareDialog" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" @click.self="showShareDialog = false">
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">创建分享链接</h3>
        <div class="space-y-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">有效期（天）</label>
            <select v-model="newShareExpiry"
              class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700">
              <option :value="1">1 天</option>
              <option :value="7">7 天</option>
              <option :value="30">30 天</option>
              <option :value="0">永久</option>
            </select>
          </div>
          <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" v-model="newShareDownload" />
            允许下载
          </label>
        </div>
        <div class="mt-4 flex gap-2 justify-end">
          <button @click="showShareDialog = false"
            class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300">取消</button>
          <button :disabled="creatingLink" @click="createShareLink"
            class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm disabled:opacity-50">
            {{ creatingLink ? '创建中...' : '创建' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
