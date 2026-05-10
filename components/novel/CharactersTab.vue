<script setup lang="ts">
import type { Character } from '~/types'
import { useCharacterApi } from '~/composables/useCharacterApi'

const props = defineProps<{ novelId: number }>()

const toast = useToast()
const router = useRouter()
const characterStore = useCharacterStore()
const taskStore = useTaskStore()
const { openLightbox } = useImageLightbox()

const characterApi = useCharacterApi()

const generatingCharacters = ref(false)
const batchGeneratingCharImages = ref(false)
const showDeleteCharacterConfirm = ref(false)
const characterToDelete = ref<Character | null>(null)

const characters = computed(() => characterStore.characters)

function goToCharacter(character: Character) {
  router.push(`/character/${character.id}`)
}

function getRoleColor(role: string): string {
  const colors: Record<string, string> = {
    protagonist: 'bg-red-100 text-red-800',
    antagonist: 'bg-purple-100 text-purple-800',
    supporting: 'bg-blue-100 text-blue-800',
    minor: 'bg-gray-100 text-gray-800',
  }
  return colors[role] || 'bg-gray-100 text-gray-800'
}

function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    protagonist: '主角',
    antagonist: '反派',
    supporting: '配角',
    minor: '路人',
  }
  return labels[role] || role
}

async function handleAICharacters() {
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
    generatingCharacters.value = false
    toast.error('生成失败：' + (e.message || ''))
  }
}

async function handleBatchCharacterImages() {
  batchGeneratingCharImages.value = true
  try {
    const res = await characterApi.batchGenerateImages(props.novelId)
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
    })
  } catch (e: any) {
    batchGeneratingCharImages.value = false
    toast.error('批量生成失败：' + (e.message || ''))
  }
}

function handleDeleteCharacter(event: MouseEvent, character: Character) {
  event.stopPropagation()
  characterToDelete.value = character
  showDeleteCharacterConfirm.value = true
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
    <div class="flex items-center justify-between">
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
          {{ generatingCharacters ? 'AI 生成中...' : (characters.length > 0 ? 'AI 更新角色' : 'AI 生成角色') }}
        </button>
        <button
          class="btn-secondary text-sm"
          :disabled="batchGeneratingCharImages || characters.length === 0"
          title="批量为所有角色生成正面图（跳过已有图片的角色）"
          @click="handleBatchCharacterImages"
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
        <NuxtLink to="/character/create" class="btn-primary">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          新建角色
        </NuxtLink>
      </div>
    </div>

    <div v-if="characterStore.loading" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div v-for="i in 4" :key="i" class="card p-4">
        <div class="skeleton h-20 w-20 rounded-full mb-3"></div>
        <div class="skeleton h-5 w-1/2 mb-2"></div>
        <div class="skeleton h-4 w-3/4"></div>
      </div>
    </div>

    <div v-else-if="characters.length === 0" class="card p-8 text-center">
      <svg class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
      <p class="text-gray-500 dark:text-gray-400">还没有角色，创建你的第一个角色</p>
    </div>

    <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="character in characters"
        :key="character.id"
        class="card p-4 hover:shadow-soft transition-shadow cursor-pointer group relative"
        @click="goToCharacter(character)"
      >
        <!-- 删除按钮：hover 时出现 -->
        <button
          class="absolute top-2 right-2 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          title="删除角色"
          @click="handleDeleteCharacter($event, character)"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
        <div class="flex items-start space-x-4">
          <div class="w-16 h-16 rounded-full flex-shrink-0 overflow-hidden bg-primary-100 flex items-center justify-center">
            <img
              v-if="character.three_view_front || character.portrait"
              :src="character.three_view_front || character.portrait"
              class="w-full h-full object-cover cursor-zoom-in"
              :alt="character.name"
              @click.stop="openLightbox(character.three_view_front || character.portrait)"
            />
            <span v-else class="text-2xl font-bold text-primary-600">{{ character.name.charAt(0) }}</span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center space-x-2">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white truncate">
                {{ character.name }}
              </h3>
              <span
                class="px-2 py-0.5 text-xs font-medium rounded"
                :class="getRoleColor(character.role)"
              >
                {{ getRoleLabel(character.role) }}
              </span>
            </div>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
              {{ character.personality || '暂无性格描述' }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete character confirm -->
    <ConfirmDialog
      v-model="showDeleteCharacterConfirm"
      title="删除角色"
      :description="`确认删除角色「${characterToDelete?.name || ''}」？此操作不可撤销。`"
      variant="danger"
      confirm-text="确认删除"
      @confirm="confirmDeleteCharacter"
    />
  </div>
</template>
