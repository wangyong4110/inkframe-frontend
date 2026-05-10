<script setup lang="ts">
import { useSkillApi, SKILL_CATEGORIES, SKILL_TYPES, type Skill } from '~/composables/useSkillApi'

const props = defineProps<{ novelId: number }>()

const toast = useToast()

const skillApi = useSkillApi()

const skills = ref<Skill[]>([])
const skillsLoading = ref(false)
const showSkillModal = ref(false)
const deletingSkillId = ref<number | null>(null)
const generatingSkills = ref(false)
const savingSkill = ref(false)
const newSkillForm = ref({
  name: '',
  category: '武技',
  skill_type: 'active',
  realm: '',
  description: '',
})

async function fetchSkills() {
  skillsLoading.value = true
  try {
    const resp = await skillApi.listSkills(props.novelId)
    skills.value = resp.skills ?? []
  } catch { /* ignore */ } finally {
    skillsLoading.value = false
  }
}

onMounted(() => fetchSkills())

function getSkillCategoryColor(cat: string): string {
  const colors: Record<string, string> = {
    武技: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    法术: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    身法: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    心法: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    阵法: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    神通: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    秘法: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
    特性: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  }
  return colors[cat] || 'bg-gray-100 text-gray-600'
}

function getSkillCategoryGradient(cat: string): string {
  const g: Record<string, string> = {
    武技: 'from-red-500 to-orange-500',
    法术: 'from-blue-500 to-indigo-500',
    身法: 'from-green-500 to-teal-500',
    心法: 'from-purple-500 to-violet-500',
    阵法: 'from-yellow-500 to-amber-500',
    神通: 'from-indigo-500 to-blue-600',
    秘法: 'from-pink-500 to-rose-500',
    特性: 'from-gray-500 to-slate-600',
  }
  return g[cat] || 'from-gray-400 to-gray-500'
}

function getSkillCategoryIcon(cat: string): string {
  const icons: Record<string, string> = {
    武技: '⚔️', 法术: '✨', 身法: '💨', 心法: '🧘',
    阵法: '⬡', 神通: '🌟', 秘法: '🔮', 特性: '🔑',
  }
  return icons[cat] || '⚡'
}

function getSkillTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    active: '主动', passive: '被动', toggle: '切换', ultimate: '绝技',
  }
  return labels[type] || type
}

function getSkillStatusColor(status: string): string {
  const colors: Record<string, string> = {
    sealed: 'bg-purple-100 text-purple-700', lost: 'bg-yellow-100 text-yellow-700',
    disabled: 'bg-gray-100 text-gray-500',
  }
  return colors[status] || ''
}

function getSkillStatusLabel(status: string): string {
  const labels: Record<string, string> = { sealed: '封印', lost: '失传', disabled: '禁用' }
  return labels[status] || status
}

async function generateSkills() {
  generatingSkills.value = true
  try {
    const resp = await skillApi.generateSkills(props.novelId, { count: 5 })
    const generated = resp.skills ?? []
    skills.value.push(...generated)
    toast.success(`已生成 ${generated.length} 个技能`)
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || ''))
  } finally {
    generatingSkills.value = false
  }
}

async function createSkill() {
  if (!newSkillForm.value.name.trim()) return
  savingSkill.value = true
  try {
    const skill = await skillApi.createSkill(props.novelId, {
      name: newSkillForm.value.name.trim(),
      category: newSkillForm.value.category,
      skill_type: newSkillForm.value.skill_type,
      realm: newSkillForm.value.realm.trim(),
      description: newSkillForm.value.description.trim(),
    })
    skills.value.push(skill)
    newSkillForm.value = { name: '', category: '武技', skill_type: 'active', realm: '', description: '' }
    showSkillModal.value = false
    toast.success('技能已创建')
  } catch (e: any) {
    toast.error('创建失败：' + (e.message || ''))
  } finally {
    savingSkill.value = false
  }
}

async function deleteSkill(id: number, event: Event) {
  event.stopPropagation()
  deletingSkillId.value = id
  try {
    await skillApi.deleteSkill(id)
    skills.value = skills.value.filter(s => s.id !== id)
    toast.success('技能已删除')
  } catch (e: any) {
    toast.error('删除失败：' + (e.message || ''))
  } finally {
    deletingSkillId.value = null
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">技能管理</h2>
      <div class="flex items-center gap-2">
        <button class="btn-secondary text-sm" :disabled="generatingSkills" @click="generateSkills">
          <svg v-if="generatingSkills" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          {{ generatingSkills ? 'AI 生成中...' : (skills.length > 0 ? 'AI 更新' : 'AI 生成') }}
        </button>
        <button class="btn-primary" @click="showSkillModal = true">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          新建技能
        </button>
      </div>
    </div>

    <div v-if="skillsLoading" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div v-for="i in 4" :key="i" class="card p-4">
        <div class="skeleton h-5 w-1/2 mb-2"></div>
        <div class="skeleton h-4 w-1/4 mb-3"></div>
        <div class="skeleton h-4 w-3/4"></div>
      </div>
    </div>

    <div v-else-if="skills.length === 0" class="card p-8 text-center">
      <svg class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
      </svg>
      <p class="text-gray-500 dark:text-gray-400 mb-1">暂无技能</p>
      <p class="text-xs text-gray-400 dark:text-gray-500">可手动新建，或点击「AI 生成」自动创建技能体系</p>
    </div>

    <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="skill in skills"
        :key="skill.id"
        class="card overflow-hidden group cursor-pointer hover:shadow-medium transition-shadow"
        @click="$router.push(`/skill/${skill.id}?novelId=${novelId}`)"
      >
        <!-- Gradient header -->
        <div
          class="h-12 flex items-center justify-between px-4 bg-gradient-to-r"
          :class="getSkillCategoryGradient(skill.category)"
        >
          <div class="flex items-center gap-2">
            <span class="text-base">{{ getSkillCategoryIcon(skill.category) }}</span>
            <span class="text-xs font-bold text-white/90">{{ skill.category }}</span>
            <span class="text-xs text-white/70">·</span>
            <span class="text-xs text-white/80">{{ getSkillTypeLabel(skill.skill_type) }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-white/80 font-mono">Lv.{{ skill.level }}<span class="opacity-50">/{{ skill.max_level }}</span></span>
            <button
              class="p-1 text-white/50 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
              :disabled="deletingSkillId === skill.id"
              title="删除技能"
              @click.stop="deleteSkill(skill.id, $event)"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Level bar -->
        <div class="h-0.5 bg-gray-100 dark:bg-gray-700">
          <div
            class="h-full bg-gradient-to-r opacity-60"
            :class="getSkillCategoryGradient(skill.category)"
            :style="{ width: `${Math.min((skill.level / Math.max(skill.max_level || 1, 1)) * 100, 100)}%` }"
          />
        </div>

        <!-- Body -->
        <div class="p-3 space-y-2">
          <div class="flex items-start justify-between gap-2">
            <h3 class="font-semibold text-gray-900 dark:text-white truncate flex-1">{{ skill.name }}</h3>
            <div class="flex items-center gap-1 flex-shrink-0">
              <span v-if="skill.status !== 'active'" class="text-xs px-1.5 py-0.5 rounded" :class="getSkillStatusColor(skill.status)">
                {{ getSkillStatusLabel(skill.status) }}
              </span>
            </div>
          </div>
          <p v-if="skill.realm" class="text-xs text-gray-400">要求：{{ skill.realm }}</p>
          <p v-if="skill.description" class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">{{ skill.description }}</p>
          <div v-if="skill.cost || skill.cooldown" class="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500 pt-1 border-t border-gray-100 dark:border-gray-700">
            <span v-if="skill.cost" class="flex items-center gap-1">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              {{ skill.cost }}
            </span>
            <span v-if="skill.cooldown" class="flex items-center gap-1">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              {{ skill.cooldown }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 新建技能弹窗 -->
    <Teleport to="body">
      <div v-if="showSkillModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50" @click="showSkillModal = false" />
        <div class="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md">
          <div class="p-6">
            <div class="flex items-center justify-between mb-5">
              <h2 class="text-lg font-bold text-gray-900 dark:text-white">新建技能</h2>
              <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" @click="showSkillModal = false">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">技能名称 <span class="text-red-500">*</span></label>
                <input v-model="newSkillForm.name" type="text" class="input" placeholder="如：天罡剑法、御风术" maxlength="100" />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">类别</label>
                  <select v-model="newSkillForm.category" class="input">
                    <option v-for="cat in SKILL_CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">类型</label>
                  <select v-model="newSkillForm.skill_type" class="input">
                    <option v-for="t in SKILL_TYPES" :key="t.id" :value="t.id">{{ t.label }}</option>
                  </select>
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">境界要求</label>
                <input v-model="newSkillForm.realm" type="text" class="input" placeholder="如：筑基期、金丹期" maxlength="50" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">技能描述</label>
                <textarea v-model="newSkillForm.description" rows="3" class="input resize-none" placeholder="技能的来源、特点、使用场景..."></textarea>
              </div>
            </div>
            <div class="flex justify-end gap-3 mt-5 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button class="btn-secondary" @click="showSkillModal = false">取消</button>
              <button class="btn-primary" :disabled="savingSkill || !newSkillForm.name.trim()" @click="createSkill">
                <svg v-if="savingSkill" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                {{ savingSkill ? '创建中...' : '创建' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
