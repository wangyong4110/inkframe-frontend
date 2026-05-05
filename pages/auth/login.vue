<script setup lang="ts">
definePageMeta({ layout: false })

const authStore = useAuthStore()
const router = useRouter()
const { request } = useApi()

const activeTab = ref<'password' | 'phone'>('password')

// 账号密码登录
const emailForm = reactive({ email: '', password: '' })
const emailLoading = ref(false)
const emailError = ref('')

async function loginWithEmail() {
  emailError.value = ''
  emailLoading.value = true
  try {
    const data = await request<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(emailForm),
    })
    const resp = data.data ?? data
    authStore.setFromAuthResponse(resp)
    router.push('/')
  } catch (e: any) {
    emailError.value = e.message || '登录失败'
  } finally {
    emailLoading.value = false
  }
}

// 手机验证码登录
const phoneForm = reactive({ phone: '', code: '' })
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

async function loginWithPhone() {
  phoneError.value = ''
  phoneLoading.value = true
  try {
    const data = await request<any>('/auth/phone/login', {
      method: 'POST',
      body: JSON.stringify(phoneForm),
    })
    const resp = data.data ?? data
    authStore.setFromAuthResponse(resp)
    router.push('/')
  } catch (e: any) {
    phoneError.value = e.message || '登录失败'
  } finally {
    phoneLoading.value = false
  }
}

// OAuth登录
async function oauthLogin(provider: string) {
  try {
    const state = Math.random().toString(36).slice(2)
    const data = await request<any>(`/auth/oauth/${provider}/url?state=${state}`)
    const url = (data.data ?? data).url
    if (url) window.location.href = url
  } catch (e: any) {
    emailError.value = e.message || 'OAuth跳转失败'
  }
}

onUnmounted(() => { if (cooldownTimer) clearInterval(cooldownTimer) })

// 开发模式快捷登录
const isDev = import.meta.dev
function devLogin() {
  authStore.mockLogin()
  router.push('/')
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center py-12 px-4">
    <div class="max-w-md w-full">
      <!-- Logo -->
      <div class="text-center mb-8">
        <NuxtLink to="/" class="inline-flex items-center space-x-2">
          <div class="w-10 h-10 bg-gradient-to-br from-primary-600 to-primary-400 rounded-xl flex items-center justify-center">
            <span class="text-white font-bold text-xl">I</span>
          </div>
          <span class="text-2xl font-bold text-gray-900 dark:text-white">InkFrame</span>
        </NuxtLink>
        <h2 class="mt-4 text-2xl font-semibold text-gray-800 dark:text-gray-100">欢迎回来</h2>
      </div>

      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
        <!-- Tabs -->
        <div class="flex border-b border-gray-200 dark:border-gray-700 mb-6">
          <button
            class="flex-1 py-2 text-sm font-medium transition-colors"
            :class="activeTab === 'password'
              ? 'border-b-2 border-primary-500 text-primary-600 dark:text-primary-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
            @click="activeTab = 'password'"
          >
            账号密码
          </button>
          <button
            class="flex-1 py-2 text-sm font-medium transition-colors"
            :class="activeTab === 'phone'
              ? 'border-b-2 border-primary-500 text-primary-600 dark:text-primary-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
            @click="activeTab = 'phone'"
          >
            手机验证码
          </button>
        </div>

        <!-- 账号密码 Tab -->
        <form v-if="activeTab === 'password'" @submit.prevent="loginWithEmail" class="space-y-4">
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
              placeholder="请输入密码"
              class="input"
            />
          </div>
          <p v-if="emailError" class="text-red-500 dark:text-red-400 text-xs">{{ emailError }}</p>
          <button
            type="submit"
            :disabled="emailLoading"
            class="btn-primary w-full py-2.5"
          >
            {{ emailLoading ? '登录中...' : '登 录' }}
          </button>
        </form>

        <!-- 手机验证码 Tab -->
        <form v-else @submit.prevent="loginWithPhone" class="space-y-4">
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
            {{ phoneLoading ? '登录中...' : '登 录' }}
          </button>
        </form>

        <!-- 第三方登录 -->
        <div class="mt-6">
          <div class="relative">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-gray-200 dark:border-gray-700" />
            </div>
            <div class="relative flex justify-center text-sm">
              <span class="px-2 bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500">第三方登录</span>
            </div>
          </div>
          <div class="mt-4 flex justify-center space-x-5">
            <!-- 微信 -->
            <button
              @click="oauthLogin('wechat')"
              title="微信登录"
              class="w-11 h-11 flex items-center justify-center rounded-full border border-gray-200 dark:border-gray-700 hover:border-[#07C160] hover:bg-[#07C160]/5 transition-colors group"
            >
              <svg viewBox="0 0 24 24" class="w-6 h-6 fill-gray-400 group-hover:fill-[#07C160] transition-colors" xmlns="http://www.w3.org/2000/svg">
                <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-3.898-6.348-7.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-7.063-6.122zm-3.494 3.033c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982zm4.856 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/>
              </svg>
            </button>
            <!-- 支付宝 -->
            <button
              @click="oauthLogin('alipay')"
              title="支付宝登录"
              class="w-11 h-11 flex items-center justify-center rounded-full border border-gray-200 dark:border-gray-700 hover:border-[#1677FF] hover:bg-[#1677FF]/5 transition-colors group"
            >
              <img :src="'/images/alipay.png'" alt="支付宝" class="w-6 h-6 object-contain opacity-30 group-hover:opacity-100 transition-opacity" />
            </button>
            <!-- 抖音 -->
            <button
              @click="oauthLogin('douyin')"
              title="抖音登录"
              class="w-11 h-11 flex items-center justify-center rounded-full border border-gray-200 dark:border-gray-700 hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors group"
            >
              <svg viewBox="0 0 24 24" class="w-6 h-6 fill-gray-400 group-hover:fill-gray-700 dark:group-hover:fill-gray-200 transition-colors" xmlns="http://www.w3.org/2000/svg">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.24 8.24 0 0 0 4.82 1.54V6.78a4.85 4.85 0 0 1-1.05-.09z"/>
              </svg>
            </button>
          </div>
        </div>

        <p class="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          没有账号？
          <NuxtLink to="/auth/register" class="text-primary-600 dark:text-primary-400 hover:underline font-medium">注册</NuxtLink>
        </p>

        <!-- 开发模式快捷登录 -->
        <div v-if="isDev" class="mt-6 pt-5 border-t border-dashed border-gray-200 dark:border-gray-700">
          <p class="text-center text-xs text-gray-400 dark:text-gray-500 mb-3">开发模式</p>
          <button
            type="button"
            class="btn-outline w-full"
            @click="devLogin"
          >
            跳过登录（测试账户）
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
