<script setup lang="ts">
definePageMeta({ layout: false })

const authStore = useAuthStore()
const router = useRouter()
const { request } = useApi()

const activeTab = ref<'email' | 'phone'>('email')

// 邮箱注册
const emailForm = reactive({
  username: '',
  email: '',
  password: '',
  nickname: '',
})
const emailLoading = ref(false)
const emailError = ref('')

async function registerWithEmail() {
  emailError.value = ''
  emailLoading.value = true
  try {
    const data = await request<any>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(emailForm),
    })
    const resp = data.data ?? data
    authStore.setFromAuthResponse(resp)
    router.push('/')
  } catch (e: any) {
    emailError.value = e.message || '注册失败'
  } finally {
    emailLoading.value = false
  }
}

// 手机号注册
const phoneForm = reactive({ phone: '', code: '', nickname: '' })
const phoneLoading = ref(false)
const phoneError = ref('')
const sendCooldown = ref(0)
let cooldownTimer: ReturnType<typeof setInterval> | null = null

async function sendPhoneCode() {
  if (sendCooldown.value > 0) return
  phoneError.value = ''
  try {
    await request('/auth/sms/send', {
      method: 'POST',
      body: JSON.stringify({ phone: phoneForm.phone }),
    })
    sendCooldown.value = 60
    cooldownTimer = setInterval(() => {
      sendCooldown.value--
      if (sendCooldown.value <= 0 && cooldownTimer) {
        clearInterval(cooldownTimer)
        cooldownTimer = null
      }
    }, 1000)
  } catch (e: any) {
    phoneError.value = e.message || '发送失败'
  }
}

async function registerWithPhone() {
  phoneError.value = ''
  phoneLoading.value = true
  try {
    const data = await request<any>('/auth/phone/register', {
      method: 'POST',
      body: JSON.stringify(phoneForm),
    })
    const resp = data.data ?? data
    authStore.setFromAuthResponse(resp)
    router.push('/')
  } catch (e: any) {
    phoneError.value = e.message || '注册失败'
  } finally {
    phoneLoading.value = false
  }
}

onUnmounted(() => { if (cooldownTimer) clearInterval(cooldownTimer) })
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center py-12 px-4">
    <div class="max-w-md w-full">
      <div class="text-center mb-8">
        <NuxtLink to="/" class="inline-flex items-center space-x-2">
          <div class="w-10 h-10 bg-gradient-to-br from-primary-600 to-primary-400 rounded-xl flex items-center justify-center">
            <span class="text-white font-bold text-xl">I</span>
          </div>
          <span class="text-2xl font-bold text-gray-900 dark:text-white">InkFrame</span>
        </NuxtLink>
        <h2 class="mt-4 text-2xl font-semibold text-gray-800 dark:text-gray-100">创建账号</h2>
      </div>

      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
        <!-- Tabs -->
        <div class="flex border-b border-gray-200 dark:border-gray-700 mb-6">
          <button
            class="flex-1 py-2 text-sm font-medium transition-colors"
            :class="activeTab === 'email'
              ? 'border-b-2 border-primary-500 text-primary-600 dark:text-primary-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
            @click="activeTab = 'email'"
          >
            邮箱注册
          </button>
          <button
            class="flex-1 py-2 text-sm font-medium transition-colors"
            :class="activeTab === 'phone'
              ? 'border-b-2 border-primary-500 text-primary-600 dark:text-primary-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
            @click="activeTab = 'phone'"
          >
            手机号注册
          </button>
        </div>

        <!-- 邮箱注册 Tab -->
        <form v-if="activeTab === 'email'" @submit.prevent="registerWithEmail" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">用户名</label>
            <input
              v-model="emailForm.username"
              type="text"
              required
              placeholder="请输入用户名"
              class="input"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">邮箱</label>
            <input
              v-model="emailForm.email"
              type="email"
              required
              placeholder="请输入邮箱"
              class="input"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">密码</label>
            <input
              v-model="emailForm.password"
              type="password"
              required
              minlength="8"
              placeholder="至少8位密码"
              class="input"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">昵称</label>
            <input
              v-model="emailForm.nickname"
              type="text"
              placeholder="请输入昵称（选填）"
              class="input"
            />
          </div>
          <p v-if="emailError" class="text-red-500 dark:text-red-400 text-xs">{{ emailError }}</p>
          <button
            type="submit"
            :disabled="emailLoading"
            class="btn-primary w-full py-2.5"
          >
            {{ emailLoading ? '注册中...' : '注 册' }}
          </button>
        </form>

        <!-- 手机号注册 Tab -->
        <form v-else @submit.prevent="registerWithPhone" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">昵称</label>
            <input
              v-model="phoneForm.nickname"
              type="text"
              placeholder="请输入昵称（选填）"
              class="input"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">手机号</label>
            <input
              v-model="phoneForm.phone"
              type="tel"
              required
              placeholder="请输入手机号"
              class="input"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">验证码</label>
            <div class="flex space-x-2">
              <input
                v-model="phoneForm.code"
                type="text"
                required
                placeholder="请输入验证码"
                class="input"
              />
              <button
                type="button"
                :disabled="sendCooldown > 0"
                @click="sendPhoneCode"
                class="btn-secondary whitespace-nowrap px-4"
              >
                {{ sendCooldown > 0 ? `${sendCooldown}s` : '发送' }}
              </button>
            </div>
          </div>
          <p v-if="phoneError" class="text-red-500 dark:text-red-400 text-xs">{{ phoneError }}</p>
          <button
            type="submit"
            :disabled="phoneLoading"
            class="btn-primary w-full py-2.5"
          >
            {{ phoneLoading ? '注册中...' : '注 册' }}
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          已有账号？
          <NuxtLink to="/auth/login" class="text-primary-600 dark:text-primary-400 hover:underline font-medium">登录</NuxtLink>
        </p>
      </div>
    </div>
  </div>
</template>
