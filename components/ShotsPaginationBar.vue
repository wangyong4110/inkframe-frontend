<script setup lang="ts">
defineProps<{
  currentPage: number
  totalPages: number
  totalItems: number
  pageNumbers: (number | '…')[]
}>()
const emit = defineEmits<{ (e: 'update:currentPage', page: number): void }>()
</script>

<template>
  <div v-if="totalPages > 1" class="flex items-center justify-between pt-1 pb-2">
    <span class="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
      第 {{ Math.min(currentPage, totalPages) }} / {{ totalPages }} 页 · 共 {{ totalItems }} 个镜头
    </span>
    <div class="flex items-center gap-1">
      <button
        class="w-7 h-7 flex items-center justify-center rounded-lg disabled:opacity-30 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:cursor-not-allowed transition-colors"
        :disabled="currentPage <= 1"
        @click="emit('update:currentPage', currentPage - 1)"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <template v-for="p in pageNumbers" :key="p">
        <span v-if="p === '…'" class="w-7 h-7 flex items-center justify-center text-xs text-gray-400 select-none">…</span>
        <button
          v-else
          class="w-7 h-7 flex items-center justify-center rounded-lg text-xs font-medium transition-colors"
          :class="p === Math.min(currentPage, totalPages)
            ? 'bg-primary-500 text-white'
            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'"
          @click="emit('update:currentPage', p as number)"
        >{{ p }}</button>
      </template>
      <button
        class="w-7 h-7 flex items-center justify-center rounded-lg disabled:opacity-30 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:cursor-not-allowed transition-colors"
        :disabled="currentPage >= totalPages"
        @click="emit('update:currentPage', currentPage + 1)"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  </div>
</template>
