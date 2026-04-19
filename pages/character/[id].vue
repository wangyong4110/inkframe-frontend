<script setup lang="ts">
const characterStore = useCharacterStore()
const route = useRoute()
const router = useRouter()

const novelId = parseInt(route.params.novelId as string)
const characterId = parseInt(route.params.id as string)

const activeTab = ref('profile')
const saving = ref(false)

const character = computed(() => characterStore.currentCharacter)

const tabs = [
  { key: 'profile', label: '角色档案' },
  { key: 'appearance', label: '外貌设定' },
  { key: 'personality', label: '性格特点' },
  { key: 'arc', label: '角色弧光' },
  { key: 'visual', label: '视觉设计' },
]

onMounted(async () => {
  if (characterId) {
    await characterStore.fetchCharacter(characterId)
  }
})

async function handleSave() {
  if (!character.value) return
  saving.value = true
  try {
    await characterStore.updateCharacter(characterId, character.value)
  } finally {
    saving.value = false
  }
}

function goBack() {
  router.push(`/novel/${novelId}?tab=characters`)
}

function getRoleColor(role: string): string {
  const colors: Record<string, string> = {
    protagonist: 'bg-red-100 text-red-800',
    antagonist: 'bg-purple-100 text-purple-800',
    supporting: 'bg-blue-100 text-blue-800',
    minor: 'bg-gray-100 text-gray-800',
  }
  return colors[role] || 'bg-gray-100 text-gray-800'
}

function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    protagonist: '主角',
    antagonist: '反派',
    supporting: '配角',
    minor: '路人',
  }
  return labels[role] || role
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center space-x-4">
        <button
          class="btn-ghost p-2"
          @click="goBack"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ character?.name || '加载中...' }}
          </h1>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            角色编辑器
          </p>
        </div>
      </div>
      <div class="flex items-center space-x-2">
        <span
          v-if="character"
          class="px-3 py-1 text-sm font-medium rounded-full"
          :class="getRoleColor(character.role)"
        >
          {{ getRoleLabel(character.role) }}
        </span>
        <button
          class="btn-primary"
          :disabled="saving"
          @click="handleSave"
        >
          {{ saving ? '保存中...' : '保存' }}
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="border-b border-gray-200 dark:border-gray-700">
      <nav class="flex space-x-8">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="py-4 px-1 border-b-2 font-medium text-sm transition-colors"
          :class="[
            activeTab === tab.key
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          ]"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </nav>
    </div>

    <!-- Profile Tab -->
    <div v-if="activeTab === 'profile' && character" class="card p-6">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">基本信息</h3>
      <div class="grid gap-6 md:grid-cols-2">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            角色名称
          </label>
          <input
            v-model="character.name"
            type="text"
            class="input"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            角色类型
          </label>
          <select v-model="character.role" class="input">
            <option value="protagonist">主角</option>
            <option value="antagonist">反派</option>
            <option value="supporting">配角</option>
            <option value="minor">路人</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            角色原型
          </label>
          <input
            v-model="character.archetype"
            type="text"
            class="input"
            placeholder="如：英雄、智者、反抗者"
          />
        </div>
      </div>

      <div class="mt-6">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          背景故事
        </label>
        <textarea
          v-model="character.background"
          rows="4"
          class="input"
          placeholder="描述角色的背景故事..."
        ></textarea>
      </div>

      <div class="mt-6">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          角色弧光
        </label>
        <textarea
          v-model="character.character_arc"
          rows="3"
          class="input"
          placeholder="描述角色的成长轨迹和变化..."
        ></textarea>
      </div>
    </div>

    <!-- Appearance Tab -->
    <div v-if="activeTab === 'appearance' && character" class="card p-6">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">外貌设定</h3>
      <div class="space-y-6">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            外貌描述
          </label>
          <textarea
            v-model="character.appearance"
            rows="4"
            class="input"
            placeholder="详细描述角色的外貌特征..."
          ></textarea>
          <p class="mt-1 text-sm text-gray-500">
            建议包含：身高、体型、发色、眼睛、服装等特征
          </p>
        </div>

        <div class="border-t border-gray-200 dark:border-gray-700 pt-6">
          <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-4">AI 生成外貌图像</h4>
          <div class="grid gap-4 md:grid-cols-3">
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
              <div class="w-full h-48 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center mb-2">
                <svg class="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <span class="text-sm text-gray-500">基础形象</span>
            </div>
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
              <div class="w-full h-48 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center mb-2">
                <svg class="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <span class="text-sm text-gray-500">表情变化</span>
            </div>
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
              <div class="w-full h-48 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center mb-2">
                <svg class="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <span class="text-sm text-gray-500">动作姿态</span>
            </div>
          </div>
          <div class="mt-4 flex gap-2">
            <button class="btn-primary">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              AI 生成形象
            </button>
            <button class="btn-outline">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              上传参考图
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Personality Tab -->
    <div v-if="activeTab === 'personality' && character" class="card p-6">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">性格特点</h3>
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          性格描述
        </label>
        <textarea
          v-model="character.personality"
          rows="6"
          class="input"
          placeholder="详细描述角色的性格特点..."
        ></textarea>
      </div>

      <div class="mt-6">
        <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">性格标签</h4>
        <div class="flex flex-wrap gap-2">
          <span class="tag tag-primary">勤奋</span>
          <span class="tag tag-primary">勇敢</span>
          <span class="tag tag-primary">聪明</span>
          <button class="tag tag-outline border-dashed">+ 添加标签</button>
        </div>
      </div>

      <div class="mt-6">
        <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">能力设定</h4>
        <div class="space-y-2">
          <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div>
              <span class="font-medium">雷电诀</span>
              <span class="ml-2 text-sm text-gray-500">等级：3阶</span>
            </div>
            <button class="text-error-500 hover:text-error-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
        <button class="mt-2 btn-outline text-sm">
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          添加能力
        </button>
      </div>
    </div>

    <!-- Character Arc Tab -->
    <div v-if="activeTab === 'arc'" class="card p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">角色弧光</h3>
        <button class="btn-primary text-sm">
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          添加阶段
        </button>
      </div>

      <!-- Arc Visualization -->
      <div class="relative mt-6">
        <div class="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700"></div>
        <div class="space-y-6">
          <div v-for="i in 4" :key="i" class="relative pl-10">
            <div class="absolute left-2 w-4 h-4 rounded-full bg-primary-500 border-4 border-white dark:border-gray-900"></div>
            <div class="card p-4">
              <div class="flex items-center justify-between mb-2">
                <span class="font-medium text-gray-900 dark:text-white">
                  {{ ['觉醒期', '成长期', '考验期', '巅峰期'][i-1] }}
                </span>
                <span class="text-sm text-gray-500">第{{ i * 5 }}章</span>
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                {{ [
                  '主角开始发现自己拥有特殊能力',
                  '主角开始修炼，能力逐渐提升',
                  '主角遭遇挫折，需要重新审视自己',
                  '主角克服困难，达到新的高度'
                ][i-1] }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Emotion Curve -->
      <div class="mt-8">
        <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-4">情感曲线</h4>
        <div class="h-32 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-end justify-between px-4 pb-2">
          <div v-for="i in 10" :key="i" class="w-8 bg-primary-500 rounded-t" :style="{ height: `${30 + Math.random() * 60}%` }"></div>
        </div>
        <div class="flex justify-between mt-2 text-xs text-gray-500">
          <span>第1章</span>
          <span>第10章</span>
          <span>第20章</span>
          <span>第30章</span>
        </div>
      </div>
    </div>

    <!-- Visual Design Tab -->
    <div v-if="activeTab === 'visual'" class="card p-6">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">视觉设计</h3>

      <div class="space-y-6">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            艺术风格
          </label>
          <select class="input">
            <option value="realistic">写实风格</option>
            <option value="anime">动漫风格</option>
            <option value="cartoon">卡通风格</option>
            <option value="ink">水墨风格</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            色彩调色板
          </label>
          <div class="flex space-x-2">
            <div class="w-10 h-10 rounded-lg bg-blue-500"></div>
            <div class="w-10 h-10 rounded-lg bg-yellow-500"></div>
            <div class="w-10 h-10 rounded-lg bg-red-500"></div>
            <div class="w-10 h-10 rounded-lg bg-green-500"></div>
            <div class="w-10 h-10 rounded-lg bg-gray-300 flex items-center justify-center cursor-pointer">
              <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
            </div>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            LoRA 训练
          </label>
          <div class="card bg-gray-50 dark:bg-gray-800 p-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="font-medium">角色 LoRA 模型</p>
                <p class="text-sm text-gray-500">用于保持角色一致性</p>
              </div>
              <div class="flex items-center space-x-2">
                <span class="tag tag-success">已训练</span>
                <button class="btn-outline text-sm">重新训练</button>
              </div>
            </div>
          </div>
        </div>

        <div>
          <button class="btn-primary w-full">
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12.75M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11a2 2 0 012 2z" />
            </svg>
            导出角色视觉资源包
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
