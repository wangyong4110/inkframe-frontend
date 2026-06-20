<script setup lang="ts">
definePageMeta({ layout: 'sysadmin' })

const api = useSysAdminApi()
const settings = ref<Record<string, string>>({})
const edits = ref<Record<string, string>>({})
const loading = ref(true)
const saving = ref(false)
const msg = ref('')
const error = ref('')

// Change admin password
const newAdminPwd = ref('')
const changePwdMsg = ref('')
const changePwdLoading = ref(false)

onMounted(async () => {
  try {
    const res = await api.listSettings()
    const d = (res as any)?.data ?? res
    settings.value = d
    edits.value = { ...d }
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})

function addSetting() {
  const key = prompt('输入设置键名：')
  if (key) {
    edits.value[key] = ''
  }
}

async function save() {
  saving.value = true
  msg.value = ''
  try {
    await api.updateSettings(edits.value)
    settings.value = { ...edits.value }
    msg.value = '保存成功'
  } catch (e: any) {
    msg.value = '保存失败: ' + e.message
  } finally {
    saving.value = false
  }
}

async function changePassword() {
  if (newAdminPwd.value.length < 8) return
  changePwdLoading.value = true
  changePwdMsg.value = ''
  try {
    await api.changePassword(newAdminPwd.value)
    changePwdMsg.value = '密码已更新'
    newAdminPwd.value = ''
  } catch (e: any) {
    changePwdMsg.value = '更新失败: ' + e.message
  } finally {
    changePwdLoading.value = false
  }
}
</script>

<template>
  <div class="p-6 max-w-2xl">
    <h1 class="text-xl font-bold text-white mb-6">系统设置</h1>

    <div v-if="loading" class="text-gray-400 text-sm">加载中...</div>
    <div v-else-if="error" class="text-red-400 text-sm">{{ error }}</div>
    <template v-else>
      <div class="bg-gray-800 rounded-lg p-5 border border-gray-700 mb-5">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-semibold text-gray-300">键值配置</h2>
          <button class="text-xs text-indigo-400 hover:text-indigo-300" @click="addSetting">+ 添加</button>
        </div>
        <div v-if="Object.keys(edits).length === 0" class="text-gray-500 text-sm">暂无设置项</div>
        <div v-for="(val, key) in edits" :key="key" class="flex items-center gap-3 mb-2">
          <span class="text-sm text-gray-400 w-40 truncate font-mono">{{ key }}</span>
          <input
            v-model="edits[key as string]"
            type="text"
            class="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-1 text-sm text-white"
          />
          <button class="text-xs text-red-400 hover:text-red-300" @click="delete edits[key as string]">删除</button>
        </div>
        <div class="flex items-center gap-3 mt-4">
          <button
            :disabled="saving"
            class="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded"
            @click="save"
          >保存</button>
          <span v-if="msg" class="text-sm" :class="msg.includes('失败') ? 'text-red-400' : 'text-green-400'">{{ msg }}</span>
        </div>
      </div>

      <!-- Change admin password -->
      <div class="bg-gray-800 rounded-lg p-5 border border-gray-700">
        <h2 class="text-sm font-semibold text-gray-300 mb-3">修改管理员密码</h2>
        <div class="flex gap-3">
          <input
            v-model="newAdminPwd"
            type="password"
            placeholder="新密码（最少8位）"
            class="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white"
          />
          <button
            :disabled="changePwdLoading || newAdminPwd.length < 8"
            class="bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded"
            @click="changePassword"
          >修改</button>
        </div>
        <p v-if="changePwdMsg" class="mt-2 text-xs" :class="changePwdMsg.includes('失败') ? 'text-red-400' : 'text-green-400'">{{ changePwdMsg }}</p>
      </div>
    </template>
  </div>
</template>
