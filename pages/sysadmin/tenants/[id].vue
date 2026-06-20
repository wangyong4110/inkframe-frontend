<script setup lang="ts">
import type { SysTenant } from '~/types/sysadmin'

definePageMeta({ layout: 'sysadmin' })

const route = useRoute()
const api = useSysAdminApi()
const id = Number(route.params.id)

const tenant = ref<SysTenant | null>(null)
const loading = ref(true)
const error = ref('')
const saving = ref(false)
const saveMsg = ref('')

const form = reactive({
  status: '',
  plan: '',
  expires_at: '',
})

onMounted(async () => {
  try {
    const res = await api.getTenant(id)
    const d = (res as any)?.data ?? res
    tenant.value = d
    form.status = d.status
    form.plan = d.plan
    form.expires_at = d.expires_at ? d.expires_at.slice(0, 10) : ''
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})

async function save() {
  saving.value = true
  saveMsg.value = ''
  try {
    await api.updateTenant(id, {
      status: form.status,
      plan: form.plan,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
    })
    saveMsg.value = '保存成功'
  } catch (e: any) {
    saveMsg.value = '保存失败: ' + e.message
  } finally {
    saving.value = false
  }
}

// Send notification to this tenant
const notifForm = reactive({ title: '', content: '' })
const notifLoading = ref(false)
const notifMsg = ref('')

async function sendNotif() {
  notifLoading.value = true
  notifMsg.value = ''
  try {
    await api.notifyTenant(id, notifForm.title, notifForm.content)
    notifMsg.value = '发送成功'
    notifForm.title = ''
    notifForm.content = ''
  } catch (e: any) {
    notifMsg.value = '发送失败: ' + e.message
  } finally {
    notifLoading.value = false
  }
}
</script>

<template>
  <div class="p-6 max-w-2xl">
    <div class="flex items-center gap-3 mb-6">
      <NuxtLink to="/sysadmin/tenants" class="text-gray-400 hover:text-white text-sm">← 返回</NuxtLink>
      <h1 class="text-xl font-bold text-white">租户详情</h1>
    </div>

    <div v-if="loading" class="text-gray-400 text-sm">加载中...</div>
    <div v-else-if="error" class="text-red-400 text-sm">{{ error }}</div>
    <template v-else-if="tenant">
      <div class="bg-gray-800 rounded-lg p-5 border border-gray-700 mb-5">
        <div class="grid grid-cols-2 gap-3 text-sm mb-4">
          <div><span class="text-gray-400">ID：</span><span class="text-white">{{ tenant.id }}</span></div>
          <div><span class="text-gray-400">代码：</span><span class="text-white font-mono">{{ tenant.code }}</span></div>
          <div><span class="text-gray-400">名称：</span><span class="text-white">{{ tenant.name }}</span></div>
          <div><span class="text-gray-400">用户数：</span><span class="text-white">{{ tenant.used_users }}</span></div>
          <div><span class="text-gray-400">创建时间：</span><span class="text-white text-xs">{{ new Date(tenant.created_at).toLocaleString() }}</span></div>
        </div>

        <div class="space-y-3">
          <div class="flex items-center gap-3">
            <label class="text-sm text-gray-400 w-20">状态</label>
            <select v-model="form.status" class="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white">
              <option value="active">正常</option>
              <option value="suspended">暂停</option>
              <option value="banned">封禁</option>
            </select>
          </div>
          <div class="flex items-center gap-3">
            <label class="text-sm text-gray-400 w-20">套餐</label>
            <select v-model="form.plan" class="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white">
              <option value="free">免费版</option>
              <option value="pro">专业版</option>
              <option value="enterprise">企业版</option>
            </select>
          </div>
          <div class="flex items-center gap-3">
            <label class="text-sm text-gray-400 w-20">到期日期</label>
            <input
              v-model="form.expires_at"
              type="date"
              class="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white"
            />
            <span class="text-xs text-gray-500">留空为永久</span>
          </div>
        </div>

        <div class="flex items-center gap-3 mt-4">
          <button
            :disabled="saving"
            class="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded"
            @click="save"
          >保存更改</button>
          <span v-if="saveMsg" class="text-sm" :class="saveMsg.includes('失败') ? 'text-red-400' : 'text-green-400'">
            {{ saveMsg }}
          </span>
        </div>
      </div>

      <!-- Send notification to tenant -->
      <div class="bg-gray-800 rounded-lg p-5 border border-gray-700">
        <h2 class="text-sm font-semibold text-gray-300 mb-3">发送通知给此租户用户</h2>
        <input
          v-model="notifForm.title"
          type="text"
          placeholder="通知标题"
          class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white mb-2"
        />
        <textarea
          v-model="notifForm.content"
          placeholder="通知内容..."
          rows="3"
          class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white mb-2 resize-none"
        />
        <div class="flex items-center gap-3">
          <button
            :disabled="notifLoading || !notifForm.title"
            class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded"
            @click="sendNotif"
          >发送通知</button>
          <span v-if="notifMsg" class="text-sm" :class="notifMsg.includes('失败') ? 'text-red-400' : 'text-green-400'">
            {{ notifMsg }}
          </span>
        </div>
      </div>
    </template>
  </div>
</template>
