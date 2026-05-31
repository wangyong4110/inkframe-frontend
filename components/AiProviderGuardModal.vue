<script setup lang="ts">
const { guardState, invalidateCache } = useAiProviderGuard()

const labels: Record<string, { title: string; desc: string; examples: string }> = {
  LLM:   { title: '文本生成（LLM）模型',  desc: '使用 AI 写作功能需要配置至少一个文本生成提供商并填写有效的 API Key。', examples: 'OpenAI、Claude、DeepSeek、豆包 等' },
  IMAGE: { title: '图像生成模型',          desc: '使用 AI 图像生成功能需要配置图像生成提供商并填写有效的 API Key。',   examples: '即梦AI（Volcengine）、Stable Diffusion 等' },
  VIDEO: { title: '视频生成模型',          desc: '使用 AI 视频生成功能需要配置视频生成提供商并填写有效的 API Key。',  examples: 'Kling、Seedance 等' },
  TTS:   { title: '语音合成（TTS）模型',   desc: '使用 AI 配音功能需要配置语音合成提供商并填写有效的 API Key。',     examples: '豆包语音、腾讯TTS、Minimax 等' },
}

const current = computed(() => labels[guardState.value.type] ?? labels.LLM)

function close() {
  guardState.value.show = false
}

function goConfig() {
  invalidateCache(guardState.value.type)
  guardState.value.show = false
  navigateTo('/model')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="ai-guard-fade">
      <div
        v-if="guardState.show"
        class="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        @click.self="close"
      >
        <div class="w-full max-w-sm mx-4 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 space-y-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
              <svg class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              </svg>
            </div>
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">尚未配置 {{ current.title }}</h3>
          </div>

          <p class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            {{ current.desc }}
          </p>

          <p class="text-sm text-gray-500 dark:text-gray-400">
            前往 <span class="font-medium text-gray-700 dark:text-gray-200">模型 → 模型提供商</span>，添加并配置你的服务商（如 {{ current.examples }}）。
          </p>

          <div class="flex gap-3 pt-1">
            <button
              class="flex-1 px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              @click="close"
            >稍后再说</button>
            <button
              class="flex-1 px-4 py-2 text-sm rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors font-medium"
              @click="goConfig"
            >去配置模型 →</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ai-guard-fade-enter-active,
.ai-guard-fade-leave-active {
  transition: opacity 0.2s ease;
}
.ai-guard-fade-enter-from,
.ai-guard-fade-leave-to {
  opacity: 0;
}
.ai-guard-fade-enter-active .max-w-sm,
.ai-guard-fade-leave-active .max-w-sm {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.ai-guard-fade-enter-from .max-w-sm,
.ai-guard-fade-leave-to .max-w-sm {
  transform: scale(0.95);
  opacity: 0;
}
</style>
