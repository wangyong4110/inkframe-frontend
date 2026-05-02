<template>
  <div class="space-y-4">
    <!-- SVG Chart -->
    <div class="relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 overflow-x-auto">
      <svg
        v-if="points.length > 0"
        :width="svgWidth"
        :height="svgHeight"
        class="min-w-full"
        @mouseleave="tooltip = null"
      >
        <!-- Act background zones -->
        <rect
          v-for="zone in actZones"
          :key="zone.act"
          :x="zone.x"
          :y="0"
          :width="zone.width"
          :height="svgHeight - paddingBottom"
          :fill="zone.fill"
          opacity="0.12"
        />
        <!-- Act labels -->
        <text
          v-for="zone in actZones"
          :key="'label-' + zone.act"
          :x="zone.x + zone.width / 2"
          :y="14"
          text-anchor="middle"
          class="text-xs fill-gray-400"
          font-size="11"
        >
          第{{ zone.act }}幕
        </text>

        <!-- Y-axis gridlines -->
        <g v-for="level in [2, 4, 6, 8, 10]" :key="level">
          <line
            :x1="paddingLeft"
            :y1="yPos(level)"
            :x2="svgWidth - paddingRight"
            :y2="yPos(level)"
            stroke="#e5e7eb"
            stroke-width="1"
            stroke-dasharray="4,4"
          />
          <text
            :x="paddingLeft - 6"
            :y="yPos(level) + 4"
            text-anchor="end"
            font-size="10"
            class="fill-gray-400"
          >{{ level }}</text>
        </g>

        <!-- Polyline -->
        <polyline
          v-if="polylinePoints"
          :points="polylinePoints"
          fill="none"
          stroke="#6366f1"
          stroke-width="2.5"
          stroke-linejoin="round"
          stroke-linecap="round"
        />

        <!-- Data points -->
        <circle
          v-for="(p, i) in points"
          :key="i"
          :cx="xPos(i)"
          :cy="yPos(p.tension_level)"
          r="5"
          :fill="tensionColor(p.tension_level)"
          stroke="white"
          stroke-width="2"
          class="cursor-pointer"
          @mouseenter="showTooltip($event, p, i)"
        />

        <!-- X-axis chapter labels (every 5 or fewer) -->
        <g v-for="(p, i) in points" :key="'x-' + i">
          <text
            v-if="i === 0 || (p.chapter_no % Math.max(1, Math.floor(points.length / 10))) === 0 || i === points.length - 1"
            :x="xPos(i)"
            :y="svgHeight - paddingBottom + 16"
            text-anchor="middle"
            font-size="10"
            class="fill-gray-400"
          >{{ p.chapter_no }}</text>
        </g>

        <!-- X-axis label -->
        <text
          :x="svgWidth / 2"
          :y="svgHeight - 2"
          text-anchor="middle"
          font-size="11"
          class="fill-gray-400"
        >章节号</text>

        <!-- Tooltip -->
        <g v-if="tooltip">
          <rect
            :x="tooltipX"
            :y="tooltipY"
            :width="tooltipWidth"
            height="48"
            rx="6"
            fill="#1f2937"
            opacity="0.92"
          />
          <text :x="tooltipX + 8" :y="tooltipY + 16" font-size="11" fill="white">
            第{{ tooltip.chapter_no }}章 · 张力{{ tooltip.tension_level }}/10
          </text>
          <text :x="tooltipX + 8" :y="tooltipY + 32" font-size="10" fill="#9ca3af">
            {{ tooltip.title || '(无标题)' }}
          </text>
          <text :x="tooltipX + 8" :y="tooltipY + 44" font-size="10" fill="#9ca3af">
            {{ tooltip.emotional_tone || '' }}
          </text>
        </g>
      </svg>

      <div v-else class="py-12 text-center text-gray-400 text-sm">
        暂无章节数据，生成章节后即可查看节奏曲线
      </div>
    </div>

    <!-- Health warnings -->
    <div v-if="health && health.warnings && health.warnings.length > 0" class="space-y-2">
      <div
        v-for="(w, i) in health.warnings"
        :key="i"
        class="flex items-start gap-3 p-3 rounded-lg"
        :class="warningClass(w.type)"
      >
        <span class="mt-0.5 text-sm font-medium shrink-0">
          {{ warningIcon(w.type) }}
        </span>
        <div class="text-sm">
          <span class="font-medium">{{ w.message }}</span>
          <span v-if="w.chapters && w.chapters.length" class="ml-2 text-xs opacity-70">
            (章节: {{ w.chapters.join(', ') }})
          </span>
        </div>
      </div>
    </div>

    <div v-else-if="health" class="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-green-700 dark:text-green-400 text-sm">
      <span>✓</span>
      <span>节奏健康，无明显问题</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PacingPoint, PacingHealth, PacingWarning } from '~/composables/usePacingApi'

const props = defineProps<{
  points: PacingPoint[]
  health: PacingHealth | null
}>()

const paddingLeft = 36
const paddingRight = 16
const paddingTop = 24
const paddingBottom = 28
const pointSpacing = 40

const svgHeight = 200

const svgWidth = computed(() => {
  const w = paddingLeft + paddingRight + Math.max(props.points.length - 1, 0) * pointSpacing + 20
  return Math.max(w, 400)
})

function xPos(index: number) {
  return paddingLeft + index * pointSpacing
}

function yPos(tension: number) {
  const chartH = svgHeight - paddingTop - paddingBottom
  return paddingTop + chartH - (tension / 10) * chartH
}

const polylinePoints = computed(() => {
  if (props.points.length === 0) return ''
  return props.points.map((p, i) => `${xPos(i)},${yPos(p.tension_level)}`).join(' ')
})

// Act zones
const actZones = computed(() => {
  if (props.points.length === 0) return []
  const actMap = new Map<number, { start: number; end: number }>()
  props.points.forEach((p, i) => {
    const act = p.act_no || 1
    if (!actMap.has(act)) actMap.set(act, { start: i, end: i })
    else actMap.get(act)!.end = i
  })
  const actColors: Record<number, string> = { 1: '#6b7280', 2: '#3b82f6', 3: '#ef4444' }
  return Array.from(actMap.entries()).map(([act, range]) => ({
    act,
    x: xPos(range.start),
    width: xPos(range.end) - xPos(range.start) + pointSpacing / 2,
    fill: actColors[act] ?? '#6b7280',
  }))
})

function tensionColor(level: number) {
  if (level <= 3) return '#10b981'
  if (level <= 6) return '#f59e0b'
  if (level <= 8) return '#f97316'
  return '#ef4444'
}

// Tooltip
const tooltip = ref<PacingPoint | null>(null)
const tooltipX = ref(0)
const tooltipY = ref(0)
const tooltipWidth = 180

function showTooltip(event: MouseEvent, p: PacingPoint, i: number) {
  tooltip.value = p
  let tx = xPos(i) + 10
  if (tx + tooltipWidth > svgWidth.value - paddingRight) {
    tx = xPos(i) - tooltipWidth - 10
  }
  tooltipX.value = tx
  tooltipY.value = Math.max(paddingTop, yPos(p.tension_level) - 30)
}

// Warning styling
function warningClass(type: PacingWarning['type']) {
  switch (type) {
    case 'consecutive_low': return 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300'
    case 'consecutive_high': return 'bg-orange-50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-300'
    case 'no_midpoint': return 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
    case 'no_satisfaction': return 'bg-purple-50 dark:bg-purple-900/20 text-purple-800 dark:text-purple-300'
    default: return 'bg-gray-50 dark:bg-gray-900/20 text-gray-700'
  }
}

function warningIcon(type: PacingWarning['type']) {
  switch (type) {
    case 'consecutive_low': return '⚠️ 低张力警告'
    case 'consecutive_high': return '🔥 高张力疲劳'
    case 'no_midpoint': return '❌ 缺少中段反转'
    case 'no_satisfaction': return '💔 缺少爽点'
    default: return '⚠️ 警告'
  }
}
</script>
