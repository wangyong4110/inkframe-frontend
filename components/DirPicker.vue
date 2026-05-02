<script setup lang="ts">
import { ref, watch } from 'vue'
import { useApi } from '~/composables/useApi'

interface DirEntry {
  name: string
  path: string
}

interface BrowseResponse {
  path: string
  parent: string
  entries: DirEntry[]
}

const props = defineProps<{
  modelValue: boolean
  initialPath?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  select: [path: string]
}>()

const { request } = useApi()

const currentPath = ref(props.initialPath || '/')
const entries = ref<DirEntry[]>([])
const parent = ref('')
const loading = ref(false)
const error = ref('')

async function browse(path: string) {
  loading.value = true
  error.value = ''
  try {
    const res = await request<{ data: BrowseResponse }>(`/fs/browse?path=${encodeURIComponent(path)}`)
    const data = res.data
    currentPath.value = data.path
    parent.value = data.parent
    entries.value = data.entries ?? []
  } catch (e) {
    error.value = e instanceof Error ? e.message : '无法读取目录'
  } finally {
    loading.value = false
  }
}

watch(() => props.modelValue, (open) => {
  if (open) browse(props.initialPath || '/')
})

function close() {
  emit('update:modelValue', false)
}

function confirm() {
  emit('select', currentPath.value)
  close()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) close()
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="modelValue" class="fixed inset-0 z-[9999] flex items-center justify-center">
        <div class="fixed inset-0 bg-black/50" @click="close" />
        <div class="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg mx-4 flex flex-col" style="max-height: 70vh">
          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-100">选择目录</h3>
            <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" @click="close">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <!-- Current path bar -->
          <div class="px-5 py-2 bg-gray-50 dark:bg-gray-700/40 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2 min-w-0">
            <svg class="w-4 h-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>
            <span class="text-xs text-gray-600 dark:text-gray-300 truncate font-mono">{{ currentPath }}</span>
          </div>

          <!-- Entry list -->
          <div class="flex-1 overflow-y-auto py-1">
            <div v-if="loading" class="flex items-center justify-center py-10 text-sm text-gray-400">加载中…</div>
            <div v-else-if="error" class="px-5 py-4 text-sm text-red-500">{{ error }}</div>
            <template v-else>
              <!-- Parent row -->
              <button
                v-if="parent"
                class="w-full flex items-center gap-3 px-5 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                @click="browse(parent)"
              >
                <svg class="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
                <span class="font-mono">..</span>
              </button>
              <!-- Dir rows -->
              <button
                v-for="entry in entries"
                :key="entry.path"
                class="w-full flex items-center gap-3 px-5 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                @click="browse(entry.path)"
              >
                <svg class="w-4 h-4 text-yellow-400 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>
                <span class="truncate font-mono">{{ entry.name }}</span>
              </button>
              <div v-if="!entries.length && !parent" class="px-5 py-4 text-xs text-gray-400">（无子目录）</div>
            </template>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-between px-5 py-4 border-t border-gray-100 dark:border-gray-700 gap-3">
            <span class="text-xs text-gray-400 truncate font-mono flex-1">{{ currentPath }}</span>
            <div class="flex gap-2 shrink-0">
              <button
                class="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                @click="close"
              >取消</button>
              <button
                class="px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors"
                @click="confirm"
              >选择此目录</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.2s ease;
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
</style>
