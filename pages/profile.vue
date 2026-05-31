<script setup lang="ts">
definePageMeta({ auth: true })

const authStore = useAuthStore()
const toast = useToast()
const profileApi = useProfileApi()
const novelApi = usePublicNovelApi()
const { uploadImage, uploading: avatarUploading } = useImageUpload()

// ── Profile form ─────────────────────────────────────────────────────────────
const nickname = ref(authStore.user?.nickname ?? '')
const email = ref(authStore.user?.email ?? '')
const savingProfile = ref(false)

watch(() => authStore.user, (u) => {
  if (u) {
    nickname.value = u.nickname
    email.value = u.email
  }
}, { immediate: true })

async function saveProfile() {
  savingProfile.value = true
  try {
    const res = await profileApi.updateProfile({
      nickname: nickname.value.trim() || undefined,
      email: email.value.trim() || undefined,
    })
    if (authStore.user) {
      authStore.user.nickname = res.data.nickname
      authStore.user.email = res.data.email
    }
    toast.success('资料已更新')
  } catch (e: any) {
    toast.error(e.message || '保存失败')
  } finally {
    savingProfile.value = false
  }
}

// ── Avatar upload ─────────────────────────────────────────────────────────────
const avatarInput = ref<HTMLInputElement | null>(null)

async function onAvatarChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const url = await uploadImage(file)
    await profileApi.updateProfile({ avatar: url })
    if (authStore.user) authStore.user.avatar = url
    toast.success('头像已更新')
  } catch (e: any) {
    toast.error(e.message || '头像上传失败')
  } finally {
    if (avatarInput.value) avatarInput.value.value = ''
  }
}

// ── Password change ───────────────────────────────────────────────────────────
const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const savingPassword = ref(false)
const showOld = ref(false)
const showNew = ref(false)

const passwordStrength = computed(() => {
  const p = newPassword.value
  if (!p) return 0
  let s = 0
  if (p.length >= 8) s++
  if (/[A-Z]/.test(p)) s++
  if (/[0-9]/.test(p)) s++
  if (/[^A-Za-z0-9]/.test(p)) s++
  return s
})

const strengthLabel = computed(() => ['', '弱', '一般', '较强', '强'][passwordStrength.value])
const strengthColor = computed(() => ['', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500'][passwordStrength.value])

async function changePassword() {
  if (newPassword.value !== confirmPassword.value) {
    toast.error('两次密码输入不一致')
    return
  }
  if (newPassword.value.length < 8) {
    toast.error('新密码至少 8 位')
    return
  }
  savingPassword.value = true
  try {
    await profileApi.changePassword({ old_password: oldPassword.value, new_password: newPassword.value })
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    toast.success('密码已修改')
  } catch (e: any) {
    toast.error(e.message || '修改失败')
  } finally {
    savingPassword.value = false
  }
}

// ── Account deletion ─────────────────────────────────────────────────────────
const showDeleteModal = ref(false)
const deletePassword = ref('')
const deleteConfirmText = ref('')
const deletingAccount = ref(false)
const DELETE_CONFIRM_WORD = '确认注销'

async function confirmDeleteAccount() {
  if (deleteConfirmText.value !== DELETE_CONFIRM_WORD) {
    toast.error(`请输入"${DELETE_CONFIRM_WORD}"以确认`)
    return
  }
  deletingAccount.value = true
  try {
    await profileApi.deleteAccount({ password: deletePassword.value || undefined })
    toast.success('账号已注销')
    authStore.logout()
    navigateTo('/auth/login')
  } catch (e: any) {
    toast.error(e.message || '注销失败')
  } finally {
    deletingAccount.value = false
  }
}

// ── Reading history ───────────────────────────────────────────────────────────
const readingHistory = ref<any[]>([])
const readingHistoryTotal = ref(0)
const readingHistoryPage = ref(1)
const loadingHistory = ref(false)
const loadingMoreHistory = ref(false)
const PAGE_SIZE = 12

async function loadReadingHistory(append = false) {
  if (!authStore.isLoggedIn) return
  if (append) loadingMoreHistory.value = true
  else loadingHistory.value = true
  try {
    const res = await novelApi.getReadingHistory(readingHistoryPage.value, PAGE_SIZE)
    const items = res.data.items ?? []
    if (append) readingHistory.value.push(...items)
    else readingHistory.value = items
    readingHistoryTotal.value = res.data.total
  } catch { /* ignore */ } finally {
    loadingHistory.value = false
    loadingMoreHistory.value = false
  }
}

async function loadMoreHistory() {
  readingHistoryPage.value++
  await loadReadingHistory(true)
}

onMounted(() => {
  loadReadingHistory()
})

function formatDate(s?: string) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
}

const avatarInitial = computed(() =>
  (authStore.user?.nickname || authStore.user?.username || '?').charAt(0).toUpperCase()
)
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-8 space-y-6">
    <div class="flex items-center gap-3 mb-2">
      <NuxtLink to="/novel" class="text-gray-500 hover:text-gray-300 transition-colors">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
      </NuxtLink>
      <h1 class="text-xl font-bold text-white">个人资料</h1>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left: Avatar + account info -->
      <div class="space-y-4">
        <!-- Avatar card -->
        <div class="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col items-center gap-4">
          <!-- Avatar -->
          <div class="relative group">
            <div
              class="w-24 h-24 rounded-full overflow-hidden ring-2 ring-gray-700 cursor-pointer"
              @click="avatarInput?.click()"
            >
              <img
                v-if="authStore.user?.avatar"
                :src="authStore.user.avatar"
                alt="avatar"
                class="w-full h-full object-cover"
              />
              <div v-else class="w-full h-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-3xl font-bold text-white">
                {{ avatarInitial }}
              </div>
            </div>
            <!-- Hover overlay -->
            <div
              class="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center cursor-pointer"
              @click="avatarInput?.click()"
            >
              <svg v-if="!avatarUploading" class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              <div v-else class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
            <input ref="avatarInput" type="file" accept="image/*" class="hidden" @change="onAvatarChange" />
          </div>

          <div class="text-center">
            <p class="font-semibold text-white text-lg">{{ authStore.user?.nickname || authStore.user?.username }}</p>
            <p class="text-sm text-gray-500 mt-0.5">@{{ authStore.user?.username }}</p>
            <span class="mt-2 inline-block px-2.5 py-0.5 text-xs rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/30">
              {{ authStore.user?.role === 'admin' ? '管理员' : '创作者' }}
            </span>
          </div>

          <p class="text-xs text-gray-600 text-center">点击头像上传新图片</p>
        </div>

        <!-- Account meta -->
        <div class="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
          <h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wider">账户信息</h3>
          <div class="space-y-2.5 text-sm">
            <div class="flex justify-between items-center">
              <span class="text-gray-500">用户名</span>
              <span class="text-gray-300 font-mono text-xs">{{ authStore.user?.username }}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-500">邮箱</span>
              <span class="text-gray-300 text-xs truncate max-w-32 text-right">{{ authStore.user?.email || '—' }}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-500">阅读记录</span>
              <span class="text-gray-300">{{ readingHistoryTotal }} 本</span>
            </div>
          </div>
        </div>

      </div>

      <!-- Right: Edit forms -->
      <div class="lg:col-span-2 space-y-5">
        <!-- Basic info -->
        <div class="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h2 class="text-base font-semibold text-white mb-5 flex items-center gap-2">
            <svg class="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
            基本信息
          </h2>
          <div class="space-y-4">
            <!-- Username (read-only) -->
            <div>
              <label class="block text-sm text-gray-400 mb-1.5">用户名</label>
              <input
                :value="authStore.user?.username"
                readonly
                class="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-500 cursor-not-allowed font-mono"
              />
              <p class="text-xs text-gray-600 mt-1">用户名创建后不可更改</p>
            </div>
            <!-- Nickname -->
            <div>
              <label class="block text-sm text-gray-400 mb-1.5">昵称</label>
              <input
                v-model="nickname"
                type="text"
                placeholder="设置一个昵称"
                class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>
            <!-- Email -->
            <div>
              <label class="block text-sm text-gray-400 mb-1.5">邮箱</label>
              <input
                v-model="email"
                type="email"
                placeholder="your@email.com"
                class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>

            <div class="flex justify-end pt-1">
              <button
                :disabled="savingProfile"
                @click="saveProfile"
                class="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
              >
                <svg v-if="savingProfile" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                {{ savingProfile ? '保存中...' : '保存更改' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Change password -->
        <div class="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h2 class="text-base font-semibold text-white mb-5 flex items-center gap-2">
            <svg class="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
            修改密码
          </h2>
          <div class="space-y-4">
            <!-- Current password -->
            <div>
              <label class="block text-sm text-gray-400 mb-1.5">当前密码</label>
              <div class="relative">
                <input
                  v-model="oldPassword"
                  :type="showOld ? 'text' : 'password'"
                  placeholder="输入当前密码"
                  class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 pr-11 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 transition-colors"
                />
                <button
                  type="button"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  @click="showOld = !showOld"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path v-if="showOld" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                    <template v-else>
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                    </template>
                  </svg>
                </button>
              </div>
            </div>

            <!-- New password -->
            <div>
              <label class="block text-sm text-gray-400 mb-1.5">新密码</label>
              <div class="relative">
                <input
                  v-model="newPassword"
                  :type="showNew ? 'text' : 'password'"
                  placeholder="至少 8 位字符"
                  class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 pr-11 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 transition-colors"
                />
                <button
                  type="button"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  @click="showNew = !showNew"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path v-if="showNew" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                    <template v-else>
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                    </template>
                  </svg>
                </button>
              </div>
              <!-- Strength bar -->
              <div v-if="newPassword" class="mt-2 space-y-1">
                <div class="flex gap-1">
                  <div
                    v-for="i in 4"
                    :key="i"
                    class="flex-1 h-1 rounded-full transition-all duration-300"
                    :class="i <= passwordStrength ? strengthColor : 'bg-gray-700'"
                  />
                </div>
                <p class="text-xs text-gray-500">密码强度：<span :class="['font-medium', passwordStrength >= 3 ? 'text-green-400' : passwordStrength === 2 ? 'text-yellow-400' : 'text-red-400']">{{ strengthLabel }}</span></p>
              </div>
            </div>

            <!-- Confirm password -->
            <div>
              <label class="block text-sm text-gray-400 mb-1.5">确认新密码</label>
              <input
                v-model="confirmPassword"
                type="password"
                placeholder="再次输入新密码"
                class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 transition-colors"
                :class="confirmPassword && confirmPassword !== newPassword ? 'border-red-500' : ''"
              />
              <p v-if="confirmPassword && confirmPassword !== newPassword" class="text-xs text-red-400 mt-1">两次密码不一致</p>
            </div>

            <div class="flex justify-end pt-1">
              <button
                :disabled="savingPassword || !oldPassword || !newPassword || newPassword !== confirmPassword"
                @click="changePassword"
                class="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-medium rounded-xl transition-colors"
              >
                <svg v-if="savingPassword" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                {{ savingPassword ? '修改中...' : '修改密码' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Danger zone -->
        <div class="bg-gray-900 border border-red-900/40 rounded-2xl p-6">
          <h2 class="text-base font-semibold text-white mb-1 flex items-center gap-2">
            <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            </svg>
            账户操作
          </h2>
          <p class="text-sm text-gray-500 mb-4">退出当前会话，需要重新登录后才能访问创作台。</p>
          <button
            @click="authStore.logout()"
            class="flex items-center gap-2 px-4 py-2.5 border border-red-800 hover:border-red-600 text-red-400 hover:text-red-300 text-sm rounded-xl transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
            </svg>
            退出登录
          </button>
        </div>
      </div>
    </div>

    <!-- Reading history -->
    <div class="bg-gray-900 border border-gray-800 rounded-2xl p-6">
      <div class="flex items-center justify-between mb-5">
        <h2 class="text-base font-semibold text-white flex items-center gap-2">
          <svg class="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
          </svg>
          最近阅读
        </h2>
        <span v-if="readingHistoryTotal > 0" class="text-sm text-gray-500">共 {{ readingHistoryTotal }} 本</span>
      </div>

      <!-- Loading skeleton -->
      <div v-if="loadingHistory" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="i in 6" :key="i" class="flex gap-3 p-3 rounded-xl bg-gray-800/50 animate-pulse">
          <div class="w-12 h-16 rounded-lg bg-gray-700 shrink-0" />
          <div class="flex-1 space-y-2 pt-1">
            <div class="h-3 bg-gray-700 rounded w-3/4" />
            <div class="h-2.5 bg-gray-700 rounded w-1/2" />
            <div class="h-1.5 bg-gray-700 rounded w-full mt-3" />
          </div>
        </div>
      </div>

      <!-- Empty -->
      <div v-else-if="readingHistory.length === 0" class="py-12 text-center">
        <svg class="w-12 h-12 text-gray-700 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
        </svg>
        <p class="text-gray-600 text-sm">还没有阅读记录</p>
        <NuxtLink to="/plaza" class="mt-3 inline-block text-sm text-violet-400 hover:text-violet-300 transition-colors">
          去作品集探索 →
        </NuxtLink>
      </div>

      <!-- Cards grid -->
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <NuxtLink
          v-for="item in readingHistory"
          :key="item.novel_id"
          :to="`/plaza/novel/${item.novel_id}`"
          class="group flex gap-3 p-3 rounded-xl bg-gray-800/40 hover:bg-gray-800 border border-transparent hover:border-gray-700 transition-all"
        >
          <!-- Cover -->
          <div class="w-12 h-16 rounded-lg overflow-hidden shrink-0 shadow-md">
            <img
              v-if="item.novel?.cover_image"
              :src="item.novel.cover_image"
              class="w-full h-full object-cover"
              :alt="item.novel?.title"
            />
            <div v-else class="w-full h-full bg-gradient-to-b from-violet-700 to-indigo-800 flex items-center justify-center">
              <span class="text-white text-xs font-bold opacity-80">
                {{ (item.novel?.title || '?').charAt(0) }}
              </span>
            </div>
          </div>

          <!-- Info -->
          <div class="flex-1 min-w-0 flex flex-col justify-between py-0.5">
            <div>
              <p class="text-sm font-medium text-gray-200 group-hover:text-white truncate transition-colors leading-snug">
                {{ item.novel?.title || `小说 #${item.novel_id}` }}
              </p>
              <p class="text-xs text-gray-500 mt-1">
                第 {{ item.chapter_no }} 章
                <span v-if="item.novel?.chapter_count" class="opacity-60">/ {{ item.novel.chapter_count }}</span>
              </p>
            </div>

            <!-- Progress bar -->
            <div class="mt-2">
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs text-gray-600">进度</span>
                <span class="text-xs text-gray-500">{{ item.scroll_pct ?? 0 }}%</span>
              </div>
              <div class="h-1 bg-gray-700 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-500"
                  :class="(item.scroll_pct ?? 0) >= 100 ? 'bg-green-500' : 'bg-violet-500'"
                  :style="{ width: `${item.scroll_pct ?? 0}%` }"
                />
              </div>
            </div>
          </div>
        </NuxtLink>
      </div>

      <!-- Load more -->
      <div v-if="readingHistory.length < readingHistoryTotal" class="mt-5 text-center">
        <button
          :disabled="loadingMoreHistory"
          @click="loadMoreHistory"
          class="px-6 py-2 border border-gray-700 hover:border-gray-600 text-sm text-gray-400 hover:text-gray-200 rounded-xl transition-colors disabled:opacity-50"
        >
          {{ loadingMoreHistory ? '加载中...' : '加载更多' }}
        </button>
      </div>
    </div>

    <!-- ── Danger zone ─────────────────────────────────────────────────── -->
    <div class="mt-6 p-5 rounded-2xl bg-red-950/20 border border-red-900/40">
      <h2 class="text-base font-semibold text-red-400 mb-1">危险区域</h2>
      <p class="text-sm text-gray-500 mb-4">注销账号后，所有数据将被永久删除且无法恢复。</p>
      <button
        @click="showDeleteModal = true"
        class="px-4 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 border border-red-700/50 text-sm text-red-400 hover:text-red-300 transition-colors"
      >
        注销账号
      </button>
    </div>
  </div>

  <!-- ── Delete account modal ──────────────────────────────────────────── -->
  <Teleport to="body">
    <div
      v-if="showDeleteModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      @click.self="showDeleteModal = false"
    >
      <div class="w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl p-6 shadow-2xl">
        <h3 class="text-lg font-semibold text-red-400 mb-2">确认注销账号</h3>
        <p class="text-sm text-gray-400 mb-5">此操作不可撤销，账号及所有相关数据将被永久删除。</p>

        <!-- Password field (only if account has password) -->
        <div class="mb-4">
          <label class="block text-xs text-gray-500 mb-1.5">当前密码（如有）</label>
          <input
            v-model="deletePassword"
            type="password"
            placeholder="留空则跳过密码验证（仅限第三方登录账号）"
            class="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-red-700"
          />
        </div>

        <!-- Confirmation text -->
        <div class="mb-5">
          <label class="block text-xs text-gray-500 mb-1.5">
            请输入 <span class="text-red-400 font-medium">{{ DELETE_CONFIRM_WORD }}</span> 以确认
          </label>
          <input
            v-model="deleteConfirmText"
            type="text"
            :placeholder="DELETE_CONFIRM_WORD"
            class="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-red-700"
          />
        </div>

        <div class="flex gap-3 justify-end">
          <button
            @click="showDeleteModal = false"
            class="px-4 py-2 rounded-xl border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors"
          >
            取消
          </button>
          <button
            :disabled="deletingAccount || deleteConfirmText !== DELETE_CONFIRM_WORD"
            @click="confirmDeleteAccount"
            class="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm text-white font-medium transition-colors"
          >
            {{ deletingAccount ? '注销中...' : '确认注销' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
