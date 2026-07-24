<script setup lang="ts">
import type { ScreenplayScene, ScreenplaySceneVersion } from '~/types'

// videoId：在 VideoEditor 内嵌使用时传入，chapterId 取当前视频关联的章节。
// chapterId：独立分场剧本页（无需先创建视频项目）直接传入章节 id，优先于 videoId 推导的值。
// collapsedList：折叠列表模式——每场默认只显示标题+一行概要，点击才展开完整内容（供章节详情页
// 顶层"剧本"tab 使用）；不传/false 时保持原有的全部展开模式（VideoEditor 内嵌剧本子tab 用这个）。
// chapterTitle：仅用于导出文件命名，不传时退回通用文件名（VideoEditor 内嵌场景暂不知道章节标题）。
const props = defineProps<{ videoId?: number; chapterId?: number; llmProvider?: string; collapsedList?: boolean; chapterTitle?: string }>()
// generated：分场剧本（连同分镜脚本）生成成功后触发，供外层做一些收尾展示；生成剧本按钮本身已经
// 在后端一键管线里提取绑定角色/道具/场景并提交了分镜生成任务，外层不需要再重复触发。
// saved：单场保存成功后触发，供外层弹窗（"查看完整剧本"）据此自动关闭；整页编辑模式下没有
// 弹窗可关，父组件不监听即可。
const emit = defineEmits<{ generated: []; saved: [sceneId: number] }>()

const route = useRoute()
const router = useRouter()
const targetSceneNo = computed(() => {
  const n = Number(route.query.scene)
  return Number.isFinite(n) && n > 0 ? n : null
})

const videoStore = useVideoStore()
const screenplayApi = useScreenplayApi()
const toast = useToast()
const { confirm } = useConfirm()
const { guardAiProvider } = useAiProviderGuard()

const video = computed(() => videoStore.currentVideo)
const chapterId = computed(() => props.chapterId ?? video.value?.chapter_id ?? null)

// 独立分场剧本页（props.videoId 未传，即 chapterId 模式）下，"进入视频生成环节"需要知道
// 这一章关联的视频 id——VideoEditor 内嵌模式已经有 props.videoId，不需要额外查询。
const chapterVideoId = ref<number | null>(null)
const resolvedVideoId = computed(() => props.videoId ?? chapterVideoId.value)
async function loadChapterVideoId() {
  if (props.videoId || !chapterId.value) return
  const novelId = scenes.value[0]?.novel_id
  if (!novelId) return
  try {
    const { request } = useApi()
    const data: any = await request(`/novels/${novelId}/videos?chapter_id=${chapterId.value}`)
    const items = Array.isArray(data?.data?.items) ? data.data.items : (Array.isArray(data?.data) ? data.data : [])
    chapterVideoId.value = items[0]?.id ?? null
  } catch {
    chapterVideoId.value = null
  }
}

function goToVideoProduction(scene: ScreenplayScene) {
  if (!resolvedVideoId.value) {
    toast.error('这一章还没有关联的视频项目，请先在"视频"tab 生成分镜脚本')
    return
  }
  router.push(`/video/${resolvedVideoId.value}/produce-v2?scene=${scene.scene_no}`)
}

const scenes = ref<ScreenplayScene[]>([])
const loading = ref(false)
const generating = ref(false)
const savingSceneId = ref<number | null>(null)
const lockingSceneId = ref<number | null>(null)
const deletingSceneId = ref<number | null>(null)

// 编辑中的场次草稿：sceneId -> 可编辑字段副本，只有点击"保存"才提交，避免每次按键都发请求
// beats 合并成单个文本框编辑（每行一条），而不是逐条 beat 的分段表单：
// - 对话行格式为 "角色名：台词"（与全局其它地方展示台词的约定一致）
// - 其余非空行一律当作动作/描写（不再区分 action/emotional/internal，简化为一种类型）
const drafts = ref<Record<number, { heading: string; synopsis: string; beatsText: string }>>({})

// 默认只读展示，点击某个具体字段才进入该字段的编辑态；保存/切场次后收起编辑态
const editingFields = ref(new Set<string>())
function fieldKey(sceneId: number, field: string) { return `${sceneId}:${field}` }
function isEditing(sceneId: number, field: string) { return editingFields.value.has(fieldKey(sceneId, field)) }
function startEdit(sceneId: number, field: string) { editingFields.value.add(fieldKey(sceneId, field)) }
function stopEdit(sceneId: number, field: string) { editingFields.value.delete(fieldKey(sceneId, field)) }
function stopEditingScene(sceneId: number) {
  for (const field of ['heading', 'synopsis', 'beats']) editingFields.value.delete(fieldKey(sceneId, field))
}

// 折叠列表模式（collapsedList）下每场是否展开完整内容；非折叠模式恒为展开，不看这个集合。
const expandedSceneIds = ref(new Set<number>())
function isExpanded(sceneId: number) {
  return !props.collapsedList || expandedSceneIds.value.has(sceneId)
}
function toggleExpanded(sceneId: number) {
  if (expandedSceneIds.value.has(sceneId)) expandedSceneIds.value.delete(sceneId)
  else expandedSceneIds.value.add(sceneId)
}

// 保存时是否联动更新本场对应的分镜脚本
const updateStoryboardFlags = ref<Record<number, boolean>>({})

function makeDraft(scene: ScreenplayScene) {
  return {
    heading: scene.heading,
    synopsis: scene.synopsis,
    beatsText: scene.beats,
  }
}

function resetDrafts() {
  const d: typeof drafts.value = {}
  for (const s of scenes.value) d[s.id] = makeDraft(s)
  drafts.value = d
}

async function loadScenes() {
  if (!chapterId.value) return
  loading.value = true
  try {
    scenes.value = await screenplayApi.listScreenplayScenes(chapterId.value)
    resetDrafts()
  } catch (e: any) {
    toast.error('加载剧本失败：' + (e.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

async function handleGenerate() {
  if (!chapterId.value) return
  if (!await guardAiProvider('LLM')) return
  if (scenes.value.length > 0) {
    const ok = await confirm('重新生成剧本？将重新分析并绑定角色/道具/场景，重新生成剧本与分镜脚本；未锁定的场次将被覆盖（历史版本会保留，可在"历史版本"中恢复）。')
    if (!ok) return
  }
  generating.value = true
  try {
    const taskId = await screenplayApi.generateScreenplayFull(chapterId.value, props.llmProvider)
    toast.success('剧本生成任务已提交，正在生成…')
    useTaskStore().trackTask(taskId, async (task) => {
      generating.value = false
      if (task.status === 'completed') {
        await loadScenes()
        toast.success(`已生成 ${scenes.value.length} 场剧本，正在生成分镜脚本…`)
        emit('generated')
        const storyboardTaskId = task.data?.storyboard_task_id as string | undefined
        if (storyboardTaskId) {
          useTaskStore().trackTask(storyboardTaskId, (sbTask) => {
            if (sbTask.status === 'completed') {
              toast.success('分镜脚本已生成')
            } else if (sbTask.status === 'failed' || sbTask.status === 'dead') {
              toast.error('分镜脚本生成失败：' + (sbTask.error || '未知错误'))
            }
          })
        }
      } else if (task.status === 'failed' || task.status === 'dead') {
        toast.error('剧本生成失败：' + (task.error || '未知错误'))
      }
    })
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || '未知错误'))
    generating.value = false
  }
}

// ── 导出剧本 / 导出分镜脚本（txt / markdown / docx）──────────────────────────
const showExportMenu = ref(false)
const exportMenuRef = ref<HTMLElement | null>(null)
onClickOutside(exportMenuRef, () => { showExportMenu.value = false })
const showStoryboardExportMenu = ref(false)
const storyboardExportMenuRef = ref<HTMLElement | null>(null)
onClickOutside(storyboardExportMenuRef, () => { showStoryboardExportMenu.value = false })
const exportingFormat = ref<'txt' | 'markdown' | 'docx' | null>(null)
const exportingStoryboardFormat = ref<'txt' | 'markdown' | 'docx' | null>(null)
const EXPORT_FORMATS: { key: 'txt' | 'markdown' | 'docx'; label: string; ext: string }[] = [
  { key: 'txt', label: '纯文本 (.txt)', ext: 'txt' },
  { key: 'markdown', label: 'Markdown (.md)', ext: 'md' },
  { key: 'docx', label: 'Word 文档 (.docx)', ext: 'docx' },
]

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function handleExport(format: 'txt' | 'markdown' | 'docx', ext: string) {
  if (!chapterId.value) return
  showExportMenu.value = false
  exportingFormat.value = format
  try {
    const blob = await screenplayApi.exportScreenplay(chapterId.value, format)
    downloadBlob(blob, `${props.chapterTitle || '章节'}_剧本.${ext}`)
  } catch (e: any) {
    toast.error('导出失败：' + (e.message || '未知错误'))
  } finally {
    exportingFormat.value = null
  }
}

async function handleExportStoryboard(format: 'txt' | 'markdown' | 'docx', ext: string) {
  if (!chapterId.value) return
  showStoryboardExportMenu.value = false
  exportingStoryboardFormat.value = format
  try {
    const blob = await screenplayApi.exportStoryboard(chapterId.value, format)
    downloadBlob(blob, `${props.chapterTitle || '章节'}_分镜脚本.${ext}`)
  } catch (e: any) {
    toast.error('导出失败：' + (e.message || '未知错误'))
  } finally {
    exportingStoryboardFormat.value = null
  }
}

// ── 场次历史版本：查看/恢复 ──────────────────────────────────────────────
const versionsSceneId = ref<number | null>(null)
const versions = ref<ScreenplaySceneVersion[]>([])
const loadingVersions = ref(false)
const restoringVersionNo = ref<number | null>(null)

async function openVersions(scene: ScreenplayScene) {
  versionsSceneId.value = scene.id
  loadingVersions.value = true
  try {
    versions.value = await screenplayApi.getSceneVersions(scene.id)
  } catch (e: any) {
    toast.error('加载历史版本失败：' + (e.message || '未知错误'))
  } finally {
    loadingVersions.value = false
  }
}

function closeVersions() {
  versionsSceneId.value = null
  versions.value = []
}

async function restoreVersion(version: ScreenplaySceneVersion) {
  if (versionsSceneId.value == null) return
  const ok = await confirm(`恢复到第 ${version.version_no} 个历史版本？当前内容会被覆盖（当前内容本身也会在恢复前自动保留一条历史版本）。`)
  if (!ok) return
  restoringVersionNo.value = version.version_no
  try {
    const updated = await screenplayApi.restoreSceneVersion(versionsSceneId.value, version.version_no)
    const idx = scenes.value.findIndex(s => s.id === updated.id)
    if (idx >= 0) scenes.value[idx] = updated
    drafts.value[updated.id] = makeDraft(updated)
    toast.success('已恢复')
    closeVersions()
  } catch (e: any) {
    toast.error('恢复失败：' + (e.message || '未知错误'))
  } finally {
    restoringVersionNo.value = null
  }
}

async function saveScene(scene: ScreenplayScene) {
  const d = drafts.value[scene.id]
  if (!d) return
  savingSceneId.value = scene.id
  try {
    const updated = await screenplayApi.updateScreenplayScene(scene.id, {
      heading: d.heading,
      synopsis: d.synopsis,
      beats: d.beatsText,
    })
    const idx = scenes.value.findIndex(s => s.id === scene.id)
    if (idx >= 0) scenes.value[idx] = updated
    drafts.value[scene.id] = makeDraft(updated)
    stopEditingScene(scene.id)
    toast.success('已保存')
    emit('saved', scene.id)

    if (updateStoryboardFlags.value[scene.id]) {
      updateStoryboardFlags.value[scene.id] = false
      try {
        const taskId = await screenplayApi.regenerateSceneStoryboard(scene.id, props.llmProvider)
        toast.success('分镜重新生成任务已提交，请稍候…')
        useTaskStore().trackTask(taskId, (task) => {
          if (task.status === 'completed') {
            toast.success(`第 ${scene.scene_no} 场分镜已更新`)
          } else if (task.status === 'failed' || task.status === 'dead') {
            toast.error('分镜重新生成失败：' + (task.error || '未知错误'))
          }
        })
      } catch (e: any) {
        toast.error('分镜重新生成提交失败：' + (e.message || '未知错误'))
      }
    }
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || '未知错误'))
  } finally {
    savingSceneId.value = null
  }
}

async function toggleLock(scene: ScreenplayScene) {
  lockingSceneId.value = scene.id
  try {
    const updated = await screenplayApi.lockScreenplayScene(scene.id, !scene.locked)
    const idx = scenes.value.findIndex(s => s.id === scene.id)
    if (idx >= 0) scenes.value[idx] = updated
  } catch (e: any) {
    toast.error('操作失败：' + (e.message || '未知错误'))
  } finally {
    lockingSceneId.value = null
  }
}

async function deleteScene(scene: ScreenplayScene) {
  const ok = await confirm(`删除第 ${scene.scene_no} 场剧本？此操作不可撤销。`)
  if (!ok) return
  deletingSceneId.value = scene.id
  try {
    await screenplayApi.deleteScreenplayScene(scene.id)
    scenes.value = scenes.value.filter(s => s.id !== scene.id)
    delete drafts.value[scene.id]
  } catch (e: any) {
    toast.error('删除失败：' + (e.message || '未知错误'))
  } finally {
    deletingSceneId.value = null
  }
}

onMounted(async () => {
  await loadScenes()
  loadChapterVideoId()
  if (targetSceneNo.value) {
    const target = scenes.value.find(s => s.scene_no === targetSceneNo.value)
    if (target) expandedSceneIds.value.add(target.id)
    await nextTick()
    document.getElementById(`scene-${targetSceneNo.value}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
})
watch(chapterId, async () => {
  await loadScenes()
  loadChapterVideoId()
})

defineExpose({ loadScenes })
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-6 space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-bold text-gray-900 dark:text-gray-100">剧本</h2>
        <p class="text-xs text-gray-400 mt-1">先审校剧本再生成分镜；已锁定的场次生成分镜脚本时不会被覆盖</p>
      </div>
      <div class="flex items-center gap-2">
        <div ref="exportMenuRef" class="relative">
          <button
            class="text-sm px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300"
            :disabled="!chapterId || !scenes.length || exportingFormat != null"
            @click="showExportMenu = !showExportMenu"
          >{{ exportingFormat ? '导出中…' : '导出剧本' }}</button>
          <div
            v-if="showExportMenu"
            class="absolute right-0 mt-1 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 overflow-hidden"
          >
            <button
              v-for="f in EXPORT_FORMATS" :key="f.key"
              class="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              @click="handleExport(f.key, f.ext)"
            >{{ f.label }}</button>
          </div>
        </div>
        <div ref="storyboardExportMenuRef" class="relative">
          <button
            class="text-sm px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300"
            :disabled="!chapterId || !scenes.length || exportingStoryboardFormat != null"
            @click="showStoryboardExportMenu = !showStoryboardExportMenu"
          >{{ exportingStoryboardFormat ? '导出中…' : '导出分镜脚本' }}</button>
          <div
            v-if="showStoryboardExportMenu"
            class="absolute right-0 mt-1 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 overflow-hidden"
          >
            <button
              v-for="f in EXPORT_FORMATS" :key="f.key"
              class="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              @click="handleExportStoryboard(f.key, f.ext)"
            >{{ f.label }}</button>
          </div>
        </div>
        <button
          class="btn-primary text-sm"
          :disabled="generating || !chapterId"
          @click="handleGenerate"
        >
          {{ generating ? '生成中…' : (scenes.length ? '重新生成剧本' : 'AI 生成剧本') }}
        </button>
      </div>
    </div>

    <div v-if="!chapterId" class="text-center py-16 text-gray-400 text-sm">未关联章节，无法生成剧本</div>
    <div v-else-if="loading" class="text-center py-16 text-gray-400 text-sm">加载中…</div>
    <div v-else-if="!scenes.length" class="text-center py-16 text-gray-400 text-sm">暂无剧本，点击右上角生成</div>

    <div
      v-for="scene in scenes" :key="scene.id"
      :id="`scene-${scene.scene_no}`"
      class="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5 space-y-3"
      :class="targetSceneNo === scene.scene_no ? 'ring-2 ring-primary-500' : ''"
    >
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <button
            v-if="collapsedList"
            type="button"
            class="shrink-0 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            @click="toggleExpanded(scene.id)"
          >
            <svg class="w-4 h-4 transition-transform" :class="isExpanded(scene.id) ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          </button>
          <span class="text-xs font-medium text-gray-400 shrink-0">第 {{ scene.scene_no }} 场</span>
          <template v-if="drafts[scene.id]">
            <input
              v-if="isEditing(scene.id, 'heading')"
              v-model="drafts[scene.id].heading"
              class="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm font-medium bg-white dark:bg-gray-700"
              autofocus
              @blur="stopEdit(scene.id, 'heading')"
              @keydown.enter.prevent="stopEdit(scene.id, 'heading')"
            />
            <span
              v-else
              class="flex-1 min-w-0 truncate text-sm font-medium text-gray-900 dark:text-white cursor-text rounded px-2 py-1 -mx-2 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              @click="startEdit(scene.id, 'heading')"
            >{{ drafts[scene.id].heading || '（无标题，点击填写）' }}</span>
          </template>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span v-if="scene.locked" class="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">已锁定</span>
          <button
            class="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300"
            title="跳转到新版视频生成页面并定位到本场"
            @click="goToVideoProduction(scene)"
          >视频制作</button>
          <button
            class="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300"
            @click="openVersions(scene)"
          >历史版本</button>
          <button
            class="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300"
            :disabled="lockingSceneId === scene.id"
            @click="toggleLock(scene)"
          >{{ scene.locked ? '解锁' : '锁定' }}</button>
          <button
            class="text-xs px-2 py-1 border border-red-300 text-red-500 rounded"
            :disabled="deletingSceneId === scene.id"
            @click="deleteScene(scene)"
          >删除</button>
        </div>
      </div>

      <!-- 折叠态：一行概要预览，点击展开 -->
      <p
        v-if="collapsedList && !isExpanded(scene.id)"
        class="text-sm text-gray-500 dark:text-gray-400 truncate cursor-pointer"
        @click="toggleExpanded(scene.id)"
      >{{ scene.synopsis || '（无概要）' }}</p>

      <template v-if="isExpanded(scene.id)">
        <template v-if="drafts[scene.id]">
          <textarea
            v-if="isEditing(scene.id, 'synopsis')"
            v-model="drafts[scene.id].synopsis"
            rows="2"
            placeholder="本场剧情概要"
            class="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-700 resize-none"
            autofocus
            @blur="stopEdit(scene.id, 'synopsis')"
          />
          <p
            v-else
            class="text-sm text-gray-700 dark:text-gray-300 cursor-text rounded px-2 py-1.5 -mx-2 hover:bg-gray-50 dark:hover:bg-gray-700/50"
            @click="startEdit(scene.id, 'synopsis')"
          >{{ drafts[scene.id].synopsis || '（无概要，点击填写）' }}</p>
        </template>

        <div v-if="drafts[scene.id]">
          <textarea
            v-if="isEditing(scene.id, 'beats')"
            v-model="drafts[scene.id].beatsText"
            rows="10"
            placeholder="动作/描写另起一行；对话行写成「角色名：台词」"
            class="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-700 leading-relaxed"
            autofocus
            @blur="stopEdit(scene.id, 'beats')"
          />
          <p
            v-else
            class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed cursor-text rounded px-2 py-1.5 -mx-2 hover:bg-gray-50 dark:hover:bg-gray-700/50"
            @click="startEdit(scene.id, 'beats')"
          >{{ drafts[scene.id].beatsText || '（无台词/动作描写，点击填写）' }}</p>
          <p class="text-xs text-gray-400 mt-1">每行一条内容；对话行请写成"角色名：台词"，其余行作为动作/描写</p>
        </div>

        <div class="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
          <span class="text-xs text-gray-400">预计 {{ scene.estimated_shot_count }} 个分镜</span>
          <div class="flex items-center gap-3">
            <label class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none">
              <input v-model="updateStoryboardFlags[scene.id]" type="checkbox" class="rounded border-gray-300 dark:border-gray-600" />
              更新分镜脚本
            </label>
            <button
              class="btn-primary text-xs px-3 py-1.5"
              :disabled="savingSceneId === scene.id"
              @click="saveScene(scene)"
            >{{ savingSceneId === scene.id ? '保存中…' : '保存' }}</button>
          </div>
        </div>
      </template>
    </div>

    <!-- 历史版本弹窗 -->
    <div v-if="versionsSceneId != null" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/50" @click="closeVersions"></div>
      <div class="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-y-auto p-5 space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-bold text-gray-900 dark:text-gray-100">历史版本</h3>
          <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" @click="closeVersions">✕</button>
        </div>
        <div v-if="loadingVersions" class="text-center py-8 text-gray-400 text-sm">加载中…</div>
        <div v-else-if="!versions.length" class="text-center py-8 text-gray-400 text-sm">暂无历史版本</div>
        <div v-else class="space-y-2">
          <div
            v-for="v in versions" :key="v.id"
            class="flex items-center justify-between gap-2 border border-gray-100 dark:border-gray-700 rounded-lg px-3 py-2"
          >
            <div class="text-xs text-gray-500 dark:text-gray-400">
              <div>版本 {{ v.version_no }}（{{ v.change_type === 'restore' ? '恢复前保留' : '重新生成前保留' }}）</div>
              <div>{{ new Date(v.created_at).toLocaleString() }}</div>
            </div>
            <button
              class="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300 shrink-0"
              :disabled="restoringVersionNo === v.version_no"
              @click="restoreVersion(v)"
            >{{ restoringVersionNo === v.version_no ? '恢复中…' : '恢复' }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
