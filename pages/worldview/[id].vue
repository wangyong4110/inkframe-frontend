<script setup lang="ts">
import type { Worldview, WorldviewEntity } from '~/types'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const activeTab = ref('overview')
const showGenerateModal = ref(false)
const loading = ref(false)
const saving = ref(false)
const generating = ref(false)
const generateHints = ref('')

// Entity state
const entities = ref<WorldviewEntity[]>([])
const showEntityModal = ref(false)
const editingEntity = ref<WorldviewEntity | null>(null)
const entityForm = ref({ type: 'organization', name: '', description: '', image_url: '' })
const entitySaving = ref(false)

const worldviewId = computed(() => route.params.id ? parseInt(route.params.id as string) : null)

const worldview = ref<Worldview>({
  id: 0,
  name: '',
  genre: 'fantasy',
  description: '',
  magic_system: '',
  geography: '',
  history: '',
  culture: '',
  technology: '',
  rules: '',
  cover_image: '',
  entities: [],
  created_at: '',
  updated_at: '',
})

const tabs = [
  { key: 'overview', label: '概览' },
  { key: 'magic', label: '修炼体系' },
  { key: 'geography', label: '地理环境' },
  { key: 'history', label: '历史背景' },
  { key: 'entities', label: '势力设定' },
]

onMounted(async () => {
  if (!worldviewId.value) return
  loading.value = true
  try {
    const { getWorldview, listEntities } = useWorldviewApi()
    const [wvResp, entResp] = await Promise.all([
      getWorldview(worldviewId.value),
      listEntities(worldviewId.value),
    ])
    worldview.value = wvResp.data
    entities.value = entResp.data ?? []
  } catch (e: any) {
    toast.error('加载失败：' + (e.message || '未知错误'))
  } finally {
    loading.value = false
  }
})

function goBack() {
  router.back()
}

async function handleSave() {
  if (!worldviewId.value) return
  saving.value = true
  try {
    const { updateWorldview } = useWorldviewApi()
    const resp = await updateWorldview(worldviewId.value, {
      name: worldview.value.name,
      genre: worldview.value.genre,
      description: worldview.value.description,
      magic_system: worldview.value.magic_system,
      geography: worldview.value.geography,
      history: worldview.value.history,
      culture: worldview.value.culture,
      technology: worldview.value.technology,
      rules: worldview.value.rules,
      cover_image: worldview.value.cover_image,
    })
    worldview.value = resp.data
    toast.success('世界观已保存')
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || '未知错误'))
  } finally {
    saving.value = false
  }
}

// Entity CRUD
function openCreateEntity() {
  editingEntity.value = null
  entityForm.value = { type: 'organization', name: '', description: '', image_url: '' }
  showEntityModal.value = true
}

function openEditEntity(entity: WorldviewEntity) {
  editingEntity.value = entity
  entityForm.value = {
    type: entity.type,
    name: entity.name,
    description: entity.description ?? '',
    image_url: entity.image_url ?? '',
  }
  showEntityModal.value = true
}

async function saveEntity() {
  if (!worldviewId.value || !entityForm.value.name.trim()) return
  entitySaving.value = true
  try {
    const { createEntity, updateEntity, listEntities } = useWorldviewApi()
    if (editingEntity.value) {
      await updateEntity(worldviewId.value, editingEntity.value.id, entityForm.value)
    } else {
      await createEntity(worldviewId.value, entityForm.value)
    }
    const resp = await listEntities(worldviewId.value)
    entities.value = resp.data ?? []
    showEntityModal.value = false
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || '未知错误'))
  } finally {
    entitySaving.value = false
  }
}

async function deleteEntity(entity: WorldviewEntity) {
  if (!worldviewId.value) return
  try {
    const { deleteEntity: apiDelete, listEntities } = useWorldviewApi()
    await apiDelete(worldviewId.value, entity.id)
    const resp = await listEntities(worldviewId.value)
    entities.value = resp.data ?? []
  } catch (e: any) {
    toast.error('删除失败：' + (e.message || '未知错误'))
  }
}

function entityTypeLabel(type: string) {
  const labels: Record<string, string> = {
    location: '地点', organization: '组织', artifact: '神器', race: '种族', creature: '生物', other: '其他',
  }
  return labels[type] ?? type
}

async function generateWorldview() {
  generating.value = true
  try {
    const { generateWorldview: apiGenerate } = useWorldviewApi()
    const hints = generateHints.value.trim()
      ? generateHints.value.split('\n').filter(Boolean)
      : []
    const resp = await apiGenerate({ genre: worldview.value.genre, hints })
    const g = resp.data
    if (g.description) worldview.value.description = g.description
    if (g.magic_system) worldview.value.magic_system = g.magic_system
    if (g.geography) worldview.value.geography = g.geography
    if (g.history) worldview.value.history = g.history
    if (g.culture) worldview.value.culture = g.culture
    if (g.technology) worldview.value.technology = g.technology
    if (g.rules) worldview.value.rules = g.rules
    showGenerateModal.value = false
    toast.success('世界观生成完成')
  } catch (e: any) {
    toast.error('AI生成失败：' + (e.message || '未知错误'))
  } finally {
    generating.value = false
  }
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
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ worldview.name || '世界观编辑器' }}</h1>
          <p class="text-sm text-gray-500 dark:text-gray-400">世界观编辑器</p>
        </div>
      </div>
      <div class="flex items-center space-x-2">
        <button class="btn-outline" :disabled="generating" @click="showGenerateModal = true">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          AI 生成
        </button>
        <button class="btn-primary" :disabled="saving" @click="handleSave">
          {{ saving ? '保存中...' : '保存' }}
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="card p-12 text-center">
      <div class="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
      <p class="mt-2 text-gray-500">加载中...</p>
    </div>

    <template v-else>
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
                <option value="romance">言情</option>
                <option value="mystery">悬疑</option>
                <option value="historical">历史</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">简介</label>
              <textarea v-model="worldview.description" rows="3" class="input"></textarea>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">封面图片</label>
              <ImageUploadBox
                v-model="worldview.cover_image"
                aspect-ratio="16/9"
                placeholder="上传封面图片"
                @error="(msg) => toast.error(msg)"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">文化背景</label>
              <textarea v-model="worldview.culture" rows="3" class="input" placeholder="描述世界的文化习俗..."></textarea>
            </div>
          </div>
        </div>

        <div class="card p-6">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">世界规则</h3>
          <textarea v-model="worldview.rules" rows="10" class="input" placeholder="列出世界的核心规则..."></textarea>
          <p class="mt-2 text-sm text-gray-500">每行一条规则，这些规则将约束AI生成的内容</p>
        </div>
      </div>

      <!-- Magic System -->
      <div v-if="activeTab === 'magic'" class="card p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">修炼体系</h3>
        </div>
        <textarea v-model="worldview.magic_system" rows="10" class="input" placeholder="描述修炼/能力体系..."></textarea>
      </div>

      <!-- Geography -->
      <div v-if="activeTab === 'geography'" class="card p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">地理环境</h3>
        </div>
        <textarea v-model="worldview.geography" rows="8" class="input" placeholder="描述地理环境..."></textarea>

        <!-- Map Placeholder -->
        <div class="mt-6 h-48 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
          <div class="text-center">
            <svg class="w-12 h-12 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 0l6 3m-6-3h.01M9 7l6 3m0 0l-6 3m6-3v12" />
            </svg>
            <p class="text-gray-500">地图编辑器（开发中）</p>
          </div>
        </div>
      </div>

      <!-- History -->
      <div v-if="activeTab === 'history'" class="card p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">历史背景</h3>
        <textarea v-model="worldview.history" rows="10" class="input" placeholder="描述世界的历史背景..."></textarea>

        <div class="mt-4">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">技术水平</label>
          <textarea v-model="worldview.technology" rows="4" class="input" placeholder="描述世界的科技/法术水平..."></textarea>
        </div>
      </div>

      <!-- Entities -->
      <div v-if="activeTab === 'entities'" class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">势力 / 实体设定</h3>
          <button class="btn-primary text-sm" @click="openCreateEntity">
            <svg class="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            新增实体
          </button>
        </div>

        <div v-if="entities.length === 0" class="card p-8 text-center">
          <svg class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14-2v-2a2 2 0 00-2-2h-2a2 2 0 00-2 2v2" />
          </svg>
          <p class="text-gray-500 dark:text-gray-400 mb-4">暂无实体设定</p>
          <button class="btn-primary" @click="openCreateEntity">新增实体</button>
        </div>

        <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div v-for="entity in entities" :key="entity.id" class="card p-4">
            <div class="flex items-start justify-between mb-2">
              <div class="flex items-start space-x-2">
                <div class="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center shrink-0">
                  <svg class="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14-2v-2a2 2 0 00-2-2h-2a2 2 0 00-2 2v2" />
                  </svg>
                </div>
                <div>
                  <h4 class="font-medium text-gray-900 dark:text-white">{{ entity.name }}</h4>
                  <span class="text-xs text-gray-500">{{ entityTypeLabel(entity.type) }}</span>
                </div>
              </div>
              <div class="flex gap-1">
                <button class="p-1 text-gray-400 hover:text-primary-600" title="编辑" @click="openEditEntity(entity)">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button class="p-1 text-gray-400 hover:text-red-500" title="删除" @click="deleteEntity(entity)">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
            <img v-if="entity.image_url" :src="entity.image_url" :alt="entity.name" class="w-full h-24 object-cover rounded mb-2" />
            <p class="text-sm text-gray-600 dark:text-gray-400">{{ entity.description }}</p>
          </div>
        </div>
      </div>
    </template>

    <!-- Entity Modal -->
    <div v-if="showEntityModal" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="fixed inset-0 bg-black/50" @click="showEntityModal = false"></div>
      <div class="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full mx-4 p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {{ editingEntity ? '编辑实体' : '新增实体' }}
        </h3>
        <div class="space-y-4">
          <div class="grid gap-4 md:grid-cols-2">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">名称 *</label>
              <input v-model="entityForm.name" type="text" class="input" placeholder="如：青云门" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">类型</label>
              <select v-model="entityForm.type" class="input">
                <option value="organization">组织</option>
                <option value="location">地点</option>
                <option value="artifact">神器</option>
                <option value="race">种族</option>
                <option value="creature">生物</option>
                <option value="other">其他</option>
              </select>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">描述</label>
            <textarea v-model="entityForm.description" rows="3" class="input" placeholder="描述该实体的特点和背景..."></textarea>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">图片（可选）</label>
            <ImageUploadBox
              v-model="entityForm.image_url"
              aspect-ratio="4/3"
              placeholder="上传实体图片"
              @error="(msg) => toast.error(msg)"
            />
          </div>
        </div>
        <div class="mt-6 flex justify-end space-x-2">
          <button class="btn-outline" @click="showEntityModal = false">取消</button>
          <button class="btn-primary" :disabled="entitySaving || !entityForm.name.trim()" @click="saveEntity">
            {{ entitySaving ? '保存中...' : '保存' }}
          </button>
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
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">类型</label>
            <select v-model="worldview.genre" class="input">
              <option value="fantasy">玄幻</option>
              <option value="xianxia">仙侠</option>
              <option value="urban">都市</option>
              <option value="scifi">科幻</option>
              <option value="romance">言情</option>
              <option value="mystery">悬疑</option>
              <option value="historical">历史</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">补充说明（每行一条，可选）</label>
            <textarea v-model="generateHints" rows="3" class="input" placeholder="描述你想要的世界观特点..."></textarea>
          </div>
        </div>
        <div class="mt-6 flex justify-end space-x-2">
          <button class="btn-outline" @click="showGenerateModal = false">取消</button>
          <button class="btn-primary" :disabled="generating" @click="generateWorldview">
            <svg v-if="generating" class="w-4 h-4 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {{ generating ? '生成中...' : '开始生成' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
