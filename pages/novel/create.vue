<script setup lang="ts">
import type { NovelGenre } from '~/types'

const router = useRouter()
const { request } = useApi()

const form = reactive({
  title: '',
  description: '',
  genre: 'fantasy' as NovelGenre,
  cover_image: 'purple',
})

const loading = ref(false)
const error = ref('')

const genreOptions = [
  { label: '玄幻', value: 'fantasy' },
  { label: '仙侠', value: 'xianxia' },
  { label: '都市', value: 'urban' },
  { label: '科幻', value: 'scifi' },
  { label: '言情', value: 'romance' },
  { label: '悬疑', value: 'mystery' },
  { label: '历史', value: 'historical' },
]

const iconOptions = [
  { value: 'purple',  gradient: 'linear-gradient(135deg,#8B5CF6,#3B82F6)' },
  { value: 'blue',    gradient: 'linear-gradient(135deg,#3B82F6,#06B6D4)' },
  { value: 'green',   gradient: 'linear-gradient(135deg,#10B981,#84CC16)' },
  { value: 'orange',  gradient: 'linear-gradient(135deg,#F59E0B,#EF4444)' },
  { value: 'red',     gradient: 'linear-gradient(135deg,#EF4444,#EC4899)' },
  { value: 'pink',    gradient: 'linear-gradient(135deg,#EC4899,#8B5CF6)' },
  { value: 'teal',    gradient: 'linear-gradient(135deg,#14B8A6,#3B82F6)' },
  { value: 'indigo',  gradient: 'linear-gradient(135deg,#6366F1,#8B5CF6)' },
  { value: 'amber',   gradient: 'linear-gradient(135deg,#F59E0B,#84CC16)' },
  { value: 'cyan',    gradient: 'linear-gradient(135deg,#06B6D4,#10B981)' },
]

function iconGradient(value: string) {
  return iconOptions.find(o => o.value === value)?.gradient
    ?? 'linear-gradient(135deg,#8B5CF6,#3B82F6)'
}

async function submit() {
  if (!form.title.trim()) { error.value = '请输入项目名称'; return }
  error.value = ''
  loading.value = true
  try {
    const data = await request<any>('/novels', {
      method: 'POST',
      body: JSON.stringify({
        title: form.title.trim(),
        description: form.description.trim(),
        genre: form.genre,
        cover_image: form.cover_image,
      }),
    })
    const novel = data.data ?? data
    router.push(`/novel/${novel.id}`)
  } catch (e: any) {
    error.value = e.message || '创建失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="max-w-xl mx-auto py-8">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">新建项目</h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">填写基本信息后即可开始创作</p>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">
      <!-- 项目图标 -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">项目图标</label>
        <div class="flex items-center gap-4">
          <!-- 预览 -->
          <div
            class="w-16 h-16 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
            :style="{ background: iconGradient(form.cover_image) }"
          >
            <span class="text-2xl font-bold text-white opacity-80 select-none">
              {{ form.title.charAt(0) || 'I' }}
            </span>
          </div>
          <!-- 色块选择 -->
          <div class="flex flex-wrap gap-2">
            <button
              v-for="opt in iconOptions"
              :key="opt.value"
              type="button"
              class="w-8 h-8 rounded-lg transition-all"
              :class="form.cover_image === opt.value
                ? 'ring-2 ring-offset-2 ring-gray-400 scale-110'
                : 'hover:scale-105'"
              :style="{ background: opt.gradient }"
              @click="form.cover_image = opt.value"
            />
          </div>
        </div>
      </div>

      <!-- 项目名称 -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          项目名称 <span class="text-red-500">*</span>
        </label>
        <input
          v-model="form.title"
          type="text"
          maxlength="100"
          placeholder="给项目起个名字"
          class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm bg-white dark:bg-gray-700 dark:text-white"
        />
      </div>

      <!-- 描述 -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">描述</label>
        <textarea
          v-model="form.description"
          rows="3"
          maxlength="500"
          placeholder="简要描述这个项目的故事背景或创作目标（可选）"
          class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm resize-none bg-white dark:bg-gray-700 dark:text-white"
        />
        <p class="mt-1 text-xs text-gray-400 text-right">{{ form.description.length }}/500</p>
      </div>

      <!-- 类型 -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          小说类型 <span class="text-red-500">*</span>
        </label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="opt in genreOptions"
            :key="opt.value"
            type="button"
            class="px-3 py-1.5 text-sm rounded-lg border transition-colors"
            :class="form.genre === opt.value
              ? 'bg-purple-600 border-purple-600 text-white'
              : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-purple-400'"
            @click="form.genre = opt.value as NovelGenre"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>

      <!-- 操作 -->
      <div class="flex items-center justify-end gap-3 pt-2">
        <NuxtLink
          to="/novel"
          class="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
        >
          取消
        </NuxtLink>
        <button
          type="button"
          :disabled="loading || !form.title.trim()"
          class="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white text-sm font-medium rounded-lg transition-colors"
          @click="submit"
        >
          {{ loading ? '创建中...' : '创建项目' }}
        </button>
      </div>
    </div>
  </div>
</template>
