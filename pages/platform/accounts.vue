<script setup lang="ts">
import type { PlatformAccount } from '~/types'

definePageMeta({ auth: true })

const platformApi = usePlatformApi()
const toast = useToast()
const accounts = ref<PlatformAccount[]>([])
const loading = ref(false)
const disconnecting = ref<Record<number, boolean>>({})

const platforms = [
  { key: 'bilibili', label: 'Bilibili', icon: '📺', desc: '哔哩哔哩' },
  { key: 'douyin', label: '抖音', icon: '🎵', desc: 'Douyin / TikTok' },
  { key: 'youtube', label: 'YouTube', icon: '▶️', desc: 'YouTube' },
  { key: 'wechat_video', label: '微信视频号', icon: '🟢', desc: 'WeChat Channel' },
]

async function loadAccounts() {
  loading.value = true
  try {
    const res = await platformApi.listAccounts()
    accounts.value = res?.data ?? []
  } catch (e: any) {
    toast.error('加载失败：' + (e.message || ''))
  } finally {
    loading.value = false
  }
}

function getConnectedAccount(platform: string) {
  return accounts.value.find(a => a.platform === platform)
}

async function connect(platform: string) {
  try {
    const redirectURI = `${window.location.origin}/platform/accounts/callback`
    const res = await platformApi.getOAuthURL(platform, redirectURI, platform)
    const url = res?.data
    if (url) {
      window.location.href = url
    } else {
      toast.error('获取授权链接失败')
    }
  } catch (e: any) {
    toast.error('连接失败：' + (e.message || ''))
  }
}

async function disconnect(id: number) {
  if (!confirm('确认解除绑定？')) return
  disconnecting.value = { ...disconnecting.value, [id]: true }
  try {
    await platformApi.disconnectAccount(id)
    toast.success('已解除绑定')
    await loadAccounts()
  } catch (e: any) {
    toast.error('操作失败：' + (e.message || ''))
  } finally {
    disconnecting.value = { ...disconnecting.value, [id]: false }
  }
}

onMounted(loadAccounts)
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 py-6 space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">平台账号管理</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">绑定外部平台账号后可一键发布视频</p>
      </div>
      <NuxtLink
        to="/platform"
        class="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
      >视频广场</NuxtLink>
    </div>

    <div v-if="loading" class="space-y-3">
      <div v-for="i in 4" :key="i" class="h-20 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="p in platforms"
        :key="p.key"
        class="flex items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700"
      >
        <div class="text-3xl flex-shrink-0">{{ p.icon }}</div>
        <div class="flex-1 min-w-0">
          <p class="font-medium text-gray-900 dark:text-white">{{ p.label }}</p>
          <p class="text-xs text-gray-500 dark:text-gray-400">{{ p.desc }}</p>
          <template v-if="getConnectedAccount(p.key) as PlatformAccount | undefined">
            <p class="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
              {{ (getConnectedAccount(p.key) as PlatformAccount).account_name }}
              <span
                class="ml-1.5 px-1.5 py-0.5 rounded text-xs"
                :class="(getConnectedAccount(p.key) as PlatformAccount).status === 'active'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'"
              >
                {{ (getConnectedAccount(p.key) as PlatformAccount).status === 'active' ? '已连接' : (getConnectedAccount(p.key) as PlatformAccount).status }}
              </span>
            </p>
          </template>
        </div>
        <div>
          <button
            v-if="!getConnectedAccount(p.key)"
            class="px-4 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            @click="connect(p.key)"
          >绑定</button>
          <button
            v-else
            :disabled="disconnecting[(getConnectedAccount(p.key) as PlatformAccount).id]"
            class="px-4 py-1.5 rounded-lg text-sm font-medium border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
            @click="disconnect((getConnectedAccount(p.key) as PlatformAccount).id)"
          >
            {{ disconnecting[(getConnectedAccount(p.key) as PlatformAccount).id] ? '解绑中...' : '解绑' }}
          </button>
        </div>
      </div>
    </div>

    <p class="text-xs text-gray-400 dark:text-gray-600 text-center">
      绑定账号后，即可在视频编辑页一键发布到对应平台
    </p>
  </div>
</template>
