<script setup lang="ts">
import type { ScreenplayScene } from '~/types'

// videoId：在 VideoEditor 内嵌使用时传入，chapterId 取当前视频关联的章节。
// chapterId：独立分场剧本页（无需先创建视频项目）直接传入章节 id，优先于 videoId 推导的值。
// focusSceneNo：仅传给弹窗单场预览场景——只渲染这一场，隐藏整章节的生成/标题区域。
const props = defineProps<{ videoId?: number; chapterId?: number; llmProvider?: string; focusSceneNo?: number }>()
// generated：分场剧本生成成功后触发，供外层（如 VideoEditor）串联自动生成分镜脚本。
// 仅在非 focusSceneNo（单场预览）模式下会触发——生成按钮本身就只在该模式下渲染，见下方模板。
// saved：单场保存成功后触发，供外层弹窗（"查看完整剧本"）据此自动关闭；整页编辑模式下没有
// 弹窗可关，父组件不监听即可。
const emit = defineEmits<{ generated: []; saved: [sceneId: number] }>()

const route = useRoute()
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

const scenes = ref<ScreenplayScene[]>([])
const displayScenes = computed(() =>
  props.focusSceneNo != null ? scenes.value.filter(s => s.scene_no === props.focusSceneNo) : scenes.value
)
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
    const ok = await confirm('重新生成剧本？未锁定的场次将被覆盖，已锁定的场次保持不变。')
    if (!ok) return
  }
  generating.value = true
  try {
    scenes.value = await screenplayApi.generateScreenplay(chapterId.value, props.llmProvider)
    resetDrafts()
    toast.success(`已生成 ${scenes.value.length} 个分场剧本`)
    emit('generated')
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || '未知错误'))
  } finally {
    generating.value = false
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
  if (targetSceneNo.value) {
    await nextTick()
    document.getElementById(`scene-${targetSceneNo.value}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
})
watch(chapterId, loadScenes)

defineExpose({ loadScenes })
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-6 space-y-4">
    <div v-if="!focusSceneNo" class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-bold text-gray-900 dark:text-gray-100">分场剧本</h2>
        <p class="text-xs text-gray-400 mt-1">先审校剧本再生成分镜；已锁定的场次生成分镜脚本时不会被覆盖</p>
      </div>
      <button
        class="btn-primary text-sm"
        :disabled="generating || !chapterId"
        @click="handleGenerate"
      >
        {{ generating ? '生成中…' : (scenes.length ? '重新生成剧本' : 'AI 生成剧本') }}
      </button>
    </div>

    <div v-if="!chapterId" class="text-center py-16 text-gray-400 text-sm">未关联章节，无法生成剧本</div>
    <div v-else-if="loading" class="text-center py-16 text-gray-400 text-sm">加载中…</div>
    <div v-else-if="!displayScenes.length" class="text-center py-16 text-gray-400 text-sm">
      {{ focusSceneNo ? '未找到该场次' : '暂无剧本，点击右上角生成' }}
    </div>

    <div
      v-for="scene in displayScenes" :key="scene.id"
      :id="`scene-${scene.scene_no}`"
      class="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5 space-y-3"
      :class="targetSceneNo === scene.scene_no ? 'ring-2 ring-primary-500' : ''"
    >
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 flex-1 min-w-0">
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
    </div>
  </div>
</template>
