<script setup lang="ts">
import type { Character } from '~/types'
import { useCharacterApi } from '~/composables/useCharacterApi'

const props = defineProps<{ novelId: number }>()

const toast = useToast()
const characterStore = useCharacterStore()
const taskStore = useTaskStore()
const { url: lightboxUrl, openLightbox } = useImageLightbox()
const { editImage } = useImageEditApi()

const characterApi = useCharacterApi()
const { guardAiProvider } = useAiProviderGuard()

const generatingCharacters = ref(false)
const batchGeneratingCharImages = ref(false)
const showBatchCharMenu = ref(false)
const showDeleteConfirm = ref(false)
const characterToDelete = ref<Character | null>(null)
const showCharacterModal = ref(false)
const newCharacterForm = ref({ name: '', role: 'supporting' as string, description: '' })
const savingCharacter = ref(false)

const characters = computed(() => characterStore.characters)

function openCharacterImage(character: Character) {
  const src = character.three_view_sheet || character.portrait || ''
  if (!src) return
  openLightbox(
    src,
    (instruction) => editImage(lightboxUrl.value, instruction, props.novelId),
    async (newUrl) => {
      await characterStore.updateCharacter(character.id, { three_view_sheet: newUrl })
    },
  )
}

function goToCharacter(character: Character) {
  navigateTo(`/character/${character.id}`)
}

function getRoleColor(role: string): string {
  const colors: Record<string, string> = {
    protagonist: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    antagonist:  'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    supporting:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    minor:       'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  }
  return colors[role] || 'bg-gray-100 text-gray-600'
}

function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    protagonist: '主角',
    antagonist:  '反派',
    supporting:  '配角',
    minor:       '路人',
  }
  return labels[role] || role
}

async function handleAICharacters() {
  if (!await guardAiProvider('LLM')) return
  generatingCharacters.value = true
  try {
    const res = await characterApi.aiBatchGenerate(props.novelId)
    const taskId = (res as any)?.data?.task_id ?? (res as any)?.task_id
    taskStore.trackTask(taskId, async (task) => {
      generatingCharacters.value = false
      if (task?.status === 'failed') {
        toast.error('角色生成失败：' + (task.error || '未知错误'))
        return
      }
      await characterStore.fetchCharacters(props.novelId)
      toast.success('角色已生成/更新')
    })
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || ''))
    generatingCharacters.value = false
  }
}

async function handleBatchCharacterImages(force = false) {
  if (!await guardAiProvider('IMAGE')) return
  batchGeneratingCharImages.value = true
  try {
    const res = await characterApi.batchGenerateImages(props.novelId, undefined, force)
    const taskId = (res as any)?.data?.task_id ?? (res as any)?.task_id
    taskStore.trackTask(taskId, async (task) => {
      batchGeneratingCharImages.value = false
      if (task?.status === 'failed') {
        toast.error('批量生成图片失败：' + (task.error || '未知错误'))
        return
      }
      const result = task?.result as any
      toast.success(`角色图片生成完成：成功 ${result?.succeeded ?? 0} / 失败 ${result?.failed ?? 0}`)
      await characterStore.fetchCharacters(props.novelId)
    }, () => characterStore.fetchCharacters(props.novelId))
  } catch (e: any) {
    batchGeneratingCharImages.value = false
    toast.error('批量生成失败：' + (e.message || ''))
  }
}

async function createCharacter() {
  const trimmedName = newCharacterForm.value.name.trim()
  if (!trimmedName) return
  if (characters.value.some(c => c.name === trimmedName)) {
    toast.warning(`角色「${trimmedName}」已存在`)
    return
  }
  savingCharacter.value = true
  try {
    await characterStore.createCharacter(props.novelId, {
      name: newCharacterForm.value.name.trim(),
      role: newCharacterForm.value.role as any,
      description: newCharacterForm.value.description.trim(),
    })
    newCharacterForm.value = { name: '', role: 'supporting', description: '' }
    showCharacterModal.value = false
    toast.success('角色已创建')
  } catch (e: any) {
    toast.error('创建失败：' + (e.message || ''))
  } finally {
    savingCharacter.value = false
  }
}

function handleDeleteCharacter(event: MouseEvent, character: Character) {
  event.stopPropagation()
  characterToDelete.value = character
  showDeleteConfirm.value = true
}

async function confirmDeleteCharacter() {
  if (!characterToDelete.value) return
  try {
    await characterStore.deleteCharacter(characterToDelete.value.id)
    toast.success('角色已删除')
    characterToDelete.value = null
  } catch (e: any) {
    toast.error('删除失败：' + (e.message || '未知错误'))
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- 工具栏 -->
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">角色列表</h2>
      <div class="flex items-center gap-2">
        <button class="btn-secondary text-sm" :disabled="generatingCharacters" @click="handleAICharacters">
          <svg v-if="generatingCharacters" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          {{ generatingCharacters ? 'AI 提取中...' : (characters.length > 0 ? 'AI 更新角色' : 'AI 提取角色') }}
        </button>
        <!-- 批量生成图片（分裂按钮） -->
        <div class="relative inline-flex">
          <button
            class="btn-secondary text-sm rounded-r-none border-r border-gray-300 dark:border-gray-600"
            :disabled="batchGeneratingCharImages || characters.length === 0"
            title="批量为所有角色生成图片（跳过已有图片的角色）"
            @click="handleBatchCharacterImages(false)"
          >
            <svg v-if="batchGeneratingCharImages" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            {{ batchGeneratingCharImages ? '生成中...' : '批量生成图片' }}
          </button>
          <button
            class="btn-secondary text-sm rounded-l-none px-2"
            :disabled="batchGeneratingCharImages || characters.length === 0"
            title="更多选项"
            @click="showBatchCharMenu = !showBatchCharMenu"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
          <div v-if="showBatchCharMenu" class="fixed inset-0 z-10" @click="showBatchCharMenu = false" />
          <div v-if="showBatchCharMenu" class="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg min-w-max">
            <button
              class="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg"
              @click="showBatchCharMenu = false; handleBatchCharacterImages(true)"
            >
              <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              全量重新生成
            </button>
          </div>
        </div>
        <button class="btn-primary text-sm" @click="showCharacterModal = true">
          <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          新建角色
        </button>
      </div>
    </div>

    <!-- 骨架屏 -->
    <div v-if="characterStore.loading" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div v-for="i in 4" :key="i" class="card overflow-hidden">
        <div class="skeleton h-32 w-full"></div>
        <div class="p-3 space-y-2">
          <div class="skeleton h-4 w-1/2"></div>
          <div class="skeleton h-3 w-3/4"></div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else-if="characters.length === 0" class="card p-8 text-center">
      <svg class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
      <p class="text-gray-500 dark:text-gray-400 mb-1">暂无角色</p>
      <p class="text-xs text-gray-400 dark:text-gray-500">可手动创建，或通过「AI 生成角色」自动从章节内容中提取</p>
    </div>

    <!-- 角色网格 -->
    <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="character in characters"
        :key="character.id"
        class="card overflow-hidden group cursor-pointer hover:shadow-medium transition-shadow"
        @click="goToCharacter(character)"
      >
        <!-- 图片区域 -->
        <div class="relative w-full h-32 overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
          <img
            v-if="character.three_view_sheet || character.portrait"
            :src="character.three_view_sheet || character.portrait"
            class="w-full h-full object-cover cursor-zoom-in"
            :alt="character.name"
            @click.stop="openCharacterImage(character)"
          />
          <span v-else class="text-4xl font-bold text-gray-300 dark:text-gray-600 select-none">
            {{ character.name.charAt(0) }}
          </span>
          <!-- 角色类型徽章（左上） -->
          <span
            class="absolute top-2 left-2 text-xs px-1.5 py-0.5 rounded font-medium"
            :class="getRoleColor(character.role)"
          >
            {{ getRoleLabel(character.role) }}
          </span>
          <!-- 删除按钮（右下，hover 显示） -->
          <button
            class="absolute bottom-2 right-2 p-1 bg-white/90 dark:bg-gray-900/90 text-gray-400 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            title="删除角色"
            @click.stop="handleDeleteCharacter($event, character)"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>

        <!-- 信息区 -->
        <div class="p-3">
          <h3 class="font-medium text-gray-900 dark:text-white truncate mb-1">{{ character.name }}</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
            {{ character.description || '暂无描述' }}
          </p>
        </div>
      </div>
    </div>

    <!-- 新建角色弹窗 -->
    <Teleport to="body">
      <div v-if="showCharacterModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50" @click="showCharacterModal = false" />
        <div class="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md">
          <div class="p-6">
            <div class="flex items-center justify-between mb-5">
              <h2 class="text-lg font-bold text-gray-900 dark:text-white">新建角色</h2>
              <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" @click="showCharacterModal = false">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">名称 <span class="text-red-500">*</span></label>
                <input v-model="newCharacterForm.name" type="text" class="input" placeholder="角色名称" maxlength="100" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">角色类型</label>
                <select v-model="newCharacterForm.role" class="input">
                  <option value="protagonist">主角</option>
                  <option value="antagonist">反派</option>
                  <option value="supporting">配角</option>
                  <option value="minor">路人</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">描述</label>
                <textarea v-model="newCharacterForm.description" rows="3" class="input resize-none" placeholder="角色的外貌、性格、背景..."></textarea>
              </div>
            </div>
            <div class="flex justify-end gap-3 mt-5 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button class="btn-secondary" @click="showCharacterModal = false">取消</button>
              <button class="btn-primary" :disabled="savingCharacter || !newCharacterForm.name.trim()" @click="createCharacter">
                <svg v-if="savingCharacter" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                {{ savingCharacter ? '创建中...' : '创建' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 删除确认弹窗 -->
    <ConfirmDialog
      v-model="showDeleteConfirm"
      title="删除角色"
      :description="`确认删除角色「${characterToDelete?.name || ''}」？该角色在章节快照中的历史记录将无法关联显示。此操作不可撤销。`"
      variant="danger"
      confirm-text="确认删除"
      @confirm="confirmDeleteCharacter"
    />
  </div>
</template>
