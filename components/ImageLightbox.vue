<script setup lang="ts">
const { url, visible, pendingUrl, refineCallback, closeLightbox, updateLightboxUrl, discardPending, savePending } = useImageLightbox()

const suggestion = ref('')
const refining = ref(false)
const refineError = ref('')

const upscaling = ref(false)
const upscaleError = ref('')
const { upscaleImage } = useImageUpscaleApi()

const textareaEl = ref<HTMLTextAreaElement | null>(null)

watch(visible, async (v) => {
  if (v) {
    suggestion.value = ''
    refineError.value = ''
    upscaleError.value = ''
    if (refineCallback.value) {
      await nextTick()
      textareaEl.value?.focus()
    }
  }
})

async function handleUpscale() {
  if (!url.value || upscaling.value) return
  upscaling.value = true
  upscaleError.value = ''
  try {
    const newUrl = await upscaleImage(url.value, 2)
    if (newUrl) updateLightboxUrl(newUrl)
  } catch (e: any) {
    upscaleError.value = e?.message || '高清处理失败'
  } finally {
    upscaling.value = false
  }
}

async function handleRefine() {
  if (!refineCallback.value || !suggestion.value.trim()) return
  if (!url.value) { refineError.value = '请先生成或上传一张图片，再进行 AI 修改'; return }
  refining.value = true
  refineError.value = ''
  try {
    const newUrl = await refineCallback.value(url.value, suggestion.value.trim())
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
          :disabled="refining || upscaling"
          @click="closeLightbox"
        >
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <!-- Image -->
        <img
          :src="url"
          class="max-w-[90vw] max-h-[70vh] object-contain rounded shadow-2xl select-none"
          @click.stop
        />

        <!-- Bottom panel — always visible for upscale; textarea only when refineCallback is set -->
        <div class="mt-4 w-full max-w-xl px-4" @click.stop>
          <div class="bg-white/10 backdrop-blur rounded-xl p-3 flex flex-col gap-2">

            <!-- Save / Discard row — shown after regeneration -->
            <div v-if="pendingUrl" class="flex items-center gap-2 pb-2 border-b border-white/20">
              <span class="text-white/60 text-xs flex-1">已生成新图片，确认替换？</span>
              <button
                class="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white/70 hover:text-white text-sm transition-colors"
                @click="discardPending"
              >
                放弃
              </button>
              <button
                class="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-green-500 hover:bg-green-400 text-white text-sm font-medium transition-colors"
                @click="savePending"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                保存
              </button>
            </div>

            <!-- Textarea — only when refine is supported -->
            <textarea
              v-if="refineCallback"
              ref="textareaEl"
              v-model="suggestion"
              rows="2"
              placeholder="描述修改建议，例如：将背景改为夜晚雨天，人物表情更严肃"
              class="w-full rounded-lg bg-white/15 text-white placeholder-white/40 text-sm px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-white/30"
              :disabled="refining"
              @keydown.ctrl.enter="handleRefine"
              @keydown.meta.enter="handleRefine"
            />

            <!-- Action row: hint | upscale | 重新生成 -->
            <div class="flex items-center gap-2">
              <!-- Hint / error text -->
              <span v-if="refineError || upscaleError" class="text-red-300 text-xs flex-1">{{ refineError || upscaleError }}</span>
              <span v-else-if="refineCallback" class="text-white/40 text-xs flex-1">Ctrl+Enter 提交</span>
              <span v-else class="flex-1" />

              <!-- Upscale button -->
              <button
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white/80 hover:text-white text-sm transition-colors disabled:opacity-40 flex-shrink-0"
                :disabled="upscaling || refining"
                title="AI 高清放大（2×，重新生成）"
                @click="handleUpscale"
              >
                <svg v-if="upscaling" class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                {{ upscaling ? '处理中…' : 'AI 高清' }}
              </button>

              <!-- 重新生成 — only when refine is supported -->
              <button
                v-if="refineCallback"
                class="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-400 text-white text-sm font-medium transition-colors disabled:opacity-50 flex-shrink-0"
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
