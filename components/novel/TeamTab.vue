<script setup lang="ts">
import type { NovelMember } from '~/types'

const props = defineProps<{ novelId: number }>()

const collabApi = useCollabApi()
const toast = useToast()
const authStore = useAuthStore()

const members = ref<NovelMember[]>([])
const loading = ref(false)

// invite form
const showInviteForm = ref(false)
const inviteEmail = ref('')
const inviteRole = ref<'editor' | 'viewer'>('editor')
const inviteTTL = ref(60)
const inviting = ref(false)
const inviteResult = ref<{ link: string; ttlLabel: string } | null>(null)

const ttlOptions = [
  { label: '10 分钟', value: 10 },
  { label: '30 分钟', value: 30 },
  { label: '1 小时', value: 60 },
  { label: '24 小时', value: 1440 },
]

const currentUserId = computed(() => authStore.user?.id ?? 0)

const owner = computed(() => members.value.find(m => m.role === 'owner' && m.status === 'active'))
const activeMembers = computed(() => members.value.filter(m => m.status === 'active'))
const pendingMembers = computed(() => members.value.filter(m => m.status === 'pending'))
const editorCount = computed(() => activeMembers.value.filter(m => m.role === 'editor').length)
const viewerCount = computed(() => activeMembers.value.filter(m => m.role === 'viewer').length)

const isOwner = computed(() =>
  members.value.some(m => m.user_id === currentUserId.value && m.role === 'owner' && m.status === 'active'),
)
const isMember = computed(() =>
  members.value.some(m => m.user_id === currentUserId.value && m.status === 'active'),
)

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
  inviteResult.value = null
  try {
    const res = await collabApi.inviteMember(props.novelId, inviteEmail.value, inviteRole.value, inviteTTL.value)
    const token = (res as any)?.data?.invite_token ?? (res as any)?.invite_token
    const ttlLabel = ttlOptions.find(o => o.value === inviteTTL.value)?.label ?? ''
    inviteResult.value = {
      link: `${window.location.origin}/collab/accept?token=${token}`,
      ttlLabel,
    }
    toast.success('邀请已通过站内信发送')
    inviteEmail.value = ''
    await load()
  } catch (e: any) {
    toast.error(e?.message || '邀请失败')
  } finally {
    inviting.value = false
  }
}

async function handleRoleChange(member: NovelMember, role: string) {
  try {
    await collabApi.updateMemberRole(props.novelId, member.user_id, role)
    await load()
    toast.success('角色已更新')
  } catch (e: any) {
    toast.error(e?.message || '修改失败')
  }
}

async function handleRemove(member: NovelMember) {
  const label = member.nickname || member.email
  const action = member.status === 'pending' ? '撤销邀请' : '移除成员'
  if (!confirm(`确认${action}「${label}」？`)) return
  try {
    await collabApi.removeMember(props.novelId, member.user_id)
    await load()
    toast.success(member.status === 'pending' ? '邀请已撤销' : '已移除')
  } catch (e: any) {
    toast.error(e?.message || '操作失败')
  }
}

async function handleLeave() {
  if (!confirm('确认退出该项目的协作？退出后将无法访问此项目。')) return
  try {
    await collabApi.leaveNovel(props.novelId)
    toast.success('已退出协作')
    await load()
  } catch (e: any) {
    toast.error(e?.message || '退出失败')
  }
}

function copyLink(link: string) {
  navigator.clipboard.writeText(link)
  toast.success('邀请链接已复制')
}

function roleLabel(role: string) {
  if (role === 'owner') return '管理员'
  if (role === 'editor') return '编辑者'
  return '浏览者'
}

function roleColor(role: string) {
  if (role === 'owner') return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
  if (role === 'editor') return 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400'
  return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
}

function avatarInitial(m: NovelMember) {
  return (m.nickname || m.email || '?').charAt(0).toUpperCase()
}

onMounted(load)
</script>

<template>
  <div class="p-6 space-y-6">
    <!-- 统计卡片 -->
    <div class="grid grid-cols-3 gap-4">
      <div class="card p-4 text-center">
        <div class="text-2xl font-bold text-gray-900 dark:text-white">{{ activeMembers.length }}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">活跃成员</div>
      </div>
      <div class="card p-4 text-center">
        <div class="text-2xl font-bold text-violet-600 dark:text-violet-400">{{ editorCount }}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">编辑者</div>
      </div>
      <div class="card p-4 text-center">
        <div class="text-2xl font-bold text-gray-600 dark:text-gray-300">{{ viewerCount }}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">浏览者</div>
      </div>
    </div>

    <!-- 邀请区域 -->
    <div class="card p-5">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-semibold text-gray-900 dark:text-white">邀请成员</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">通过邮箱邀请协作者加入项目</p>
        </div>
        <button
          v-if="isOwner"
          class="btn-primary text-sm px-4 py-1.5"
          @click="showInviteForm = !showInviteForm"
        >
          {{ showInviteForm ? '收起' : '+ 邀请成员' }}
        </button>
        <span v-else class="text-xs text-gray-400">仅管理员可邀请成员</span>
      </div>

      <div v-if="showInviteForm && isOwner" class="mt-4 space-y-3">
        <!-- 邮箱 + 角色 -->
        <div class="flex gap-2">
          <input
            v-model="inviteEmail"
            type="email"
            placeholder="输入对方账号邮箱"
            class="input flex-1 text-sm"
            @keydown.enter="handleInvite"
          />
          <select v-model="inviteRole" class="input w-28 text-sm">
            <option value="editor">编辑者</option>
            <option value="viewer">浏览者</option>
          </select>
        </div>
        <!-- 有效期 + 发送 -->
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-500 dark:text-gray-400 shrink-0">有效期</span>
          <div class="flex gap-1 flex-1 flex-wrap">
            <button
              v-for="opt in ttlOptions"
              :key="opt.value"
              class="text-xs px-2 py-1 rounded-lg border transition-colors"
              :class="inviteTTL === opt.value
                ? 'bg-violet-600 border-violet-600 text-white'
                : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-violet-400'"
              @click="inviteTTL = opt.value"
            >{{ opt.label }}</button>
          </div>
          <button
            class="btn-primary text-sm px-4 shrink-0"
            :disabled="inviting || !inviteEmail"
            @click="handleInvite"
          >
            {{ inviting ? '发送中...' : '发送邀请' }}
          </button>
        </div>
        <!-- 发送结果 -->
        <div
          v-if="inviteResult"
          class="p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700"
        >
          <p class="text-xs text-green-700 dark:text-green-400 font-medium">
            邀请已发送！链接 {{ inviteResult.ttlLabel }} 内有效
          </p>
          <div class="flex items-center gap-2 mt-2">
            <input
              :value="inviteResult.link"
              readonly
              class="flex-1 text-xs text-gray-400 bg-transparent outline-none truncate"
            />
            <button
              class="text-xs text-violet-500 hover:text-violet-400 shrink-0"
              @click="copyLink(inviteResult!.link)"
            >
              复制链接
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 权限说明 -->
    <div class="card p-4">
      <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">角色权限说明</h3>
      <div class="space-y-2 text-xs text-gray-600 dark:text-gray-300">
        <div class="flex gap-3">
          <span class="w-16 font-medium text-amber-600 dark:text-amber-400 shrink-0">管理员</span>
          <span>管理团队成员、邀请/移除成员、修改角色，完整读写权限</span>
        </div>
        <div class="flex gap-3">
          <span class="w-16 font-medium text-violet-600 dark:text-violet-400 shrink-0">编辑者</span>
          <span>可编辑章节、角色、道具、世界观等全部内容</span>
        </div>
        <div class="flex gap-3">
          <span class="w-16 font-medium text-gray-500 dark:text-gray-400 shrink-0">浏览者</span>
          <span>只读访问，无法修改任何内容</span>
        </div>
      </div>
    </div>

    <!-- 成员列表 -->
    <div class="card overflow-hidden">
      <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-gray-900 dark:text-white">
          团队成员
          <span class="ml-2 text-xs text-gray-400 font-normal">{{ activeMembers.length }} 人</span>
        </h3>
        <button
          v-if="loading"
          class="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"
        />
      </div>

      <ul class="divide-y divide-gray-50 dark:divide-gray-800">
        <li
          v-for="m in activeMembers"
          :key="m.id"
          class="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        >
          <!-- 头像 -->
          <div class="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0 overflow-hidden">
            <img v-if="m.avatar" :src="m.avatar" class="w-full h-full object-cover" />
            <span v-else class="text-sm font-bold text-primary-600 dark:text-primary-400">
              {{ avatarInitial(m) }}
            </span>
          </div>
          <!-- 信息 -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                {{ m.nickname || m.email }}
              </p>
              <span v-if="m.user_id === currentUserId" class="text-xs text-gray-400">(我)</span>
            </div>
            <p class="text-xs text-gray-400 truncate">{{ m.email }}</p>
          </div>
          <!-- 角色 / 操作 -->
          <div class="flex items-center gap-2 flex-shrink-0">
            <!-- owner 显示固定徽章 -->
            <template v-if="m.role === 'owner'">
              <span :class="['text-xs px-2.5 py-0.5 rounded-full font-medium', roleColor('owner')]">
                管理员
              </span>
            </template>
            <!-- 非 owner：owner 可修改角色 -->
            <template v-else>
              <select
                v-if="isOwner && m.user_id !== currentUserId"
                :value="m.role"
                class="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300"
                @change="handleRoleChange(m, ($event.target as HTMLSelectElement).value)"
              >
                <option value="editor">编辑者</option>
                <option value="viewer">浏览者</option>
              </select>
              <span v-else :class="['text-xs px-2.5 py-0.5 rounded-full font-medium', roleColor(m.role)]">
                {{ roleLabel(m.role) }}
              </span>
            </template>
            <!-- owner 移除其他成员 / 自己不能移除自己 -->
            <button
              v-if="isOwner && m.role !== 'owner'"
              class="p-1 text-gray-300 hover:text-red-500 transition-colors"
              title="移除成员"
              @click="handleRemove(m)"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6"/>
              </svg>
            </button>
          </div>
        </li>
        <li v-if="!loading && activeMembers.length === 0" class="py-8 text-center text-sm text-gray-400">
          暂无成员
        </li>
      </ul>
    </div>

    <!-- 待接受邀请 -->
    <div v-if="pendingMembers.length > 0" class="card overflow-hidden">
      <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <h3 class="text-sm font-semibold text-gray-900 dark:text-white">
          待接受邀请
          <span class="ml-2 text-xs text-amber-500 font-normal">{{ pendingMembers.length }} 份</span>
        </h3>
      </div>
      <ul class="divide-y divide-gray-50 dark:divide-gray-800">
        <li
          v-for="m in pendingMembers"
          :key="m.id"
          class="flex items-center gap-3 px-5 py-3 opacity-70"
        >
          <div class="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center flex-shrink-0">
            <span class="text-sm font-bold text-amber-600 dark:text-amber-400">{{ avatarInitial(m) }}</span>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ m.nickname || m.email }}</p>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="text-xs text-amber-500">待接受</span>
              <span v-if="m.invite_expires_at" class="text-xs text-gray-400">
                · 过期时间 {{ new Date(m.invite_expires_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
              </span>
            </div>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <span :class="['text-xs px-2.5 py-0.5 rounded-full font-medium', roleColor(m.role)]">
              {{ roleLabel(m.role) }}
            </span>
            <button
              v-if="isOwner"
              class="p-1 text-gray-300 hover:text-red-500 transition-colors"
              title="撤销邀请"
              @click="handleRemove(m)"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </li>
      </ul>
    </div>

    <!-- 退出协作（非管理员） -->
    <div v-if="isMember && !isOwner" class="card p-5 border border-red-200 dark:border-red-800/40">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-semibold text-red-600 dark:text-red-400">退出协作</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">退出后将无法再访问本项目，需重新接受邀请</p>
        </div>
        <button
          class="text-sm px-4 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          @click="handleLeave"
        >
          退出协作
        </button>
      </div>
    </div>
  </div>
</template>
