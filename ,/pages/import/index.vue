<script setup lang="ts">
import type { Novel, Video, ApiResponse } from '~/types'
import { VIDEO_PRESETS } from '~/composables/useStylePresets'

const router = useRouter()
const api = useApi()

// 导入状态
const importing = ref(false)
const importingStep = ref(0)
const importProgress = ref(0)
const importResult = ref<any>(null)

// 表单数据
const importForm = ref({
  source: 'file',
  url: '',
  file: null as File | null,
  format: 'auto',
  siteName: '',
})

// 视频配置
const videoConfig = ref({
  startChapter: 1,
  endChapter: 0,
  resolution: '1080p',
  videoPreset: 'cinematic',
  frameRate: 24,
  aspectRatio: '16:9',
  artStyle: 'anime',
})

watch(() => videoConfig.value.videoPreset, (id) => {
  const preset = VIDEO_PRESETS.find(p => p.id === id)
  if (preset) {
    videoConfig.value.aspectRatio = preset.aspect_ratio
    videoConfig.value.frameRate = preset.frame_rate
  }
})

// 导入步骤
const steps = [
  { title: '选择来源', icon: 'upload' },
  { title: '上传文件', icon: 'file' },
  { title: '配置视频', icon: 'video' },
  { title: '开始生成', icon: 'play' },
]

const sources = [
  { value: 'file', label: '本地文件', icon: 'folder', formats: 'TXT, MD, JSON, HTML' },
  { value: 'url', label: '网络链接', icon: 'link', formats: '支持大多数小说网站' },
  { value: 'crawl', label: '爬取小说', icon: 'globe', formats: '起点、晋江、纵横等' },
]

const resolutionOptions = [
  { value: '720p', label: '720p (1280x720)' },
  { value: '1080p', label: '1080p (1920x1080)' },
  { value: '4k', label: '4K (3840x2160)' },
]

// 文件上传
const fileInput = ref<HTMLInputElement | null>(null)

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    importForm.value.file = target.files[0]
    importForm.value.format = detectFormat(target.files[0].name)
  }
}

function detectFormat(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'txt': return 'txt'
    case 'md':
    case 'markdown': return 'md'
    case 'json': return 'json'
    case 'html':
    case 'htm': return 'html'
    case 'epub': return 'epub'
    default: return 'auto'
  }
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
    importForm.value.file = event.dataTransfer.files[0]
    importForm.value.format = detectFormat(event.dataTransfer.files[0].name)
  }
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
}

// 导入错误信息
const importError = ref('')

// 开始导入
async function handleImport() {
  importing.value = true
  importingStep.value = 0
  importProgress.value = 0
  importResult.value = null
  importError.value = ''

  try {
    // 步骤1：导入小说
    importingStep.value = 1
    
    let result: any
    
    if (importForm.value.source === 'file') {
      // 文件导入
      const formData = new FormData()
      if (importForm.value.file) {
        formData.append('file', importForm.value.file)
      }
      formData.append('format', importForm.value.format)
      
      const response = await fetch('/api/v1/import/novel/file', {
        method: 'POST',
        body: formData,
      })
      result = await response.json()
    } else if (importForm.value.source === 'url') {
      // URL导入
      const response = await fetch('/api/v1/import/novel/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importForm.value.url }),
      })
      result = await response.json()
    } else {
      // 爬取导入
      const response = await fetch('/api/v1/import/novel/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: importForm.value.url,
          site_name: importForm.value.siteName,
        }),
      })
      result = await response.json()
    }

    if (result.code !== 0) {
      throw new Error(result.error || '导入失败')
    }

    importResult.value = result.data
    importProgress.value = 30

    // 步骤2：配置视频
    importingStep.value = 2
    importProgress.value = 40

    // 步骤3：生成视频
    importingStep.value = 3
    importProgress.value = 50

    const videoResponse = await fetch(`/api/v1/novels/${result.data.novel_id}/generate-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start_chapter: videoConfig.value.startChapter,
        end_chapter: videoConfig.value.endChapter || undefined,
        resolution: videoConfig.value.resolution,
        frame_rate: videoConfig.value.frameRate,
        aspect_ratio: videoConfig.value.aspectRatio,
        art_style: videoConfig.value.artStyle,
      }),
    })

    const videoResult = await videoResponse.json()
    
    if (videoResult.code !== 0) {
      throw new Error(videoResult.error || '视频生成失败')
    }

    importProgress.value = 100
    importingStep.value = 4

    importResult.value.video = videoResult.data

  } catch (error: any) {
    console.error('Import failed:', error)
    importError.value = error.message || '导入失败'
  } finally {
    importing.value = false
  }
}

// 查看小说
function viewNovel() {
  if (importResult.value?.novel_id) {
    router.push(`/novel/${importResult.value.novel_id}`)
  }
}

// 查看视频
function viewVideo() {
  if (importResult.value?.video?.video_id) {
    router.push(`/video/${importResult.value.video.video_id}`)
  }
}

// 重置
function reset() {
  importForm.value = {
    source: 'file',
    url: '',
    file: null,
    format: 'auto',
    siteName: '',
  }
  videoConfig.value = {
    startChapter: 1,
    endChapter: 0,
    resolution: '1080p',
    videoPreset: 'cinematic',
    frameRate: 24,
    aspectRatio: '16:9',
    artStyle: 'anime',
  }
  importResult.value = null
  importingStep.value = 0
  importProgress.value = 0
  importError.value = ''
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">导入小说</h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          从文件、链接或网站导入小说并生成视频
        </p>
      </div>
    </div>

    <!-- Progress Steps -->
    <div class="card p-6">
      <div class="flex items-center justify-between">
        <div 
          v-for="(step, index) in steps" 
          :key="index"
          class="flex items-center"
          :class="index < steps.length - 1 ? 'flex-1' : ''"
        >
          <div class="flex flex-col items-center">
            <div 
              class="w-10 h-10 rounded-full flex items-center justify-center font-medium"
              :class="[
                index + 1 <= importingStep 
                  ? 'bg-primary-500 text-white' 
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
              ]"
            >
              <svg v-if="index + 1 < importingStep" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <span v-else>{{ index + 1 }}</span>
            </div>
            <span 
              class="mt-2 text-sm"
              :class="index + 1 <= importingStep ? 'text-primary-600' : 'text-gray-500'"
            >
              {{ step.title }}
            </span>
          </div>
          <div 
            v-if="index < steps.length - 1" 
            class="flex-1 h-0.5 mx-4"
            :class="index + 1 < importingStep ? 'bg-primary-500' : 'bg-gray-200 dark:bg-gray-700'"
          ></div>
        </div>
      </div>

      <!-- Progress Bar -->
      <div v-if="importing" class="mt-6">
        <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div 
            class="h-full bg-primary-500 transition-all duration-300"
            :style="{ width: `${importProgress}%` }"
          ></div>
        </div>
        <p class="mt-2 text-sm text-gray-500 text-center">
          {{ importProgress < 30 ? '正在导入小说...' : 
             importProgress < 50 ? '正在配置视频参数...' :
             importProgress < 100 ? '正在生成视频...' : '完成！' }}
        </p>
      </div>
    </div>

    <!-- Source Selection -->
    <div class="grid gap-4 md:grid-cols-3">
      <div
        v-for="source in sources"
        :key="source.value"
        class="card p-6 cursor-pointer transition-all"
        :class="[
          importForm.source === source.value 
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' 
            : 'hover:border-gray-300 dark:hover:border-gray-600'
        ]"
        @click="importForm.source = source.value"
      >
        <div class="flex items-center space-x-4">
          <div 
            class="w-12 h-12 rounded-lg flex items-center justify-center"
            :class="importForm.source === source.value ? 'bg-primary-500 text-white' : 'bg-gray-100 dark:bg-gray-800'"
          >
            <svg v-if="source.icon === 'folder'" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <svg v-else-if="source.icon === 'link'" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <svg v-else class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
          </div>
          <div>
            <h3 class="font-medium text-gray-900 dark:text-white">{{ source.label }}</h3>
            <p class="text-sm text-gray-500">{{ source.formats }}</p>
          </div>
        </div>
        <div 
          v-if="importForm.source === source.value" 
          class="mt-4 flex items-center text-primary-600"
        >
          <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          已选择
        </div>
      </div>
    </div>

    <!-- Import Options -->
    <div class="card p-6">
      <!-- File Upload -->
      <div v-if="importForm.source === 'file'" class="space-y-4">
        <h3 class="font-semibold text-gray-900 dark:text-white">上传文件</h3>
        
        <div 
          class="border-2 border-dashed rounded-lg p-8 text-center"
          :class="importForm.file ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'"
          @drop="handleDrop"
          @dragover="handleDragOver"
          @click="fileInput?.click()"
        >
          <input 
            ref="fileInput"
            type="file" 
            class="hidden" 
            accept=".txt,.md,.json,.html,.htm"
            @change="handleFileSelect"
          />
          
          <div v-if="importForm.file" class="space-y-2">
            <svg class="w-12 h-12 mx-auto text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p class="font-medium text-gray-900 dark:text-white">{{ importForm.file.name }}</p>
            <p class="text-sm text-gray-500">点击或拖拽重新选择</p>
          </div>
          
          <div v-else class="space-y-2">
            <svg class="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p class="text-gray-600 dark:text-gray-400">点击或拖拽文件到此处</p>
            <p class="text-sm text-gray-500">支持 TXT, MD, JSON, HTML 格式</p>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            文件格式
          </label>
          <select v-model="importForm.format" class="input w-48">
            <option value="auto">自动检测</option>
            <option value="txt">TXT</option>
            <option value="md">Markdown</option>
            <option value="json">JSON</option>
            <option value="html">HTML</option>
          </select>
        </div>
      </div>

      <!-- URL Import -->
      <div v-if="importForm.source === 'url'" class="space-y-4">
        <h3 class="font-semibold text-gray-900 dark:text-white">网络链接</h3>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            小说 URL
          </label>
          <input 
            v-model="importForm.url" 
            type="url" 
            class="input" 
            placeholder="https://example.com/novel/xxx"
          />
          <p class="mt-1 text-sm text-gray-500">
            支持大多数小说网站的 URL
          </p>
        </div>
      </div>

      <!-- Crawl -->
      <div v-if="importForm.source === 'crawl'" class="space-y-4">
        <h3 class="font-semibold text-gray-900 dark:text-white">爬取小说</h3>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            小说页面 URL
          </label>
          <input 
            v-model="importForm.url" 
            type="url" 
            class="input" 
            placeholder="https://www.qidian.com/xxx"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            站点名称（可选）
          </label>
          <select v-model="importForm.siteName" class="input">
            <option value="">自动检测</option>
            <option value="qidian">起点中文网</option>
            <option value="jjwxc">晋江文学城</option>
            <option value="zongheng">纵横中文网</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Video Config -->
    <div class="card p-6 space-y-6">
      <h3 class="font-semibold text-gray-900 dark:text-white">视频配置</h3>
      <div class="grid gap-6 md:grid-cols-2">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            开始章节
          </label>
          <input
            v-model.number="videoConfig.startChapter"
            type="number"
            min="1"
            class="input"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            结束章节（0 表示全部）
          </label>
          <input
            v-model.number="videoConfig.endChapter"
            type="number"
            min="0"
            class="input"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            分辨率
          </label>
          <select v-model="videoConfig.resolution" class="input">
            <option v-for="opt in resolutionOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          视频格式
        </label>
        <StylePicker type="video" v-model="videoConfig.videoPreset" compact />
        <p class="mt-1 text-xs text-gray-400">选择后自动设置宽高比和帧率</p>
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          图片风格
        </label>
        <StylePicker type="image" v-model="videoConfig.artStyle" compact />
      </div>
    </div>

    <!-- Actions -->
    <div class="flex justify-between">
      <button class="btn-outline" @click="reset">
        重置
      </button>
      <button 
        class="btn-primary"
        :disabled="importing || !importForm.url && !importForm.file"
        @click="handleImport"
      >
        <svg v-if="importing" class="w-5 h-5 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {{ importing ? '处理中...' : '导入并生成视频' }}
      </button>
    </div>

    <!-- Error -->
    <div v-if="importError" class="card p-4 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
      导入失败：{{ importError }}
    </div>

    <!-- Result -->
    <div v-if="importResult" class="card p-6 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
      <div class="flex items-center space-x-4 mb-4">
        <div class="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
          <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h3 class="font-semibold text-gray-900 dark:text-white">导入成功！</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            已导入「{{ importResult.title }}」，共 {{ importResult.total_chapters }} 章
          </p>
        </div>
      </div>
      <div class="flex space-x-4">
        <button class="btn-primary" @click="viewNovel">
          查看小说
        </button>
        <button v-if="importResult.video" class="btn-outline" @click="viewVideo">
          查看视频
        </button>
      </div>
    </div>
  </div>
</template>
