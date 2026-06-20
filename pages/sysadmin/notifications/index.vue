<script setup lang="ts">
definePageMeta({ layout: 'sysadmin' })

const api = useSysAdminApi()

const broadcastForm = reactive({ title: '', content: '' })
const broadcastLoading = ref(false)
const broadcastMsg = ref('')

const tenantForm = reactive({ tenantId: '', title: '', content: '' })
const tenantLoading = ref(false)
const tenantMsg = ref('')

async function sendBroadcast() {
  if (!broadcastForm.title || !broadcastForm.content) return
  broadcastLoading.value = true
  broadcastMsg.value = ''
  try {
    await api.broadcastNotification(broadcastForm.title, broadcastForm.content)
    broadcastMsg.value = '已向所有活跃用户发送通知'
    broadcastForm.title = ''
    broadcastForm.content = ''
  } catch (e: any) {
    broadcastMsg.value = '发送失败: ' + e.message
  } finally {
    broadcastLoading.value = false
  }
}

async function sendTenantNotif() {
  if (!tenantForm.tenantId || !tenantForm.title) return
  tenantLoading.value = true
  tenantMsg.value = ''
  try {
    await api.notifyTenant(Number(tenantForm.tenantId), tenantForm.title, tenantForm.content)
    tenantMsg.value = '发送成功'
    tenantForm.title = ''
    tenantForm.content = ''
  } catch (e: any) {
    tenantMsg.value = '发送失败: ' + e.message
  } finally {
    tenantLoading.value = false
  }
}
</script>

<template>
  <div class="p-6 max-w-2xl">
    <h1 class="text-xl font-bold text-white mb-6">系统通知</h1>

    <!-- Broadcast -->
    <div class="bg-gray-800 rounded-lg p-5 border border-gray-700 mb-5">
      <h2 class="text-sm font-semibold text-gray-300 mb-4">全站广播通知</h2>
      <p class="text-xs text-gray-500 mb-3">向所有活跃用户发送系统通知</p>
      <input
        v-model="broadcastForm.title"
        type="text"
        placeholder="通知标题"
        class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white mb-2"
      />
      <textarea
        v-model="broadcastForm.content"
        placeholder="通知内容..."
        rows="3"
        class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white mb-3 resize-none"
      />
      <div class="flex items-center gap-3">
        <button
          :disabled="broadcastLoading || !broadcastForm.title"
          class="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded"
          @click="sendBroadcast"
        >发送广播</button>
        <span v-if="broadcastMsg" class="text-sm" :class="broadcastMsg.includes('失败') ? 'text-red-400' : 'text-green-400'">{{ broadcastMsg }}</span>
      </div>
    </div>

    <!-- Per tenant -->
    <div class="bg-gray-800 rounded-lg p-5 border border-gray-700">
      <h2 class="text-sm font-semibold text-gray-300 mb-4">向指定租户发送通知</h2>
      <input
        v-model="tenantForm.tenantId"
        type="number"
        placeholder="租户ID"
        class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white mb-2"
      />
      <input
        v-model="tenantForm.title"
        type="text"
        placeholder="通知标题"
        class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white mb-2"
      />
      <textarea
        v-model="tenantForm.content"
        placeholder="通知内容..."
        rows="3"
        class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white mb-3 resize-none"
      />
      <div class="flex items-center gap-3">
        <button
          :disabled="tenantLoading || !tenantForm.tenantId || !tenantForm.title"
          class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded"
          @click="sendTenantNotif"
        >发送</button>
        <span v-if="tenantMsg" class="text-sm" :class="tenantMsg.includes('失败') ? 'text-red-400' : 'text-green-400'">{{ tenantMsg }}</span>
      </div>
    </div>
  </div>
</template>
