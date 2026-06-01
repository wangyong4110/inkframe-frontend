<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white">伏笔管理</h3>
      <div class="flex gap-2">
        <button
          @click="handleAIExtract"
          :disabled="extracting"
          class="btn-secondary text-sm"
          aria-label="AI 提取伏笔"
        >
          <svg v-if="extracting" class="animate-spin w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          {{ extracting ? '提取中...' : 'AI 提取' }}
        </button>
        <button @click="openCreate" aria-label="添加伏笔" class="btn-primary text-sm">
          <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          新建伏笔
        </button>
      </div>
    </div>

    <!-- Stats + Filter tabs -->
    <div v-if="!loading && items.length > 0" class="flex items-center justify-between">
      <div class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
        <span class="font-medium text-gray-700 dark:text-gray-300">{{ items.length }} 条伏笔</span>
        <span class="text-yellow-600 dark:text-yellow-400">{{ plantedCount }} 未兑现</span>
        <span class="text-green-600 dark:text-green-400">{{ paidCount }} 已兑现</span>
        <span v-if="abandonedCount > 0" class="text-gray-400">{{ abandonedCount }} 已放弃</span>
      </div>
      <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 text-xs">
        <button
          v-for="tab in statusTabs" :key="tab.value"
          @click="statusFilter = tab.value"
          :class="[
            'px-2.5 py-1 transition-colors',
            statusFilter === tab.value
              ? 'bg-primary-600 text-white'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50'
          ]"
        >{{ tab.label }}<span v-if="tab.count > 0" class="ml-1 opacity-70">{{ tab.count }}</span></button>
      </div>
    </div>

    <!-- List -->
    <div v-if="loading" class="text-center py-8 text-gray-400 text-sm">加载中…</div>
    <div v-else-if="items.length === 0" class="card p-8 text-center">
      <p class="text-gray-500 dark:text-gray-400 text-sm mb-3">还没有伏笔记录，点击"新建伏笔"或让 AI 自动提取</p>
      <button @click="openCreate" class="btn-primary text-sm mx-auto">新建伏笔</button>
    </div>
    <div v-else-if="displayList.length === 0" class="text-center py-6 text-gray-400 text-sm">
      该状态下暂无伏笔
    </div>
    <div v-else class="space-y-2">
      <div
        v-for="item in displayList"
        :key="item.id"
        class="flex items-stretch bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden hover:shadow-soft transition-shadow"
      >
        <!-- Status stripe -->
        <div class="w-1 shrink-0" :class="statusStripe(item.status)" />
        <!-- Content -->
        <div class="flex-1 flex items-center justify-between px-3 py-2.5 min-w-0 gap-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-medium text-gray-900 dark:text-white truncate">
                {{ item.title || '（无标题）' }}
              </span>
              <span class="text-xs px-1.5 py-0.5 rounded-full shrink-0" :class="statusClass(item.status)">
                {{ statusLabel(item.status) }}
              </span>
            </div>
            <p v-if="item.description" class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
              {{ item.description }}
            </p>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button
              v-if="item.status === 'planted'"
              @click="markPaidOff(item)"
              class="text-xs px-2 py-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/40 rounded transition-colors"
            >✓ 兑现</button>
            <button
              @click="editItem(item)"
              class="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/40 rounded transition-colors"
            >编辑</button>
            <button
              @click="deleteItem(item.id)"
              class="text-xs px-2 py-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/40 rounded transition-colors"
            >删除</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h4 class="text-lg font-semibold text-gray-900 dark:text-white">
          {{ editingItem ? '编辑伏笔' : '添加伏笔' }}
        </h4>
        <div>
          <label class="block text-sm font-medium mb-1" for="f-title">标题 *</label>
          <input id="f-title" v-model="form.title" class="input input-bordered w-full" aria-label="伏笔标题" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1" for="f-desc">描述</label>
          <textarea id="f-desc" v-model="form.description" rows="3" class="textarea textarea-bordered w-full" aria-label="伏笔描述" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">状态</label>
          <select v-model="form.status" class="select select-bordered w-full" aria-label="伏笔状态">
            <option value="planted">已埋设</option>
            <option value="paid_off">已兑现</option>
            <option value="abandoned">已放弃</option>
          </select>
        </div>
        <div v-if="modalError" class="text-red-500 text-sm" role="alert">{{ modalError }}</div>
        <div class="flex justify-end gap-3">
          <button @click="showModal = false" class="btn btn-ghost" aria-label="取消">取消</button>
          <button @click="saveItem" :disabled="saving" class="btn btn-primary" aria-label="保存">
            {{ saving ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 钩子链 -->
    <div class="card overflow-hidden">
      <button class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors" @click="showHookSection = !showHookSection">
        <span class="flex items-center gap-2">
          <span class="text-base">🪝</span> 钩子链 <span class="text-xs text-gray-400 ml-1">悬念与章末钩子追踪</span>
        </span>
        <svg class="w-4 h-4 text-gray-400 transition-transform" :class="showHookSection ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
      </button>
      <div v-if="showHookSection" class="border-t border-gray-100 dark:border-gray-700 p-4 space-y-3">
        <div class="flex justify-between items-center">
          <span class="text-xs text-gray-400">共 {{ hooks.length }} 个钩子</span>
          <button class="btn btn-sm btn-primary" @click="showHookForm = true">添加钩子</button>
        </div>
        <div v-if="hooks.length === 0" class="text-center py-4 text-xs text-gray-400">暂无钩子记录</div>
        <div v-for="hook in hooks" :key="hook.id" class="flex items-start justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="px-2 py-0.5 text-xs rounded-full" :class="hook.is_fulfilled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'">{{ HOOK_TYPE_LABELS[hook.type] ?? hook.type }}</span>
              <span v-if="hook.is_fulfilled" class="text-xs text-green-600 dark:text-green-400">✓ 已兑现</span>
            </div>
            <p class="text-gray-700 dark:text-gray-300">{{ hook.description }}</p>
            <p class="text-xs text-gray-400 mt-1">第{{ hook.planted_at }}章埋下 · 计划第{{ hook.planned_payoff_at }}章兑现 · 强度{{ hook.intensity }}/10</p>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button v-if="!hook.is_fulfilled" class="text-xs btn btn-sm btn-ghost py-0.5 px-2" @click="handleFulfillHook(hook)">兑现</button>
            <button class="text-red-400 hover:text-red-600 p-1" @click="handleDeleteHook(hook)"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
          </div>
        </div>
        <div v-if="showHookForm" class="p-4 border border-gray-200 dark:border-gray-600 rounded-lg space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div><label class="text-xs text-gray-500 mb-1 block">类型</label><select v-model="hookForm.type" class="input text-sm w-full"><option v-for="(l,k) in HOOK_TYPE_LABELS" :key="k" :value="k">{{ l }}</option></select></div>
            <div><label class="text-xs text-gray-500 mb-1 block">强度 {{ hookForm.intensity }}/10</label><input v-model.number="hookForm.intensity" type="range" min="1" max="10" class="w-full"/></div>
            <div><label class="text-xs text-gray-500 mb-1 block">埋下章节</label><input v-model.number="hookForm.planted_at" type="number" min="1" class="input text-sm w-full"/></div>
            <div><label class="text-xs text-gray-500 mb-1 block">兑现章节</label><input v-model.number="hookForm.planned_payoff_at" type="number" min="1" class="input text-sm w-full"/></div>
            <div class="col-span-2"><label class="text-xs text-gray-500 mb-1 block">描述</label><textarea v-model="hookForm.description" class="input text-sm w-full" rows="2" placeholder="钩子内容描述"></textarea></div>
          </div>
          <div class="flex justify-end gap-2"><button class="btn btn-ghost btn-sm" @click="showHookForm = false">取消</button><button class="btn btn-primary btn-sm" :disabled="hookSaving" @click="handleCreateHook">{{ hookSaving ? '保存中...' : '保存' }}</button></div>
        </div>
      </div>
    </div>

    <!-- 冲突弧 -->
    <div class="card overflow-hidden">
      <button class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors" @click="showArcsSection = !showArcsSection">
        <span class="flex items-center gap-2">
          <span class="text-base">⚡</span> 冲突弧 <span class="text-xs text-gray-400 ml-1">核心矛盾发展追踪</span>
        </span>
        <svg class="w-4 h-4 text-gray-400 transition-transform" :class="showArcsSection ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
      </button>
      <div v-if="showArcsSection" class="border-t border-gray-100 dark:border-gray-700 p-4 space-y-3">
        <div class="flex justify-between items-center">
          <span class="text-xs text-gray-400">共 {{ arcs.length }} 条冲突弧</span>
          <button class="btn btn-sm btn-primary" @click="showArcForm = true">添加冲突弧</button>
        </div>
        <div v-if="arcs.length === 0" class="text-center py-4 text-xs text-gray-400">暂无冲突弧记录</div>
        <div v-for="arc in arcs" :key="arc.id" class="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm space-y-2">
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="font-medium text-gray-900 dark:text-white">{{ arc.title }}</span>
                <span class="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">{{ ARC_TYPE_LABELS[arc.type] ?? arc.type }}</span>
              </div>
              <p v-if="arc.description" class="text-xs text-gray-500 dark:text-gray-400 mb-2">{{ arc.description }}</p>
              <div class="flex gap-1 mb-1.5">
                <div v-for="(phase, idx) in ARC_PHASES" :key="phase" class="flex-1 h-1.5 rounded-full transition-colors" :class="idx <= ARC_PHASES.indexOf(arc.current_phase ?? 'setup') ? 'bg-primary-500' : 'bg-gray-200 dark:bg-gray-600'" :title="ARC_PHASE_LABELS[phase]"></div>
              </div>
              <p class="text-xs text-gray-400">{{ ARC_PHASE_LABELS[arc.current_phase ?? 'setup'] }} · {{ arc.antagonist || '无对立方' }} · 第{{ arc.start_chapter }}章起</p>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <button v-if="arc.current_phase !== 'resolution'" class="text-xs btn btn-sm btn-ghost py-0.5 px-2" @click="handleAdvancePhase(arc)">推进</button>
              <button class="text-red-400 hover:text-red-600 p-1" @click="handleDeleteArc(arc)"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
          </div>
        </div>
        <div v-if="showArcForm" class="p-4 border border-gray-200 dark:border-gray-600 rounded-lg space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div class="col-span-2"><label class="text-xs text-gray-500 mb-1 block">标题</label><input v-model="arcForm.title" type="text" class="input text-sm w-full" placeholder="冲突弧标题"/></div>
            <div><label class="text-xs text-gray-500 mb-1 block">类型</label><select v-model="arcForm.type" class="input text-sm w-full"><option v-for="(l,k) in ARC_TYPE_LABELS" :key="k" :value="k">{{ l }}</option></select></div>
            <div><label class="text-xs text-gray-500 mb-1 block">起始章节</label><input v-model.number="arcForm.start_chapter" type="number" min="1" class="input text-sm w-full"/></div>
            <div class="col-span-2"><label class="text-xs text-gray-500 mb-1 block">对立方</label><input v-model="arcForm.antagonist" type="text" class="input text-sm w-full" placeholder="反派/对立角色名"/></div>
            <div class="col-span-2"><label class="text-xs text-gray-500 mb-1 block">描述</label><textarea v-model="arcForm.description" class="input text-sm w-full" rows="2" placeholder="冲突背景与核心矛盾"></textarea></div>
          </div>
          <div class="flex justify-end gap-2"><button class="btn btn-ghost btn-sm" @click="showArcForm = false">取消</button><button class="btn btn-primary btn-sm" :disabled="arcSaving" @click="handleCreateArc">{{ arcSaving ? '保存中...' : '保存' }}</button></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Foreshadow } from '~/types'
import { useForeshadowApi } from '~/composables/useForeshadowApi'

const props = defineProps<{ novelId: number }>()
const foreshadowApi = useForeshadowApi()
const toast = useToast()
const { guardAiProvider } = useAiProviderGuard()

const loading = ref(false)
const extracting = ref(false)
const items = ref<Foreshadow[]>([])
const statusFilter = ref<'all' | 'planted' | 'paid_off' | 'abandoned'>('all')
const showModal = ref(false)
const editingItem = ref<Foreshadow | null>(null)
const saving = ref(false)
const modalError = ref('')

const form = reactive({ title: '', description: '', status: 'planted' as Foreshadow['status'] })

const plantedCount = computed(() => items.value.filter(i => i.status === 'planted').length)
const paidCount = computed(() => items.value.filter(i => i.status === 'paid_off').length)
const abandonedCount = computed(() => items.value.filter(i => i.status === 'abandoned').length)

const statusTabs = computed(() => [
  { value: 'all' as const, label: '全部', count: items.value.length },
  { value: 'planted' as const, label: '未兑现', count: plantedCount.value },
  { value: 'paid_off' as const, label: '已兑现', count: paidCount.value },
  { value: 'abandoned' as const, label: '已放弃', count: abandonedCount.value },
])

const displayList = computed(() => {
  const filtered = statusFilter.value === 'all' ? items.value : items.value.filter(i => i.status === statusFilter.value)
  const order: Record<string, number> = { planted: 0, paid_off: 1, abandoned: 2 }
  return [...filtered].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9))
})

function statusLabel(s: string) {
  return s === 'planted' ? '未兑现' : s === 'paid_off' ? '已兑现' : '已放弃'
}
function statusClass(s: string) {
  return s === 'planted'
    ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
    : s === 'paid_off'
    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
}
function statusStripe(s: string) {
  return s === 'planted' ? 'bg-yellow-400' : s === 'paid_off' ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
}

async function load() {
  loading.value = true
  try {
    const res = await foreshadowApi.list(props.novelId)
    items.value = res?.data ?? []
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingItem.value = null
  form.title = ''; form.description = ''; form.status = 'planted'
  modalError.value = ''
  showModal.value = true
}

function editItem(item: Foreshadow) {
  editingItem.value = item
  form.title = item.title
  form.description = item.description ?? ''
  form.status = item.status
  modalError.value = ''
  showModal.value = true
}

async function saveItem() {
  if (!form.title.trim()) { modalError.value = '请输入标题'; return }
  saving.value = true
  try {
    if (editingItem.value) {
      await foreshadowApi.update(props.novelId, editingItem.value.id, { ...form })
    } else {
      await foreshadowApi.create(props.novelId, { ...form })
    }
    showModal.value = false
    await load()
  } catch (e: any) {
    modalError.value = e?.message ?? '保存失败'
  } finally {
    saving.value = false
  }
}

async function handleAIExtract() {
  if (!await guardAiProvider('LLM')) return
  extracting.value = true
  try {
    const res = await foreshadowApi.aiExtract(props.novelId) as any
    const count = res?.total ?? res?.foreshadows?.length ?? 0
    await load()
    toast.success(`AI 提取完成，共生成 ${count} 条伏笔`)
  } catch (e: any) {
    toast.error('AI 提取失败：' + (e?.message ?? '未知错误'))
  } finally {
    extracting.value = false
  }
}

async function markPaidOff(item: Foreshadow) {
  await foreshadowApi.update(props.novelId, item.id, { status: 'paid_off' })
  await load()
}

async function deleteItem(id: number) {
  if (!confirm('确认删除此伏笔？')) return
  await foreshadowApi.remove(props.novelId, id)
  await load()
}

onMounted(load)

// ── 钩子链 ────────────────────────────────────────────────────────────────────
const { listHooks, createHook, deleteHook, fulfillHook } = useHookChainApi()
const hooks = ref<any[]>([])
const showHookSection = ref(false)
const showHookForm = ref(false)
const hookSaving = ref(false)
const hookForm = ref({ type: 'chapter_end', description: '', planted_at: 1, planned_payoff_at: 10, intensity: 5, notes: '' })
const HOOK_TYPE_LABELS: Record<string, string> = {
  chapter_end: '章末钩子', emotional: '情感钩子', mystery: '悬念钩子', threat: '威胁钩子', promise: '承诺钩子',
}
watch(showHookSection, async (v) => { if (v && hooks.value.length === 0) { try { hooks.value = (await listHooks(props.novelId) as any).hooks ?? [] } catch {} } })
async function handleCreateHook() {
  if (!hookForm.value.description.trim()) return
  hookSaving.value = true
  try { await createHook(props.novelId, hookForm.value); showHookForm.value = false; hooks.value = (await listHooks(props.novelId) as any).hooks ?? [] } catch {} finally { hookSaving.value = false }
}
async function handleFulfillHook(hook: any) {
  try { await fulfillHook(hook.id, hook.planned_payoff_at); hooks.value = (await listHooks(props.novelId) as any).hooks ?? [] } catch {}
}
async function handleDeleteHook(hook: any) {
  if (!confirm('确认删除？')) return
  try { await deleteHook(hook.id); hooks.value = hooks.value.filter((h: any) => h.id !== hook.id) } catch {}
}

// ── 冲突弧 ────────────────────────────────────────────────────────────────────
const { listConflictArcs, createConflictArc, deleteConflictArc, advancePhase } = useConflictArcApi()
const arcs = ref<any[]>([])
const showArcsSection = ref(false)
const showArcForm = ref(false)
const arcSaving = ref(false)
const arcForm = ref({ title: '', description: '', type: 'interpersonal', antagonist: '', start_chapter: 1 })
const ARC_PHASES = ['setup', 'escalation', 'climax', 'resolution']
const ARC_PHASE_LABELS: Record<string, string> = { setup: '铺垫', escalation: '升级', climax: '高潮', resolution: '收尾' }
const ARC_TYPE_LABELS: Record<string, string> = { internal: '内心冲突', interpersonal: '人际冲突', social: '社会冲突' }
watch(showArcsSection, async (v) => { if (v && arcs.value.length === 0) { try { arcs.value = (await listConflictArcs(props.novelId) as any).conflict_arcs ?? [] } catch {} } })
async function handleCreateArc() {
  if (!arcForm.value.title.trim()) return
  arcSaving.value = true
  try { await createConflictArc(props.novelId, arcForm.value); showArcForm.value = false; arcs.value = (await listConflictArcs(props.novelId) as any).conflict_arcs ?? [] } catch {} finally { arcSaving.value = false }
}
async function handleAdvancePhase(arc: any) {
  try { await advancePhase(arc.id); arcs.value = (await listConflictArcs(props.novelId) as any).conflict_arcs ?? [] } catch {}
}
async function handleDeleteArc(arc: any) {
  if (!confirm('确认删除？')) return
  try { await deleteConflictArc(arc.id); arcs.value = arcs.value.filter((a: any) => a.id !== arc.id) } catch {}
}
</script>
