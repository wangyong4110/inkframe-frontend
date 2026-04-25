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
  <div class="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
    <div class="max-w-md w-full">
      <div class="text-center mb-8">
        <NuxtLink to="/" class="inline-flex items-center space-x-2">
          <div class="w-10 h-10 bg-gradient-to-br from-purple-600 to-blue-500 rounded-xl flex items-center justify-center">
            <span class="text-white font-bold text-xl">I</span>
          </div>
          <span class="text-2xl font-bold text-gray-900">InkFrame</span>
        </NuxtLink>
        <h2 class="mt-4 text-2xl font-semibold text-gray-800">创建账号</h2>
      </div>

      <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <!-- Tabs -->
        <div class="flex border-b border-gray-200 mb-6">
          <button
            class="flex-1 py-2 text-sm font-medium transition-colors"
            :class="activeTab === 'email' ? 'border-b-2 border-purple-600 text-purple-600' : 'text-gray-500 hover:text-gray-700'"
            @click="activeTab = 'email'"
          >
            邮箱注册
          </button>
          <button
            class="flex-1 py-2 text-sm font-medium transition-colors"
            :class="activeTab === 'phone' ? 'border-b-2 border-purple-600 text-purple-600' : 'text-gray-500 hover:text-gray-700'"
            @click="activeTab = 'phone'"
          >
            手机号注册
          </button>
        </div>

        <!-- 邮箱注册 Tab -->
        <form v-if="activeTab === 'email'" @submit.prevent="registerWithEmail" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">用户名</label>
            <input
              v-model="emailForm.username"
              type="text"
              required
              placeholder="请输入用户名"
              class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
            <input
              v-model="emailForm.email"
              type="email"
              required
              placeholder="请输入邮箱"
              class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">密码</label>
            <input
              v-model="emailForm.password"
              type="password"
              required
              minlength="8"
              placeholder="至少8位密码"
              class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">昵称</label>
            <input
              v-model="emailForm.nickname"
              type="text"
              placeholder="请输入昵称（选填）"
              class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm"
            />
          </div>
          <p v-if="emailError" class="text-red-500 text-xs">{{ emailError }}</p>
          <button
            type="submit"
            :disabled="emailLoading"
            class="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-medium rounded-lg transition-colors text-sm"
          >
            {{ emailLoading ? '注册中...' : '注 册' }}
          </button>
        </form>

        <!-- 手机号注册 Tab -->
        <form v-else @submit.prevent="registerWithPhone" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">昵称</label>
            <input
              v-model="phoneForm.nickname"
              type="text"
              placeholder="请输入昵称（选填）"
              class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">手机号</label>
            <input
              v-model="phoneForm.phone"
              type="tel"
              required
              placeholder="请输入手机号"
              class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">验证码</label>
            <div class="flex space-x-2">
              <input
                v-model="phoneForm.code"
                type="text"
                required
                placeholder="请输入验证码"
                class="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm"
              />
              <button
                type="button"
                :disabled="sendCooldown > 0"
                @click="sendPhoneCode"
                class="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400 text-gray-700 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
              >
                {{ sendCooldown > 0 ? `${sendCooldown}s` : '发送' }}
              </button>
            </div>
          </div>
          <p v-if="phoneError" class="text-red-500 text-xs">{{ phoneError }}</p>
          <button
            type="submit"
            :disabled="phoneLoading"
            class="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-medium rounded-lg transition-colors text-sm"
          >
            {{ phoneLoading ? '注册中...' : '注 册' }}
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-gray-500">
          已有账号？
          <NuxtLink to="/auth/login" class="text-purple-600 hover:underline font-medium">登录</NuxtLink>
        </p>
      </div>
    </div>
  </div>
</template>
