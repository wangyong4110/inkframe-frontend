<script setup lang="ts">
import type { HookChain, CreateHookPayload } from '~/composables/useHookChainApi'
import type { SatisfactionPoint, CreateSatisfactionPointPayload } from '~/composables/useSatisfactionPointApi'
import type { ConflictArc, CreateConflictArcPayload } from '~/composables/useConflictArcApi'
import type { PacingPoint, PacingHealth } from '~/composables/usePacingApi'

const props = defineProps<{ novelId: number }>()
const toast = useToast()

const { listHooks, createHook, deleteHook, fulfillHook } = useHookChainApi()
const { listSatisfactionPoints, createSatisfactionPoint, deleteSatisfactionPoint } = useSatisfactionPointApi()
const { listConflictArcs, createConflictArc, deleteConflictArc, advancePhase } = useConflictArcApi()
const { getPacingCurve, getPacingHealth } = usePacingApi()

const activeSection = ref<'pacing' | 'hooks' | 'satisfaction' | 'arcs'>('pacing')

// ── 节奏曲线 ──────────────────────────────────────────────────────────────────
const pacingPoints = ref<PacingPoint[]>([])
const pacingHealth = ref<PacingHealth | null>(null)
const pacingLoading = ref(false)

async function fetchPacing() {
  pacingLoading.value = true
  try {
    const [curve, health] = await Promise.all([
      getPacingCurve(props.novelId),
      getPacingHealth(props.novelId),
    ])
    pacingPoints.value = curve.points ?? []
    pacingHealth.value = health
  } catch (e: any) {
    toast.error('加载节奏数据失败：' + (e.message || ''))
  } finally {
    pacingLoading.value = false
  }
}

const maxTension = computed(() => Math.max(...pacingPoints.value.map(p => p.tension_level), 1))

function barHeight(tension: number) {
  return Math.max(4, Math.round((tension / maxTension.value) * 100))
}

const TONE_COLORS: Record<string, string> = {
  tense: 'bg-red-400',
  exciting: 'bg-orange-400',
  happy: 'bg-yellow-400',
  romantic: 'bg-pink-400',
  sad: 'bg-blue-400',
  calm: 'bg-green-400',
  mysterious: 'bg-purple-400',
}

function toneColor(tone: string) {
  return TONE_COLORS[tone] ?? 'bg-gray-400'
}

// ── 钩子链 ────────────────────────────────────────────────────────────────────
const hooks = ref<HookChain[]>([])
const hooksLoading = ref(false)
const showHookForm = ref(false)
const hookForm = ref<CreateHookPayload>({
  type: 'chapter_end',
  description: '',
  planted_at: 1,
  planned_payoff_at: 10,
  intensity: 5,
  notes: '',
})
const hookSaving = ref(false)

const HOOK_TYPE_LABELS: Record<string, string> = {
  chapter_end: '章末钩子',
  emotional: '情感钩子',
  mystery: '悬念钩子',
  threat: '威胁钩子',
  promise: '承诺钩子',
}

async function fetchHooks() {
  hooksLoading.value = true
  try {
    const res = await listHooks(props.novelId)
    hooks.value = res.hooks ?? []
  } catch (e: any) {
    toast.error('加载钩子链失败：' + (e.message || ''))
  } finally {
    hooksLoading.value = false
  }
}

async function handleCreateHook() {
  if (!hookForm.value.description.trim()) return toast.error('请填写钩子描述')
  hookSaving.value = true
  try {
    await createHook(props.novelId, hookForm.value)
    toast.success('钩子已创建')
    showHookForm.value = false
    await fetchHooks()
  } catch (e: any) {
    toast.error('创建失败：' + (e.message || ''))
  } finally {
    hookSaving.value = false
  }
}

async function handleDeleteHook(hook: HookChain) {
  const ok = confirm('确认删除此钩子？')
  if (!ok) return
  try {
    await deleteHook(hook.id)
    hooks.value = hooks.value.filter(h => h.id !== hook.id)
    toast.success('已删除')
  } catch (e: any) {
    toast.error('删除失败：' + (e.message || ''))
  }
}

async function handleFulfillHook(hook: HookChain, actualChapter: number) {
  try {
    await fulfillHook(hook.id, actualChapter)
    toast.success('钩子已标记为已兑现')
    await fetchHooks()
  } catch (e: any) {
    toast.error('操作失败：' + (e.message || ''))
  }
}

// ── 爽点 ──────────────────────────────────────────────────────────────────────
const satisfactionPoints = ref<SatisfactionPoint[]>([])
const spLoading = ref(false)
const showSpForm = ref(false)
const spForm = ref<CreateSatisfactionPointPayload>({
  type: 'face_slap',
  description: '',
  planned_chapter: 10,
  buildup_start: 1,
  intensity_target: 8,
  notes: '',
})
const spSaving = ref(false)

const SP_TYPE_LABELS: Record<string, string> = {
  face_slap: '打脸', breakthrough: '突破', reveal: '揭秘',
  reunion: '重逢', revenge: '复仇', recognition: '认可', other: '其他',
}

async function fetchSatisfactionPoints() {
  spLoading.value = true
  try {
    const res = await listSatisfactionPoints(props.novelId)
    satisfactionPoints.value = res.satisfaction_points ?? []
  } catch (e: any) {
    toast.error('加载爽点失败：' + (e.message || ''))
  } finally {
    spLoading.value = false
  }
}

async function handleCreateSP() {
  if (!spForm.value.description.trim()) return toast.error('请填写爽点描述')
  spSaving.value = true
  try {
    await createSatisfactionPoint(props.novelId, spForm.value)
    toast.success('爽点已创建')
    showSpForm.value = false
    await fetchSatisfactionPoints()
  } catch (e: any) {
    toast.error('创建失败：' + (e.message || ''))
  } finally {
    spSaving.value = false
  }
}

async function handleDeleteSP(sp: SatisfactionPoint) {
  const ok = confirm('确认删除此爽点？')
  if (!ok) return
  try {
    await deleteSatisfactionPoint(sp.id)
    satisfactionPoints.value = satisfactionPoints.value.filter(s => s.id !== sp.id)
    toast.success('已删除')
  } catch (e: any) {
    toast.error('删除失败：' + (e.message || ''))
  }
}

// ── 冲突弧 ────────────────────────────────────────────────────────────────────
const arcs = ref<ConflictArc[]>([])
const arcsLoading = ref(false)
const showArcForm = ref(false)
const arcForm = ref<CreateConflictArcPayload>({
  title: '',
  description: '',
  type: 'interpersonal',
  antagonist: '',
  start_chapter: 1,
})
const arcSaving = ref(false)

const ARC_PHASES: ConflictPhase[] = ['setup', 'escalation', 'climax', 'resolution']
const ARC_PHASE_LABELS: Record<string, string> = {
  setup: '铺垫', escalation: '升级', climax: '高潮', resolution: '收尾',
}
const ARC_TYPE_LABELS: Record<string, string> = {
  internal: '内心冲突', interpersonal: '人际冲突', social: '社会冲突',
}

async function fetchArcs() {
  arcsLoading.value = true
  try {
    const res = await listConflictArcs(props.novelId)
    arcs.value = res.conflict_arcs ?? []
  } catch (e: any) {
    toast.error('加载冲突弧失败：' + (e.message || ''))
  } finally {
    arcsLoading.value = false
  }
}

async function handleCreateArc() {
  if (!arcForm.value.title.trim()) return toast.error('请填写冲突弧标题')
  arcSaving.value = true
  try {
    await createConflictArc(props.novelId, arcForm.value)
    toast.success('冲突弧已创建')
    showArcForm.value = false
    await fetchArcs()
  } catch (e: any) {
    toast.error('创建失败：' + (e.message || ''))
  } finally {
    arcSaving.value = false
  }
}

async function handleAdvancePhase(arc: ConflictArc) {
  try {
    await advancePhase(arc.id)
    toast.success('阶段已推进')
    await fetchArcs()
  } catch (e: any) {
    toast.error('操作失败：' + (e.message || ''))
  }
}

async function handleDeleteArc(arc: ConflictArc) {
  const ok = confirm('确认删除此冲突弧？')
  if (!ok) return
  try {
    await deleteConflictArc(arc.id)
    arcs.value = arcs.value.filter(a => a.id !== arc.id)
    toast.success('已删除')
  } catch (e: any) {
    toast.error('删除失败：' + (e.message || ''))
  }
}

// ── 初始化 ───────────────────────────────────────────────────────────────────
watch(activeSection, (section) => {
  if (section === 'pacing' && pacingPoints.value.length === 0) fetchPacing()
  if (section === 'hooks' && hooks.value.length === 0) fetchHooks()
  if (section === 'satisfaction' && satisfactionPoints.value.length === 0) fetchSatisfactionPoints()
  if (section === 'arcs' && arcs.value.length === 0) fetchArcs()
}, { immediate: true })
</script>

<template>
  <div class="space-y-4">
    <!-- 子导航 -->
    <div class="card overflow-hidden">
      <div class="flex">
        <button
          v-for="s in [
            { key: 'pacing', label: '节奏曲线' },
            { key: 'hooks', label: '钩子链' },
            { key: 'satisfaction', label: '爽点规划' },
            { key: 'arcs', label: '冲突弧' },
          ]"
          :key="s.key"
          class="flex-1 py-3 text-sm font-medium transition-colors"
          :class="activeSection === s.key
            ? 'border-b-2 border-primary-500 text-primary-600 dark:text-primary-400'
            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
          @click="activeSection = s.key as any"
        >
          {{ s.label }}
        </button>
      </div>
    </div>

    <!-- 节奏曲线 -->
    <div v-if="activeSection === 'pacing'" class="card p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-semibold text-gray-900 dark:text-white">节奏曲线</h3>
        <button class="btn-outline text-sm" :disabled="pacingLoading" @click="fetchPacing">刷新</button>
      </div>

      <div v-if="pacingLoading" class="flex justify-center py-12">
        <div class="w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
      </div>

      <!-- 健康状态 -->
      <div v-if="pacingHealth" class="mb-4 p-3 rounded-lg" :class="{
        'bg-green-50 dark:bg-green-900/20': pacingHealth.status === 'healthy',
        'bg-yellow-50 dark:bg-yellow-900/20': pacingHealth.status === 'warning',
        'bg-red-50 dark:bg-red-900/20': pacingHealth.status === 'critical',
      }">
        <div class="flex items-center gap-2 mb-2">
          <span class="w-2 h-2 rounded-full" :class="{
            'bg-green-500': pacingHealth.status === 'healthy',
            'bg-yellow-500': pacingHealth.status === 'warning',
            'bg-red-500': pacingHealth.status === 'critical',
          }"></span>
          <span class="text-sm font-medium" :class="{
            'text-green-700 dark:text-green-300': pacingHealth.status === 'healthy',
            'text-yellow-700 dark:text-yellow-300': pacingHealth.status === 'warning',
            'text-red-700 dark:text-red-300': pacingHealth.status === 'critical',
          }">
            {{ { healthy: '节奏健康', warning: '节奏警告', critical: '节奏问题' }[pacingHealth.status] }}
          </span>
        </div>
        <ul v-if="pacingHealth.warnings?.length" class="space-y-1">
          <li v-for="w in pacingHealth.warnings" :key="w.message" class="text-xs text-gray-600 dark:text-gray-400">
            · {{ w.message }}
          </li>
        </ul>
      </div>

      <!-- 柱状图 -->
      <div v-if="pacingPoints.length > 0" class="overflow-x-auto">
        <div class="flex items-end gap-1 min-w-0 h-32">
          <div
            v-for="point in pacingPoints"
            :key="point.chapter_no"
            class="flex-1 min-w-4 rounded-t cursor-pointer group relative"
            :class="toneColor(point.emotional_tone)"
            :style="{ height: `${barHeight(point.tension_level)}%` }"
            :title="`第${point.chapter_no}章：${point.title || ''} 张力${point.tension_level}`"
          >
            <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
              第{{ point.chapter_no }}章 · 张力{{ point.tension_level }}
            </div>
          </div>
        </div>
        <div class="flex justify-between text-xs text-gray-400 mt-1 px-1">
          <span>第1章</span>
          <span>第{{ pacingPoints.at(-1)?.chapter_no }}章</span>
        </div>
      </div>

      <div v-else-if="!pacingLoading" class="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
        暂无节奏数据，请先生成章节后查看
      </div>
    </div>

    <!-- 钩子链 -->
    <div v-if="activeSection === 'hooks'" class="space-y-4">
      <div class="flex justify-between items-center">
        <span class="text-sm text-gray-500 dark:text-gray-400">共 {{ hooks.length }} 个钩子</span>
        <button class="btn-primary text-sm" @click="showHookForm = true">添加钩子</button>
      </div>

      <div v-if="hooksLoading" class="flex justify-center py-8">
        <div class="w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
      </div>

      <div v-else-if="hooks.length === 0" class="card p-8 text-center text-gray-400 text-sm">
        暂无钩子，添加钩子来追踪伏笔与悬念
      </div>

      <div v-else class="space-y-3">
        <div v-for="hook in hooks" :key="hook.id" class="card p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="px-2 py-0.5 text-xs rounded-full" :class="hook.is_fulfilled
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'"
                >
                  {{ HOOK_TYPE_LABELS[hook.type] ?? hook.type }}
                </span>
                <span v-if="hook.is_fulfilled" class="text-xs text-green-600 dark:text-green-400">✓ 已兑现</span>
              </div>
              <p class="text-sm text-gray-700 dark:text-gray-300">{{ hook.description }}</p>
              <p class="text-xs text-gray-400 mt-1">
                第{{ hook.planted_at }}章埋下 · 计划第{{ hook.planned_payoff_at }}章兑现
                · 强度 {{ hook.intensity }}/10
              </p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button
                v-if="!hook.is_fulfilled"
                class="text-xs btn-outline py-1 px-2"
                @click="handleFulfillHook(hook, hook.planned_payoff_at)"
              >兑现</button>
              <button class="text-red-400 hover:text-red-600 p-1" @click="handleDeleteHook(hook)">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 钩子表单 -->
      <div v-if="showHookForm" class="card p-5 border-2 border-primary-300 dark:border-primary-700">
        <h4 class="font-medium text-gray-900 dark:text-white mb-4">添加新钩子</h4>
        <div class="grid gap-3 md:grid-cols-2">
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">类型</label>
            <select v-model="hookForm.type" class="input text-sm">
              <option v-for="(label, key) in HOOK_TYPE_LABELS" :key="key" :value="key">{{ label }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">强度 ({{ hookForm.intensity }}/10)</label>
            <input v-model.number="hookForm.intensity" type="range" min="1" max="10" class="w-full" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">埋下章节</label>
            <input v-model.number="hookForm.planted_at" type="number" min="1" class="input text-sm" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">计划兑现章节</label>
            <input v-model.number="hookForm.planned_payoff_at" type="number" min="1" class="input text-sm" />
          </div>
          <div class="md:col-span-2">
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">描述</label>
            <textarea v-model="hookForm.description" class="input text-sm" rows="2" placeholder="描述此钩子的内容和目的"></textarea>
          </div>
          <div class="md:col-span-2">
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">备注</label>
            <input v-model="hookForm.notes" type="text" class="input text-sm" placeholder="可选备注" />
          </div>
        </div>
        <div class="flex justify-end gap-2 mt-4">
          <button class="btn-outline text-sm" @click="showHookForm = false">取消</button>
          <button class="btn-primary text-sm" :disabled="hookSaving" @click="handleCreateHook">
            {{ hookSaving ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 爽点规划 -->
    <div v-if="activeSection === 'satisfaction'" class="space-y-4">
      <div class="flex justify-between items-center">
        <span class="text-sm text-gray-500 dark:text-gray-400">共 {{ satisfactionPoints.length }} 个爽点</span>
        <button class="btn-primary text-sm" @click="showSpForm = true">添加爽点</button>
      </div>

      <div v-if="spLoading" class="flex justify-center py-8">
        <div class="w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
      </div>

      <div v-else-if="satisfactionPoints.length === 0" class="card p-8 text-center text-gray-400 text-sm">
        暂无爽点，规划高潮时刻让读者爽到
      </div>

      <div v-else class="space-y-3">
        <div v-for="sp in satisfactionPoints" :key="sp.id" class="card p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="px-2 py-0.5 text-xs rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                  {{ SP_TYPE_LABELS[sp.type] ?? sp.type }}
                </span>
                <span v-if="sp.chapter_id" class="text-xs text-green-600 dark:text-green-400">✓ 已实现</span>
              </div>
              <p class="text-sm text-gray-700 dark:text-gray-300">{{ sp.description }}</p>
              <p class="text-xs text-gray-400 mt-1">
                计划第{{ sp.planned_chapter }}章 · 铺垫从第{{ sp.buildup_start }}章开始
                · 预期强度 {{ sp.intensity_target }}/10
              </p>
            </div>
            <button class="text-red-400 hover:text-red-600 p-1 shrink-0" @click="handleDeleteSP(sp)">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- 爽点表单 -->
      <div v-if="showSpForm" class="card p-5 border-2 border-primary-300 dark:border-primary-700">
        <h4 class="font-medium text-gray-900 dark:text-white mb-4">添加爽点</h4>
        <div class="grid gap-3 md:grid-cols-2">
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">类型</label>
            <select v-model="spForm.type" class="input text-sm">
              <option v-for="(label, key) in SP_TYPE_LABELS" :key="key" :value="key">{{ label }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">强度目标 ({{ spForm.intensity_target }}/10)</label>
            <input v-model.number="spForm.intensity_target" type="range" min="1" max="10" class="w-full" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">计划实现章节</label>
            <input v-model.number="spForm.planned_chapter" type="number" min="1" class="input text-sm" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">铺垫起始章节</label>
            <input v-model.number="spForm.buildup_start" type="number" min="1" class="input text-sm" />
          </div>
          <div class="md:col-span-2">
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">描述</label>
            <textarea v-model="spForm.description" class="input text-sm" rows="2" placeholder="描述这个爽点的内容"></textarea>
          </div>
        </div>
        <div class="flex justify-end gap-2 mt-4">
          <button class="btn-outline text-sm" @click="showSpForm = false">取消</button>
          <button class="btn-primary text-sm" :disabled="spSaving" @click="handleCreateSP">
            {{ spSaving ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 冲突弧 -->
    <div v-if="activeSection === 'arcs'" class="space-y-4">
      <div class="flex justify-between items-center">
        <span class="text-sm text-gray-500 dark:text-gray-400">共 {{ arcs.length }} 条冲突弧</span>
        <button class="btn-primary text-sm" @click="showArcForm = true">添加冲突弧</button>
      </div>

      <div v-if="arcsLoading" class="flex justify-center py-8">
        <div class="w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
      </div>

      <div v-else-if="arcs.length === 0" class="card p-8 text-center text-gray-400 text-sm">
        暂无冲突弧，追踪故事的核心矛盾发展
      </div>

      <div v-else class="space-y-3">
        <div v-for="arc in arcs" :key="arc.id" class="card p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <h4 class="font-medium text-gray-900 dark:text-white text-sm">{{ arc.title }}</h4>
                <span class="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                  {{ ARC_TYPE_LABELS[arc.type] ?? arc.type }}
                </span>
              </div>
              <p v-if="arc.description" class="text-sm text-gray-500 dark:text-gray-400 mb-2">{{ arc.description }}</p>

              <!-- 阶段进度 -->
              <div class="flex gap-1 mb-2">
                <div
                  v-for="(phase, idx) in ARC_PHASES"
                  :key="phase"
                  class="flex-1 h-1.5 rounded-full transition-colors"
                  :class="idx <= ARC_PHASES.indexOf((arc.current_phase ?? 'setup') as ConflictPhase)
                    ? 'bg-primary-500'
                    : 'bg-gray-200 dark:bg-gray-700'"
                  :title="ARC_PHASE_LABELS[phase]"
                ></div>
              </div>
              <p class="text-xs text-gray-400">
                当前阶段：{{ ARC_PHASE_LABELS[arc.current_phase ?? 'setup'] }}
                · 对立方：{{ arc.antagonist || '未设置' }}
                · 从第{{ arc.start_chapter }}章开始
              </p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button
                v-if="arc.current_phase !== 'resolution'"
                class="text-xs btn-outline py-1 px-2"
                @click="handleAdvancePhase(arc)"
              >推进</button>
              <button class="text-red-400 hover:text-red-600 p-1" @click="handleDeleteArc(arc)">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 冲突弧表单 -->
      <div v-if="showArcForm" class="card p-5 border-2 border-primary-300 dark:border-primary-700">
        <h4 class="font-medium text-gray-900 dark:text-white mb-4">添加冲突弧</h4>
        <div class="grid gap-3 md:grid-cols-2">
          <div class="md:col-span-2">
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">标题</label>
            <input v-model="arcForm.title" type="text" class="input text-sm" placeholder="例如：主角与反派的终极对决" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">冲突类型</label>
            <select v-model="arcForm.type" class="input text-sm">
              <option v-for="(label, key) in ARC_TYPE_LABELS" :key="key" :value="key">{{ label }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">起始章节</label>
            <input v-model.number="arcForm.start_chapter" type="number" min="1" class="input text-sm" />
          </div>
          <div class="md:col-span-2">
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">对立方/反派</label>
            <input v-model="arcForm.antagonist" type="text" class="input text-sm" placeholder="反派/对立角色名" />
          </div>
          <div class="md:col-span-2">
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">描述</label>
            <textarea v-model="arcForm.description" class="input text-sm" rows="2" placeholder="描述此冲突的背景和核心矛盾"></textarea>
          </div>
        </div>
        <div class="flex justify-end gap-2 mt-4">
          <button class="btn-outline text-sm" @click="showArcForm = false">取消</button>
          <button class="btn-primary text-sm" :disabled="arcSaving" @click="handleCreateArc">
            {{ arcSaving ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
