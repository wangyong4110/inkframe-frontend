<script setup lang="ts">
/**
 * ImageCropModal — 图片裁剪弹窗
 *
 * 专为从三视图裁剪面部参考图设计：
 *   - 默认选取 Panel 1（左 1/4，面部特写格）
 *   - 四格快速选择按钮
 *   - 拖动矩形自定义裁剪区域（拖内部移动，拖四角缩放）
 *   - 右侧实时预览
 *   - 确认后上传至 OSS，emit('done', url)
 *
 * imageUrl 通常是 OSS 直链，经 /media/proxy 转成同源 blob: URL 后再显示/裁剪——
 * 避免依赖 OSS 侧 CORS 配置（否则 <img crossorigin> 可能直接加载失败，画面空白）。
 */
const props = defineProps<{
  imageUrl: string
  panelCount?: number   // 默认 4（三视图 4 格）
}>()

const emit = defineEmits<{
  done: [url: string]
  cancel: []
}>()

const { uploading, uploadImage } = useImageUpload()
const { requestBlob } = useApi()

const imgRef = ref<HTMLImageElement | null>(null)
const previewCanvas = ref<HTMLCanvasElement | null>(null)
const wrapperRef = ref<HTMLDivElement | null>(null)

const naturalW = ref(0)
const naturalH = ref(0)
const displayW = ref(0)
const displayH = ref(0)

const panels = computed(() => props.panelCount ?? 4)

// crop rect in display-pixel coords
const crop = ref({ x: 0, y: 0, w: 0, h: 0 })

// ── 图片加载：走后端代理转成同源 blob: URL ──────────────────────────────────────
// imageUrl 通常指向 OSS，直接用 <img crossorigin> 加载依赖 OSS 侧 CORS 配置——一旦没配置，
// <img> 会整个加载失败（页面显示空白），而不仅仅是后面 canvas 读像素时报错。
// 经 /media/proxy 中转后拿到的是与本页面同源的二进制数据，不再受浏览器跨域限制。
const displaySrc = ref('')
const loadError = ref('')
let objectUrl = ''

function revokeObjectUrl() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = ''
  }
}

async function loadImage(url: string) {
  loadError.value = ''
  displaySrc.value = ''
  if (!url) return
  try {
    const blob = await requestBlob(`/media/proxy?url=${encodeURIComponent(url)}`)
    revokeObjectUrl()
    objectUrl = URL.createObjectURL(blob)
    displaySrc.value = objectUrl
  } catch (e: any) {
    loadError.value = e?.message || '图片加载失败'
  }
}

watch(() => props.imageUrl, (url) => { loadImage(url) }, { immediate: true })

onUnmounted(() => { revokeObjectUrl() })

function onImageLoad() {
  const img = imgRef.value
  if (!img) return
  naturalW.value = img.naturalWidth
  naturalH.value = img.naturalHeight
  displayW.value = img.offsetWidth
  displayH.value = img.offsetHeight
  selectPanel(0)
}

function selectPanel(idx: number) {
  const pw = displayW.value / panels.value
  crop.value = { x: idx * pw, y: 0, w: pw, h: displayH.value }
  drawPreview()
}

// Convert display coords to natural image coords
function toNatural() {
  const sx = naturalW.value / displayW.value
  const sy = naturalH.value / displayH.value
  return {
    x: Math.round(crop.value.x * sx),
    y: Math.round(crop.value.y * sy),
    w: Math.round(crop.value.w * sx),
    h: Math.round(crop.value.h * sy),
  }
}

function drawPreview() {
  const canvas = previewCanvas.value
  const img = imgRef.value
  if (!canvas || !img || !naturalW.value) return
  const nc = toNatural()
  if (nc.w <= 0 || nc.h <= 0) return
  const ratio = nc.w / nc.h
  const pw = 144
  const ph = Math.round(pw / ratio)
  canvas.width = pw
  canvas.height = ph
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, pw, ph)
  ctx.drawImage(img, nc.x, nc.y, nc.w, nc.h, 0, 0, pw, ph)
}

// ── Drag ──────────────────────────────────────────────────────────────────────

type DragMode = 'move' | 'tl' | 'tr' | 'bl' | 'br'
let dragMode: DragMode | null = null
let startX = 0
let startY = 0
let snapshot = { x: 0, y: 0, w: 0, h: 0 }
const MIN = 40

function startDrag(e: MouseEvent, mode: DragMode) {
  e.preventDefault()
  dragMode = mode
  startX = e.clientX
  startY = e.clientY
  snapshot = { ...crop.value }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', stopDrag)
}

function onMove(e: MouseEvent) {
  if (!dragMode) return
  const dx = e.clientX - startX
  const dy = e.clientY - startY
  const s = snapshot
  const maxX = displayW.value
  const maxY = displayH.value
  let { x, y, w, h } = s

  if (dragMode === 'move') {
    x = Math.max(0, Math.min(s.x + dx, maxX - w))
    y = Math.max(0, Math.min(s.y + dy, maxY - h))
  } else if (dragMode === 'tl') {
    const nx = Math.max(0, Math.min(s.x + dx, s.x + s.w - MIN))
    const ny = Math.max(0, Math.min(s.y + dy, s.y + s.h - MIN))
    w = s.x + s.w - nx; h = s.y + s.h - ny; x = nx; y = ny
  } else if (dragMode === 'tr') {
    const ny = Math.max(0, Math.min(s.y + dy, s.y + s.h - MIN))
    w = Math.max(MIN, Math.min(s.w + dx, maxX - s.x))
    h = s.y + s.h - ny; y = ny
  } else if (dragMode === 'bl') {
    const nx = Math.max(0, Math.min(s.x + dx, s.x + s.w - MIN))
    w = s.x + s.w - nx; h = Math.max(MIN, Math.min(s.h + dy, maxY - s.y)); x = nx
  } else if (dragMode === 'br') {
    w = Math.max(MIN, Math.min(s.w + dx, maxX - s.x))
    h = Math.max(MIN, Math.min(s.h + dy, maxY - s.y))
  }

  crop.value = { x, y, w, h }
  drawPreview()
}

function stopDrag() {
  dragMode = null
  window.removeEventListener('mousemove', onMove)
  window.removeEventListener('mouseup', stopDrag)
}

onUnmounted(() => {
  window.removeEventListener('mousemove', onMove)
  window.removeEventListener('mouseup', stopDrag)
})

// ── Confirm ───────────────────────────────────────────────────────────────────

const confirmError = ref('')

async function handleConfirm() {
  const img = imgRef.value
  if (!img) return
  confirmError.value = ''

  const nc = toNatural()
  if (nc.w <= 0 || nc.h <= 0) return

  const canvas = document.createElement('canvas')
  canvas.width = nc.w
  canvas.height = nc.h
  const ctx = canvas.getContext('2d')!
  try {
    ctx.drawImage(img, nc.x, nc.y, nc.w, nc.h, 0, 0, nc.w, nc.h)
  } catch {
    confirmError.value = '图片处理失败，请重新打开裁剪窗口重试'
    return
  }

  const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.92))
  if (!blob) { confirmError.value = '裁剪失败'; return }

  try {
    const file = new File([blob], 'portrait.jpg', { type: 'image/jpeg' })
    const url = await uploadImage(file)
    emit('done', url)
  } catch (e: any) {
    confirmError.value = e.message || '上传失败'
  }
}
</script>

<template>
  <div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/70" @click="emit('cancel')" />
    <div class="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">

      <!-- Header -->
      <div class="px-6 pt-5 pb-3 flex-shrink-0 flex items-start justify-between">
        <div>
          <h3 class="font-semibold text-gray-900 dark:text-white text-base">裁剪面部参考图</h3>
          <p class="text-xs text-gray-400 mt-0.5">拖动选框内部移动，拖四角缩放；或用下方快速选格按钮</p>
        </div>
        <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1" @click="emit('cancel')">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="px-6 pb-4 flex gap-4 flex-1 min-h-0">

        <!-- Crop area -->
        <div class="flex-1 min-w-0 flex flex-col gap-2">
          <!-- Panel quick-select -->
          <div class="flex gap-1.5">
            <button
              v-for="i in panels"
              :key="i"
              class="text-xs px-2.5 py-1 rounded border transition-colors"
              :class="Math.abs(crop.x - (i - 1) * (displayW / panels)) < 2
                ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-violet-400'"
              @click="selectPanel(i - 1)"
            >
              格 {{ i }}{{ i === 1 ? '（面部）' : '' }}
            </button>
          </div>

          <!-- Image + crop overlay -->
          <div
            ref="wrapperRef"
            class="relative flex-1 overflow-hidden rounded-lg bg-black select-none"
            style="min-height: 120px;"
          >
            <img
              v-if="displaySrc"
              ref="imgRef"
              :src="displaySrc"
              class="block w-full h-auto"
              draggable="false"
              @load="onImageLoad"
            />
            <div v-else class="flex items-center justify-center h-full min-h-[200px] text-xs text-gray-400">
              {{ loadError || '图片加载中…' }}
            </div>

            <!-- Dark overlay: 4 rects surrounding crop rect -->
            <template v-if="displayW > 0">
              <!-- top -->
              <div class="absolute bg-black/55 pointer-events-none"
                :style="{ top: 0, left: 0, width: `${displayW}px`, height: `${crop.y}px` }" />
              <!-- bottom -->
              <div class="absolute bg-black/55 pointer-events-none"
                :style="{ top: `${crop.y + crop.h}px`, left: 0, width: `${displayW}px`, bottom: 0 }" />
              <!-- left -->
              <div class="absolute bg-black/55 pointer-events-none"
                :style="{ top: `${crop.y}px`, left: 0, width: `${crop.x}px`, height: `${crop.h}px` }" />
              <!-- right -->
              <div class="absolute bg-black/55 pointer-events-none"
                :style="{ top: `${crop.y}px`, left: `${crop.x + crop.w}px`, right: 0, height: `${crop.h}px` }" />

              <!-- Crop border + drag handle -->
              <div
                class="absolute border-2 border-white/90 cursor-move"
                :style="{ top: `${crop.y}px`, left: `${crop.x}px`, width: `${crop.w}px`, height: `${crop.h}px` }"
                @mousedown="startDrag($event, 'move')"
              >
                <!-- rule-of-thirds grid lines -->
                <div class="absolute inset-0 pointer-events-none opacity-40">
                  <div class="absolute top-1/3 left-0 right-0 h-px bg-white" />
                  <div class="absolute top-2/3 left-0 right-0 h-px bg-white" />
                  <div class="absolute left-1/3 top-0 bottom-0 w-px bg-white" />
                  <div class="absolute left-2/3 top-0 bottom-0 w-px bg-white" />
                </div>
                <!-- Corner handles -->
                <div v-for="[corner, cls] in [['tl','top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize'],['tr','top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize'],['bl','bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize'],['br','bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize']]"
                  :key="corner"
                  class="absolute w-3 h-3 bg-white rounded-sm shadow"
                  :class="cls"
                  @mousedown.stop="startDrag($event, corner as any)"
                />
              </div>
            </template>
          </div>
        </div>

        <!-- Preview panel -->
        <div class="w-36 flex-shrink-0 flex flex-col gap-2 pt-8">
          <p class="text-xs text-gray-500 dark:text-gray-400 font-medium">裁剪预览</p>
          <canvas
            ref="previewCanvas"
            class="rounded-lg border border-gray-200 dark:border-gray-600 w-full bg-gray-100 dark:bg-gray-700"
          />
          <p class="text-[10px] text-gray-400">
            {{ Math.round(toNatural().w) }} × {{ Math.round(toNatural().h) }} px
          </p>
        </div>

      </div>

      <!-- Error -->
      <p v-if="confirmError" class="px-6 pb-2 text-xs text-red-500">{{ confirmError }}</p>

      <!-- Footer -->
      <div class="px-6 py-4 flex-shrink-0 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
        <button class="btn-secondary" @click="emit('cancel')">取消</button>
        <button
          class="btn-primary flex items-center gap-1.5"
          :disabled="uploading"
          @click="handleConfirm"
        >
          <svg v-if="uploading" class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {{ uploading ? '上传中…' : '确认裁剪' }}
        </button>
      </div>

    </div>
  </div>
</template>
