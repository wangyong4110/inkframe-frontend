<script setup lang="ts">
import type { Worldview, WorldviewEntity } from '~/types'

const { url: lightboxUrl, openLightbox } = useImageLightbox()
const { editImage } = useImageEditApi()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { guardAiProvider } = useAiProviderGuard()

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
  rules: '',
  glossary: '',
  entities: [],
  created_at: '',
  updated_at: '',
})

const tabs = [
  { key: 'overview', label: '概览' },
  { key: 'magic', label: '修炼体系' },
  { key: 'geography', label: '关键地点' },
  { key: 'history', label: '背景矛盾' },
  { key: 'glossary', label: '术语词汇' },
  { key: 'entities', label: '实体设定' },
]

onMounted(async () => {
  if (!worldviewId.value) return
  loading.value = true
  try {
    const { getWorldview, listEntities } = useWorldviewApi()
    const wvResp = await getWorldview(worldviewId.value)
    if (wvResp?.data) {
      Object.assign(worldview.value, wvResp.data)
    }
    // Load entities independently — failure is non-critical
    listEntities(worldviewId.value).then(entResp => {
      entities.value = entResp.data ?? []
    }).catch(() => {})
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
      rules: worldview.value.rules,
      glossary: worldview.value.glossary,
    })
    if (resp?.data) {
      Object.assign(worldview.value, resp.data)
    }
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

function openEntityImage(entity: WorldviewEntity) {
  if (!entity.image_url || !worldviewId.value) return
  const wid = worldviewId.value
  openLightbox(
    entity.image_url,
    (currentUrl, instruction) => editImage(currentUrl, instruction),
    async (newUrl) => {
      const { updateEntity } = useWorldviewApi()
      await updateEntity(wid, entity.id, { image_url: newUrl })
      entity.image_url = newUrl
    },
  )
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
  if (!await guardAiProvider('LLM')) return
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
    if (g.rules) worldview.value.rules = g.rules
    if (g.glossary) worldview.value.glossary = g.glossary
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
          <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">基本信息</h3>
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
          </div>
        </div>

        <div class="card p-6">
          <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">世界规则</h3>
          <textarea v-model="worldview.rules" rows="12" class="input" placeholder="列出世界的核心规则与禁忌，每行一条。这些规则将约束 AI 生成的内容..."></textarea>
          <p class="mt-2 text-sm text-gray-500">每行一条规则，约束 AI 生成章节时的行为边界</p>
        </div>
      </div>

      <!-- Glossary -->
      <div v-if="activeTab === 'glossary'" class="card p-6">
        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">术语词汇表</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-3">世界专属术语、专有名词及其含义。AI 生成时将保持术语一致性，避免前后矛盾。</p>
        <textarea v-model="worldview.glossary" rows="14" class="input" placeholder="每行一条，格式：词语 — 含义&#10;例如：&#10;灵根 — 修炼者天生的感知灵气能力，分金木水火土五行，影响修炼速度和上限&#10;渡劫 — 修炼到化神期后面临天道考验的关卡，失败则魂飞魄散&#10;洞天福地 — 灵气浓郁的修炼圣地，多被各大势力占据..."></textarea>
      </div>

      <!-- Magic System -->
      <div v-if="activeTab === 'magic'" class="card p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">修炼体系</h3>
        </div>
        <textarea v-model="worldview.magic_system" rows="10" class="input" placeholder="描述修炼/能力体系..."></textarea>
      </div>

      <!-- Geography → 关键地点 -->
      <div v-if="activeTab === 'geography'" class="card p-6">
        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">关键地点</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">只列出故事实际会发生的场景。每个地点说明：控制方、叙事意义、进入难度。不需要描述整个世界的地理格局。</p>
        <textarea v-model="worldview.geography" rows="12" class="input" placeholder="例如：&#10;青云峰（天宗总部）— 控制方：天宗，主角修炼起点，与外界隔绝，第1-30章核心舞台&#10;血煞禁地（北疆）— 控制方：血煞门，高危区域，封印所在地，第二卷高潮场景&#10;浮云城（中立商业城市）— 控制方：无名商会，信息交汇处，主角初次接触黑市..."></textarea>
      </div>

      <!-- History → 背景矛盾 -->
      <div v-if="activeTab === 'history'" class="card p-6">
        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">背景矛盾</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">只记录<strong class="text-gray-700 dark:text-gray-200">仍在影响当前故事</strong>的过去事件。与现在无关的历史不需要写。</p>
        <textarea v-model="worldview.history" rows="12" class="input" placeholder="例如：&#10;三千年前天魔大战：上古魔君被封印于血煞禁地，封印每隔百年减弱一次，当前正处第三十次减弱期——这是整个故事的时间压力&#10;天宗叛徒事件（二十年前）：天宗前任长老偷走镇宗秘典投靠血煞门，此事至今未解，主角师父是当年调查此案的幸存者&#10;灵气浓度下降（持续中）：修炼资源枯竭导致各势力争夺加剧，这是当前政治紧张局势的根源..."></textarea>
      </div>

      <!-- Entities -->
      <div v-if="activeTab === 'entities'" class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">实体设定（势力 / 地点 / 神器 / 种族）</h3>
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
            <img v-if="entity.image_url" :src="entity.image_url" :alt="entity.name" class="w-full h-24 object-cover rounded mb-2 cursor-zoom-in" @click="openEntityImage(entity)" />
            <p class="text-sm text-gray-600 dark:text-gray-400">{{ entity.description }}</p>
          </div>
        </div>
      </div>
    </template>

    <!-- Entity Modal -->
    <div v-if="showEntityModal" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="fixed inset-0 bg-black/50" @click="showEntityModal = false"></div>
      <div class="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full mx-4 p-6">
        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
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
        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">AI 生成世界观</h3>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">补充说明（可选）</label>
          <textarea v-model="generateHints" rows="3" class="input" placeholder="描述你想要的世界观特点..."></textarea>
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
