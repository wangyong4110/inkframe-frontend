<script setup lang="ts">
import type { SceneAnchor, UpdateSceneAnchorPayload } from '~/composables/useSceneAnchorApi'
import { useSceneAnchorApi } from '~/composables/useSceneAnchorApi'

const { openLightbox } = useImageLightbox()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const api = useSceneAnchorApi()

const anchorId = parseInt(route.params.id as string)
if (isNaN(anchorId)) {
  await navigateTo('/novel')
}
const novelId = parseInt(route.query.novelId as string)

const activeTab = ref('basic')
const saving = ref(false)
const isDirty = ref(false)
const loading = ref(true)

const anchor = ref<SceneAnchor | null>(null)

const form = ref({
  name: '',
  type: 'interior' as string,
  variant: '',
  description: '',
  prompt_lock: '',
})

const generatingRefImage = ref(false)

const tabs = [
  { key: 'basic',  label: '场景信息' },
  { key: 'visual', label: '视觉设计' },
]

useUnsavedGuard(isDirty, '场景锚点有未保存的修改，确认离开？')
watch(form, () => { isDirty.value = true }, { deep: true })

const typeOptions = [
  { value: 'interior',  label: '室内 (interior)' },
  { value: 'exterior',  label: '室外 (exterior)' },
  { value: 'imaginary', label: '虚幻 (imaginary)' },
]

function typeBadgeClass(t: string) {
  if (t === 'interior') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
  if (t === 'exterior') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
  return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
}

function scoreColor(score: number) {
  if (score >= 0.85) return 'text-green-600 dark:text-green-400'
  if (score >= 0.70) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

onMounted(async () => {
  loading.value = true
  try {
    const a = await api.getSceneAnchor(anchorId)
    anchor.value = a
    form.value = {
      name: a.name ?? '',
      type: a.type ?? 'interior',
      variant: a.variant ?? '',
      description: a.description ?? '',
      prompt_lock: a.prompt_lock ?? '',
    }
  } catch (e: any) {
    toast.error('加载场景锚点失败：' + (e.message || '未知错误'))
  } finally {
    loading.value = false
    await nextTick()
    isDirty.value = false
  }
})

async function handleSave() {
  if (!form.value.name.trim()) { toast.error('名称不能为空'); return }
  saving.value = true
  try {
    const payload: UpdateSceneAnchorPayload = {
      name: form.value.name,
      type: form.value.type,
      variant: form.value.variant || undefined,
      description: form.value.description,
      prompt_lock: form.value.prompt_lock,
    }
    const updated = await api.updateSceneAnchor(anchorId, payload)
    anchor.value = updated
    isDirty.value = false
    toast.success('保存成功')
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || '未知错误'))
  } finally {
    saving.value = false
  }
}

async function handleGenerateRefImage() {
  generatingRefImage.value = true
  try {
    const updated = await api.generateRefImage(anchorId)
    if (anchor.value) anchor.value = updated
    toast.success('参考图已生成')
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || '未知错误'))
  } finally {
    generatingRefImage.value = false
  }
}

function goBack() {
  novelId ? router.push(`/novel/${novelId}?tab=scene_anchors`) : router.back()
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
            <h1 class="text-xl font-bold text-gray-900 dark:text-white truncate">
              {{ anchor?.name || '场景锚点' }}
            </h1>
            <span v-if="anchor?.type" class="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0" :class="typeBadgeClass(anchor.type)">
              {{ anchor.type }}
            </span>
            <span v-if="anchor?.variant" class="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex-shrink-0">
              {{ anchor.variant }}
            </span>
          </div>
          <div class="flex items-center gap-4 mt-0.5 text-xs text-gray-500">
            <span>引用 {{ anchor?.usage_count ?? 0 }} 次</span>
            <span v-if="anchor && anchor.avg_cons_score > 0" :class="scoreColor(anchor.avg_cons_score)">
              均分 {{ anchor.avg_cons_score.toFixed(2) }}
            </span>
          </div>
        </div>
      </div>
      <button class="btn-primary flex-shrink-0" :disabled="saving" @click="handleSave">
        <svg v-if="saving" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        {{ saving ? '保存中…' : '保存' }}
      </button>
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
      <!-- Tabs -->
      <div class="border-b border-gray-200 dark:border-gray-700">
        <nav class="flex space-x-8">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="py-3 px-1 border-b-2 font-medium text-sm transition-colors"
            :class="activeTab === tab.key
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </nav>
      </div>

      <!-- ── Tab: 场景信息 ──────────────────────────────────────────────────── -->
      <div v-if="activeTab === 'basic'" class="card p-6 space-y-5">
        <!-- Name -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            名称 <span class="text-red-500">*</span>
          </label>
          <input v-model="form.name" type="text" class="input" placeholder="如：皇宫正殿、深山古洞" maxlength="100" />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <!-- Type -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">类型</label>
            <select v-model="form.type" class="input">
              <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>

          <!-- Variant -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              变体
              <span class="text-xs font-normal text-gray-400 ml-1">（可选，如 day / night / winter）</span>
            </label>
            <input v-model="form.variant" type="text" class="input" placeholder="day / night / ruined / winter…" />
          </div>
        </div>

        <!-- Stats (read-only) -->
        <div v-if="anchor" class="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div class="text-center">
            <p class="text-lg font-bold text-gray-900 dark:text-white">{{ anchor.usage_count ?? 0 }}</p>
            <p class="text-xs text-gray-500">引用次数</p>
          </div>
          <div v-if="anchor.avg_cons_score > 0" class="text-center">
            <p class="text-lg font-bold" :class="scoreColor(anchor.avg_cons_score)">{{ anchor.avg_cons_score.toFixed(2) }}</p>
            <p class="text-xs text-gray-500">平均一致性</p>
          </div>
          <div class="text-center">
            <p class="text-sm font-medium" :class="anchor.ref_image_locked_at ? 'text-green-600 dark:text-green-400' : 'text-gray-400'">
              {{ anchor.ref_image_locked_at ? '已锁定' : '未锁定' }}
            </p>
            <p class="text-xs text-gray-500">参考图</p>
          </div>
        </div>
      </div>

      <!-- ── Tab: 视觉 & 参考图 ──────────────────────────────────────────── -->
      <div v-if="activeTab === 'visual'" class="space-y-5">
        <!-- Visual prompts card -->
        <div class="card p-6 space-y-5">
          <div>
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">视觉提示词</h3>
            <p class="text-xs text-gray-400">以下字段将直接注入 AI 图像/视频生成提示词，建议使用英文。</p>
          </div>

          <!-- Prompt Lock -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">核心关键词（Prompt Lock）</label>
            <input
              v-model="form.prompt_lock"
              type="text"
              class="input font-mono text-sm"
              placeholder="grand hall, marble columns, red carpet, golden torchlight"
            />
            <p class="mt-1 text-xs text-gray-400">逗号分隔，每次生成都会强制注入，控制场景一致性的核心视觉元素</p>
          </div>

          <!-- Description -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">完整视觉描述（英文）</label>
            <textarea
              v-model="form.description"
              rows="5"
              class="input resize-none font-mono text-sm"
              placeholder="A grand imperial throne hall bathed in warm golden light, towering marble columns lined with red silk banners, intricate dragon carvings on the ceiling, polished jade floor reflecting the candlelight..."
            ></textarea>
            <p class="mt-1 text-xs text-gray-400">场景的完整英文视觉描述，包含建筑结构、光线氛围、空间感等细节</p>
          </div>

          <div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs text-blue-700 dark:text-blue-300">
            <span class="font-medium">生成提示词顺序：</span>
            <span class="font-mono ml-1">核心关键词 → 完整视觉描述 → 分镜动作描述</span>
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
              @click="anchor?.ref_image_url && openLightbox(anchor.ref_image_url)"
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
              <!-- Lock status -->
              <div v-if="anchor?.ref_image_locked_at" class="flex items-center gap-2 text-sm">
                <svg class="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span class="text-green-600 dark:text-green-400 font-medium">已锁定</span>
                <span class="text-gray-400 text-xs">{{ new Date(anchor.ref_image_locked_at).toLocaleString() }}</span>
              </div>
              <div v-else class="flex items-center gap-2 text-sm text-gray-500">
                <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
                <span>未锁定（生成后自动锁定）</span>
              </div>

              <button
                class="btn-primary text-sm"
                :disabled="generatingRefImage"
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

              <p class="text-xs text-gray-400">AI 将根据核心关键词和视觉描述生成参考图，生成完成后自动锁定。</p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
