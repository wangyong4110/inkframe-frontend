<script setup lang="ts">
import type { UserFeedback } from '~/composables/useFeedbackApi'

const authStore = useAuthStore()
const toast = useToast()
const feedbackApi = useFeedbackApi()
const { uploadImage } = useImageUpload()

const showPanel = ref(false)
const activeTab = ref<'submit' | 'history'>('submit')
const submitting = ref(false)
const showSuccess = ref(false)

// ── Submit form ──
const form = ref({ type: '', title: '', content: '', rating: 0 })

// ── Screenshots ──
interface ScreenshotItem { file: File; preview: string; url: string; uploading: boolean }
const screenshots = ref<ScreenshotItem[]>([])
const MAX_SCREENSHOTS = 3

async function addScreenshots(files: FileList | File[]) {
  const arr = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, MAX_SCREENSHOTS - screenshots.value.length)
  for (const file of arr) {
    const preview = URL.createObjectURL(file)
    const item: ScreenshotItem = { file, preview, url: '', uploading: true }
    screenshots.value.push(item)
    try {
      item.url = await uploadImage(file)
    } catch {
      toast.error('截图上传失败')
      item.url = ''
    } finally {
      item.uploading = false
    }
  }
}

function removeScreenshot(index: number) {
  URL.revokeObjectURL(screenshots.value[index].preview)
  screenshots.value.splice(index, 1)
}

function onFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) addScreenshots(input.files)
  input.value = ''
}

function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  const images = Array.from(items).filter(i => i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean) as File[]
  if (images.length) addScreenshots(images)
}
const currentPage = ref('')

const typeOptions = [
  { value: 'bug',     label: 'Bug报告', emoji: '🐛' },
  { value: 'feature', label: '功能建议', emoji: '💡' },
  { value: 'content', label: '内容问题', emoji: '😵' },
  { value: 'question',label: '使用咨询', emoji: '💬' },
  { value: 'praise',  label: '表扬',    emoji: '👍' },
]

function setRating(star: number) {
  form.value.rating = form.value.rating === star ? 0 : star
}

function resetForm() {
  form.value = { type: '', title: '', content: '', rating: 0 }
  screenshots.value.forEach(s => URL.revokeObjectURL(s.preview))
  screenshots.value = []
}

async function submit() {
  if (!form.value.type) { toast.warning('请选择反馈类型'); return }
  if (!form.value.content.trim()) { toast.warning('请填写反馈内容'); return }
  submitting.value = true
  try {
    const uploadedUrls = screenshots.value.filter(s => s.url).map(s => s.url)
    await feedbackApi.submitFeedback({
      type: form.value.type,
      title: form.value.title || undefined,
      content: form.value.content,
      rating: form.value.rating || undefined,
      page_url: typeof window !== 'undefined' ? window.location.href : '',
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      screenshots: uploadedUrls.length ? uploadedUrls : undefined,
    })
    resetForm()
    showPanel.value = false
    showSuccess.value = true
    setTimeout(() => { showSuccess.value = false }, 1000)
  } catch (e: any) {
    toast.error('提交失败：' + (e.message || '未知错误'))
  } finally {
    submitting.value = false
  }
}

// ── History ──
const historyList = ref<UserFeedback[]>([])
const historyLoading = ref(false)
const expandedId = ref<number | null>(null)

const STATUS_LABEL: Record<string, string> = {
  pending:   '待处理',
  reviewing: '处理中',
  resolved:  '已解决',
  closed:    '已关闭',
}
const STATUS_CLASS: Record<string, string> = {
  pending:   'bg-yellow-500/15 text-yellow-400',
  reviewing: 'bg-blue-500/15 text-blue-400',
  resolved:  'bg-green-500/15 text-green-400',
  closed:    'bg-gray-500/15 text-gray-400',
}
const TYPE_LABEL: Record<string, string> = {
  bug: '🐛', feature: '💡', content: '😵', question: '💬', praise: '👍',
}

async function loadHistory() {
  historyLoading.value = true
  try {
    const res = await feedbackApi.listMyFeedback(1, 20)
    historyList.value = (res as any)?.data?.items ?? (res as any)?.items ?? []
  } catch {
    historyList.value = []
  } finally {
    historyLoading.value = false
  }
}

function formatDate(s: string) {
  if (!s) return ''
  const d = new Date(s)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

// ── Panel ──
function openPanel() {
  if (typeof window !== 'undefined') currentPage.value = window.location.pathname
  showPanel.value = true
  if (activeTab.value === 'history') loadHistory()
}

function closePanel() {
  showPanel.value = false
}

function switchTab(tab: 'submit' | 'history') {
  activeTab.value = tab
  if (tab === 'history') loadHistory()
}
</script>

<template>
  <Teleport to="body">
    <!-- Success toast near button -->
    <Transition name="slide-up">
      <div v-if="showSuccess" class="fixed bottom-20 right-6 z-50 flex items-center gap-2 bg-gray-900 border border-green-500/40 text-green-400 text-sm px-4 py-2.5 rounded-xl shadow-lg">
        <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
        感谢您的反馈~
      </div>
    </Transition>

    <!-- Floating button -->
    <button
      v-if="authStore.isLoggedIn"
      class="fixed bottom-6 right-6 z-50 w-12 h-12 bg-violet-600 hover:bg-violet-500 text-white rounded-full shadow-lg flex items-center justify-center transition-colors group"
      title="意见反馈"
      @click="openPanel"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
      </svg>
      <span class="absolute right-14 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-gray-700">
        意见反馈
      </span>
    </button>

    <!-- Modal -->
    <Transition name="fade">
      <div
        v-if="showPanel"
        class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
        @click.self="closePanel"
      >
        <Transition name="slide-up">
          <div
            v-if="showPanel"
            class="bg-gray-900 rounded-xl border border-gray-700 shadow-2xl w-full max-w-md flex flex-col"
            style="max-height: 90vh"
          >
            <!-- Header -->
            <div class="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
              <div class="flex gap-1 bg-gray-800 rounded-lg p-0.5">
                <button
                  class="px-3 py-1 rounded-md text-xs font-medium transition-colors"
                  :class="activeTab === 'submit' ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-white'"
                  @click="switchTab('submit')"
                >提交反馈</button>
                <button
                  class="px-3 py-1 rounded-md text-xs font-medium transition-colors"
                  :class="activeTab === 'history' ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-white'"
                  @click="switchTab('history')"
                >我的反馈</button>
              </div>
              <button class="text-gray-400 hover:text-white p-1 rounded transition-colors" @click="closePanel">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <!-- ── Tab: Submit ── -->
            <template v-if="activeTab === 'submit'">
              <div class="px-5 py-4 space-y-4 overflow-y-auto flex-1">
                <!-- Type -->
                <div>
                  <label class="block text-xs text-gray-400 mb-2">反馈类型 <span class="text-red-400">*</span></label>
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="opt in typeOptions" :key="opt.value"
                      class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors"
                      :class="form.type === opt.value
                        ? 'bg-violet-600 border-violet-500 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'"
                      @click="form.type = opt.value"
                    >
                      <span>{{ opt.emoji }}</span><span>{{ opt.label }}</span>
                    </button>
                  </div>
                </div>
                <!-- Title -->
                <div>
                  <label class="block text-xs text-gray-400 mb-1">标题</label>
                  <input v-model="form.title" type="text" placeholder="简短描述（选填）"
                    class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors" />
                </div>
                <!-- Content -->
                <div>
                  <label class="block text-xs text-gray-400 mb-1">详细描述 <span class="text-red-400">*</span></label>
                  <textarea v-model="form.content" placeholder="请详细描述..." rows="4"
                    class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors resize-none" />
                </div>
                <!-- Rating -->
                <div>
                  <label class="block text-xs text-gray-400 mb-1">满意度评分（选填）</label>
                  <div class="flex gap-1">
                    <button v-for="star in 5" :key="star"
                      class="text-xl transition-colors"
                      :class="star <= form.rating ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-300'"
                      @click="setRating(star)"
                    >{{ star <= form.rating ? '★' : '☆' }}</button>
                  </div>
                </div>

                <!-- Screenshots -->
                <div @paste.capture="onPaste">
                  <label class="block text-xs text-gray-400 mb-2">截图（最多3张，可粘贴）</label>
                  <div class="flex gap-2 flex-wrap">
                    <div v-for="(s, i) in screenshots" :key="i"
                      class="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-600 shrink-0 group"
                    >
                      <img :src="s.preview" class="w-full h-full object-cover" />
                      <div v-if="s.uploading" class="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <svg class="w-4 h-4 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                        </svg>
                      </div>
                      <button v-else
                        class="absolute top-0.5 right-0.5 w-5 h-5 bg-black/70 rounded-full text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        @click="removeScreenshot(i)"
                      >
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    </div>
                    <label v-if="screenshots.length < MAX_SCREENSHOTS"
                      class="w-20 h-20 rounded-lg border border-dashed border-gray-600 hover:border-violet-500 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors text-gray-500 hover:text-violet-400 shrink-0"
                    >
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4"/></svg>
                      <span class="text-xs">添加</span>
                      <input type="file" accept="image/*" multiple class="hidden" @change="onFileInputChange" />
                    </label>
                  </div>
                </div>
              </div>
              <div class="px-5 py-4 border-t border-gray-700 flex gap-3 shrink-0">
                <button
                  class="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm py-2 rounded-lg transition-colors font-medium"
                  :disabled="submitting" @click="submit"
                >{{ submitting ? '提交中...' : '提交反馈' }}</button>
                <button class="px-4 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm py-2 rounded-lg transition-colors" @click="closePanel">取消</button>
              </div>
            </template>

            <!-- ── Tab: History ── -->
            <template v-else>
              <div class="flex-1 overflow-y-auto">
                <!-- Loading -->
                <div v-if="historyLoading" class="flex items-center justify-center py-12 text-gray-500 text-sm">
                  <svg class="w-4 h-4 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  加载中...
                </div>

                <!-- Empty -->
                <div v-else-if="historyList.length === 0" class="flex flex-col items-center justify-center py-12 text-gray-500">
                  <svg class="w-10 h-10 mb-3 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                  </svg>
                  <p class="text-sm">还没有提交过反馈</p>
                  <button class="mt-3 text-xs text-violet-400 hover:text-violet-300 transition-colors" @click="activeTab = 'submit'">立即提交</button>
                </div>

                <!-- List -->
                <ul v-else class="divide-y divide-gray-800">
                  <li v-for="item in historyList" :key="item.id" class="px-5 py-3">
                    <!-- Row summary -->
                    <button class="w-full text-left" @click="expandedId = expandedId === item.id ? null : item.id">
                      <div class="flex items-start justify-between gap-2">
                        <div class="flex items-center gap-2 min-w-0">
                          <span class="text-base shrink-0">{{ TYPE_LABEL[item.type] ?? '📝' }}</span>
                          <span class="text-sm text-gray-200 truncate">{{ item.title || item.content }}</span>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                          <span class="text-xs px-2 py-0.5 rounded-full font-medium" :class="STATUS_CLASS[item.status] ?? 'bg-gray-700 text-gray-400'">
                            {{ STATUS_LABEL[item.status] ?? item.status }}
                          </span>
                          <svg class="w-3.5 h-3.5 text-gray-500 transition-transform" :class="expandedId === item.id ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                          </svg>
                        </div>
                      </div>
                      <div class="text-xs text-gray-500 mt-0.5 pl-7">
                        FB-{{ String(item.seq_no).padStart(6, '0') }} · {{ formatDate(item.created_at) }}
                      </div>
                    </button>

                    <!-- Expanded detail -->
                    <div v-if="expandedId === item.id" class="mt-3 pl-7 space-y-3">
                      <!-- Content -->
                      <p class="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{{ item.content }}</p>

                      <!-- Admin reply -->
                      <div v-if="item.reply_content" class="rounded-lg bg-violet-900/30 border border-violet-700/40 px-3 py-2.5">
                        <div class="flex items-center gap-1.5 mb-1.5">
                          <svg class="w-3.5 h-3.5 text-violet-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z" clip-rule="evenodd"/>
                          </svg>
                          <span class="text-xs font-medium text-violet-300">官方回复</span>
                          <span v-if="item.replied_at" class="text-xs text-gray-500">· {{ formatDate(item.replied_at) }}</span>
                        </div>
                        <p class="text-sm text-gray-200 leading-relaxed">{{ item.reply_content }}</p>
                      </div>

                      <!-- No reply yet for non-resolved -->
                      <p v-else-if="item.status === 'pending'" class="text-xs text-gray-500 italic">等待处理中，感谢您的耐心</p>
                      <p v-else-if="item.status === 'reviewing'" class="text-xs text-gray-500 italic">已在处理中，稍后会有回复</p>
                    </div>
                  </li>
                </ul>
              </div>
            </template>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-up-enter-active, .slide-up-leave-active { transition: transform 0.2s ease, opacity 0.2s ease; }
.slide-up-enter-from, .slide-up-leave-to { transform: translateY(16px); opacity: 0; }
</style>
