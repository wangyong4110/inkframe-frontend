<script setup lang="ts">
import type { OutlineReview, OutlineIssue } from '~/types'

const props = defineProps<{
  review: OutlineReview | null
  chapterTitle?: string
}>()

const emit = defineEmits<{
  close: []
}>()

// Parse JSON fields safely
const issues = computed<OutlineIssue[]>(() => {
  if (!props.review?.issues_json) return []
  try { return JSON.parse(props.review.issues_json) } catch { return [] }
})

const highlights = computed<string[]>(() => {
  if (!props.review?.highlights_json) return []
  try { return JSON.parse(props.review.highlights_json) } catch { return [] }
})

// Dimension display config
const dimensions = [
  { key: 'structure_score', label: '结构完整性', icon: '🏗️' },
  { key: 'pacing_score', label: '节奏控制', icon: '🎵' },
  { key: 'continuity_score', label: '前后连贯', icon: '🔗' },
  { key: 'character_score', label: '人物塑造', icon: '👤' },
  { key: 'conflict_score', label: '冲突设计', icon: '⚡' },
  { key: 'hook_score', label: '钩子效果', icon: '🎣' },
] as const

function scoreColor(score: number) {
  if (score >= 80) return 'text-green-600 dark:text-green-400'
  if (score >= 60) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

function scoreBarColor(score: number) {
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-yellow-500'
  return 'bg-red-500'
}

function statusLabel(status: string) {
  return { passed: '通过', warning: '需改进', failed: '问题较多', reviewing: '审查中', pending: '待审查' }[status] ?? status
}

function statusBadgeClass(status: string) {
  return {
    passed: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    warning: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
    failed: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    reviewing: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    pending: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
  }[status] ?? ''
}

function severityIcon(severity: string) {
  return { error: '🔴', warning: '🟡', info: '🔵' }[severity] ?? '⚪'
}

function dimensionLabel(dim: string) {
  return { structure: '结构', pacing: '节奏', continuity: '连贯', character: '人物', conflict: '冲突', hook: '钩子' }[dim] ?? dim
}
</script>

<template>
  <div v-if="review" class="fixed inset-0 z-50 flex justify-end" @click.self="emit('close')">
    <div class="w-full max-w-xl bg-white dark:bg-gray-900 shadow-2xl flex flex-col h-full overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <div>
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">大纲审查报告</h2>
          <p v-if="chapterTitle" class="text-sm text-gray-500 dark:text-gray-400">{{ chapterTitle }}</p>
        </div>
        <button class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg" @click="emit('close')">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-6 space-y-6">
        <!-- Overall score -->
        <div class="flex items-center gap-4">
          <div class="relative w-20 h-20 flex-shrink-0">
            <svg class="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="32" fill="none" stroke="currentColor" stroke-width="8" class="text-gray-200 dark:text-gray-700"/>
              <circle cx="40" cy="40" r="32" fill="none" stroke="currentColor" stroke-width="8"
                :stroke-dasharray="`${(review.overall_score / 100) * 201} 201`"
                :class="scoreColor(review.overall_score)"
                stroke-linecap="round"/>
            </svg>
            <div class="absolute inset-0 flex items-center justify-center">
              <span class="text-xl font-bold" :class="scoreColor(review.overall_score)">{{ Math.round(review.overall_score) }}</span>
            </div>
          </div>
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-sm font-medium text-gray-900 dark:text-white">综合评分</span>
              <span class="text-xs px-2 py-0.5 rounded-full font-medium" :class="statusBadgeClass(review.status)">{{ statusLabel(review.status) }}</span>
            </div>
            <p v-if="review.reviewed_at" class="text-xs text-gray-400">审查时间：{{ new Date(review.reviewed_at).toLocaleString('zh-CN') }}</p>
          </div>
        </div>

        <!-- Six-dimension scores -->
        <div>
          <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">六维评分</h3>
          <div class="space-y-2.5">
            <div v-for="dim in dimensions" :key="dim.key" class="flex items-center gap-3">
              <span class="text-base w-6">{{ dim.icon }}</span>
              <span class="text-sm text-gray-600 dark:text-gray-400 w-20 flex-shrink-0">{{ dim.label }}</span>
              <div class="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div class="h-2 rounded-full transition-all" :class="scoreBarColor((review as any)[dim.key])" :style="`width:${(review as any)[dim.key]}%`"/>
              </div>
              <span class="text-sm font-medium w-8 text-right" :class="scoreColor((review as any)[dim.key])">{{ Math.round((review as any)[dim.key]) }}</span>
            </div>
          </div>
        </div>

        <!-- Highlights -->
        <div v-if="highlights.length > 0">
          <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">✨ 亮点</h3>
          <ul class="space-y-1.5">
            <li v-for="(h, i) in highlights" :key="i" class="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
              <span class="text-green-500 mt-0.5 flex-shrink-0">✓</span>
              <span>{{ h }}</span>
            </li>
          </ul>
        </div>

        <!-- Issues -->
        <div v-if="issues.length > 0">
          <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">📋 问题诊断（{{ issues.length }}条）</h3>
          <div class="space-y-3">
            <div v-for="(issue, i) in issues" :key="i"
              class="rounded-lg border p-3 text-sm"
              :class="{
                'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20': issue.severity === 'error',
                'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20': issue.severity === 'warning',
                'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20': issue.severity === 'info',
              }">
              <div class="flex items-center gap-2 mb-1">
                <span>{{ severityIcon(issue.severity) }}</span>
                <span class="font-medium text-gray-800 dark:text-gray-200">{{ dimensionLabel(issue.dimension) }}</span>
                <span class="text-xs text-gray-500 dark:text-gray-400 ml-auto">{{ { error: '阻塞', warning: '改进', info: '优化' }[issue.severity] }}</span>
              </div>
              <p class="text-gray-700 dark:text-gray-300 mb-1.5">{{ issue.description }}</p>
              <p class="text-gray-500 dark:text-gray-400 text-xs">💡 {{ issue.suggestion }}</p>
            </div>
          </div>
        </div>

        <!-- Overall suggestion -->
        <div v-if="review.suggestion">
          <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">📝 综合建议</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed bg-gray-50 dark:bg-gray-800 rounded-lg p-3">{{ review.suggestion }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
