<script setup lang="ts">
const route = useRoute()
const router = useRouter()

const activeTab = ref('overview')
const showGenerateModal = ref(false)

const worldviewId = computed(() => route.params.id ? parseInt(route.params.id as string) : null)

const tabs = [
  { key: 'overview', label: '概览' },
  { key: 'magic', label: '修炼体系' },
  { key: 'geography', label: '地理环境' },
  { key: 'history', label: '历史背景' },
  { key: 'entities', label: '势力设定' },
]

// Mock data
const worldview = ref({
  id: 1,
  name: '修仙世界',
  genre: 'xianxia',
  description: '这是一个修仙世界，修仙者可以修炼成仙，获得长生不老的力量。',
  magic_system: '修炼分为九个境界：炼气、筑基、金丹、元婴、化神、炼虚、合道、大乘、渡劫。每个境界分为九层，需要积累足够的灵力才能突破。',
  geography: '世界分为五大洲：东胜神州、南膽部洲、西牛贺洲、北俱芦洲、中神州。中神州是修仙界的中心，有无数宗门林立。',
  history: '上古时期，诸多大能开辟此界，制定修炼法则。万年前，神魔大战爆发，世界几乎毁灭。如今，修仙界逐渐恢复繁荣。',
  culture: '修仙者以宗门为家，注重传承和师徒情谊。弱肉强食是修仙界的生存法则，但也有着一定的道义约束。',
  technology: '炼丹术、炼器术、阵法术是三大辅助修炼技艺。高阶丹药可以加速修炼，强大的法器可以提升战斗力。',
  rules: '1. 禁止对凡人使用法术\n2. 禁止在凡间城市争斗\n3. 渡劫需到指定地点',
  entities: [
    { id: 1, name: '天玄宗', type: 'sect', description: '中神州第一宗门', power: 95 },
    { id: 2, name: '万剑阁', type: 'sect', description: '以剑道闻名天下', power: 88 },
    { id: 3, name: '妖族联盟', type: 'alliance', description: '妖族势力联合', power: 75 },
  ],
})

function goBack() {
  router.push('/novel')
}

async function generateWorldview() {
  // TODO: 调用API生成世界观
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center space-x-4">
        <button class="btn-ghost p-2" @click="goBack">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ worldview.name }}</h1>
          <p class="text-sm text-gray-500 dark:text-gray-400">世界观编辑器</p>
        </div>
      </div>
      <div class="flex items-center space-x-2">
        <button class="btn-outline" @click="showGenerateModal = true">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          AI 生成
        </button>
        <button class="btn-primary">保存</button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="border-b border-gray-200 dark:border-gray-700">
      <nav class="flex space-x-8">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="py-4 px-1 border-b-2 font-medium text-sm"
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

    <!-- Overview -->
    <div v-if="activeTab === 'overview'" class="grid gap-6 md:grid-cols-2">
      <div class="card p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">基本信息</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">世界观名称</label>
            <input v-model="worldview.name" type="text" class="input" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">类型</label>
            <select v-model="worldview.genre" class="input">
              <option value="fantasy">玄幻</option>
              <option value="xianxia">仙侠</option>
              <option value="urban">都市</option>
              <option value="scifi">科幻</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">简介</label>
            <textarea v-model="worldview.description" rows="3" class="input"></textarea>
          </div>
        </div>
      </div>

      <div class="card p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">世界规则</h3>
        <textarea v-model="worldview.rules" rows="8" class="input" placeholder="列出世界的核心规则..."></textarea>
        <p class="mt-2 text-sm text-gray-500">每行一条规则，这些规则将约束AI生成的内容</p>
      </div>
    </div>

    <!-- Magic System -->
    <div v-if="activeTab === 'magic'" class="card p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">修炼体系</h3>
        <button class="btn-outline text-sm">
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          添加境界
        </button>
      </div>
      <textarea v-model="worldview.magic_system" rows="8" class="input" placeholder="描述修炼体系..."></textarea>
      
      <!-- Realm Visualization -->
      <div class="mt-6">
        <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-4">境界层次图</h4>
        <div class="relative">
          <div class="absolute left-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-purple-500 to-gray-200"></div>
          <div class="space-y-4">
            <div v-for="(realm, index) in ['渡劫境', '大乘境', '合道境', '炼虚境', '化神境', '元婴境', '金丹境', '筑基境', '炼气境']" 
                 :key="realm"
                 class="relative pl-10">
              <div class="absolute left-2 w-4 h-4 rounded-full"
                   :class="index < 3 ? 'bg-purple-500' : index < 6 ? 'bg-blue-500' : 'bg-green-500'">
              </div>
              <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <div class="font-medium text-gray-900 dark:text-white">{{ realm }}</div>
                <div class="text-sm text-gray-500">{{ 9 - index }}层</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Geography -->
    <div v-if="activeTab === 'geography'" class="card p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">地理环境</h3>
        <button class="btn-outline text-sm">
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          添加地点
        </button>
      </div>
      <textarea v-model="worldview.geography" rows="6" class="input" placeholder="描述地理环境..."></textarea>
      
      <!-- Map Placeholder -->
      <div class="mt-6 h-64 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
        <div class="text-center">
          <svg class="w-12 h-12 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 0l6 3m-6-3h.01M9 7l6 3m0 0l-6 3m6-3v12" />
          </svg>
          <p class="text-gray-500">地图编辑器（开发中）</p>
        </div>
      </div>
    </div>

    <!-- Entities -->
    <div v-if="activeTab === 'entities'" class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">势力设定</h3>
        <button class="btn-primary text-sm">
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          添加势力
        </button>
      </div>

      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div v-for="entity in worldview.entities" :key="entity.id" class="card p-4">
          <div class="flex items-start justify-between mb-2">
            <div class="flex items-center space-x-2">
              <div class="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
                <svg class="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14-2v-2a2 2 0 00-2-2h-2a2 2 0 00-2 2v2m14-2v-2a2 2 0 00-2-2h-2a2 2 0 00-2 2m14 2v2a2 2 0 01-2 2H7a2 2 0 01-2-2v-2" />
                </svg>
              </div>
              <div>
                <h4 class="font-medium text-gray-900 dark:text-white">{{ entity.name }}</h4>
                <span class="text-xs text-gray-500">{{ entity.type === 'sect' ? '宗门' : '联盟' }}</span>
              </div>
            </div>
            <span class="tag tag-primary">{{ entity.power }}</span>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400">{{ entity.description }}</p>
        </div>
      </div>

      <!-- Power Ranking -->
      <div class="card p-6 mt-6">
        <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-4">势力排行榜</h4>
        <div class="space-y-3">
          <div v-for="(entity, index) in worldview.entities.sort((a, b) => b.power - a.power)" :key="entity.id" 
               class="flex items-center space-x-4">
            <span class="w-6 text-center font-bold"
                  :class="index === 0 ? 'text-yellow-500' : index === 1 ? 'text-gray-400' : index === 2 ? 'text-amber-600' : 'text-gray-500'">
              {{ index + 1 }}
            </span>
            <div class="flex-1">
              <div class="flex items-center justify-between mb-1">
                <span class="text-sm font-medium">{{ entity.name }}</span>
                <span class="text-sm text-gray-500">{{ entity.power }}</span>
              </div>
              <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div class="h-full bg-gradient-to-r from-primary-500 to-primary-300 rounded-full"
                     :style="{ width: `${entity.power}%` }"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Generate Modal -->
    <div v-if="showGenerateModal" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="fixed inset-0 bg-black/50" @click="showGenerateModal = false"></div>
      <div class="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full mx-4 p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">AI 生成世界观</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">生成类型</label>
            <select class="input">
              <option value="all">完整世界观</option>
              <option value="magic">修炼体系</option>
              <option value="geography">地理环境</option>
              <option value="history">历史背景</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">补充说明（可选）</label>
            <textarea rows="3" class="input" placeholder="描述你想要的世界观特点..."></textarea>
          </div>
        </div>
        <div class="mt-6 flex justify-end space-x-2">
          <button class="btn-outline" @click="showGenerateModal = false">取消</button>
          <button class="btn-primary" @click="generateWorldview">开始生成</button>
        </div>
      </div>
    </div>
  </div>
</template>
