<script setup lang="ts">
import { useSkillApi, SKILL_CATEGORIES, SKILL_TYPES, SKILL_STATUSES } from '~/composables/useSkillApi'
import type { Skill } from '~/composables/useSkillApi'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const skillApi = useSkillApi()

const skillId = parseInt(route.params.id as string)
const novelId = parseInt(route.query.novelId as string)

const activeTab = ref('profile')
const saving = ref(false)
const isDirty = ref(false)

const form = ref({
  name: '',
  category: '武技',
  skill_type: 'active',
  status: 'active',
  level: 1,
  max_level: 10,
  realm: '',
  description: '',
  effect: '',
  flavor_text: '',
  cost: '',
  cooldown: '',
  tags: '',
  acquired_chapter_no: null as number | null,
  acquired_desc: '',
  character_id: null as number | null,
  parent_id: null as number | null,
  notes: '',
})

// ── Effect image generation ───────────────────────────────────────────────────
const effectImageUrl = ref('')
const effectVisualPrompt = ref('')
const generatingEffect = ref(false)

async function generateEffect() {
  if (generatingEffect.value) return
  // Save visual prompt first if changed
  generatingEffect.value = true
  try {
    if (effectVisualPrompt.value !== '') {
      await skillApi.updateSkill(skillId, { effect_visual_prompt: effectVisualPrompt.value })
    }
    const skill = await skillApi.generateSkillEffect(skillId)
    effectImageUrl.value = skill.effect_image_url ?? ''
    toast.success('特效图片生成成功')
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || '未知错误'))
  } finally {
    generatingEffect.value = false
  }
}

// Tag pill editor
const tagList = computed({
  get: () => form.value.tags ? form.value.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
  set: (arr: string[]) => { form.value.tags = arr.join(',') },
})
const newTag = ref('')
function addTag() {
  const t = newTag.value.trim()
  if (t && !tagList.value.includes(t)) {
    tagList.value = [...tagList.value, t]
  }
  newTag.value = ''
}
function removeTag(idx: number) {
  const arr = [...tagList.value]
  arr.splice(idx, 1)
  tagList.value = arr
}

// ── Styling helpers ───────────────────────────────────────────────────────────
const categoryConfig: Record<string, { gradient: string; icon: string; color: string }> = {
  武技: { gradient: 'from-red-500 to-orange-500',    icon: '⚔️', color: 'bg-red-100 text-red-700' },
  法术: { gradient: 'from-blue-500 to-indigo-500',   icon: '✨', color: 'bg-blue-100 text-blue-700' },
  身法: { gradient: 'from-green-500 to-teal-500',    icon: '💨', color: 'bg-green-100 text-green-700' },
  心法: { gradient: 'from-purple-500 to-violet-500', icon: '🧘', color: 'bg-purple-100 text-purple-700' },
  阵法: { gradient: 'from-yellow-500 to-amber-500',  icon: '⬡',  color: 'bg-yellow-100 text-yellow-700' },
  神通: { gradient: 'from-indigo-500 to-blue-600',   icon: '🌟', color: 'bg-indigo-100 text-indigo-700' },
  秘法: { gradient: 'from-pink-500 to-rose-500',     icon: '🔮', color: 'bg-pink-100 text-pink-700' },
  特性: { gradient: 'from-gray-500 to-slate-600',    icon: '🔑', color: 'bg-gray-100 text-gray-600' },
}

function catConfig(cat: string) {
  return categoryConfig[cat] ?? { gradient: 'from-gray-400 to-gray-500', icon: '⚡', color: 'bg-gray-100 text-gray-600' }
}

const typeLabel: Record<string, string> = {
  active: '主动', passive: '被动', toggle: '切换', ultimate: '绝技',
}
const typeColor: Record<string, string> = {
  active:  'bg-orange-100 text-orange-700',
  passive: 'bg-teal-100 text-teal-700',
  toggle:  'bg-cyan-100 text-cyan-700',
  ultimate:'bg-rose-100 text-rose-700',
}
const statusColor: Record<string, string> = {
  active:   'bg-green-400',
  sealed:   'bg-purple-400',
  lost:     'bg-yellow-400',
  disabled: 'bg-gray-400',
}
const statusLabel: Record<string, string> = {
  active: '正常', sealed: '封印', lost: '失传', disabled: '禁用',
}

const tabs = [
  { key: 'profile',   label: '基本档案' },
  { key: 'effect',    label: '效果描述' },
  { key: 'combat',    label: '战斗参数' },
  { key: 'history',   label: '习得记录' },
  { key: 'fx',        label: '特效生成' },
]

// ── Lifecycle ─────────────────────────────────────────────────────────────────
useUnsavedGuard(isDirty, '技能信息有未保存的修改，确认离开？')
watch(form, () => { isDirty.value = true }, { deep: true })

onMounted(async () => {
  if (!skillId) return
  try {
    const skill: Skill = await skillApi.getSkill(skillId)
    form.value = {
      name:               skill.name ?? '',
      category:           skill.category ?? '武技',
      skill_type:         skill.skill_type ?? 'active',
      status:             skill.status ?? 'active',
      level:              skill.level ?? 1,
      max_level:          skill.max_level ?? 10,
      realm:              skill.realm ?? '',
      description:        skill.description ?? '',
      effect:             skill.effect ?? '',
      flavor_text:        skill.flavor_text ?? '',
      cost:               skill.cost ?? '',
      cooldown:           skill.cooldown ?? '',
      tags:               skill.tags ?? '',
      acquired_chapter_no:skill.acquired_chapter_no ?? null,
      acquired_desc:      skill.acquired_desc ?? '',
      character_id:       skill.character_id ?? null,
      parent_id:          skill.parent_id ?? null,
      notes:              skill.notes ?? '',
    }
    effectImageUrl.value = skill.effect_image_url ?? ''
    effectVisualPrompt.value = skill.effect_visual_prompt ?? ''
  } catch (e: any) {
    toast.error('加载技能失败：' + (e.message || '未知错误'))
  }
  await nextTick()
  isDirty.value = false
})

// ── Actions ───────────────────────────────────────────────────────────────────
async function handleSave() {
  if (!form.value.name.trim()) { toast.error('技能名称不能为空'); return }
  saving.value = true
  try {
    await skillApi.updateSkill(skillId, { ...form.value })
    isDirty.value = false
    toast.success('保存成功')
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || '未知错误'))
  } finally {
    saving.value = false
  }
}

function goBack() {
  novelId ? router.push(`/novel/${novelId}?tab=skills`) : router.back()
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <button
          class="btn-ghost p-2"
          @click="goBack"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <div class="flex items-center gap-2">
            <span class="text-lg">{{ catConfig(form.category).icon }}</span>
            <h1 class="text-xl font-bold text-gray-900 dark:text-white">{{ form.name || '技能详情' }}</h1>
            <span class="text-xs px-2 py-0.5 rounded-full" :class="catConfig(form.category).color">{{ form.category }}</span>
            <span class="text-xs px-2 py-0.5 rounded-full" :class="typeColor[form.skill_type]">{{ typeLabel[form.skill_type] }}</span>
          </div>
          <p class="text-sm text-gray-500">技能编辑器</p>
        </div>
      </div>
      <button class="btn-primary" :disabled="saving" @click="handleSave">
        <svg v-if="saving" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        {{ saving ? '保存中…' : '保存' }}
      </button>
    </div>

    <!-- Tabs -->
    <div class="border-b border-gray-200 dark:border-gray-700">
      <nav class="flex space-x-8">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="py-3 px-1 border-b-2 font-medium text-sm transition-colors"
          :class="activeTab === tab.key
            ? 'border-primary-500 text-primary-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </nav>
    </div>

    <!-- ── Tab: 基本档案 ───────────────────────────────────────────────────── -->
    <div v-if="activeTab === 'profile'" class="space-y-4">
      <div class="card p-6 space-y-5">
        <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider">基本信息</h3>
        <!-- Name -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">技能名称 <span class="text-red-500">*</span></label>
          <input v-model="form.name" type="text" class="input" placeholder="如：天罡剑法、御风术、归元心法…" maxlength="100" />
        </div>

        <!-- Category picker -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">技能类别</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="cat in SKILL_CATEGORIES"
              :key="cat"
              type="button"
              class="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border-2 transition-all font-medium"
              :class="form.category === cat
                ? `${catConfig(cat).color} border-current`
                : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'"
              @click="form.category = cat"
            >
              <span>{{ catConfig(cat).icon }}</span>{{ cat }}
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <!-- Skill type -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">技能类型</label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="t in SKILL_TYPES"
                :key="t.id"
                type="button"
                class="text-xs px-3 py-1.5 rounded-full border-2 font-medium transition-all"
                :class="form.skill_type === t.id
                  ? `${typeColor[t.id]} border-current`
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'"
                @click="form.skill_type = t.id"
              >
                {{ t.label }}
              </button>
            </div>
          </div>
          <!-- Status -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">当前状态</label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="s in SKILL_STATUSES"
                :key="s.id"
                type="button"
                class="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border-2 font-medium transition-all"
                :class="form.status === s.id
                  ? 'border-gray-400 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'"
                @click="form.status = s.id"
              >
                <span class="w-1.5 h-1.5 rounded-full" :class="statusColor[s.id]" />
                {{ s.label }}
              </button>
            </div>
          </div>
        </div>

        <!-- Realm -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">境界要求</label>
          <input v-model="form.realm" type="text" class="input" placeholder="练气期 / 筑基期 / 金丹期 / 元婴期…" maxlength="50" />
          <p class="mt-1 text-xs text-gray-400">修炼该技能所需的最低境界或条件</p>
        </div>
      </div>

      <!-- Level -->
      <div class="card p-6 space-y-4">
        <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider">等级设定</h3>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">当前等级</label>
            <input v-model.number="form.level" type="number" :min="1" :max="form.max_level" class="input" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">最高等级</label>
            <input v-model.number="form.max_level" type="number" :min="1" :max="100" class="input" />
          </div>
        </div>
        <!-- Level progress bar -->
        <div>
          <div class="flex justify-between text-xs text-gray-400 mb-1">
            <span>Lv.{{ form.level }}</span>
            <span>满级 Lv.{{ form.max_level }}</span>
          </div>
          <div class="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <div
              class="h-full rounded-full bg-gradient-to-r transition-all"
              :class="`bg-gradient-to-r ${catConfig(form.category).gradient.replace('from-', 'from-').replace('to-', 'to-')}`"
              :style="{ width: `${Math.min((form.level / Math.max(form.max_level, 1)) * 100, 100)}%` }"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- ── Tab: 效果描述 ───────────────────────────────────────────────────── -->
    <div v-if="activeTab === 'effect'" class="space-y-4">
      <div class="card p-6 space-y-5">
        <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider">技能描述</h3>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">技能概述</label>
          <textarea v-model="form.description" rows="3" class="input resize-none" placeholder="对技能整体特点的简要说明，供读者快速理解…" />
          <p class="mt-1 text-xs text-gray-400">简明介绍，用于角色思考或对话中的简短提及</p>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">效果详情</label>
          <textarea v-model="form.effect" rows="5" class="input resize-none" placeholder="技能的具体效果：伤害范围、持续时间、触发条件、特殊机制…" />
          <p class="mt-1 text-xs text-gray-400">详细的技能机制，包含数值参考和边界条件</p>
        </div>
      </div>

      <!-- Flavor text -->
      <div class="card p-6 space-y-3">
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider">世界观描述</h3>
          <span class="text-xs text-gray-400">（小说内视角）</span>
        </div>
        <div class="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-lg p-3 mb-2">
          <p class="text-xs text-amber-700 dark:text-amber-400">此处填写从书中人物视角描述该技能的文字，可直接引用为小说正文内容。</p>
        </div>
        <textarea
          v-model="form.flavor_text"
          rows="5"
          class="input resize-none italic text-gray-600 dark:text-gray-400"
          placeholder="「此剑法出自上古剑仙之手，共三十六式，每式皆藏一道天雷之意……」"
        />
      </div>
    </div>

    <!-- ── Tab: 战斗参数 ───────────────────────────────────────────────────── -->
    <div v-if="activeTab === 'combat'" class="space-y-4">
      <div class="card p-6 space-y-5">
        <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider">消耗 & 冷却</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">技能消耗</label>
            <input v-model="form.cost" type="text" class="input" placeholder="100 法力 / 30 灵力/秒 / 无…" />
            <p class="mt-1 text-xs text-gray-400">每次使用消耗的资源</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">冷却时间</label>
            <input v-model="form.cooldown" type="text" class="input" placeholder="10秒 / 1小时 / 无 / 一日一次…" />
            <p class="mt-1 text-xs text-gray-400">再次使用需等待的时间</p>
          </div>
        </div>
      </div>

      <!-- Tags -->
      <div class="card p-6 space-y-4">
        <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider">技能标签</h3>
        <div class="flex flex-wrap gap-2 min-h-[2rem]">
          <span
            v-for="(tag, i) in tagList"
            :key="i"
            class="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
          >
            {{ tag }}
            <button type="button" class="hover:text-red-500 transition-colors leading-none" @click="removeTag(i)">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </span>
          <span v-if="!tagList.length" class="text-xs text-gray-400">暂无标签</span>
        </div>
        <div class="flex gap-2">
          <input
            v-model="newTag"
            type="text"
            class="input flex-1 text-sm"
            placeholder="添加标签（如：范围攻击、持续伤害、控制…）"
            @keyup.enter="addTag"
          />
          <button type="button" class="btn-secondary text-sm px-3" @click="addTag">添加</button>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <span class="text-xs text-gray-400 mr-1">常用：</span>
          <button
            v-for="preset in ['单体攻击','范围攻击','持续伤害','控制','治疗','防御','增益','减益','位移','召唤']"
            :key="preset"
            type="button"
            class="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            @click="newTag = preset; addTag()"
          >{{ preset }}</button>
        </div>
      </div>
    </div>

    <!-- ── Tab: 习得记录 ───────────────────────────────────────────────────── -->
    <div v-if="activeTab === 'history'" class="space-y-4">
      <div class="card p-6 space-y-5">
        <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider">习得来源</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">所属角色 ID</label>
            <input v-model.number="form.character_id" type="number" class="input" placeholder="角色 ID（留空=全局）" />
            <p class="mt-1 text-xs text-gray-400">留空表示世界通用技能，未绑定特定角色</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">前置技能 ID</label>
            <input v-model.number="form.parent_id" type="number" class="input" placeholder="前置技能 ID（技能树）" />
            <p class="mt-1 text-xs text-gray-400">需先习得该技能才能解锁</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">习得章节</label>
            <input v-model.number="form.acquired_chapter_no" type="number" class="input" placeholder="第几章习得" />
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">习得方式</label>
          <textarea v-model="form.acquired_desc" rows="3" class="input resize-none" placeholder="机缘巧合于古洞中得到传承，或拜入宗门后由师傅传授…" />
        </div>
      </div>

      <div class="card p-6 space-y-3">
        <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider">作者备注</h3>
        <div class="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/30 rounded-lg p-3">
          <p class="text-xs text-blue-700 dark:text-blue-400">此备注仅供作者查阅，不会出现在正文中。可记录创作思路、待完善的设定、技能的后续发展方向等。</p>
        </div>
        <textarea v-model="form.notes" rows="4" class="input resize-none" placeholder="TODO: 第50章时揭示此技能的真正来历；后期应该给主角解除封印…" />
      </div>
    </div>

    <!-- ── Tab: 特效生成 ───────────────────────────────────────────────────── -->
    <div v-if="activeTab === 'fx'" class="space-y-4">
      <!-- Image preview -->
      <div class="card overflow-hidden">
        <div
          class="relative flex items-center justify-center bg-gray-900 min-h-[280px]"
          :class="`bg-gradient-to-br ${catConfig(form.category).gradient} opacity-90`"
        >
          <img
            v-if="effectImageUrl"
            :src="effectImageUrl"
            :alt="form.name + ' 特效'"
            class="max-h-72 w-full object-contain"
          />
          <div v-else class="flex flex-col items-center gap-3 py-16 text-white/60">
            <span class="text-5xl">{{ catConfig(form.category).icon }}</span>
            <span class="text-sm">暂无特效图片</span>
          </div>
          <!-- Generating overlay -->
          <div v-if="generatingEffect" class="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3">
            <svg class="w-10 h-10 text-white animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <span class="text-white text-sm">AI 正在生成特效图片…</span>
          </div>
        </div>
      </div>

      <!-- Visual prompt editor -->
      <div class="card p-6 space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider">特效提示词</h3>
          <span class="text-xs text-gray-400">留空则由 AI 根据技能属性自动生成</span>
        </div>
        <div class="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-lg p-3">
          <p class="text-xs text-amber-700 dark:text-amber-400">
            提示词用于描述技能释放特效的视觉风格。填写英文效果更佳，如：
            <em>「blazing sword aura, crimson energy burst, dramatic lighting」</em>
          </p>
        </div>
        <textarea
          v-model="effectVisualPrompt"
          rows="5"
          class="input resize-none font-mono text-sm"
          :placeholder="`留空时 AI 将根据「${form.category}」类别、「${form.name || '技能名称'}」自动构建提示词…`"
        />
        <!-- Quick-fill presets -->
        <div class="flex flex-wrap gap-1.5 items-center">
          <span class="text-xs text-gray-400 mr-1">快速添加：</span>
          <button
            v-for="preset in ['dramatic lighting', 'vivid colors', 'particle effects', 'energy burst', 'glowing runes', 'dark magic', 'heavenly light', 'speed blur', 'shockwave', 'cinematic']"
            :key="preset"
            type="button"
            class="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            @click="effectVisualPrompt = effectVisualPrompt ? effectVisualPrompt + ', ' + preset : preset"
          >{{ preset }}</button>
        </div>
      </div>

      <!-- Generate button -->
      <div class="flex justify-end gap-3">
        <button
          v-if="effectImageUrl"
          type="button"
          class="btn-secondary text-sm"
          @click="() => { const a = document.createElement('a'); a.href = effectImageUrl; a.target = '_blank'; a.click() }"
        >
          查看原图
        </button>
        <button
          type="button"
          class="btn-primary"
          :disabled="generatingEffect"
          @click="generateEffect"
        >
          <svg v-if="generatingEffect" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          {{ generatingEffect ? '生成中…' : (effectImageUrl ? '重新生成' : 'AI 生成特效') }}
        </button>
      </div>
    </div>
  </div>
</template>
