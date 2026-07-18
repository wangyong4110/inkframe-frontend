<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import type { SceneAnchor, UpdateSceneAnchorPayload } from '~/types'
import { useSceneAnchorApi } from '~/composables/useSceneAnchorApi'

const { openLightbox, url: lightboxUrl } = useImageLightbox()
const { editImage } = useImageEditApi()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const api = useSceneAnchorApi()
const { guardAiProvider } = useAiProviderGuard()

const anchorId = parseInt(route.params.id as string)
if (isNaN(anchorId)) {
  await navigateTo('/novel')
}
const novelId = parseInt(route.query.novelId as string)
const chapterNo = parseInt(route.query.chapterNo as string)

const saving = ref(false)
const saveStatus = ref<'' | 'saving' | 'saved' | 'error'>('')
const isDirty = ref(false)
const dataLoaded = ref(false)
const loading = ref(true)

const anchor = ref<SceneAnchor | null>(null)

const form = ref({
  name: '',
  description: '',
})

const generatingRefImage = ref(false)
const uploadingRefImage = ref(false)
const aiUpdating = ref(false)
const refImageFileInput = ref<HTMLInputElement | null>(null)

useUnsavedGuard(isDirty, '场景有未保存的修改，确认离开？')

function scoreColor(score: number) {
  if (score >= 0.85) return 'text-green-600 dark:text-green-400'
  if (score >= 0.70) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

onMounted(async () => {
  loading.value = true
  try {
    anchor.value = await api.getSceneAnchor(anchorId)
    form.value = {
      name: anchor.value.name ?? '',
      description: anchor.value.description ?? '',
    }
  } catch {
    toast.error('加载场景失败')
  } finally {
    loading.value = false
    await nextTick()
    isDirty.value = false
    dataLoaded.value = true
  }
})

async function handleAIUpdate() {
  aiUpdating.value = true
  try {
    const result = await api.aiAnalyzeAnchor(anchorId)
    if (result.description) form.value.description = result.description
    toast.success('AI已更新字段')
  } catch (e: any) {
    toast.error('AI更新失败：' + (e.message || '未知错误'))
  } finally {
    aiUpdating.value = false
  }
}

async function handleSave() {
  if (!form.value.name.trim()) return
  if (saving.value) return
  saving.value = true
  saveStatus.value = 'saving'
  try {
    const payload: UpdateSceneAnchorPayload = {
      name: form.value.name,
      description: form.value.description,
    }
    const updated = await api.updateSceneAnchor(anchorId, payload)
    anchor.value = updated
    isDirty.value = false
    saveStatus.value = 'saved'
    setTimeout(() => { if (saveStatus.value === 'saved') saveStatus.value = '' }, 2000)
  } catch (e: any) {
    saveStatus.value = 'error'
    toast.error('自动保存失败：' + (e.message || '未知错误'))
  } finally {
    saving.value = false
  }
}

const debouncedSave = useDebounceFn(handleSave, 800)

watch(form, () => {
  if (!dataLoaded.value) return
  isDirty.value = true
  debouncedSave()
}, { deep: true })

async function handleGenerateRefImage() {
  if (!await guardAiProvider('IMAGE')) return
  generatingRefImage.value = true
  try {
    const updated = await api.generateRefImage(anchorId, undefined, form.value.description)
    if (anchor.value) anchor.value = updated
    toast.success('参考图已生成')
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || '未知错误'))
  } finally {
    generatingRefImage.value = false
  }
}

async function handleUploadRefImage(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploadingRefImage.value = true
  try {
    const res = await api.uploadRefImage(anchorId, file)
    if (anchor.value && res.anchor) anchor.value = res.anchor
    else if (anchor.value) anchor.value = { ...anchor.value, ref_image_url: res.url }
    toast.success('参考图已上传并锁定')
  } catch (e: any) {
    toast.error('上传失败：' + (e.message || '未知错误'))
  } finally {
    uploadingRefImage.value = false
    if (refImageFileInput.value) refImageFileInput.value.value = ''
  }
}


function goBack() {
  const from = route.query.from as string | undefined
  if (from) { router.push(decodeURIComponent(from)); return }
  if (novelId && !isNaN(chapterNo)) {
    router.push(`/novel/${novelId}/chapter/${chapterNo}?tab=scenes`)
  } else if (novelId) {
    router.push(`/novel/${novelId}?tab=scene_anchors`)
  } else {
    router.back()
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-3 min-w-0">
        <button class="btn-ghost p-2 flex-shrink-0" @click="goBack">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <input
              v-model="form.name"
              type="text"
              maxlength="100"
              placeholder="场景名称"
              class="text-xl font-bold text-gray-900 dark:text-white bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-primary-500 focus:outline-none truncate w-64 max-w-full"
            />
          </div>
          <div v-if="anchor && anchor.avg_cons_score > 0" class="flex items-center gap-4 mt-0.5 text-xs text-gray-500">
            <span :class="scoreColor(anchor.avg_cons_score)">
              均分 {{ anchor.avg_cons_score.toFixed(2) }}
            </span>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-3 flex-shrink-0">
        <!-- 自动保存状态 -->
        <transition name="fade">
          <span v-if="saveStatus === 'saving'" class="flex items-center gap-1 text-xs text-gray-400">
            <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            保存中…
          </span>
          <span v-else-if="saveStatus === 'saved'" class="flex items-center gap-1 text-xs text-green-500">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
            </svg>
            已自动保存
          </span>
          <span v-else-if="saveStatus === 'error'" class="text-xs text-red-400">保存失败</span>
        </transition>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/40 px-3 h-8 rounded-md transition-colors disabled:opacity-40"
          :disabled="aiUpdating || saving"
          title="基于当前名称/描述由 AI 重新分析并更新场景信息"
          @click="handleAIUpdate"
        >
          <svg v-if="aiUpdating" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          {{ aiUpdating ? '更新中…' : 'AI 更新' }}
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="card p-8 flex items-center justify-center">
      <svg class="w-6 h-6 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      <span class="ml-2 text-gray-500">加载中…</span>
    </div>

    <template v-else>
      <!-- ── 视觉 & 参考图 ──────────────────────────────────────────── -->
      <div class="space-y-5">
        <!-- Visual prompts card -->
        <div class="card p-6 space-y-5">
          <!-- Description -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">图片生成提示词</label>
            <textarea
              v-model="form.description"
              rows="6"
              class="input resize-none font-mono text-sm"
              placeholder="金色暖光笼罩的宏伟皇宫大殿，高耸的汉白玉石柱悬挂红绸龙旗，穹顶精雕龙纹浮雕，翡翠地砖映照摇曳烛光…"
            ></textarea>
            <p class="mt-1 text-xs text-gray-400">场景的完整视觉描述，包含建筑结构、光线氛围、空间感等细节，由 AI 提取自动填写，也可手动编辑</p>
          </div>
        </div>

        <!-- Reference image card -->
        <div class="card p-6 space-y-4">
          <div>
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">场景参考图</h3>
            <p class="text-xs text-gray-400">锁定后，关联此锚点的所有分镜生成时都以此图为风格参考，保证场景一致性。</p>
          </div>

          <div class="flex gap-6 items-start">
            <!-- Image preview -->
            <div
              class="relative flex-shrink-0 w-56 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 border-2 border-dashed border-gray-200 dark:border-gray-600 cursor-pointer"
              style="aspect-ratio: 16/9"
              @click="anchor?.ref_image_url && openLightbox(anchor.ref_image_url, (currentUrl, s) => editImage(currentUrl, s, novelId), async (url) => { const updated = await api.lockRefImage(anchorId, { image_url: url }); if (anchor) anchor = updated })"
            >
              <img
                v-if="anchor?.ref_image_url"
                :src="anchor.ref_image_url"
                class="w-full h-full object-cover"
                alt="场景参考图"
              />
              <div v-else class="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-400">
                <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span class="text-xs">暂无参考图</span>
              </div>
              <div v-if="generatingRefImage" class="absolute inset-0 bg-black/60 flex items-center justify-center">
                <svg class="w-6 h-6 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
              </div>
            </div>

            <!-- Actions & status -->
            <div class="flex-1 space-y-3">

              <div class="flex flex-wrap gap-2">
                <button
                  class="btn-primary text-sm"
                  :disabled="generatingRefImage || uploadingRefImage"
                  @click="handleGenerateRefImage"
                >
                  <svg v-if="generatingRefImage" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                  </svg>
                  {{ generatingRefImage ? 'AI 生成中…' : (anchor?.ref_image_url ? '重新生成' : 'AI 生成参考图') }}
                </button>

                <button
                  class="btn-secondary text-sm"
                  :disabled="generatingRefImage || uploadingRefImage"
                  @click="refImageFileInput?.click()"
                >
                  <svg v-if="uploadingRefImage" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  {{ uploadingRefImage ? '上传中…' : '上传参考图' }}
                </button>
                <input
                  ref="refImageFileInput"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  class="hidden"
                  @change="handleUploadRefImage"
                />
              </div>

              <p class="text-xs text-gray-400">AI 将根据图片生成提示词生成参考图，生成完成后自动锁定；或手动上传图片作为参考图。</p>
            </div>
          </div>
        </div>

      </div>
    </template>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
