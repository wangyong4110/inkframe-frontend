<script setup lang="ts">
import type { NovelMember } from '~/types'

const props = defineProps<{ novelId: number; open: boolean }>()
const emit = defineEmits<{ 'update:open': [boolean] }>()

const collabApi = useCollabApi()
const toast = useToast()

const members = ref<NovelMember[]>([])
const loading = ref(false)
const inviteEmail = ref('')
const inviteRole = ref('editor')
const inviting = ref(false)
const inviteLink = ref('')

async function load() {
  loading.value = true
  try {
    const res = await collabApi.listMembers(props.novelId)
    members.value = (res as any)?.data?.members ?? (res as any)?.members ?? []
  } catch (e: any) {
    toast.error(e?.message || '加载成员失败')
  } finally {
    loading.value = false
  }
}

async function handleInvite() {
  if (!inviteEmail.value) return
  inviting.value = true
  try {
    const res = await collabApi.inviteMember(props.novelId, inviteEmail.value, inviteRole.value)
    const token = (res as any)?.data?.invite_token ?? (res as any)?.invite_token
    inviteLink.value = `${window.location.origin}/collab/accept?token=${token}`
    toast.success('邀请链接已生成')
    inviteEmail.value = ''
  } catch (e: any) {
    toast.error(e?.message || '邀请失败')
  } finally {
    inviting.value = false
  }
}

async function handleRemove(member: NovelMember) {
  if (!confirm(`确认移除 ${member.nickname || member.email}？`)) return
  try {
    await collabApi.removeMember(props.novelId, member.user_id)
    await load()
    toast.success('已移除')
  } catch (e: any) {
    toast.error(e?.message || '移除失败')
  }
}

async function handleRoleChange(member: NovelMember, role: string) {
  try {
    await collabApi.updateMemberRole(props.novelId, member.user_id, role)
    await load()
  } catch (e: any) {
    toast.error(e?.message || '修改失败')
  }
}

function copyLink() {
  navigator.clipboard.writeText(inviteLink.value)
  toast.success('已复制')
}

watch(() => props.open, (v) => {
  if (v) load()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click.self="emit('update:open', false)"
    >
      <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
        <div class="flex items-center justify-between mb-5">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">协作成员</h2>
          <button
            class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            @click="emit('update:open', false)"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- 邀请表单 -->
        <div class="mb-5 p-4 rounded-xl bg-gray-50 dark:bg-gray-800">
          <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">邀请成员</p>
          <div class="flex gap-2">
            <input
              v-model="inviteEmail"
              type="email"
              placeholder="输入邮箱地址"
              class="input flex-1 text-sm"
              @keydown.enter="handleInvite"
            />
            <select v-model="inviteRole" class="input w-24 text-sm">
              <option value="editor">编辑者</option>
              <option value="viewer">浏览者</option>
            </select>
            <button
              class="btn-primary text-sm px-3"
              :disabled="inviting || !inviteEmail"
              @click="handleInvite"
            >
              {{ inviting ? '...' : '邀请' }}
            </button>
          </div>
          <!-- 邀请链接 -->
          <div v-if="inviteLink" class="mt-3 flex items-center gap-2">
            <input :value="inviteLink" readonly class="input flex-1 text-xs text-gray-500" />
            <button class="btn-secondary text-xs px-2 py-1" @click="copyLink">复制</button>
          </div>
        </div>

        <!-- 成员列表 -->
        <div v-if="loading" class="flex justify-center py-6">
          <div class="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
        <ul v-else class="space-y-2 max-h-64 overflow-y-auto">
          <li
            v-for="m in members"
            :key="m.id"
            class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <div class="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0 overflow-hidden">
              <img v-if="m.avatar" :src="m.avatar" class="w-full h-full object-cover" />
              <span v-else class="text-sm font-bold text-primary-600 dark:text-primary-400">
                {{ (m.nickname || m.email).charAt(0).toUpperCase() }}
              </span>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ m.nickname || m.email }}</p>
              <p class="text-xs text-gray-400 truncate">{{ m.email }}</p>
            </div>
            <div class="flex items-center gap-2">
              <template v-if="m.role === 'owner'">
                <span class="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">所有者</span>
              </template>
              <template v-else>
                <select
                  :value="m.role"
                  class="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 bg-transparent text-gray-600 dark:text-gray-300"
                  @change="handleRoleChange(m, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="editor">编辑者</option>
                  <option value="viewer">浏览者</option>
                </select>
                <button
                  class="text-gray-300 hover:text-red-500 transition-colors"
                  @click="handleRemove(m)"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </template>
            </div>
          </li>
          <li v-if="members.length === 0" class="text-center py-4 text-sm text-gray-400">
            暂无协作成员
          </li>
        </ul>
      </div>
    </div>
  </Teleport>
</template>
