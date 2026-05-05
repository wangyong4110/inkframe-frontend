<script setup lang="ts">
const { url, visible, refineCallback, closeLightbox, updateLightboxUrl } = useImageLightbox()

const suggestion = ref('')
const refining = ref(false)
const refineError = ref('')

watch(visible, (v) => {
  if (v) {
    suggestion.value = ''
    refineError.value = ''
  }
})

async function handleRefine() {
  if (!refineCallback.value || !suggestion.value.trim()) return
  refining.value = true
  refineError.value = ''
  try {
    const newUrl = await refineCallback.value(suggestion.value.trim())
    if (newUrl) {
      updateLightboxUrl(newUrl)
      suggestion.value = ''
    }
  } catch (e: any) {
    refineError.value = e?.message || '重新生成失败，请重试'
  } finally {
    refining.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && !refining.value) closeLightbox()
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="lightbox">
      <div
        v-if="visible"
        class="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm"
        @click.self="!refining && closeLightbox()"
      >
        <!-- Close button -->
        <button
          class="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
          :disabled="refining"
          @click="closeLightbox"
        >
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <!-- Image -->
        <img
          :src="url"
          :class="refineCallback ? 'max-h-[70vh]' : 'max-h-[90vh]'"
          class="max-w-[90vw] object-contain rounded shadow-2xl select-none"
          @click.stop
        />

        <!-- Refine panel — only shown when a callback is provided -->
        <div
          v-if="refineCallback"
          class="mt-4 w-full max-w-xl px-4"
          @click.stop
        >
          <div class="bg-white/10 backdrop-blur rounded-xl p-3 flex flex-col gap-2">
            <textarea
              v-model="suggestion"
              rows="2"
              placeholder="描述修改建议，例如：将背景改为夜晚雨天，人物表情更严肃"
              class="w-full rounded-lg bg-white/15 text-white placeholder-white/40 text-sm px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-white/30"
              :disabled="refining"
              @keydown.ctrl.enter="handleRefine"
              @keydown.meta.enter="handleRefine"
            />
            <div class="flex items-center justify-between gap-2">
              <span v-if="refineError" class="text-red-300 text-xs">{{ refineError }}</span>
              <span v-else class="text-white/40 text-xs">Ctrl+Enter 提交</span>
              <button
                class="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-400 text-white text-sm font-medium transition-colors disabled:opacity-50"
                :disabled="refining || !suggestion.trim()"
                @click="handleRefine"
              >
                <svg v-if="refining" class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {{ refining ? '生成中…' : '重新生成' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.lightbox-enter-active,
.lightbox-leave-active {
  transition: opacity 0.2s ease;
}
.lightbox-enter-from,
.lightbox-leave-to {
  opacity: 0;
}
</style>
