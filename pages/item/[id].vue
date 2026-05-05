<script setup lang="ts">
import type { Item } from '~/types'
import { useItemApi } from '~/composables/useApi'

const { openLightbox } = useImageLightbox()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const itemApi = useItemApi()
const novelStore = useNovelStore()

const itemId = parseInt(route.params.id as string)
const novelId = parseInt(route.query.novelId as string)

const activeTab = ref('profile')
const saving = ref(false)
const isDirty = ref(false)
const generatingImage = ref(false)

// 使用小说配置的图像生成模型
const selectedImageProvider = computed(() => novelStore.currentNovel?.image_model || '')

// 图像生成异步任务
const imageTaskId = ref('')
const imageTaskStatus = ref<'idle' | 'pending' | 'running' | 'completed' | 'failed'>('idle')
let imageTaskTimer: ReturnType<typeof setInterval> | null = null

function clearImageTaskTimer() {
  if (imageTaskTimer) {
    clearInterval(imageTaskTimer)
    imageTaskTimer = null
  }
}

async function pollImageTask() {
  if (!imageTaskId.value) return
  try {
    const res = await useTaskApi().getTask(imageTaskId.value)
    const task = res.data
    imageTaskStatus.value = task.status as any
    if (task.status === 'completed') {
      clearImageTaskTimer()
      generatingImage.value = false
      const item = task.data ?? task.item
      if (item?.image_url) imageUrl.value = item.image_url
      toast.success('图片生成成功')
    } else if (task.status === 'failed') {
      clearImageTaskTimer()
      generatingImage.value = false
      toast.error('图片生成失败：' + (task.error || '未知错误'))
    }
  } catch {
    // ignore transient poll errors
  }
}

function revokeIfBlob(url: string) {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url)
}

onUnmounted(() => {
  clearImageTaskTimer()
  revokeIfBlob(referenceImagePreview.value)
  revokeIfBlob(imageUrl.value)
})

// 本地上传物品图片
const uploadingImage = ref(false)
const imageFileInputRef = ref<HTMLInputElement | null>(null)

async function handleImageUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  // Show local preview immediately — no need to wait for server response.
  const localPreview = URL.createObjectURL(file)
  const prevUrl = imageUrl.value
  imageUrl.value = localPreview
  uploadingImage.value = true
  try {
    const data = await itemApi.uploadItemImage(itemId, file)
    // Replace ObjectURL with the persisted server URL.
    URL.revokeObjectURL(localPreview)
    imageUrl.value = data.url
    toast.success('图片上传成功')
  } catch (err: any) {
    URL.revokeObjectURL(localPreview)
    imageUrl.value = prevUrl   // restore on failure
    toast.error('上传失败：' + (err.message || '未知错误'))
  } finally {
    uploadingImage.value = false
    if (imageFileInputRef.value) imageFileInputRef.value.value = ''
  }
}

// 参考图片
const referenceImageUrl = ref('')      // 服务端绝对 URL（OSS），用于 AI 调用
const referenceImagePreview = ref('')  // 预览用 URL（ObjectURL 或 OSS URL）
const uploadingRef = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

function clearReferenceImage() {
  revokeIfBlob(referenceImagePreview.value)
  referenceImageUrl.value = ''
  referenceImagePreview.value = ''
}

async function handleReferenceUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  // 立即显示本地预览，不依赖服务端 URL
  const localPreview = URL.createObjectURL(file)
  referenceImagePreview.value = localPreview
  uploadingRef.value = true
  try {
    // 使用物品专属上传接口，将参考图 URL 存入 item.reference_image_url
    const data = await itemApi.uploadItemReference(itemId, file)
    referenceImageUrl.value = data.url
    // 若服务端返回了绝对 URL，用于更清晰的预览；否则保留 ObjectURL
    if (data.url.startsWith('http')) {
      URL.revokeObjectURL(localPreview)
      referenceImagePreview.value = data.url
    }
    toast.success('参考图片上传成功')
  } catch (err: any) {
    clearReferenceImage()
    toast.error('上传失败：' + (err.message || '未知错误'))
  } finally {
    uploadingRef.value = false
    if (fileInputRef.value) fileInputRef.value.value = ''
  }
}


// ── Abilities JSON structure ──────────────────────────────────────────────────
interface PowerStat { key: string; value: string }
interface AbilitiesData {
  rarity: string
  acquisition: string
  material: string
  size: string
  condition: string
  magic_element: string
  origin_story: string
  power_stats: PowerStat[]
}

const defaultAbilities: AbilitiesData = {
  rarity: '',
  acquisition: '',
  material: '',
  size: '',
  condition: 'intact',
  magic_element: '',
  origin_story: '',
  power_stats: [],
}

function parseAbilities(raw: string): AbilitiesData {
  try {
    const parsed = JSON.parse(raw || '{}')
    return {
      ...defaultAbilities,
      ...parsed,
      power_stats: Array.isArray(parsed.power_stats) ? parsed.power_stats : [],
    }
  } catch { return { ...defaultAbilities } }
}

function serializeAbilities(data: AbilitiesData): string {
  const obj: Record<string, any> = {}
  if (data.rarity) obj.rarity = data.rarity
  if (data.acquisition) obj.acquisition = data.acquisition
  if (data.material) obj.material = data.material
  if (data.size) obj.size = data.size
  if (data.condition) obj.condition = data.condition
  if (data.magic_element) obj.magic_element = data.magic_element
  if (data.origin_story) obj.origin_story = data.origin_story
  const stats = data.power_stats.filter(s => s.key.trim())
  if (stats.length) obj.power_stats = stats
  return Object.keys(obj).length ? JSON.stringify(obj) : ''
}

// ── Form fields ───────────────────────────────────────────────────────────────
const form = ref({
  name: '',
  category: 'other' as Item['category'],
  status: 'active' as Item['status'],
  description: '',
  appearance: '',
  location: '',
  owner: '',
  significance: '',
  visual_prompt: '',
})

const abilities = ref<AbilitiesData>({ ...defaultAbilities })
const imageUrl = ref('')

const newStatKey = ref('')
const newStatValue = ref('')

function addStat() {
  const k = newStatKey.value.trim()
  if (!k) return
  abilities.value.power_stats.push({ key: k, value: newStatValue.value.trim() })
  newStatKey.value = ''
  newStatValue.value = ''
}

function removeStat(idx: number) {
  abilities.value.power_stats.splice(idx, 1)
}

// ── Options ───────────────────────────────────────────────────────────────────
const categoryOptions = [
  { value: 'weapon',     label: '武器',   icon: '⚔️' },
  { value: 'armor',      label: '防具',   icon: '🛡️' },
  { value: 'treasure',   label: '宝物',   icon: '💎' },
  { value: 'artifact',   label: '法器',   icon: '🔮' },
  { value: 'tool',       label: '工具',   icon: '🔧' },
  { value: 'document',   label: '文书',   icon: '📜' },
  { value: 'consumable', label: '消耗品', icon: '🧪' },
  { value: 'other',      label: '其他',   icon: '📦' },
]

const statusOptions = [
  { value: 'active',    label: '持有中', color: 'text-green-600' },
  { value: 'lost',      label: '已遗失', color: 'text-yellow-600' },
  { value: 'destroyed', label: '已损毁', color: 'text-red-600' },
  { value: 'unknown',   label: '未知',   color: 'text-gray-500' },
]

const rarityOptions = [
  { value: '',          label: '未设置' },
  { value: 'common',    label: '普通',   color: 'bg-gray-100 text-gray-600' },
  { value: 'uncommon',  label: '优良',   color: 'bg-green-100 text-green-700' },
  { value: 'rare',      label: '稀有',   color: 'bg-blue-100 text-blue-700' },
  { value: 'epic',      label: '史诗',   color: 'bg-purple-100 text-purple-700' },
  { value: 'legendary', label: '传说',   color: 'bg-yellow-100 text-yellow-700' },
]

const acquisitionOptions = [
  { value: '',           label: '未知来源' },
  { value: 'found',      label: '捡到 / 发现' },
  { value: 'gift',       label: '赠予' },
  { value: 'purchase',   label: '购买' },
  { value: 'crafted',    label: '锻造 / 制作' },
  { value: 'inherited',  label: '继承' },
  { value: 'stolen',     label: '夺取 / 盗取' },
  { value: 'reward',     label: '奖励 / 战利品' },
]

const conditionOptions = [
  { value: 'intact',   label: '完好无损' },
  { value: 'good',     label: '良好' },
  { value: 'worn',     label: '有所磨损' },
  { value: 'damaged',  label: '损坏' },
  { value: 'broken',   label: '严重破损' },
]

const magicElementOptions = [
  { value: '',        label: '无属性' },
  { value: 'fire',    label: '🔥 火' },
  { value: 'water',   label: '💧 水' },
  { value: 'earth',   label: '🌍 土' },
  { value: 'wind',    label: '🌬️ 风' },
  { value: 'thunder', label: '⚡ 雷' },
  { value: 'ice',     label: '❄️ 冰' },
  { value: 'light',   label: '✨ 光' },
  { value: 'dark',    label: '🌑 暗' },
]

const tabs = [
  { key: 'profile',   label: '基本档案' },
  { key: 'traits',    label: '物品特性' },
  { key: 'narrative', label: '叙事意义' },
  { key: 'image',     label: '图片生成' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function rarityColor(r: string): string {
  return rarityOptions.find(o => o.value === r)?.color ?? 'bg-gray-100 text-gray-500'
}
function rarityLabel(r: string): string {
  return rarityOptions.find(o => o.value === r)?.label ?? ''
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
useUnsavedGuard(isDirty, '物品信息有未保存的修改，确认离开？')
watch([form, abilities], () => { isDirty.value = true }, { deep: true })

onMounted(async () => {
  if (novelId && novelStore.currentNovel?.id !== novelId) {
    novelStore.fetchNovel(novelId).catch(() => {})
  }
  if (!itemId) return
  try {
    const res = await itemApi.getItem(itemId)
    const item: Item = (res as any).data ?? res
    form.value = {
      name: item.name ?? '',
      category: (item.category as any) ?? 'other',
      status: item.status ?? 'active',
      description: item.description ?? '',
      appearance: item.appearance ?? '',
      location: item.location ?? '',
      owner: item.owner ?? '',
      significance: item.significance ?? '',
      visual_prompt: item.visual_prompt ?? '',
    }
    abilities.value = parseAbilities(item.abilities ?? '')
    imageUrl.value = item.image_url ?? ''
    // 恢复已存的参考图（仅绝对 URL 可用于预览和 AI 调用）
    if (item.reference_image_url?.startsWith('http')) {
      referenceImageUrl.value = item.reference_image_url
      referenceImagePreview.value = item.reference_image_url
    }
  } catch (e: any) {
    toast.error('加载物品失败：' + (e.message || '未知错误'))
  }
  await nextTick()
  isDirty.value = false
})

// ── Actions ───────────────────────────────────────────────────────────────────
async function handleSave() {
  if (!form.value.name.trim()) { toast.error('物品名称不能为空'); return }
  saving.value = true
  try {
    await itemApi.updateItem(itemId, {
      ...form.value,
      abilities: serializeAbilities(abilities.value),
    })
    isDirty.value = false
    toast.success('保存成功')
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || '未知错误'))
  } finally {
    saving.value = false
  }
}

async function generateImage() {
  // Save first so the backend has the latest visual_prompt
  await handleSave()
  generatingImage.value = true
  imageTaskStatus.value = 'pending'
  clearImageTaskTimer()
  try {
    const res = await itemApi.generateItemImage(itemId, referenceImageUrl.value || undefined, selectedImageProvider.value || undefined)
    const taskId = (res as any).data?.task_id ?? ''
    if (!taskId) throw new Error('未获取到任务 ID')
    imageTaskId.value = taskId
    toast.info('图片生成任务已提交，AI 正在生成中…')
    imageTaskTimer = setInterval(pollImageTask, 3000)
  } catch (e: any) {
    generatingImage.value = false
    imageTaskStatus.value = 'failed'
    toast.error('图片生成失败：' + (e.message || '未知错误'))
  }
}

function goBack() {
  novelId ? router.push(`/novel/${novelId}?tab=items`) : router.back()
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
            <h1 class="text-xl font-bold text-gray-900 dark:text-white">{{ form.name || '物品详情' }}</h1>
            <span v-if="abilities.rarity" class="text-xs px-2 py-0.5 rounded-full font-medium" :class="rarityColor(abilities.rarity)">
              {{ rarityLabel(abilities.rarity) }}
            </span>
          </div>
          <p class="text-sm text-gray-500">物品编辑器</p>
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
        <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider">基础信息</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <!-- Name -->
          <div class="sm:col-span-2">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">名称 <span class="text-red-500">*</span></label>
            <input v-model="form.name" type="text" class="input" placeholder="物品名称" maxlength="100" />
          </div>
          <!-- Category -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">类别</label>
            <select v-model="form.category" class="input">
              <option v-for="opt in categoryOptions" :key="opt.value" :value="opt.value">
                {{ opt.icon }} {{ opt.label }}
              </option>
            </select>
          </div>
          <!-- Status -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">当前状态</label>
            <select v-model="form.status" class="input">
              <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
        </div>
      </div>

      <div class="card p-6 space-y-5">
        <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider">稀有度 & 来源</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <!-- Rarity -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">稀有度</label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="opt in rarityOptions.slice(1)"
                :key="opt.value"
                type="button"
                class="text-xs px-3 py-1.5 rounded-full border-2 font-medium transition-all"
                :class="abilities.rarity === opt.value
                  ? `${opt.color} border-current`
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'"
                @click="abilities.rarity = abilities.rarity === opt.value ? '' : opt.value"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
          <!-- Acquisition -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">获得方式</label>
            <select v-model="abilities.acquisition" class="input">
              <option v-for="opt in acquisitionOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
          <!-- Location -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">所在位置</label>
            <input v-model="form.location" type="text" class="input" placeholder="当前位置或存放地点" />
          </div>
          <!-- Owner -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">持有者</label>
            <input v-model="form.owner" type="text" class="input" placeholder="当前持有人或归属" />
          </div>
        </div>
      </div>
    </div>

    <!-- ── Tab: 物品特性 ───────────────────────────────────────────────────── -->
    <div v-if="activeTab === 'traits'" class="space-y-4">
      <!-- Physical attributes -->
      <div class="card p-6 space-y-4">
        <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider">外观 & 物理属性</h3>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">材质</label>
            <input v-model="abilities.material" type="text" class="input" placeholder="精铁、龙骨、丝绸…" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">规格 / 尺寸</label>
            <input v-model="abilities.size" type="text" class="input" placeholder="长 120cm、重 2kg…" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">品相</label>
            <select v-model="abilities.condition" class="input">
              <option v-for="opt in conditionOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">外观描述</label>
          <textarea v-model="form.appearance" rows="3" class="input resize-none" placeholder="外形、颜色、纹路、雕刻、散发的气息等视觉细节…" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">功能描述</label>
          <textarea v-model="form.description" rows="3" class="input resize-none" placeholder="用途、使用方式、触发条件、副作用…" />
        </div>
      </div>

      <!-- Magic attributes -->
      <div class="card p-6 space-y-4">
        <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider">魔法 & 能力属性</h3>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">魔法属性</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="opt in magicElementOptions"
              :key="opt.value"
              type="button"
              class="text-xs px-3 py-1.5 rounded-full border transition-all"
              :class="abilities.magic_element === opt.value
                ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30'
                : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'"
              @click="abilities.magic_element = opt.value"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <!-- Power stats editor -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">数值属性</label>
          <div v-if="abilities.power_stats.length" class="mb-3 space-y-2">
            <div
              v-for="(stat, i) in abilities.power_stats"
              :key="i"
              class="flex items-center gap-2"
            >
              <input v-model="stat.key" type="text" class="input flex-1 text-sm" placeholder="属性名" />
              <input v-model="stat.value" type="text" class="input flex-1 text-sm" placeholder="数值" />
              <button type="button" class="p-1.5 text-gray-400 hover:text-red-500 transition-colors" @click="removeStat(i)">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>
          <!-- Add new stat -->
          <div class="flex items-center gap-2">
            <input v-model="newStatKey" type="text" class="input flex-1 text-sm" placeholder="新属性名（如：攻击力）" @keyup.enter="addStat" />
            <input v-model="newStatValue" type="text" class="input flex-1 text-sm" placeholder="数值（如：+100）" @keyup.enter="addStat" />
            <button type="button" class="btn-secondary text-sm px-3" @click="addStat">添加</button>
          </div>
          <p class="mt-1.5 text-xs text-gray-400">适用于武器攻击力、防具防御值、法器法力加成等量化属性</p>
        </div>
      </div>
    </div>

    <!-- ── Tab: 叙事意义 ───────────────────────────────────────────────────── -->
    <div v-if="activeTab === 'narrative'" class="card p-6 space-y-5">
      <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider">故事定位</h3>
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">来历 / 背景故事</label>
        <textarea v-model="abilities.origin_story" rows="4" class="input resize-none" placeholder="物品的锻造历史、传承经过、前任持有者的故事…" />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">叙事意义 & 象征</label>
        <textarea v-model="form.significance" rows="4" class="input resize-none" placeholder="该物品在故事中的象征意义、推动情节的关键作用、与主题的关联…" />
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100 dark:border-gray-700">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">当前位置</label>
          <input v-model="form.location" type="text" class="input" placeholder="当前已知位置" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">持有者</label>
          <input v-model="form.owner" type="text" class="input" placeholder="当前持有者" />
        </div>
      </div>
    </div>

    <!-- ── Tab: 图片生成 ───────────────────────────────────────────────────── -->
    <div v-if="activeTab === 'image'" class="space-y-4">
      <div class="card p-6">
        <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-4">物品图片</h3>

        <!-- Image preview -->
        <div class="flex gap-6 items-start">
          <div class="w-48 h-48 flex-shrink-0 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center border border-gray-200 dark:border-gray-700">
            <img v-if="imageUrl" :src="imageUrl" class="w-full h-full object-cover cursor-zoom-in" alt="物品图片" @click="openLightbox(imageUrl)" />
            <div v-else class="flex flex-col items-center gap-2 text-gray-300">
              <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p class="text-xs">暂无图片</p>
            </div>
          </div>

          <div class="flex-1 space-y-3">
            <div>
              <p class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">生成设置</p>
              <div class="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                <p><span class="text-gray-400">类别：</span>{{ categoryOptions.find(o => o.value === form.category)?.icon }} {{ categoryOptions.find(o => o.value === form.category)?.label }}</p>
                <p v-if="abilities.rarity"><span class="text-gray-400">稀有度：</span>
                  <span class="text-xs px-1.5 py-0.5 rounded" :class="rarityColor(abilities.rarity)">{{ rarityLabel(abilities.rarity) }}</span>
                </p>
                <p v-if="abilities.material"><span class="text-gray-400">材质：</span>{{ abilities.material }}</p>
                <p v-if="abilities.magic_element && abilities.magic_element !== ''">
                  <span class="text-gray-400">属性：</span>{{ magicElementOptions.find(o => o.value === abilities.magic_element)?.label }}
                </p>
              </div>
            </div>
            <!-- 参考图片上传 -->
            <div class="pt-3 border-t border-gray-100 dark:border-gray-700">
              <p class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">参考图片（可选）</p>
              <div v-if="referenceImagePreview" class="flex items-center gap-3 mb-2">
                <img :src="referenceImagePreview" class="w-14 h-14 rounded-lg object-cover border border-gray-200 dark:border-gray-700 flex-shrink-0 cursor-zoom-in" alt="参考图" @click="openLightbox(referenceImagePreview)" />
                <div class="flex-1 min-w-0">
                  <p class="text-xs text-gray-500 truncate">已上传参考图</p>
                  <p class="text-xs text-gray-400">AI 生成时将以此为视觉参考</p>
                </div>
                <button
                  class="text-xs text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                  @click="clearReferenceImage"
                >清除</button>
              </div>
              <div v-else class="flex items-center gap-2">
                <input
                  ref="fileInputRef"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  class="hidden"
                  @change="handleReferenceUpload"
                />
                <button
                  class="btn-secondary text-sm flex items-center gap-1.5"
                  :disabled="uploadingRef"
                  @click="fileInputRef?.click()"
                >
                  <svg v-if="uploadingRef" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  {{ uploadingRef ? '上传中…' : '上传参考图' }}
                </button>
                <p class="text-xs text-gray-400">JPG / PNG / WebP，AI 生成时作为视觉参考</p>
              </div>
            </div>

            <div class="flex flex-wrap gap-2 pt-2">
              <!-- 本地上传 -->
              <input
                ref="imageFileInputRef"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                class="hidden"
                @change="handleImageUpload"
              />
              <button
                class="btn-secondary flex items-center gap-2"
                :disabled="uploadingImage"
                @click="imageFileInputRef?.click()"
              >
                <svg v-if="uploadingImage" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {{ uploadingImage ? '上传中…' : '本地上传' }}
              </button>
              <!-- AI 生成 -->
              <button
                class="btn-primary flex items-center gap-2"
                :disabled="generatingImage || saving"
                @click="generateImage"
              >
                <svg v-if="generatingImage" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {{ generatingImage ? 'AI 生成中…' : (imageUrl ? '重新生成' : 'AI 生成图片') }}
              </button>
              <button v-if="imageUrl" class="btn-secondary text-sm" @click="imageUrl = ''">清除</button>
            </div>
            <!-- 任务状态 -->
            <div v-if="imageTaskStatus !== 'idle'" class="mt-2 text-xs">
              <span v-if="imageTaskStatus === 'pending' || imageTaskStatus === 'running'" class="text-blue-500 flex items-center gap-1">
                <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                AI 正在生成图片，请稍候…
              </span>
              <span v-else-if="imageTaskStatus === 'completed'" class="text-green-500">生成完成</span>
              <span v-else-if="imageTaskStatus === 'failed'" class="text-red-500">生成失败，请重试</span>
            </div>
          </div>
        </div>

        <!-- Visual prompt -->
        <div class="mt-5 space-y-2">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            图片生成提示词
            <span class="ml-1 text-xs font-normal text-gray-400">（留空将根据外观描述自动生成）</span>
          </label>
          <textarea
            v-model="form.visual_prompt"
            rows="4"
            class="input resize-none"
            placeholder="精细描述物品视觉特征，用于 AI 绘图。&#10;例：一顶红色天鹅绒小帽，金色蕾丝边沿，帽顶饰有白色小花，童话水彩风格，柔和光线，白色背景，高清细节…"
          />
          <div class="flex flex-wrap gap-2">
            <span class="text-xs text-gray-400">建议包含：</span>
            <span
              v-for="tip in ['材质纹理', '主色调', '光效', '艺术风格', '背景']"
              :key="tip"
              class="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
              @click="form.visual_prompt += (form.visual_prompt ? '，' : '') + tip + '：'"
            >{{ tip }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
