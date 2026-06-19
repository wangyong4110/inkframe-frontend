<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between flex-wrap gap-2">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white">伏笔管理</h3>
      <div class="flex gap-2">
        <button @click="handleAIExtract" :disabled="extracting" class="btn-secondary text-sm">
          <svg v-if="extracting" class="animate-spin w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          {{ extracting ? '提取中...' : 'AI 提取' }}
        </button>
        <button @click="openCreate" class="btn-primary text-sm">
          <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          新建伏笔
        </button>
      </div>
    </div>

    <!-- Stats Bar -->
    <div v-if="!loading && items.length > 0" class="space-y-2">
      <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-center">
          <div class="text-lg font-bold text-gray-900 dark:text-white">{{ items.length }}</div>
          <div class="text-xs text-gray-500">全部</div>
        </div>
        <div class="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800 px-3 py-2 text-center">
          <div class="text-lg font-bold text-yellow-700 dark:text-yellow-400">{{ plantedCount }}</div>
          <div class="text-xs text-yellow-600 dark:text-yellow-500">未兑现</div>
        </div>
        <div class="bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 px-3 py-2 text-center">
          <div class="text-lg font-bold text-green-700 dark:text-green-400">{{ paidCount }}</div>
          <div class="text-xs text-green-600 dark:text-green-500">已兑现</div>
        </div>
        <div class="bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 px-3 py-2 text-center">
          <div class="text-lg font-bold text-red-700 dark:text-red-400">{{ overdueCount }}</div>
          <div class="text-xs text-red-600 dark:text-red-500">已超期</div>
        </div>
        <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-center">
          <div class="text-lg font-bold text-gray-500 dark:text-gray-400">{{ abandonedCount }}</div>
          <div class="text-xs text-gray-400">已放弃</div>
        </div>
      </div>
      <!-- Narrative Debt Gauge -->
      <div v-if="stats" class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-xs text-gray-500 dark:text-gray-400">叙事债务率</span>
          <span class="text-xs font-semibold" :class="narrativeDebtTextColor">
            {{ Math.round(narrativeDebt * 100) }}%
            <span class="font-normal ml-1 opacity-75">{{ narrativeDebtHint }}</span>
          </span>
        </div>
        <div class="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div class="h-full rounded-full transition-all duration-500" :class="narrativeDebtBarColor" :style="`width: ${Math.round(narrativeDebt * 100)}%`" />
        </div>
      </div>
    </div>

    <!-- Overdue / Abandoned Warnings -->
    <div v-if="overdueItems.length > 0" class="rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 px-4 py-3">
      <div class="flex items-center gap-2 mb-1.5">
        <svg class="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
        <span class="text-sm font-medium text-red-700 dark:text-red-400">{{ overdueItems.length }} 条伏笔已超期未兑现</span>
      </div>
      <ul class="space-y-0.5">
        <li v-for="f in overdueItems" :key="f.id" class="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
          <span class="font-medium">《{{ f.title }}》</span>
          <span class="text-red-400">埋于第{{ f.planted_chapter_no }}章，计划第{{ f.payoff_chapter_no }}章兑现，已逾期 {{ currentChapterNo - f.payoff_chapter_no }} 章</span>
        </li>
      </ul>
    </div>
    <div v-if="abandonedItems.length > 0" class="rounded-lg border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20 px-4 py-3">
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
        <span class="text-sm font-medium text-orange-700 dark:text-orange-400">{{ abandonedItems.length }} 条伏笔被放弃——建议说明原因或改为补救兑现</span>
      </div>
    </div>

    <!-- View toggle + Filters -->
    <div v-if="!loading && items.length > 0" class="flex items-center gap-2 flex-wrap">
      <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 text-xs">
        <button v-for="tab in statusTabs" :key="tab.value" @click="statusFilter = tab.value"
          :class="['px-2.5 py-1 transition-colors', statusFilter === tab.value ? 'bg-primary-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50']">
          {{ tab.label }}<span v-if="tab.count > 0" class="ml-1 opacity-70">{{ tab.count }}</span>
        </button>
      </div>
      <select v-model="levelFilter" class="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
        <option value="">全部层级</option>
        <option v-for="(l, k) in LEVEL_LABELS" :key="k" :value="k">{{ l }}</option>
      </select>
      <select v-model="typeFilter" class="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
        <option value="">全部类型</option>
        <option v-for="(l, k) in TYPE_LABELS" :key="k" :value="k">{{ l }}</option>
      </select>
      <select v-model="confidenceFilter" class="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
        <option value="">全部把握</option>
        <option v-for="(l, k) in CONFIDENCE_LABELS" :key="k" :value="k">{{ l }}</option>
      </select>
      <div class="ml-auto flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 text-xs">
        <button @click="viewMode = 'list'" :class="['px-2.5 py-1 transition-colors', viewMode==='list' ? 'bg-primary-600 text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700/50']">列表</button>
        <button @click="viewMode = 'timeline'" :class="['px-2.5 py-1 transition-colors', viewMode==='timeline' ? 'bg-primary-600 text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700/50']">时间轴</button>
        <button @click="viewMode = 'tree'" :class="['px-2.5 py-1 transition-colors', viewMode==='tree' ? 'bg-primary-600 text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700/50']">树形</button>
      </div>
    </div>

    <!-- Loading / Empty -->
    <div v-if="loading" class="text-center py-8 text-gray-400 text-sm">加载中…</div>
    <div v-else-if="items.length === 0" class="card p-8 text-center">
      <p class="text-gray-500 dark:text-gray-400 text-sm mb-3">还没有伏笔记录，点击"新建伏笔"或让 AI 自动提取</p>
      <button @click="openCreate" class="btn-primary text-sm mx-auto">新建伏笔</button>
    </div>

    <!-- List View -->
    <div v-else-if="viewMode === 'list'" class="space-y-1.5">
      <div v-if="displayList.length === 0" class="text-center py-6 text-gray-400 text-sm">该筛选条件下暂无伏笔</div>
      <div v-for="item in displayList" :key="item.id">
        <div :class="[
          'flex items-stretch bg-white dark:bg-gray-800 border rounded-lg overflow-hidden hover:shadow-soft transition-shadow',
          isOverdue(item) ? 'border-red-300 dark:border-red-700' : item.status === 'abandoned' ? 'border-orange-300 dark:border-orange-700' : 'border-gray-200 dark:border-gray-700'
        ]">
          <!-- Status stripe -->
          <div class="w-1 shrink-0" :class="statusStripe(item)" />
          <!-- Content -->
          <div class="flex-1 px-3 py-2.5 min-w-0 space-y-1">
            <!-- Title row -->
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="font-medium text-gray-900 dark:text-white truncate">{{ item.title || '（无标题）' }}</span>
              <span v-if="item.level" class="text-xs px-1.5 py-0.5 rounded shrink-0" :class="levelClass(item.level)">{{ LEVEL_LABELS[item.level] ?? item.level }}</span>
              <span v-if="item.foreshadow_type" class="text-xs px-1.5 py-0.5 rounded shrink-0 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">{{ TYPE_LABELS[item.foreshadow_type] ?? item.foreshadow_type }}</span>
              <span class="text-xs px-1.5 py-0.5 rounded-full shrink-0" :class="statusClass(item.status)">{{ statusLabel(item.status) }}</span>
              <span v-if="item.confidence" class="text-xs px-1.5 py-0.5 rounded shrink-0" :class="confidenceClass(item.confidence!)">{{ CONFIDENCE_LABELS[item.confidence!] }}</span>
              <span v-if="isOverdue(item)" class="text-xs px-1.5 py-0.5 rounded shrink-0 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">⚠ 已超期</span>
              <span v-if="item.parent_id" class="text-xs px-1.5 py-0.5 rounded shrink-0 bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">子伏笔</span>
              <span v-if="hasChildren(item.id)" class="text-xs px-1.5 py-0.5 rounded shrink-0 bg-indigo-50 text-indigo-500 dark:bg-indigo-900/20 dark:text-indigo-500">↳ {{ getChildren(item.id).length }} 支线</span>
            </div>
            <!-- Description -->
            <p v-if="item.description" class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{{ item.description }}</p>
            <!-- Meta info -->
            <div class="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
              <span v-if="item.planted_chapter_no > 0">埋于第 {{ item.planted_chapter_no }} 章</span>
              <span v-if="item.payoff_chapter_no > 0" :class="isOverdue(item) ? 'text-red-500' : ''">计划第 {{ item.payoff_chapter_no }} 章兑现</span>
              <span v-if="item.actual_payoff_chapter_no > 0" class="text-green-600 dark:text-green-400">✓ 第 {{ item.actual_payoff_chapter_no }} 章已兑现</span>
              <span v-if="item.payoff_quality && item.payoff_quality > 0" class="text-yellow-500">{{ '★'.repeat(item.payoff_quality) }}{{ '☆'.repeat(5 - item.payoff_quality) }}</span>
              <span v-if="reinforceCount(item) > 0" class="text-blue-400">强化 ×{{ reinforceCount(item) }}</span>
              <span v-if="item.tags" class="truncate">{{ item.tags }}</span>
            </div>
            <!-- Actions + Reinforce toggle -->
            <div class="flex items-center gap-1 pt-0.5">
              <button v-if="item.status === 'planted'" @click="markPaidOff(item)" class="text-xs px-2 py-0.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/40 rounded transition-colors">✓ 兑现</button>
              <button @click="editItem(item)" class="text-xs px-2 py-0.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/40 rounded transition-colors">编辑</button>
              <button @click="deleteItem(item.id)" class="text-xs px-2 py-0.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/40 rounded transition-colors">删除</button>
              <button @click="toggleReinforce(item.id)" class="ml-auto text-xs px-2 py-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded transition-colors flex items-center gap-1">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                强化记录
                <svg class="w-3 h-3 transition-transform" :class="expandedReinforceId === item.id ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
              </button>
            </div>
          </div>
        </div>
        <!-- Reinforcement expand section -->
        <div v-if="expandedReinforceId === item.id" class="ml-4 mr-1 mt-0.5 mb-1 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 px-3 py-2.5 space-y-2">
          <div class="text-xs font-medium text-gray-500 dark:text-gray-400">强化记录（{{ parseReinforcements(item.reinforcement_chapters).length }} 次）</div>
          <div v-if="parseReinforcements(item.reinforcement_chapters).length === 0" class="text-xs text-gray-400">暂无强化记录</div>
          <div v-for="r in parseReinforcements(item.reinforcement_chapters)" :key="r.chapter_no" class="flex items-start gap-2 text-xs">
            <span class="shrink-0 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">第{{ r.chapter_no }}章</span>
            <span class="text-gray-600 dark:text-gray-300">{{ r.note || '（无备注）' }}</span>
          </div>
          <!-- Add reinforce form -->
          <div class="flex items-center gap-2 pt-1 border-t border-gray-200 dark:border-gray-700">
            <input v-model.number="reinforceForm.chapter_no" type="number" min="1" class="input text-xs w-20" placeholder="章节" />
            <input v-model="reinforceForm.note" class="input text-xs flex-1" placeholder="强化说明（可选）" />
            <button @click="handleAddReinforce(item)" :disabled="reinforceForm.chapter_no < 1" class="btn btn-xs btn-primary shrink-0">添加</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Timeline View -->
    <div v-else-if="viewMode === 'timeline'" class="card overflow-hidden">
      <div class="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <p class="text-xs text-gray-500 dark:text-gray-400">横轴为章节序号；实色条=规划范围；绿色端点=实际兑现；蓝色小点=强化章节</p>
      </div>
      <div class="p-4 space-y-2.5 overflow-x-auto">
        <div v-if="timelineItems.length === 0" class="text-center py-6 text-xs text-gray-400">有埋设章节号的伏笔才会显示在时间轴上</div>
        <div v-for="item in timelineItems" :key="item.id" class="flex items-center gap-3 min-w-0">
          <!-- Label -->
          <div class="w-28 shrink-0 text-right">
            <span class="text-xs font-medium text-gray-700 dark:text-gray-300 truncate block">{{ item.title }}</span>
            <span class="text-xs" :class="item.confidence ? confidenceClass(item.confidence) : 'text-gray-400'">{{ LEVEL_LABELS[item.level] ?? '' }}</span>
          </div>
          <!-- Bar track -->
          <div class="flex-1 relative h-5 min-w-[180px]">
            <div class="absolute inset-y-0 left-0 right-0 rounded bg-gray-100 dark:bg-gray-700" />
            <!-- Planned range bar -->
            <div v-if="item.planted_chapter_no > 0" class="absolute inset-y-1 rounded" :class="levelBarClass(item.level)" :style="barStyle(item)" />
            <!-- Reinforcement dots -->
            <div v-for="r in parseReinforcements(item.reinforcement_chapters)" :key="r.chapter_no"
              class="absolute inset-y-0 w-2 flex items-center justify-center" :style="`left: calc(${markerPct(r.chapter_no)}% - 4px)`" :title="`第${r.chapter_no}章强化`">
              <div class="w-2 h-2 rounded-full bg-blue-500 dark:bg-blue-400 border border-white dark:border-gray-800" />
            </div>
            <!-- Actual payoff marker -->
            <div v-if="item.actual_payoff_chapter_no > 0"
              class="absolute inset-y-0 w-1.5 bg-green-600 dark:bg-green-400 rounded" :style="`left: calc(${markerPct(item.actual_payoff_chapter_no)}% - 3px)`" :title="`第${item.actual_payoff_chapter_no}章兑现`" />
            <!-- Overdue indicator -->
            <div v-if="isOverdue(item)" class="absolute right-0 inset-y-1 w-1.5 bg-red-500 rounded-r" title="已超期" />
          </div>
          <!-- Range label -->
          <div class="w-20 shrink-0 text-xs text-gray-400">
            <span>Ch.{{ item.planted_chapter_no }}</span>
            <span v-if="item.payoff_chapter_no > 0">→{{ item.payoff_chapter_no }}</span>
          </div>
        </div>
        <!-- X-axis ticks -->
        <div class="flex ml-28 pl-3 pr-20 text-xs text-gray-300 dark:text-gray-600 justify-between mt-1">
          <span v-for="t in timelineTicks" :key="t">{{ t }}</span>
        </div>
      </div>
    </div>

    <!-- Tree View -->
    <div v-else-if="viewMode === 'tree'" class="space-y-1">
      <div v-if="rootItems.length === 0" class="text-center py-6 text-gray-400 text-sm">暂无父子关系伏笔</div>
      <template v-for="root in rootItems" :key="root.id">
        <div class="flex items-start gap-2 p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div class="w-1 shrink-0 self-stretch rounded" :class="statusStripe(root)" />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="font-medium text-sm text-gray-900 dark:text-white">{{ root.title }}</span>
              <span class="text-xs px-1.5 py-0.5 rounded" :class="levelClass(root.level)">{{ LEVEL_LABELS[root.level] }}</span>
              <span class="text-xs px-1.5 py-0.5 rounded-full" :class="statusClass(root.status)">{{ statusLabel(root.status) }}</span>
              <span v-if="root.confidence" class="text-xs px-1.5 py-0.5 rounded" :class="confidenceClass(root.confidence)">{{ CONFIDENCE_LABELS[root.confidence] }}</span>
            </div>
            <p v-if="root.description" class="text-xs text-gray-400 mt-0.5 line-clamp-1">{{ root.description }}</p>
          </div>
          <button @click="editItem(root)" class="text-xs text-blue-500 hover:text-blue-700 shrink-0">编辑</button>
        </div>
        <!-- Children -->
        <div v-for="child in getChildren(root.id)" :key="child.id" class="ml-6 flex items-start gap-2 p-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50 rounded-lg">
          <div class="text-gray-300 dark:text-gray-600 text-xs shrink-0 mt-0.5">└</div>
          <div class="w-0.5 shrink-0 self-stretch rounded" :class="statusStripe(child)" />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-sm text-gray-800 dark:text-gray-200">{{ child.title }}</span>
              <span class="text-xs px-1.5 py-0.5 rounded" :class="levelClass(child.level)">{{ LEVEL_LABELS[child.level] }}</span>
              <span class="text-xs px-1.5 py-0.5 rounded-full" :class="statusClass(child.status)">{{ statusLabel(child.status) }}</span>
              <span v-if="child.confidence" class="text-xs px-1.5 py-0.5 rounded" :class="confidenceClass(child.confidence)">{{ CONFIDENCE_LABELS[child.confidence] }}</span>
            </div>
          </div>
          <button @click="editItem(child)" class="text-xs text-blue-500 hover:text-blue-700 shrink-0">编辑</button>
        </div>
        <!-- Grandchildren -->
        <template v-for="child in getChildren(root.id)" :key="`gc-${child.id}`">
          <div v-for="gc in getChildren(child.id)" :key="gc.id" class="ml-12 flex items-start gap-2 p-2 bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700/30 rounded-lg">
            <div class="text-gray-300 dark:text-gray-600 text-xs shrink-0 mt-0.5">└</div>
            <div class="w-0.5 shrink-0 self-stretch rounded" :class="statusStripe(gc)" />
            <div class="flex-1 min-w-0">
              <span class="text-xs text-gray-700 dark:text-gray-300">{{ gc.title }}</span>
              <span class="ml-1.5 text-xs px-1 py-0.5 rounded" :class="statusClass(gc.status)">{{ statusLabel(gc.status) }}</span>
            </div>
          </div>
        </template>
      </template>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h4 class="text-lg font-semibold text-gray-900 dark:text-white">{{ editingItem ? '编辑伏笔' : '添加伏笔' }}</h4>
        <!-- Title -->
        <div>
          <label class="block text-sm font-medium mb-1">标题 *</label>
          <input v-model="form.title" class="input input-bordered w-full" />
        </div>
        <!-- Level + Type -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium mb-1">层级</label>
            <select v-model="form.level" class="select select-bordered w-full">
              <option value="main">主线伏笔</option>
              <option value="sub">支线伏笔</option>
              <option value="detail">细节伏笔</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">类型</label>
            <select v-model="form.foreshadow_type" class="select select-bordered w-full">
              <option value="">不分类</option>
              <option v-for="(l, k) in TYPE_LABELS" :key="k" :value="k">{{ l }}</option>
            </select>
          </div>
        </div>
        <!-- Confidence + Parent -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium mb-1">AI把握度</label>
            <select v-model="form.confidence" class="select select-bordered w-full">
              <option value="">未评级</option>
              <option v-for="(l, k) in CONFIDENCE_LABELS" :key="k" :value="k">{{ l }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">父伏笔 ID</label>
            <input v-model.number="form.parent_id" type="number" min="0" class="input input-bordered w-full" placeholder="0=无父节点" />
          </div>
        </div>
        <!-- Description -->
        <div>
          <label class="block text-sm font-medium mb-1">描述</label>
          <textarea v-model="form.description" rows="3" class="textarea textarea-bordered w-full" placeholder="伏笔内容：何时埋下、内容、预计如何兑现…" />
        </div>
        <!-- Chapter numbers -->
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="block text-sm font-medium mb-1">埋设章节</label>
            <input v-model.number="form.planted_chapter_no" type="number" min="0" class="input input-bordered w-full" placeholder="0" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">计划兑现章节</label>
            <input v-model.number="form.payoff_chapter_no" type="number" min="0" class="input input-bordered w-full" placeholder="0=未规划" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">实际兑现章节</label>
            <input v-model.number="form.actual_payoff_chapter_no" type="number" min="0" class="input input-bordered w-full" placeholder="0=未兑现" />
          </div>
        </div>
        <!-- Status + Tags -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium mb-1">状态</label>
            <select v-model="form.status" class="select select-bordered w-full">
              <option value="planted">未兑现</option>
              <option value="paid_off">已兑现</option>
              <option value="abandoned">已放弃</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">标签</label>
            <input v-model="form.tags" class="input input-bordered w-full" placeholder="标签1,标签2" />
          </div>
        </div>
        <!-- Payoff quality (only when paid_off) -->
        <div v-if="form.status === 'paid_off'" class="space-y-3">
          <div>
            <label class="block text-sm font-medium mb-1.5">兑现质量评分</label>
            <div class="flex gap-1">
              <button v-for="star in 5" :key="star" @click="form.payoff_quality = form.payoff_quality === star ? 0 : star"
                class="text-2xl leading-none transition-colors focus:outline-none"
                :class="star <= (form.payoff_quality || 0) ? 'text-yellow-400 hover:text-yellow-300' : 'text-gray-300 hover:text-yellow-300'">★</button>
              <span class="ml-2 text-sm text-gray-400 self-center">{{ QUALITY_HINTS[form.payoff_quality || 0] }}</span>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">兑现评注</label>
            <textarea v-model="form.payoff_notes" rows="2" class="textarea textarea-bordered w-full" placeholder="对这次伏笔兑现的评价、笔记…" />
          </div>
        </div>
        <div v-if="modalError" class="text-red-500 text-sm" role="alert">{{ modalError }}</div>
        <div class="flex justify-end gap-3 pt-1">
          <button @click="showModal = false" class="btn btn-ghost">取消</button>
          <button @click="saveItem" :disabled="saving" class="btn btn-primary">{{ saving ? '保存中...' : '保存' }}</button>
        </div>
      </div>
    </div>

    <!-- 钩子链 -->
    <div class="card overflow-hidden">
      <button class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors" @click="showHookSection = !showHookSection">
        <span class="flex items-center gap-2">
          <span class="text-base">🪝</span> 钩子链
          <span class="text-xs text-gray-400 ml-1">章节悬念与信息操作追踪</span>
          <span v-if="hooks.length > 0" class="text-xs bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded-full">{{ hooks.length }}</span>
        </span>
        <svg class="w-4 h-4 text-gray-400 transition-transform" :class="showHookSection ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
      </button>
      <div v-if="showHookSection" class="border-t border-gray-100 dark:border-gray-700 p-4 space-y-3">
        <div class="flex justify-between items-center">
          <span class="text-xs text-gray-400">共 {{ hooks.length }} 个钩子</span>
          <button class="btn btn-sm btn-primary" @click="showHookForm = true">添加钩子</button>
        </div>
        <div v-if="hooks.length === 0" class="text-center py-4 text-xs text-gray-400">暂无钩子记录</div>
        <div v-for="hook in hooks" :key="hook.id" class="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm space-y-2">
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1 flex-wrap">
                <span class="px-2 py-0.5 text-xs rounded-full" :class="hook.is_fulfilled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'">{{ HOOK_TYPE_LABELS[hook.type] ?? hook.type }}</span>
                <span class="text-xs px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300">强度 {{ hook.intensity }}/10</span>
                <span v-if="hook.is_fulfilled" class="text-xs text-green-600 dark:text-green-400">✓ 已兑现</span>
              </div>
              <p class="text-gray-700 dark:text-gray-300">{{ hook.description }}</p>
              <p class="text-xs text-gray-400 mt-1">第{{ hook.planted_at }}章埋下 · 计划第{{ hook.planned_payoff_at || '?' }}章兑现</p>
              <!-- Payoff quality (after fulfillment) -->
              <div v-if="hook.is_fulfilled" class="mt-1.5 flex items-center gap-2">
                <span class="text-xs text-gray-400">兑现质量：</span>
                <div class="flex gap-0.5">
                  <button v-for="s in 5" :key="s" @click="handleRateHookPayoff(hook, s)"
                    class="text-base leading-none transition-colors"
                    :class="s <= (hook.payoff_quality || 0) ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600 hover:text-yellow-300'">★</button>
                </div>
                <span v-if="hook.payoff_notes" class="text-xs text-gray-400 truncate max-w-[120px]">{{ hook.payoff_notes }}</span>
              </div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <button v-if="!hook.is_fulfilled" class="text-xs btn btn-sm btn-ghost py-0.5 px-2" @click="handleFulfillHook(hook)">兑现</button>
              <button class="text-red-400 hover:text-red-600 p-1" @click="handleDeleteHook(hook)"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
          </div>
        </div>
        <!-- Hook form -->
        <div v-if="showHookForm" class="p-4 border border-gray-200 dark:border-gray-600 rounded-lg space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-gray-500 mb-1 block">类型</label>
              <select v-model="hookForm.type" class="input text-sm w-full">
                <option v-for="(l,k) in HOOK_TYPE_LABELS" :key="k" :value="k">{{ l }}</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-gray-500 mb-1 block">强度 {{ hookForm.intensity }}/10</label>
              <input v-model.number="hookForm.intensity" type="range" min="1" max="10" class="w-full mt-1.5"/>
            </div>
            <div>
              <label class="text-xs text-gray-500 mb-1 block">埋下章节</label>
              <input v-model.number="hookForm.planted_at" type="number" min="1" class="input text-sm w-full"/>
            </div>
            <div>
              <label class="text-xs text-gray-500 mb-1 block">兑现章节</label>
              <input v-model.number="hookForm.planned_payoff_at" type="number" min="1" class="input text-sm w-full"/>
            </div>
            <div class="col-span-2">
              <label class="text-xs text-gray-500 mb-1 block">描述</label>
              <textarea v-model="hookForm.description" class="input text-sm w-full" rows="2" placeholder="钩子内容描述"></textarea>
            </div>
          </div>
          <div class="flex justify-end gap-2">
            <button class="btn btn-ghost btn-sm" @click="showHookForm = false">取消</button>
            <button class="btn btn-primary btn-sm" :disabled="hookSaving" @click="handleCreateHook">{{ hookSaving ? '保存中...' : '保存' }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 冲突弧 -->
    <div class="card overflow-hidden">
      <button class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors" @click="showArcsSection = !showArcsSection">
        <span class="flex items-center gap-2">
          <span class="text-base">⚡</span> 冲突弧
          <span class="text-xs text-gray-400 ml-1">三幕六阶段核心矛盾追踪</span>
          <span v-if="arcs.length > 0" class="text-xs bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded-full">{{ arcs.length }}</span>
        </span>
        <svg class="w-4 h-4 text-gray-400 transition-transform" :class="showArcsSection ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
      </button>
      <div v-if="showArcsSection" class="border-t border-gray-100 dark:border-gray-700 p-4 space-y-3">
        <div class="flex justify-between items-center">
          <span class="text-xs text-gray-400">共 {{ arcs.length }} 条冲突弧</span>
          <button class="btn btn-sm btn-primary" @click="showArcForm = true">添加冲突弧</button>
        </div>
        <div v-if="arcs.length === 0" class="text-center py-4 text-xs text-gray-400">暂无冲突弧记录</div>
        <div v-for="arc in arcs" :key="arc.id" class="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm space-y-2">
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1 flex-wrap">
                <span class="font-medium text-gray-900 dark:text-white">{{ arc.title }}</span>
                <span class="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">{{ ARC_TYPE_LABELS[arc.type] ?? arc.type }}</span>
                <span v-if="arc.is_resolved" class="text-xs text-green-600 dark:text-green-400">✓ 已收尾</span>
              </div>
              <p v-if="arc.description" class="text-xs text-gray-500 dark:text-gray-400 mb-2">{{ arc.description }}</p>
              <!-- 6-phase progress bar -->
              <div class="flex gap-0.5 mb-1">
                <div v-for="(phase, idx) in ARC_PHASES" :key="phase"
                  class="flex-1 h-2 rounded-sm transition-colors relative group"
                  :class="isPhaseActive(arc, idx) ? arcPhaseColor(idx) : 'bg-gray-200 dark:bg-gray-600'"
                  :title="ARC_PHASE_LABELS[phase]">
                  <span class="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] text-gray-400 whitespace-nowrap hidden group-hover:block">{{ ARC_PHASE_LABELS[phase] }}</span>
                </div>
              </div>
              <p class="text-xs text-gray-400">{{ ARC_PHASE_LABELS[arc.current_phase ?? 'setup'] }} · {{ arc.antagonist || '无对立方' }} · 第{{ arc.start_chapter }}章起</p>
              <!-- Tension slider section -->
              <div class="mt-2 space-y-1.5">
                <div class="text-xs text-gray-400 mb-1">张力曲线（各阶段强度 1-10）</div>
                <div v-for="(phase, idx) in ARC_PHASES" :key="`tension-${phase}`" class="flex items-center gap-2">
                  <span class="text-xs w-10 shrink-0" :class="isPhaseActive(arc, idx) ? 'text-gray-700 dark:text-gray-200 font-medium' : 'text-gray-400'">{{ ARC_PHASE_LABELS[phase].slice(0,2) }}</span>
                  <input type="range" min="1" max="10"
                    :value="parseTensionLevels(arc.tension_levels)[phase] || 5"
                    @change="handleUpdateTension(arc, phase, +($event.target as HTMLInputElement).value)"
                    class="flex-1 h-1 accent-primary-600"
                    :disabled="arc.is_resolved"
                  />
                  <span class="text-xs text-gray-400 w-4 text-right shrink-0">{{ parseTensionLevels(arc.tension_levels)[phase] || 5 }}</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <button v-if="!arc.is_resolved" class="text-xs btn btn-sm btn-ghost py-0.5 px-2" @click="handleAdvancePhase(arc)">推进</button>
              <button class="text-red-400 hover:text-red-600 p-1" @click="handleDeleteArc(arc)"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
          </div>
        </div>
        <!-- Arc form -->
        <div v-if="showArcForm" class="p-4 border border-gray-200 dark:border-gray-600 rounded-lg space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div class="col-span-2"><label class="text-xs text-gray-500 mb-1 block">标题</label><input v-model="arcForm.title" type="text" class="input text-sm w-full" placeholder="冲突弧标题"/></div>
            <div><label class="text-xs text-gray-500 mb-1 block">类型</label><select v-model="arcForm.type" class="input text-sm w-full"><option v-for="(l,k) in ARC_TYPE_LABELS" :key="k" :value="k">{{ l }}</option></select></div>
            <div><label class="text-xs text-gray-500 mb-1 block">起始章节</label><input v-model.number="arcForm.start_chapter" type="number" min="1" class="input text-sm w-full"/></div>
            <div class="col-span-2"><label class="text-xs text-gray-500 mb-1 block">对立方</label><input v-model="arcForm.antagonist" type="text" class="input text-sm w-full" placeholder="反派/对立角色名"/></div>
            <div class="col-span-2"><label class="text-xs text-gray-500 mb-1 block">描述</label><textarea v-model="arcForm.description" class="input text-sm w-full" rows="2" placeholder="冲突背景与核心矛盾"></textarea></div>
          </div>
          <div class="flex justify-end gap-2">
            <button class="btn btn-ghost btn-sm" @click="showArcForm = false">取消</button>
            <button class="btn btn-primary btn-sm" :disabled="arcSaving" @click="handleCreateArc">{{ arcSaving ? '保存中...' : '保存' }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Foreshadow, ForeshadowStats } from '~/types'
import { useForeshadowApi } from '~/composables/useForeshadowApi'

const props = defineProps<{ novelId: number; totalChapters?: number }>()
const foreshadowApi = useForeshadowApi()
const toast = useToast()
const { guardAiProvider } = useAiProviderGuard()

// ── Labels ─────────────────────────────────────────────────────────────────────
const LEVEL_LABELS: Record<string, string> = { main: '主线', sub: '支线', detail: '细节' }
const TYPE_LABELS: Record<string, string> = {
  prop: '道具', dialogue: '对话', behavior: '行为', scene: '场景', prophecy: '预言/梦境',
}
const CONFIDENCE_LABELS: Record<string, string> = { high: '高把握', medium: '中把握', low: '低把握' }
const QUALITY_HINTS: Record<number, string> = {
  0: '未评分', 1: '差强人意', 2: '尚可', 3: '良好', 4: '精彩', 5: '绝佳',
}

// ── State ──────────────────────────────────────────────────────────────────────
const loading = ref(false)
const extracting = ref(false)
const items = ref<Foreshadow[]>([])
const stats = ref<ForeshadowStats | null>(null)
const statusFilter = ref<'all' | 'planted' | 'paid_off' | 'abandoned'>('all')
const levelFilter = ref('')
const typeFilter = ref('')
const confidenceFilter = ref('')
const viewMode = ref<'list' | 'timeline' | 'tree'>('list')
const showModal = ref(false)
const editingItem = ref<Foreshadow | null>(null)
const saving = ref(false)
const modalError = ref('')

const form = reactive({
  title: '',
  description: '',
  status: 'planted' as Foreshadow['status'],
  level: 'sub' as Foreshadow['level'],
  foreshadow_type: '' as Foreshadow['foreshadow_type'],
  confidence: '' as string,
  planted_chapter_no: 0,
  payoff_chapter_no: 0,
  actual_payoff_chapter_no: 0,
  tags: '',
  parent_id: 0,
  payoff_quality: 0,
  payoff_notes: '',
})

// Reinforce state
const expandedReinforceId = ref<number | null>(null)
const reinforceForm = reactive({ chapter_no: 0, note: '' })

const currentChapterNo = computed(() => props.totalChapters ?? 0)

// ── Computed ───────────────────────────────────────────────────────────────────
const plantedCount = computed(() => items.value.filter(i => i.status === 'planted').length)
const paidCount = computed(() => items.value.filter(i => i.status === 'paid_off').length)
const abandonedCount = computed(() => items.value.filter(i => i.status === 'abandoned').length)
const overdueCount = computed(() => items.value.filter(isOverdue).length)
const overdueItems = computed(() => items.value.filter(isOverdue))
const abandonedItems = computed(() => items.value.filter(i => i.status === 'abandoned'))

const narrativeDebt = computed(() => stats.value?.narrative_debt ?? (items.value.length > 0 ? plantedCount.value / items.value.length : 0))
const narrativeDebtBarColor = computed(() => {
  const d = narrativeDebt.value
  if (d < 0.3) return 'bg-green-500'
  if (d < 0.6) return 'bg-yellow-500'
  return 'bg-red-500'
})
const narrativeDebtTextColor = computed(() => {
  const d = narrativeDebt.value
  if (d < 0.3) return 'text-green-600 dark:text-green-400'
  if (d < 0.6) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
})
const narrativeDebtHint = computed(() => {
  const d = narrativeDebt.value
  if (d < 0.3) return '叙事张力充足'
  if (d < 0.6) return '注意兑现进度'
  return '债务过高，请及时兑现'
})

function isOverdue(item: Foreshadow) {
  return item.status === 'planted' && item.payoff_chapter_no > 0 && currentChapterNo.value > item.payoff_chapter_no + 3
}

const statusTabs = computed(() => [
  { value: 'all' as const, label: '全部', count: items.value.length },
  { value: 'planted' as const, label: '未兑现', count: plantedCount.value },
  { value: 'paid_off' as const, label: '已兑现', count: paidCount.value },
  { value: 'abandoned' as const, label: '已放弃', count: abandonedCount.value },
])

const displayList = computed(() => {
  let list = items.value
  if (statusFilter.value !== 'all') list = list.filter(i => i.status === statusFilter.value)
  if (levelFilter.value) list = list.filter(i => i.level === levelFilter.value)
  if (typeFilter.value) list = list.filter(i => i.foreshadow_type === typeFilter.value)
  if (confidenceFilter.value) list = list.filter(i => i.confidence === confidenceFilter.value)
  return [...list].sort((a, b) => {
    if (isOverdue(a) && !isOverdue(b)) return -1
    if (!isOverdue(a) && isOverdue(b)) return 1
    const levelOrder: Record<string, number> = { main: 0, sub: 1, detail: 2 }
    return (levelOrder[a.level] ?? 9) - (levelOrder[b.level] ?? 9)
  })
})

// Tree view
const rootItems = computed(() => displayList.value.filter(i => !i.parent_id || i.parent_id === 0))
function getChildren(parentId: number) {
  return items.value.filter(i => i.parent_id === parentId)
}
function hasChildren(id: number) {
  return items.value.some(i => i.parent_id === id)
}

// Timeline
const timelineItems = computed(() =>
  items.value.filter(i => i.planted_chapter_no > 0).sort((a, b) => a.planted_chapter_no - b.planted_chapter_no)
)
const timelineMax = computed(() => {
  let max = currentChapterNo.value || 1
  for (const i of timelineItems.value) {
    if (i.payoff_chapter_no > max) max = i.payoff_chapter_no
    if (i.actual_payoff_chapter_no > max) max = i.actual_payoff_chapter_no
  }
  return max
})
const timelineTicks = computed(() => {
  const max = timelineMax.value
  const step = Math.max(1, Math.round(max / 5))
  const ticks: number[] = []
  for (let i = 0; i <= max; i += step) ticks.push(i)
  if (ticks[ticks.length - 1] !== max) ticks.push(max)
  return ticks
})

function barStyle(item: Foreshadow) {
  const max = timelineMax.value || 1
  const start = Math.max(0, ((item.planted_chapter_no - 1) / max) * 100)
  const end = item.payoff_chapter_no > 0 ? Math.min(100, (item.payoff_chapter_no / max) * 100) : start + 4
  return `left: ${start}%; width: ${Math.max(2, end - start)}%`
}
function markerPct(chapterNo: number) {
  const max = timelineMax.value || 1
  return Math.min(100, (chapterNo / max) * 100)
}

// ── Style Helpers ──────────────────────────────────────────────────────────────
function statusLabel(s: string) {
  return s === 'planted' ? '未兑现' : s === 'paid_off' ? '已兑现' : '已放弃'
}
function statusClass(s: string) {
  return s === 'planted'
    ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
    : s === 'paid_off'
    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
    : 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
}
function statusStripe(item: Foreshadow) {
  if (isOverdue(item)) return 'bg-red-500'
  if (item.status === 'abandoned') return 'bg-orange-400'
  return item.status === 'planted' ? 'bg-yellow-400' : 'bg-green-500'
}
function levelClass(level: string) {
  return level === 'main'
    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    : level === 'sub'
    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
}
function levelBarClass(level: string) {
  return level === 'main' ? 'bg-red-400 dark:bg-red-600' : level === 'sub' ? 'bg-blue-400 dark:bg-blue-600' : 'bg-gray-400 dark:bg-gray-500'
}
function confidenceClass(conf: string) {
  return conf === 'high'
    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    : conf === 'medium'
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
}

// ── Reinforcement Helpers ──────────────────────────────────────────────────────
function parseReinforcements(str?: string): Array<{ chapter_no: number; note: string }> {
  if (!str) return []
  try { return JSON.parse(str) } catch { return [] }
}
function reinforceCount(item: Foreshadow) {
  return parseReinforcements(item.reinforcement_chapters).length
}
function toggleReinforce(id: number) {
  if (expandedReinforceId.value === id) {
    expandedReinforceId.value = null
  } else {
    expandedReinforceId.value = id
    reinforceForm.chapter_no = currentChapterNo.value || 1
    reinforceForm.note = ''
  }
}

async function handleAddReinforce(item: Foreshadow) {
  if (reinforceForm.chapter_no < 1) return
  try {
    const updated = await foreshadowApi.addReinforcement(props.novelId, item.id, reinforceForm.chapter_no, reinforceForm.note) as any
    const idx = items.value.findIndex(i => i.id === item.id)
    if (idx >= 0 && updated) {
      items.value[idx] = updated
    }
    reinforceForm.chapter_no = 0
    reinforceForm.note = ''
    toast.success('强化记录已添加')
  } catch (e: any) {
    toast.error('添加失败：' + (e?.message ?? '未知错误'))
  }
}

// ── CRUD ───────────────────────────────────────────────────────────────────────
async function load() {
  loading.value = true
  try {
    const [listRes, statsRes] = await Promise.all([
      foreshadowApi.list(props.novelId),
      foreshadowApi.getStats(props.novelId, currentChapterNo.value),
    ])
    items.value = (listRes as any)?.data?.foreshadows ?? (listRes as any)?.foreshadows ?? []
    stats.value = ((statsRes as any)?.data ?? statsRes) as ForeshadowStats
  } catch (e: any) {
    toast.error('加载失败：' + (e?.message ?? '未知错误'))
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingItem.value = null
  Object.assign(form, {
    title: '', description: '', status: 'planted', level: 'sub', foreshadow_type: '',
    confidence: '', planted_chapter_no: 0, payoff_chapter_no: 0, actual_payoff_chapter_no: 0,
    tags: '', parent_id: 0, payoff_quality: 0, payoff_notes: '',
  })
  modalError.value = ''
  showModal.value = true
}

function editItem(item: Foreshadow) {
  editingItem.value = item
  Object.assign(form, {
    title: item.title,
    description: item.description ?? '',
    status: item.status,
    level: item.level || 'sub',
    foreshadow_type: item.foreshadow_type || '',
    confidence: item.confidence || '',
    planted_chapter_no: item.planted_chapter_no || 0,
    payoff_chapter_no: item.payoff_chapter_no || 0,
    actual_payoff_chapter_no: item.actual_payoff_chapter_no || 0,
    tags: item.tags || '',
    parent_id: item.parent_id || 0,
    payoff_quality: item.payoff_quality || 0,
    payoff_notes: item.payoff_notes || '',
  })
  modalError.value = ''
  showModal.value = true
}

async function saveItem() {
  if (!form.title.trim()) { modalError.value = '请输入标题'; return }
  saving.value = true
  try {
    const payload: Record<string, unknown> = {
      title: form.title,
      description: form.description,
      status: form.status,
      level: form.level,
      foreshadow_type: form.foreshadow_type,
      confidence: form.confidence || undefined,
      planted_chapter_no: form.planted_chapter_no,
      payoff_chapter_no: form.payoff_chapter_no,
      actual_payoff_chapter_no: form.actual_payoff_chapter_no,
      tags: form.tags,
      parent_id: form.parent_id || 0,
    }
    if (form.status === 'paid_off') {
      payload.payoff_quality = form.payoff_quality
      payload.payoff_notes = form.payoff_notes
    }
    if (editingItem.value) {
      await foreshadowApi.update(props.novelId, editingItem.value.id, payload)
    } else {
      await foreshadowApi.create(props.novelId, payload as Partial<Foreshadow>)
    }
    showModal.value = false
    await load()
  } catch (e: any) {
    modalError.value = e?.message ?? '保存失败'
  } finally {
    saving.value = false
  }
}

async function handleAIExtract() {
  if (!await guardAiProvider('LLM')) return
  extracting.value = true
  try {
    const res = await foreshadowApi.aiExtract(props.novelId) as any
    const count = res?.total ?? res?.foreshadows?.length ?? 0
    await load()
    toast.success(`AI 提取完成，共生成 ${count} 条伏笔`)
  } catch (e: any) {
    toast.error('AI 提取失败：' + (e?.message ?? '未知错误'))
  } finally {
    extracting.value = false
  }
}

async function markPaidOff(item: Foreshadow) {
  const actualChapter = currentChapterNo.value || 0
  await foreshadowApi.update(props.novelId, item.id, { status: 'paid_off', actual_payoff_chapter_no: actualChapter })
  await load()
}

async function deleteItem(id: number) {
  if (!confirm('确认删除此伏笔？')) return
  await foreshadowApi.remove(props.novelId, id)
  await load()
}

onMounted(load)

// ── 钩子链 ─────────────────────────────────────────────────────────────────────
const { listHooks, createHook, deleteHook, fulfillHook, ratePayoff: rateHookPayoff } = useHookChainApi()
const hooks = ref<any[]>([])
const showHookSection = ref(false)
const showHookForm = ref(false)
const hookSaving = ref(false)
const hookForm = ref({ type: 'chapter_end', description: '', planted_at: 1, planned_payoff_at: 10, intensity: 5, notes: '' })

const HOOK_TYPE_LABELS: Record<string, string> = {
  chapter_end: '章末钩子', mystery: '悬念钩子', revelation: '揭秘钩子', decision: '抉择钩子',
  threat: '威胁钩子', promise: '承诺钩子', emotional: '情感钩子', action: '行动钩子',
}

watch(showHookSection, async (v) => {
  if (v && hooks.value.length === 0) {
    try { hooks.value = (await listHooks(props.novelId) as any).hooks ?? [] } catch {}
  }
})

async function handleCreateHook() {
  if (!hookForm.value.description.trim()) return
  hookSaving.value = true
  try {
    await createHook(props.novelId, hookForm.value)
    showHookForm.value = false
    hooks.value = (await listHooks(props.novelId) as any).hooks ?? []
  } catch {} finally { hookSaving.value = false }
}

async function handleFulfillHook(hook: any) {
  try {
    await fulfillHook(hook.id, hook.planned_payoff_at)
    hooks.value = (await listHooks(props.novelId) as any).hooks ?? []
  } catch {}
}

async function handleRateHookPayoff(hook: any, quality: number) {
  try {
    const updated = await rateHookPayoff(hook.id, quality) as any
    const idx = hooks.value.findIndex((h: any) => h.id === hook.id)
    if (idx >= 0 && updated) hooks.value[idx] = updated
  } catch {}
}

async function handleDeleteHook(hook: any) {
  if (!confirm('确认删除？')) return
  try {
    await deleteHook(hook.id)
    hooks.value = hooks.value.filter((h: any) => h.id !== hook.id)
  } catch {}
}

// ── 冲突弧 ─────────────────────────────────────────────────────────────────────
const { listConflictArcs, createConflictArc, deleteConflictArc, advancePhase, updateTension } = useConflictArcApi()
const arcs = ref<any[]>([])
const showArcsSection = ref(false)
const showArcForm = ref(false)
const arcSaving = ref(false)
const arcForm = ref({ title: '', description: '', type: 'interpersonal', antagonist: '', start_chapter: 1 })

const ARC_PHASES = ['setup', 'ignition', 'escalation', 'turning_point', 'climax', 'aftershock']
const ARC_PHASE_LABELS: Record<string, string> = {
  setup: '铺垫', ignition: '点燃', escalation: '升级', turning_point: '转折', climax: '高潮', aftershock: '余震', resolution: '收尾',
}
const ARC_TYPE_LABELS: Record<string, string> = {
  internal: '内心冲突', interpersonal: '人际冲突', social: '社会冲突', philosophical: '价值观冲突',
}

function parseTensionLevels(str?: string): Record<string, number> {
  if (!str) return {}
  try { return JSON.parse(str) } catch { return {} }
}

function isPhaseActive(arc: any, idx: number) {
  const currentIdx = ARC_PHASES.indexOf(arc.current_phase ?? 'setup')
  const effectiveIdx = currentIdx === -1 ? ARC_PHASES.length - 1 : currentIdx
  return idx <= effectiveIdx
}
function arcPhaseColor(idx: number) {
  const colors = [
    'bg-blue-300 dark:bg-blue-700', 'bg-yellow-400 dark:bg-yellow-600', 'bg-orange-400 dark:bg-orange-600',
    'bg-red-400 dark:bg-red-600', 'bg-red-600 dark:bg-red-800', 'bg-purple-400 dark:bg-purple-600',
  ]
  return colors[idx] ?? 'bg-primary-500'
}

watch(showArcsSection, async (v) => {
  if (v && arcs.value.length === 0) {
    try { arcs.value = (await listConflictArcs(props.novelId) as any).conflict_arcs ?? [] } catch {}
  }
})

async function handleCreateArc() {
  if (!arcForm.value.title.trim()) return
  arcSaving.value = true
  try {
    await createConflictArc(props.novelId, arcForm.value)
    showArcForm.value = false
    arcs.value = (await listConflictArcs(props.novelId) as any).conflict_arcs ?? []
  } catch {} finally { arcSaving.value = false }
}

async function handleAdvancePhase(arc: any) {
  try {
    await advancePhase(arc.id)
    arcs.value = (await listConflictArcs(props.novelId) as any).conflict_arcs ?? []
  } catch {}
}

async function handleUpdateTension(arc: any, phase: string, level: number) {
  try {
    const updated = await updateTension(arc.id, phase, level) as any
    const idx = arcs.value.findIndex((a: any) => a.id === arc.id)
    if (idx >= 0 && updated) arcs.value[idx] = updated
  } catch {}
}

async function handleDeleteArc(arc: any) {
  if (!confirm('确认删除？')) return
  try {
    await deleteConflictArc(arc.id)
    arcs.value = arcs.value.filter((a: any) => a.id !== arc.id)
  } catch {}
}
</script>
