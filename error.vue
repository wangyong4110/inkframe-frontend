<template>
  <div class="min-h-screen bg-gray-950 text-white flex items-center justify-center">
    <div class="text-center space-y-6 max-w-md px-4">
      <div class="text-8xl font-bold text-gray-800">{{ error.statusCode }}</div>
      <h1 class="text-2xl font-bold text-white">
        {{ title }}
      </h1>
      <p class="text-gray-400">{{ description }}</p>
      <div class="flex justify-center gap-4">
        <button
          @click="handleError"
          aria-label="返回首页"
          class="px-6 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          返回首页
        </button>
        <button
          @click="$router.back()"
          aria-label="返回上一页"
          class="px-6 py-2 border border-gray-700 hover:bg-gray-800 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 text-gray-300"
        >
          返回上一页
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ error: { statusCode: number; message?: string } }>()

const title = computed(() => {
  if (props.error.statusCode === 404) return '页面不存在'
  if (props.error.statusCode === 403) return '没有访问权限'
  if (props.error.statusCode === 500) return '服务器错误'
  return '出现了一些问题'
})

const description = computed(() => {
  if (props.error.statusCode === 404) return '您访问的页面不存在或已被移除。'
  if (props.error.statusCode === 403) return '您没有权限访问此页面。'
  if (props.error.statusCode === 500) return '服务器遇到了问题，请稍后重试。'
  return props.error.message || '请稍后重试或联系支持团队。'
})

function handleError() {
  clearError({ redirect: '/' })
}
</script>
