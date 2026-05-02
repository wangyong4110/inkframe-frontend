<script setup lang="ts">
import type { SceneAnchor, UpdateSceneAnchorPayload, ConsistencyLog } from '~/composables/useSceneAnchorApi'
import { useSceneAnchorApi } from '~/composables/useSceneAnchorApi'

const { openLightbox } = useImageLightbox()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const api = useSceneAnchorApi()

const anchorId = parseInt(route.params.id as string)
const novelId = parseInt(route.query.novelId as string)

const activeTab = ref('basic')
const saving = ref(false)
const isDirty = ref(false)
const loading = ref(true)

// Original anchor data
const anchor = ref<SceneAnchor | null>(null)

// Editable form
const form = ref({
  name: '',
  type: 'interior' as string,
  variant: '',
  description: '',
  prompt_lock: '',
  style_tokens: '',
  notes: '',
  parent_anchor_id: undefined as number | undefined,
})

// All anchors for parent_anchor_id selector
const allAnchors = ref<SceneAnchor[]>([])

// Ref image generation
const generatingRefImage = ref(false)

// Consistency logs
const logs = ref<ConsistencyLog[]>([])
const logsLoading = ref(false)

const tabs = [
  { key: 'basic',     label: '基本信息' },
  { key: 'visual',    label: '视觉提示' },
  { key: 'ref_image', label: '参考图' },
  { key: 'history',   label: '一致性历史' },
]

useUnsavedGuard(isDirty, '场景锚点有未保存的修改，确认离开？')
watch(form, () => { isDirty.value = true }, { deep: true })

const typeOptions = [
  { value: 'interior',  label: '室内 (interior)' },
  { value: 'exterior',  label: '室外 (exterior)' },
  { value: 'imaginary', label: '虚幻 (imaginary)' },
]

function typeLabel(t: string) {
  return typeOptions.find(o => o.value === t)?.label ?? t
}

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

function scoreBgClass(score: number) {
  if (score >= 0.85) return 'bg-green-400'
  if (score >= 0.70) return 'bg-amber-400'
  return 'bg-red-400'
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
      style_tokens: a.style_tokens ?? '',
      notes: a.notes ?? '',
      parent_anchor_id: a.parent_anchor_id,
    }

    // Load all anchors for parent selector
    if (novelId) {
      const sceneAnchorStore = useSceneAnchorStore()
      if (sceneAnchorStore.anchors.length === 0) {
        await sceneAnchorStore.fetchAnchors(novelId)
      }
      allAnchors.value = sceneAnchorStore.anchors
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
      style_tokens: form.value.style_tokens,
      notes: form.value.notes,
      parent_anchor_id: form.value.parent_anchor_id || undefined,
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

async function loadLogs() {
  if (logs.value.length > 0) return
  logsLoading.value = true
  try {
    logs.value = await api.getConsistencyLogs(anchorId)
  } catch {
    // ignore
  } finally {
    logsLoading.value = false
  }
}

watch(activeTab, (tab) => {
  if (tab === 'history') loadLogs()
})

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

      <!-- ── Tab: 基本信息 ──────────────────────────────────────────────────── -->
      <div v-if="activeTab === 'basic'" class="card p-6 space-y-5">
        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">基本信息</h3>

        <!-- Name -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            名称 <span class="text-red-500">*</span>
          </label>
          <input v-model="form.name" type="text" class="input" placeholder="如：皇宫正殿" maxlength="100" />
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
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">变体（Variant）</label>
            <input v-model="form.variant" type="text" class="input" placeholder="如：day / night / winter" />
          </div>
        </div>

        <!-- Parent anchor -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">父锚点</label>
          <select v-model="form.parent_anchor_id" class="input">
            <option :value="undefined">无</option>
            <option
              v-for="a in allAnchors.filter(a => a.id !== anchorId)"
              :key="a.id"
              :value="a.id"
            >{{ a.name }}</option>
          </select>
        </div>

        <!-- Notes -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">备注</label>
          <textarea v-model="form.notes" rows="3" class="input resize-none" placeholder="内部备注，不影响 AI 生成"></textarea>
        </div>
      </div>

      <!-- ── Tab: 视觉提示 ──────────────────────────────────────────────────── -->
      <div v-if="activeTab === 'visual'" class="card p-6 space-y-5">
        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">视觉提示</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">这些字段直接注入到 AI 图像/视频生成的提示词中，建议使用英文。</p>

        <!-- Description -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">视觉描述（英文）</label>
          <textarea
            v-model="form.description"
            rows="4"
            class="input resize-none font-mono text-sm"
            placeholder="A cozy rustic cottage bedroom bathed in soft morning light..."
          ></textarea>
          <p class="mt-1 text-xs text-gray-400">建筑结构、光线、氛围的英文描述，用于场景参考图生成</p>
        </div>

        <!-- Prompt Lock -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prompt Lock（核心关键词）</label>
          <input
            v-model="form.prompt_lock"
            type="text"
            class="input font-mono text-sm"
            placeholder="grand hall, marble columns, red carpet, golden light"
          />
          <p class="mt-1 text-xs text-gray-400">逗号分隔的核心视觉关键词，每次生成都会强制注入</p>
        </div>

        <!-- Style Tokens -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Style Tokens</label>
          <input
            v-model="form.style_tokens"
            type="text"
            class="input font-mono text-sm"
            placeholder="ancient_chinese, warmly_lit, early_morning, intimate"
          />
          <p class="mt-1 text-xs text-gray-400">风格标记，影响画面的整体艺术风格</p>
        </div>

        <div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs text-blue-700 dark:text-blue-300 space-y-1">
          <p class="font-medium">生成提示词组合顺序：</p>
          <p class="font-mono">Prompt Lock + Description + Style Tokens + Shot Prompt</p>
        </div>
      </div>

      <!-- ── Tab: 参考图 ────────────────────────────────────────────────────── -->
      <div v-if="activeTab === 'ref_image'" class="card p-6 space-y-5">
        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">场景参考图</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">锁定一张参考图后，所有关联此锚点的分镜生成时都会使用此图作为风格参考，保证场景一致性。</p>

        <!-- Image preview -->
        <div class="flex gap-6 items-start">
          <div class="relative flex-shrink-0 w-48 h-36 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 border-2 border-dashed border-gray-200 dark:border-gray-600">
            <img
              v-if="anchor?.ref_image_url"
              :src="anchor.ref_image_url"
              class="w-full h-full object-cover cursor-zoom-in"
              alt="场景参考图"
              @click="openLightbox(anchor.ref_image_url)"
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

          <div class="flex-1 space-y-3">
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
              <span>未锁定</span>
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

            <p class="text-xs text-gray-400">
              AI 将根据「视觉描述」和「Prompt Lock」生成参考图，并自动锁定。
            </p>
          </div>
        </div>
      </div>

      <!-- ── Tab: 一致性历史 ───────────────────────────────────────────────── -->
      <div v-if="activeTab === 'history'" class="card p-6 space-y-5">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">一致性评分历史</h3>
          <div class="flex items-center gap-4 text-xs text-gray-500">
            <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-green-400 inline-block"></span>≥ 0.85 通过</span>
            <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-amber-400 inline-block"></span>0.70–0.84 重试</span>
            <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-red-400 inline-block"></span>&lt; 0.70 人工</span>
          </div>
        </div>

        <div v-if="logsLoading" class="h-24 flex items-center justify-center">
          <svg class="w-5 h-5 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
        </div>

        <div v-else-if="logs.length === 0" class="text-center py-8 text-gray-400">
          <svg class="w-10 h-10 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p class="text-sm">暂无评分记录</p>
          <p class="text-xs mt-1">生成分镜并完成一致性评分后会自动记录</p>
        </div>

        <div v-else class="space-y-4">
          <!-- Bar chart -->
          <div class="flex items-end gap-1.5 h-24 bg-gray-50 dark:bg-gray-800 rounded-lg px-4 pb-2 pt-3 overflow-x-auto">
            <div
              v-for="log in logs.slice(0, 30)"
              :key="log.id"
              class="flex flex-col items-center gap-1 flex-shrink-0"
            >
              <div
                class="w-5 rounded-t transition-all"
                :class="scoreBgClass(log.overall_score)"
                :style="{ height: `${Math.round(log.overall_score * 60) + 4}px` }"
                :title="`Shot #${log.shot_id}: ${log.overall_score.toFixed(2)}`"
              ></div>
            </div>
          </div>

          <!-- Log table -->
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead>
                <tr class="text-left text-gray-500 border-b border-gray-100 dark:border-gray-700">
                  <th class="pb-2 font-medium">镜头</th>
                  <th class="pb-2 font-medium">综合</th>
                  <th class="pb-2 font-medium">建筑</th>
                  <th class="pb-2 font-medium">光线</th>
                  <th class="pb-2 font-medium">氛围</th>
                  <th class="pb-2 font-medium">状态</th>
                  <th class="pb-2 font-medium">时间</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50 dark:divide-gray-800">
                <tr v-for="log in logs.slice(0, 20)" :key="log.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td class="py-1.5 text-gray-600 dark:text-gray-400">#{{ log.shot_id }}</td>
                  <td class="py-1.5 font-medium" :class="scoreColor(log.overall_score)">{{ log.overall_score.toFixed(2) }}</td>
                  <td class="py-1.5 text-gray-600 dark:text-gray-400">{{ log.arch_score.toFixed(2) }}</td>
                  <td class="py-1.5 text-gray-600 dark:text-gray-400">{{ log.light_score.toFixed(2) }}</td>
                  <td class="py-1.5 text-gray-600 dark:text-gray-400">{{ log.atmo_score.toFixed(2) }}</td>
                  <td class="py-1.5">
                    <span
                      class="px-1.5 py-0.5 rounded text-xs font-medium"
                      :class="log.passed
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'"
                    >
                      {{ log.passed ? '通过' : '未通过' }}
                    </span>
                  </td>
                  <td class="py-1.5 text-gray-400">{{ new Date(log.created_at).toLocaleDateString() }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
