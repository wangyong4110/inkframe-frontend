<template>
  <div>
    <!-- ── Page Header ──────────────────────────────────────────────────────── -->
    <div class="-mx-6 -mt-8 px-6 pt-5 border-b border-gray-800 bg-gray-900/50 mb-6">
      <!-- Title row -->
      <div class="flex items-center gap-3 mb-4 flex-wrap">
        <NuxtLink to="/novel" class="text-gray-500 hover:text-gray-300 transition-colors shrink-0">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </NuxtLink>
        <h1 class="text-lg font-semibold text-white truncate">{{ project?.name || '加载中...' }}</h1>
        <span v-if="project" :class="statusBadgeClass(project.status)"
          class="text-xs font-medium px-2.5 py-0.5 rounded-full shrink-0">
          {{ statusLabel(project.status) }}
        </span>
        <div class="ml-auto flex items-center gap-2 shrink-0">
          <span class="text-xs text-gray-600">改写策略</span>
          <span v-if="project" class="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
            {{ levelLabel(project.level) }}
          </span>
        </div>
      </div>

      <!-- Pipeline stepper -->
      <div class="flex items-center mb-4">
        <div v-for="(step, i) in [{label:'文学分析',n:1},{label:'改写圣经',n:2},{label:'章节改写',n:3}]" :key="step.n" class="flex items-center" :class="i < 2 ? 'flex-1' : ''">
          <div class="flex items-center gap-2 shrink-0">
            <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors"
              :class="pipelineStepClass(step.n as 1|2|3)">
              <svg v-if="phaseStatus(step.n as 1|2|3) === 'done'" class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
              <span v-else-if="phaseStatus(step.n as 1|2|3) === 'running'" class="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
              <span v-else>{{ step.n }}</span>
            </div>
            <span class="text-sm transition-colors" :class="pipelineLabelClass(step.n as 1|2|3)">{{ step.label }}</span>
          </div>
          <div v-if="i < 2" class="flex-1 h-px mx-3 transition-colors"
            :class="phaseStatus(step.n as 1|2|3) === 'done' ? 'bg-amber-500/50' : 'bg-gray-700'" />
        </div>
      </div>

      <!-- Running progress bar -->
      <div v-if="isRunning" class="mb-4 space-y-1.5">
        <div class="flex justify-between text-xs text-gray-400">
          <span class="flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block"></span>
            {{ project?.status === 'analyzing' ? '文学分析中...' : `章节改写中 · ${project?.done_chapters || 0} / ${project?.total_chapters || 0} 章` }}
          </span>
          <span>{{ displayProgress }}%</span>
        </div>
        <div class="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div class="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all duration-500"
            :style="{ width: displayProgress + '%' }" />
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex">
        <button v-for="tab in tabs" :key="tab.key" @click="activeTab = tab.key"
          :class="['px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
            activeTab === tab.key ? 'border-amber-500 text-amber-400' : 'border-transparent text-gray-500 hover:text-gray-300']">
          {{ tab.label }}
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="py-20 flex items-center justify-center gap-3 text-gray-500">
      <div class="w-5 h-5 border-2 border-gray-700 border-t-amber-500 rounded-full animate-spin"></div>
      <span class="text-sm">加载中...</span>
    </div>

    <template v-else>
      <!-- ══ Tab: 工作流 ═══════════════════════════════════════════════════════ -->
      <div v-if="activeTab === 'workflow'" class="space-y-4">

        <!-- Phase 1: 文学分析 -->
        <div class="bg-gray-900 border rounded-2xl overflow-hidden transition-all"
          :class="phaseStatus(1) === 'running' ? 'border-blue-500/40' : phaseStatus(1) === 'done' ? 'border-gray-700' : phaseStatus(1) === 'error' ? 'border-red-500/40' : 'border-gray-800'">
          <div class="p-5">
            <div class="flex items-start justify-between gap-4">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  :class="phaseStatus(1) === 'done' ? 'bg-emerald-500/20 text-emerald-400' : phaseStatus(1) === 'running' ? 'bg-blue-500/20 text-blue-400' : phaseStatus(1) === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-gray-800 text-gray-500'">
                  <svg v-if="phaseStatus(1) === 'done'" class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                  </svg>
                  <div v-else-if="phaseStatus(1) === 'running'" class="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  <span v-else class="text-sm font-bold">1</span>
                </div>
                <div>
                  <h3 class="font-semibold text-white">文学分析</h3>
                  <p class="text-xs text-gray-500 mt-0.5">提取叙事指纹、角色心理图谱、主题内核与高风险元素</p>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <span v-if="phaseStatus(1) === 'done'" class="text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full">已完成</span>
                <span v-else-if="phaseStatus(1) === 'running'" class="text-xs text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full">进行中</span>
                <button v-if="project?.status === 'pending'" @click="doStartAnalysis" :disabled="actionLoading"
                  class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                  {{ actionLoading ? '启动中...' : '开始分析 →' }}
                </button>
                <button v-if="project?.status === 'failed' && !(project.total_chapters)" @click="doStartAnalysis" :disabled="actionLoading"
                  class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                  {{ actionLoading ? '启动中...' : '↺ 重新分析' }}
                </button>
              </div>
            </div>

            <!-- Analysis dimension pills (when done) -->
            <div v-if="analysis" class="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div v-for="card in analysisSummary" :key="card.label"
                class="flex items-center gap-2 bg-gray-800/60 rounded-xl px-3 py-2">
                <span class="text-base shrink-0">{{ card.icon }}</span>
                <div class="min-w-0">
                  <p class="text-xs text-gray-500">{{ card.label }}</p>
                  <p class="text-xs text-gray-300 truncate">{{ Object.keys(parseJSON(card.data)).length > 0 ? '已分析' : '—' }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Phase 2: 改写圣经 -->
        <div class="bg-gray-900 border rounded-2xl overflow-hidden transition-all"
          :class="phaseStatus(2) === 'active' ? 'border-amber-500/50 shadow-lg shadow-amber-500/5' : phaseStatus(2) === 'done' ? 'border-gray-700' : 'border-gray-800 opacity-50 pointer-events-none'">
          <div class="p-5">
            <div class="flex items-start justify-between gap-4">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  :class="phaseStatus(2) === 'done' ? 'bg-emerald-500/20 text-emerald-400' : phaseStatus(2) === 'active' ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-800 text-gray-500'">
                  <svg v-if="phaseStatus(2) === 'done'" class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                  </svg>
                  <span v-else class="text-sm font-bold">2</span>
                </div>
                <div>
                  <h3 class="font-semibold text-white">改写圣经</h3>
                  <p class="text-xs text-gray-500 mt-0.5">AI 生成的改写规则手册，可手动调整后再开始章节改写</p>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button v-if="bible" @click="activeTab = 'bible'"
                  class="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors">
                  编辑圣经
                </button>
                <button v-if="project?.status === 'bible_ready'" @click="doStartRewriting" :disabled="actionLoading"
                  class="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                  {{ actionLoading ? '启动中...' : '开始改写 →' }}
                </button>
              </div>
            </div>

            <!-- Bible summary chips -->
            <div v-if="bible" class="mt-4 flex flex-wrap gap-2">
              <div v-if="bible.new_world_name" class="flex items-center gap-1.5 bg-gray-800/60 rounded-lg px-3 py-1.5">
                <span class="text-xs text-gray-500">新世界观</span>
                <span class="text-xs font-medium text-amber-300">{{ bible.new_world_name }}</span>
              </div>
              <div v-if="Object.keys(parseJSON(bible.new_char_names)).length > 0" class="flex items-center gap-1.5 bg-gray-800/60 rounded-lg px-3 py-1.5">
                <span class="text-xs text-gray-500">角色映射</span>
                <span class="text-xs font-medium text-white">{{ Object.keys(parseJSON(bible.new_char_names)).length }} 个</span>
              </div>
              <div v-if="forbiddenPhrasesList.length > 0" class="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5">
                <span class="text-xs text-red-400">🚫 禁用词</span>
                <span class="text-xs font-medium text-red-300">{{ forbiddenPhrasesList.length }} 个</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Phase 3: 章节改写 -->
        <div class="bg-gray-900 border rounded-2xl overflow-hidden transition-all"
          :class="phaseStatus(3) === 'running' ? 'border-amber-500/40' : phaseStatus(3) === 'done' ? 'border-gray-700' : phaseStatus(3) === 'error' ? 'border-red-500/40' : 'border-gray-800 opacity-50 pointer-events-none'">
          <div class="p-5">
            <div class="flex items-start justify-between gap-4">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  :class="phaseStatus(3) === 'done' ? 'bg-emerald-500/20 text-emerald-400' : phaseStatus(3) === 'running' ? 'bg-amber-500/20 text-amber-400' : phaseStatus(3) === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-gray-800 text-gray-500'">
                  <svg v-if="phaseStatus(3) === 'done'" class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                  </svg>
                  <div v-else-if="phaseStatus(3) === 'running'" class="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  <span v-else class="text-sm font-bold">3</span>
                </div>
                <div>
                  <h3 class="font-semibold text-white">章节改写</h3>
                  <p class="text-xs text-gray-500 mt-0.5">依据改写圣经重写所有章节并进行相似度合规检测</p>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button v-if="phaseStatus(3) === 'running' && activeTaskId" @click="cancelActiveTask"
                  class="text-xs text-red-400 hover:text-red-300 transition-colors">取消</button>
                <button v-if="project?.status === 'failed' && (project.total_chapters || 0) > 0" @click="doStartRewriting" :disabled="actionLoading"
                  class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                  {{ actionLoading ? '启动中...' : '↺ 重试改写' }}
                </button>
                <button v-if="chapterTasks.length > 0" @click="activeTab = 'chapters'"
                  class="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors">
                  查看章节
                </button>
              </div>
            </div>

            <!-- Chapter progress bar -->
            <div v-if="phaseStatus(3) !== 'locked' && (project?.total_chapters || 0) > 0" class="mt-4 space-y-3">
              <div class="flex items-center gap-5 text-sm">
                <div class="flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span class="text-gray-400 text-xs">完成</span>
                  <span class="font-bold text-emerald-400">{{ project?.done_chapters || 0 }}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-gray-600"></span>
                  <span class="text-gray-400 text-xs">总计</span>
                  <span class="font-bold text-white">{{ project?.total_chapters || 0 }}</span>
                </div>
                <div v-if="completedTasks.length > 0" class="flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full" :class="overallRatingColor.replace('text-', 'bg-').replace('400','500')"></span>
                  <span class="text-gray-400 text-xs">合规</span>
                  <span class="font-bold text-sm" :class="overallRatingColor">{{ overallRatingLabel }}</span>
                </div>
              </div>
              <div v-if="project?.total_chapters" class="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div class="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-700"
                  :style="{ width: (((project.done_chapters || 0) / project.total_chapters) * 100) + '%' }" />
              </div>
            </div>

            <!-- Error -->
            <div v-if="project?.status === 'failed' && project.error_msg" class="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300">
              {{ project.error_msg }}
            </div>

            <!-- Compliance quick row -->
            <div v-if="phaseStatus(3) === 'done'" class="mt-4 pt-4 border-t border-gray-800 flex flex-wrap items-center gap-5">
              <div>
                <p class="text-xs text-gray-500 mb-0.5">通过率</p>
                <p class="text-sm font-bold" :class="completedTasks.length > 0 && passedTasks.length / completedTasks.length >= 0.8 ? 'text-emerald-400' : completedTasks.length > 0 && passedTasks.length / completedTasks.length >= 0.6 ? 'text-amber-400' : 'text-red-400'">
                  {{ completedTasks.length > 0 ? Math.round(passedTasks.length / completedTasks.length * 100) : 0 }}%
                </p>
              </div>
              <div>
                <p class="text-xs text-gray-500 mb-0.5">平均相似度</p>
                <p class="text-sm font-bold" :class="avgLexSim < 0.20 ? 'text-emerald-400' : avgLexSim < 0.35 ? 'text-amber-400' : 'text-red-400'">
                  {{ (avgLexSim * 100).toFixed(1) }}%
                </p>
              </div>
              <button @click="activeTab = 'compliance'" class="ml-auto text-xs text-amber-400 hover:text-amber-300 transition-colors">
                查看完整合规报告 →
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ══ Tab: 改写圣经 ══════════════════════════════════════════════════════ -->
      <div v-else-if="activeTab === 'bible'">
        <div v-if="!bible" class="py-20 text-center">
          <p class="text-gray-500 mb-2">改写圣经尚未生成</p>
          <p class="text-xs text-gray-600">请先完成「文学分析」阶段</p>
        </div>
        <div v-else>
          <!-- Toolbar -->
          <div class="flex justify-end mb-4">
            <button v-if="!bibleEditMode" @click="startBibleEdit"
              class="text-sm px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors">
              编辑圣经
            </button>
            <div v-else class="flex gap-2">
              <button @click="cancelBibleEdit" class="text-sm px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors">取消</button>
              <button @click="saveBible" :disabled="bibleSaving"
                class="text-sm px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors disabled:opacity-50">
                {{ bibleSaving ? '保存中...' : '保存' }}
              </button>
            </div>
          </div>

          <!-- View mode -->
          <div v-if="!bibleEditMode" class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 class="text-xs text-gray-500 mb-1.5">新世界观名称</h3>
                <p class="text-lg font-bold text-amber-300">{{ bible.new_world_name || '（同原作）' }}</p>
              </div>
              <div class="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 class="text-xs text-gray-500 mb-2">角色名称对照</h3>
                <div class="space-y-1.5">
                  <div v-for="(newName, oldName) in parseJSON(bible.new_char_names)" :key="String(oldName)"
                    class="flex items-center gap-2 text-sm">
                    <span class="text-gray-400">{{ oldName }}</span>
                    <span class="text-gray-600">→</span>
                    <span class="text-amber-300 font-medium">{{ String(newName) }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <RewriteBibleCard title="情节转化规则" icon="🔄" :data="parseJSON(bible.plot_transform)" />
              <RewriteBibleCard title="叙事声音策略" icon="🎭" :data="parseJSON(bible.voice_strategy)" />
              <RewriteBibleCard title="文风指南" icon="✍️" :data="parseJSON(bible.style_guide)" />
              <RewriteBibleCard title="禁止元素（遗留）" icon="🚫" :data="parseJSON(bible.forbidden_elems)" :danger="true" />
            </div>

            <!-- Copyright compliance section -->
            <div class="space-y-3">
              <h3 class="text-sm font-semibold text-gray-300 flex items-center gap-2">
                版权合规管控
                <span class="text-xs bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full font-normal">严格禁止在改写稿中出现</span>
              </h3>
              <div class="bg-gray-900 border border-red-500/20 rounded-xl p-5">
                <h4 class="text-xs font-semibold text-red-400 mb-3">🚫 禁止词组</h4>
                <div v-if="forbiddenPhrasesList.length > 0" class="flex flex-wrap gap-2">
                  <span v-for="phrase in forbiddenPhrasesList" :key="phrase"
                    class="text-xs bg-red-500/10 border border-red-500/30 text-red-300 px-2.5 py-1 rounded-lg">
                    {{ phrase }}
                  </span>
                </div>
                <p v-else class="text-xs text-gray-500">暂无</p>
              </div>
              <div class="bg-gray-900 border border-orange-500/20 rounded-xl p-5">
                <h4 class="text-xs font-semibold text-orange-400 mb-3">💬 签名对话改写指南</h4>
                <div v-if="forbiddenDialoguesList.length > 0" class="space-y-3">
                  <div v-for="(d, i) in forbiddenDialoguesList" :key="i"
                    class="border border-orange-500/20 rounded-lg p-3 space-y-1.5">
                    <div class="flex items-center gap-2">
                      <span class="text-xs text-orange-300 font-medium shrink-0">模式：</span>
                      <span class="text-xs text-gray-300">{{ d.pattern }}</span>
                    </div>
                    <div v-if="d.excerpt" class="text-xs text-gray-500 italic bg-gray-800 px-2 py-1 rounded">{{ d.excerpt }}</div>
                    <div class="flex items-start gap-2">
                      <span class="text-xs text-emerald-400 font-medium shrink-0">改写建议：</span>
                      <span class="text-xs text-gray-300">{{ d.rewrite_guide }}</span>
                    </div>
                  </div>
                </div>
                <p v-else class="text-xs text-gray-500">暂无</p>
              </div>
              <div class="bg-gray-900 border border-violet-500/20 rounded-xl p-5">
                <h4 class="text-xs font-semibold text-violet-400 mb-3">🌀 意象迁移表</h4>
                <div v-if="Object.keys(imageryTransformMap).length > 0" class="space-y-2">
                  <div v-for="(newSymbol, origSymbol) in imageryTransformMap" :key="String(origSymbol)"
                    class="flex items-center gap-3 text-sm">
                    <span class="text-gray-400">{{ origSymbol }}</span>
                    <span class="text-gray-600">→</span>
                    <span class="text-violet-300">{{ String(newSymbol) }}</span>
                  </div>
                </div>
                <p v-else class="text-xs text-gray-500">暂无</p>
              </div>
            </div>

            <!-- Analysis cards -->
            <div v-if="analysis" class="space-y-3">
              <h3 class="text-sm font-semibold text-gray-300">文学分析详情</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <RewriteAnalysisCard title="叙事声音指纹" icon="🎙" :data="parseJSON(analysis.voice_fingerprint)" />
                <RewriteAnalysisCard title="场景架构" icon="🏗" :data="parseJSON(analysis.scene_architecture)" />
                <RewriteAnalysisCard title="角色心理图谱" icon="🧠" :data="parseJSON(analysis.character_psych)" />
                <RewriteAnalysisCard title="主题内核" icon="💡" :data="parseJSON(analysis.theme_core)" />
                <RewriteAnalysisCard title="世界逻辑" icon="🌍" :data="parseJSON(analysis.world_logic)" />
                <RewriteAnalysisCard title="高风险标志元素" icon="⚠️" :data="parseJSON(analysis.high_risk_markers)" :highlight="true" />
              </div>
            </div>
          </div>

          <!-- Edit mode -->
          <div v-else class="space-y-4">
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
              <div>
                <label class="block text-xs text-gray-400 mb-1.5">新世界观名称</label>
                <input v-model="bibleEditData.new_world_name" type="text"
                  class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
              </div>
              <div>
                <label class="block text-xs text-gray-400 mb-1.5">命名风格</label>
                <input v-model="bibleEditData.naming_style" type="text"
                  class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
              </div>
            </div>
            <div v-for="field in [
              { key: 'new_char_names', label: '角色名称对照（JSON）' },
              { key: 'plot_transform', label: '情节转化规则（JSON）' },
              { key: 'props_transform', label: '道具替换（JSON）' },
              { key: 'voice_strategy', label: '叙事声音策略（JSON）' },
              { key: 'style_guide', label: '文风指南（JSON）' },
              { key: 'imagery_transform', label: '意象迁移表（JSON）' },
              { key: 'forbidden_phrases', label: '禁止词组（JSON 数组）' },
              { key: 'forbidden_dialogues', label: '签名对话改写指南（JSON）' },
              { key: 'forbidden_elems', label: '禁止元素（JSON）' },
            ]" :key="field.key" class="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <label class="block text-xs text-gray-400 mb-1.5">{{ field.label }}</label>
              <textarea v-model="bibleEditData[field.key]" rows="4"
                class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 font-mono focus:outline-none focus:border-amber-500 resize-y" />
            </div>
          </div>
        </div>
      </div>

      <!-- ══ Tab: 章节改写 ══════════════════════════════════════════════════════ -->
      <div v-else-if="activeTab === 'chapters'">
        <div v-if="chapterTasks.length === 0" class="py-20 text-center text-gray-500">暂无章节改写任务</div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div v-for="task in chapterTasks" :key="task.id"
            class="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl p-4 transition-colors">
            <div class="flex items-center justify-between mb-3">
              <span class="text-sm font-semibold text-white">第 {{ task.chapter_no }} 章</span>
              <div class="flex items-center gap-1.5">
                <span v-if="task.deai_applied" class="text-xs px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 font-medium">去AI</span>
                <span :class="chapterStatusBadge(task.status)" class="text-xs px-2 py-0.5 rounded-full">
                  {{ chapterStatusLabel(task.status) }}
                </span>
              </div>
            </div>
            <div v-if="task.status === 'completed'" class="space-y-2">
              <!-- Similarity bar -->
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-500 w-14 shrink-0">相似度</span>
                <div class="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div :class="['h-full rounded-full', task.similarity_score < 0.3 ? 'bg-emerald-500' : task.similarity_score < 0.5 ? 'bg-amber-500' : 'bg-red-500']"
                    :style="{ width: (task.similarity_score * 100) + '%' }" />
                </div>
                <span :class="task.similarity_score < 0.3 ? 'text-emerald-400' : task.similarity_score < 0.5 ? 'text-amber-400' : 'text-red-400'"
                  class="text-xs w-8 text-right shrink-0">{{ Math.round(task.similarity_score * 100) }}%</span>
              </div>
              <!-- Quality + compliance row -->
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-xs text-gray-500">质量</span>
                  <span :class="task.quality_score >= 75 ? 'text-emerald-400' : task.quality_score >= 50 ? 'text-amber-400' : 'text-red-400'"
                    class="text-xs font-semibold">{{ task.quality_score.toFixed(1) }}</span>
                  <span class="text-base" :title="chapterComplianceTitle(task)">{{ chapterComplianceEmoji(task) }}</span>
                </div>
                <button @click="openComparison(task)" class="text-xs text-amber-400 hover:text-amber-300 transition-colors">
                  对比 →
                </button>
              </div>
            </div>
            <div v-else-if="task.status === 'rewriting'" class="flex items-center gap-2 mt-2">
              <div class="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0"></div>
              <span class="text-xs text-amber-400">改写中...</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ══ Tab: 合规报告 ══════════════════════════════════════════════════════ -->
      <div v-else-if="activeTab === 'compliance'">
        <div v-if="project?.status !== 'completed'" class="py-20 text-center">
          <p class="text-gray-500 mb-1">项目完成后可查看完整合规报告</p>
          <p v-if="isRunning" class="text-xs text-amber-400">改写进行中，请稍候...</p>
        </div>
        <div v-else-if="complianceLoading" class="py-20 text-center text-gray-500 text-sm">加载合规报告中...</div>
        <div v-else-if="!complianceReport" class="py-20 text-center text-gray-500 text-sm">暂无合规数据</div>
        <div v-else class="space-y-5">
          <div :class="['rounded-xl p-6 border', complianceReport.overall_rating === 'green' ? 'bg-emerald-500/10 border-emerald-500/30' : complianceReport.overall_rating === 'yellow' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-red-500/10 border-red-500/30']">
            <div class="flex items-center gap-3 flex-wrap">
              <span class="text-3xl">{{ complianceReport.overall_rating === 'green' ? '🟢' : complianceReport.overall_rating === 'yellow' ? '🟡' : '🔴' }}</span>
              <div class="flex-1 min-w-0">
                <p class="font-semibold text-white">
                  {{ complianceReport.overall_rating === 'green' ? '安全 — 整体通过版权合规检测' : complianceReport.overall_rating === 'yellow' ? '注意 — 部分章节相似度偏高' : '风险 — 存在较高版权侵权风险' }}
                </p>
                <p class="text-xs text-gray-400 mt-0.5">{{ levelLabel(complianceReport.level) }} · 通过 {{ complianceReport.passed_chapters }}/{{ complianceReport.done_chapters }} 章</p>
              </div>
              <button @click="exportComplianceReport" class="text-sm px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors shrink-0">
                导出报告
              </button>
            </div>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p class="text-xs text-gray-500 mb-1">通过率</p>
              <p class="text-2xl font-bold" :class="complianceReport.passed_chapters / complianceReport.done_chapters >= 0.8 ? 'text-emerald-400' : complianceReport.passed_chapters / complianceReport.done_chapters >= 0.6 ? 'text-amber-400' : 'text-red-400'">
                {{ complianceReport.done_chapters > 0 ? Math.round(complianceReport.passed_chapters / complianceReport.done_chapters * 100) : 0 }}%
              </p>
            </div>
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p class="text-xs text-gray-500 mb-1">平均词法相似度</p>
              <p class="text-2xl font-bold" :class="complianceReport.avg_lexical_sim < 0.20 ? 'text-emerald-400' : complianceReport.avg_lexical_sim < 0.35 ? 'text-amber-400' : 'text-red-400'">
                {{ (complianceReport.avg_lexical_sim * 100).toFixed(1) }}%
              </p>
            </div>
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p class="text-xs text-gray-500 mb-1">平均语义泄漏率</p>
              <p class="text-2xl font-bold" :class="complianceReport.avg_semantic_sim < 0.15 ? 'text-emerald-400' : complianceReport.avg_semantic_sim < 0.30 ? 'text-amber-400' : 'text-red-400'">
                {{ (complianceReport.avg_semantic_sim * 100).toFixed(1) }}%
              </p>
            </div>
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p class="text-xs text-gray-500 mb-1">平均质量分</p>
              <p class="text-2xl font-bold" :class="complianceReport.avg_quality_score >= 75 ? 'text-emerald-400' : complianceReport.avg_quality_score >= 50 ? 'text-amber-400' : 'text-red-400'">
                {{ complianceReport.avg_quality_score.toFixed(1) }}
              </p>
            </div>
          </div>
          <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table class="w-full">
              <thead>
                <tr class="border-b border-gray-800">
                  <th class="text-left text-xs text-gray-500 font-medium px-4 py-3">章节</th>
                  <th class="text-left text-xs text-gray-500 font-medium px-4 py-3">合规</th>
                  <th class="text-left text-xs text-gray-500 font-medium px-4 py-3">词法相似</th>
                  <th class="text-left text-xs text-gray-500 font-medium px-4 py-3">结构相似</th>
                  <th class="text-left text-xs text-gray-500 font-medium px-4 py-3">语义泄漏</th>
                  <th class="text-left text-xs text-gray-500 font-medium px-4 py-3">质量分</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="ch in complianceReport.chapters"
                  :key="ch.chapter_no"
                  class="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors cursor-pointer"
                  :title="getTaskByChapterNo(ch.chapter_no) ? '点击查看原文对比' : ''"
                  @click="jumpToChapterComparison(ch.chapter_no)"
                >
                  <td class="px-4 py-2.5 text-sm text-white flex items-center gap-1.5">
                    第 {{ ch.chapter_no }} 章
                    <svg v-if="getTaskByChapterNo(ch.chapter_no)" class="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                    </svg>
                  </td>
                  <td class="px-4 py-2.5 text-base">{{ ch.rating === 'green' ? '🟢' : ch.rating === 'yellow' ? '🟡' : '🔴' }}</td>
                  <td class="px-4 py-2.5 text-xs" :class="ch.lexical_sim < 0.20 ? 'text-emerald-400' : ch.lexical_sim < 0.35 ? 'text-amber-400' : 'text-red-400'">{{ (ch.lexical_sim * 100).toFixed(1) }}%</td>
                  <td class="px-4 py-2.5 text-xs" :class="ch.structural_sim < 0.25 ? 'text-emerald-400' : ch.structural_sim < 0.40 ? 'text-amber-400' : 'text-red-400'">{{ (ch.structural_sim * 100).toFixed(1) }}%</td>
                  <td class="px-4 py-2.5 text-xs" :class="ch.semantic_sim < 0.15 ? 'text-emerald-400' : ch.semantic_sim < 0.30 ? 'text-amber-400' : 'text-red-400'">{{ (ch.semantic_sim * 100).toFixed(1) }}%</td>
                  <td class="px-4 py-2.5 text-xs" :class="ch.quality_score >= 75 ? 'text-emerald-400' : ch.quality_score >= 50 ? 'text-amber-400' : 'text-red-400'">{{ ch.quality_score.toFixed(1) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>

    <!-- ── Comparison Modal ───────────────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="comparisonTask" class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto py-6 px-4"
          @click.self="comparisonTask = null">
          <div class="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-5xl">
            <div class="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h3 class="font-semibold text-white">第 {{ comparisonTask.chapter_no }} 章 — 原文 vs 改写版</h3>
              <button @click="comparisonTask = null" class="text-gray-400 hover:text-white text-xl leading-none transition-colors">&times;</button>
            </div>
            <!-- Metrics bar -->
            <div class="px-6 py-3 border-b border-gray-800 flex flex-wrap gap-4 text-xs bg-gray-800/30">
              <div class="flex items-center gap-1.5">
                <span class="text-gray-500">词法相似度</span>
                <span :class="comparisonTask.lexical_sim < 0.20 ? 'text-emerald-400' : comparisonTask.lexical_sim < 0.35 ? 'text-amber-400' : 'text-red-400'" class="font-semibold">{{ Math.round(comparisonTask.lexical_sim * 100) }}%</span>
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-gray-500">结构相似度</span>
                <span :class="comparisonTask.structural_sim < 0.25 ? 'text-emerald-400' : comparisonTask.structural_sim < 0.40 ? 'text-amber-400' : 'text-red-400'" class="font-semibold">{{ Math.round(comparisonTask.structural_sim * 100) }}%</span>
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-gray-500">语义泄漏率</span>
                <span :class="comparisonTask.semantic_sim < 0.15 ? 'text-emerald-400' : comparisonTask.semantic_sim < 0.30 ? 'text-amber-400' : 'text-red-400'" class="font-semibold">{{ Math.round(comparisonTask.semantic_sim * 100) }}%</span>
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-gray-500">质量分</span>
                <span :class="comparisonTask.quality_score >= 75 ? 'text-emerald-400' : comparisonTask.quality_score >= 50 ? 'text-amber-400' : 'text-red-400'" class="font-semibold">{{ comparisonTask.quality_score.toFixed(1) }}</span>
              </div>
              <span v-if="comparisonTask.passed" class="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">✓ 合规通过</span>
              <span v-if="comparisonTask.deai_applied" class="text-violet-300 bg-violet-500/20 px-2 py-0.5 rounded-full">去AI润色</span>
            </div>
            <!-- Consistency warning -->
            <div v-if="comparisonConsistencyIssues.length > 0" class="px-6 py-3 border-b border-gray-800 bg-amber-500/5">
              <div class="flex items-start gap-2">
                <span class="text-amber-400 text-xs font-semibold mt-0.5 shrink-0">⚠ 一致性问题</span>
                <ul class="space-y-0.5">
                  <li v-for="issue in comparisonConsistencyIssues" :key="issue" class="text-xs text-amber-300">{{ issue }}</li>
                </ul>
              </div>
            </div>
            <!-- Side by side content -->
            <div class="grid grid-cols-2 divide-x divide-gray-800">
              <div class="p-6">
                <p class="text-xs text-gray-500 font-medium mb-3 uppercase tracking-wide">原文</p>
                <div class="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap max-h-[60vh] overflow-y-auto pr-2">{{ comparisonTask.original_content }}</div>
              </div>
              <div class="p-6">
                <p class="text-xs text-gray-500 font-medium mb-3 uppercase tracking-wide">改写版</p>
                <div class="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap max-h-[60vh] overflow-y-auto pr-2">{{ comparisonTask.rewritten_content }}</div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import type { RewriteProject, LiteraryAnalysis, RewriteBible, ChapterRewriteTask, AsyncTask, ComplianceReport } from '~/types'

const route = useRoute()
const toast = useToast()
const {
  getProject,
  startAnalysis: apiStartAnalysis,
  startRewriting: apiStartRewriting,
  getAnalysis,
  getBible,
  listChapterTasks,
  updateBible: apiUpdateBible,
  getComplianceReport: apiGetComplianceReport,
} = useRewriteApi()
const { getTask, cancelTask } = useTaskApi()

const projectId = Number(route.params.id)
const project = ref<RewriteProject | null>(null)
const analysis = ref<LiteraryAnalysis | null>(null)
const bible = ref<RewriteBible | null>(null)
const chapterTasks = ref<ChapterRewriteTask[]>([])
const loading = ref(true)
const activeTab = ref('workflow')
const actionLoading = ref(false)
const comparisonTask = ref<ChapterRewriteTask | null>(null)

// Parse consistency issues from JSON string for the comparison modal
const comparisonConsistencyIssues = computed<string[]>(() => {
  if (!comparisonTask.value?.consistency_issues) return []
  try {
    const parsed = JSON.parse(comparisonTask.value.consistency_issues)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
})

// ── Bible editing ─────────────────────────────────────────────────────────────
const bibleEditMode = ref(false)
const bibleEditData = ref<Record<string, string>>({})
const bibleSaving = ref(false)

function startBibleEdit() {
  if (!bible.value) return
  bibleEditData.value = {
    new_world_name: bible.value.new_world_name || '',
    naming_style: bible.value.naming_style || '',
    new_char_names: bible.value.new_char_names || '{}',
    plot_transform: bible.value.plot_transform || '{}',
    props_transform: bible.value.props_transform || '{}',
    voice_strategy: bible.value.voice_strategy || '{}',
    style_guide: bible.value.style_guide || '{}',
    imagery_transform: bible.value.imagery_transform || '{}',
    forbidden_phrases: bible.value.forbidden_phrases || '[]',
    forbidden_dialogues: bible.value.forbidden_dialogues || '[]',
    forbidden_elems: bible.value.forbidden_elems || '{}',
  }
  bibleEditMode.value = true
}

function cancelBibleEdit() {
  bibleEditMode.value = false
}

async function saveBible() {
  bibleSaving.value = true
  try {
    await apiUpdateBible(projectId, bibleEditData.value as any)
    // Refresh bible from server
    const bRes = await getBible(projectId)
    bible.value = bRes.data
    bibleEditMode.value = false
  } catch (e) {
    console.error(e)
  } finally {
    bibleSaving.value = false
  }
}

// ── Async task polling ────────────────────────────────────────────────────────
const activeTaskId = ref<string | null>(null)
const activeTask = ref<AsyncTask | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

const TERMINAL = new Set(['completed', 'failed', 'cancelled'])

const isRunning = computed(() =>
  ['analyzing', 'rewriting'].includes(project.value?.status ?? ''),
)

// Progress: prefer live task progress, fall back to project.progress
const displayProgress = computed(() => {
  if (activeTask.value && !TERMINAL.has(activeTask.value.status)) {
    return activeTask.value.progress ?? 0
  }
  return project.value?.progress ?? 0
})

function startPolling(taskId: string) {
  activeTaskId.value = taskId
  stopPolling()
  pollTimer = setInterval(async () => {
    try {
      const res = await getTask(taskId)
      activeTask.value = res.data
      // Always refresh project so status badge, progress bar and chapter list stay live
      await refreshProject()
      if (TERMINAL.has(res.data.status)) {
        stopPolling()
      }
    } catch { /* network blip — keep polling */ }
  }, 2500)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function cancelActiveTask() {
  if (!activeTaskId.value) return
  try {
    await cancelTask(activeTaskId.value)
    stopPolling()
    await refreshProject()
  } catch (e) {
    console.error(e)
  }
}

// ── Compliance report ─────────────────────────────────────────────────────────
const complianceReport = ref<ComplianceReport | null>(null)
const complianceLoading = ref(false)
let _complianceReportInFlight = false

async function loadComplianceReport() {
  if (complianceReport.value || complianceLoading.value || _complianceReportInFlight) return
  _complianceReportInFlight = true
  complianceLoading.value = true
  try {
    const res = await apiGetComplianceReport(projectId)
    complianceReport.value = res.data
  } catch {
    complianceReport.value = null
  } finally {
    complianceLoading.value = false
    _complianceReportInFlight = false
  }
}

watch(activeTab, (tab) => {
  if (tab === 'compliance' && project.value?.status === 'completed') {
    loadComplianceReport()
  }
})

// Also load when project transitions to completed while user is already on the compliance tab
watch(() => project.value?.status, (status) => {
  if (status === 'completed' && activeTab.value === 'compliance') {
    loadComplianceReport()
  }
})

async function exportComplianceReport() {
  if (!complianceReport.value) return
  const r = complianceReport.value
  const ratingLabel = r.overall_rating === 'green' ? '安全' : r.overall_rating === 'yellow' ? '注意' : '风险'
  const lines = [
    `【简影 AI 改写合规报告】`,
    `项目：${project.value?.name || ''}`,
    `改写策略：${levelLabel(r.level)}`,
    `整体评级：${ratingLabel}`,
    `通过率：${r.done_chapters > 0 ? Math.round(r.passed_chapters / r.done_chapters * 100) : 0}%（${r.passed_chapters}/${r.done_chapters} 章）`,
    `平均词法相似度：${(r.avg_lexical_sim * 100).toFixed(1)}%`,
    `平均结构相似度：${(r.avg_structural_sim * 100).toFixed(1)}%`,
    `平均语义泄漏率：${(r.avg_semantic_sim * 100).toFixed(1)}%`,
    `平均质量分：${r.avg_quality_score.toFixed(1)}`,
    ``,
    `章节明细：`,
    ...r.chapters.map(ch => `  第${ch.chapter_no}章 ${ch.rating === 'green' ? '🟢' : ch.rating === 'yellow' ? '🟡' : '🔴'} 词法${(ch.lexical_sim * 100).toFixed(1)}% 结构${(ch.structural_sim * 100).toFixed(1)}% 语义泄漏${(ch.semantic_sim * 100).toFixed(1)}% 质量${ch.quality_score.toFixed(1)}`),
    ``,
    `生成时间：${new Date().toLocaleString('zh-CN')}`,
  ]
  try {
    await navigator.clipboard.writeText(lines.join('\n'))
    toast.success('合规报告已复制到剪贴板')
  } catch {
    toast.error('复制失败，请手动截图')
  }
}

// ── Computed compliance metrics from local chapterTasks ───────────────────────
const completedTasks = computed(() => chapterTasks.value.filter(t => t.status === 'completed'))
const passedTasks = computed(() => completedTasks.value.filter(t => t.passed))
const avgLexSim = computed(() => {
  if (!completedTasks.value.length) return 0
  return completedTasks.value.reduce((s, t) => s + t.lexical_sim, 0) / completedTasks.value.length
})
// Use pass-rate as primary indicator: "passed" already captures level-specific thresholds.
const overallRatingEmoji = computed(() => {
  if (!completedTasks.value.length) return '—'
  const passRate = passedTasks.value.length / completedTasks.value.length
  if (passRate >= 0.8) return '🟢'
  if (passRate < 0.6) return '🔴'
  return '🟡'
})
const overallRatingLabel = computed(() => {
  if (!completedTasks.value.length) return '—'
  const passRate = passedTasks.value.length / completedTasks.value.length
  if (passRate >= 0.8) return '安全'
  if (passRate < 0.6) return '风险'
  return '注意'
})
const overallRatingColor = computed(() => {
  if (!completedTasks.value.length) return 'text-gray-400'
  const passRate = passedTasks.value.length / completedTasks.value.length
  if (passRate >= 0.8) return 'text-emerald-400'
  if (passRate < 0.6) return 'text-red-400'
  return 'text-amber-400'
})

// ── Bible computed helpers ────────────────────────────────────────────────────
const forbiddenPhrasesList = computed<string[]>(() => {
  if (!bible.value?.forbidden_phrases) return []
  try { return JSON.parse(bible.value.forbidden_phrases) || [] } catch { return [] }
})

interface ForbiddenDialogue { pattern: string; excerpt: string; rewrite_guide: string }
const forbiddenDialoguesList = computed<ForbiddenDialogue[]>(() => {
  if (!bible.value?.forbidden_dialogues) return []
  try { return JSON.parse(bible.value.forbidden_dialogues) || [] } catch { return [] }
})

const imageryTransformMap = computed<Record<string, string>>(() => {
  if (!bible.value?.imagery_transform) return {}
  try { return JSON.parse(bible.value.imagery_transform) || {} } catch { return {} }
})

// ── Chapter compliance helpers ────────────────────────────────────────────────
// Use `passed` as primary indicator: it already incorporates level-specific thresholds.
// Fixed thresholds like 0.20/0.35 are wrong for level 1-3 where higher similarity is expected.
function chapterComplianceEmoji(task: ChapterRewriteTask) {
  if (task.passed) return '🟢'
  // Distinguish copyright risk (too similar) from quality gap (too different)
  // We approximate: if similarity_score > 0.5 it's likely too-similar rather than too-different
  if (task.similarity_score > 0.5) return '🔴'
  return '🟡'
}

function chapterComplianceTitle(task: ChapterRewriteTask) {
  if (task.passed) return '合规通过：相似度在本级别目标范围内'
  if (task.similarity_score > 0.5) return '风险：改写后与原文仍过于相似，存在版权风险'
  return '注意：改写幅度超出预期，建议检查质量'
}

// ── Data loading ──────────────────────────────────────────────────────────────
const tabs = [
  { key: 'workflow', label: '工作流' },
  { key: 'bible', label: '改写圣经' },
  { key: 'chapters', label: '章节改写' },
  { key: 'compliance', label: '合规报告' },
]

onMounted(async () => {
  await refreshProject()
  loading.value = false
  // If already running on page load, start project-level auto-refresh
  // (we don't have task_id from a previous session, so poll the project)
  if (isRunning.value) {
    startProjectPoll()
  }
})

onUnmounted(() => {
  stopPolling()
  stopProjectPoll()
})

// Project-level poll: used when page loads mid-run (no task_id available)
let projectPollTimer: ReturnType<typeof setInterval> | null = null

function startProjectPoll() {
  stopProjectPoll()
  projectPollTimer = setInterval(async () => {
    await refreshProject()
    if (!isRunning.value) stopProjectPoll()
  }, 3000)
}

function stopProjectPoll() {
  if (projectPollTimer) {
    clearInterval(projectPollTimer)
    projectPollTimer = null
  }
}

async function refreshProject() {
  try {
    const res = await getProject(projectId)
    project.value = res.data

    if (['bible_ready', 'rewriting', 'completed'].includes(project.value.status)) {
      try {
        const aRes = await getAnalysis(projectId)
        analysis.value = aRes.data
      } catch {}
    }
    if (['bible_ready', 'rewriting', 'completed'].includes(project.value.status)) {
      try {
        const bRes = await getBible(projectId)
        bible.value = bRes.data
      } catch {}
      await reloadChapterTasks()
    }
  } catch (e) {
    console.error(e)
  }
}

async function reloadChapterTasks() {
  try {
    const cRes = await listChapterTasks(projectId)
    chapterTasks.value = cRes.data?.items || []
  } catch {}
}

// ── Actions ───────────────────────────────────────────────────────────────────
async function doStartAnalysis() {
  actionLoading.value = true
  try {
    const res = await apiStartAnalysis(projectId)
    const taskId = res.data?.task_id
    if (taskId) {
      stopProjectPoll() // task polling takes over
      startPolling(taskId)
    }
    await refreshProject()
  } catch (e) {
    console.error(e)
  } finally {
    actionLoading.value = false
  }
}

async function doStartRewriting() {
  actionLoading.value = true
  try {
    const res = await apiStartRewriting(projectId)
    const taskId = res.data?.task_id
    if (taskId) {
      stopProjectPoll()
      startPolling(taskId)
    }
    await refreshProject()
  } catch (e) {
    console.error(e)
  } finally {
    actionLoading.value = false
  }
}

function openComparison(task: ChapterRewriteTask) {
  comparisonTask.value = task
}

function getTaskByChapterNo(chapterNo: number): ChapterRewriteTask | undefined {
  return chapterTasks.value.find(t => t.chapter_no === chapterNo && t.status === 'completed')
}

function jumpToChapterComparison(chapterNo: number) {
  const task = getTaskByChapterNo(chapterNo)
  if (task) {
    comparisonTask.value = task
  } else {
    toast.info(`第 ${chapterNo} 章数据暂不可用`)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseJSON(str: string): Record<string, unknown> {
  try { return JSON.parse(str) || {} } catch { return {} }
}

function levelLabel(level: number) {
  const labels: Record<number, string> = {
    1: '字词润色', 2: '文学精炼', 3: '题材借鉴', 4: '精神传承', 5: '深度蒸馏',
  }
  return labels[level] || '未知'
}

function levelLegalTag(level: number) {
  const tags: Record<number, string> = {
    1: '⚠️ 衍生作品·需授权', 2: '⚠️ 衍生作品·需授权',
    3: '🔶 灰色地带', 4: '✅ 独立作品（推荐）', 5: '✅ 独立作品',
  }
  return tags[level] || ''
}

function levelColor(level: number) {
  const map: Record<number, string> = {
    1: 'text-sky-300', 2: 'text-blue-300', 3: 'text-teal-300',
    4: 'text-emerald-300', 5: 'text-amber-300',
  }
  return map[level] || 'text-gray-300'
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    pending: '待开始', analyzing: '分析中', bible_ready: '待改写',
    rewriting: '改写中', reviewing: '审核中', completed: '已完成', failed: '失败',
  }
  return map[status] || status
}

function statusBadgeClass(status: string) {
  const map: Record<string, string> = {
    pending: 'bg-gray-700 text-gray-300',
    analyzing: 'bg-blue-500/20 text-blue-300',
    bible_ready: 'bg-amber-500/20 text-amber-300',
    rewriting: 'bg-violet-500/20 text-violet-300',
    reviewing: 'bg-yellow-500/20 text-yellow-300',
    completed: 'bg-emerald-500/20 text-emerald-300',
    failed: 'bg-red-500/20 text-red-300',
  }
  return map[status] || 'bg-gray-700 text-gray-300'
}

function chapterStatusLabel(status: string) {
  const map: Record<string, string> = {
    pending: '待改写', rewriting: '改写中', reviewing: '审核中', completed: '完成', failed: '失败',
  }
  return map[status] || status
}

function chapterStatusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'bg-gray-700 text-gray-400',
    rewriting: 'bg-violet-500/20 text-violet-300',
    reviewing: 'bg-yellow-500/20 text-yellow-300',
    completed: 'bg-emerald-500/20 text-emerald-300',
    failed: 'bg-red-500/20 text-red-300',
  }
  return map[status] || 'bg-gray-700 text-gray-400'
}

// Pipeline helpers
function phaseStatus(phase: 1 | 2 | 3): 'locked' | 'active' | 'running' | 'done' | 'error' {
  const s = project.value?.status ?? 'pending'
  if (phase === 1) {
    if (s === 'pending') return 'active'
    if (s === 'analyzing') return 'running'
    if (['bible_ready','rewriting','completed'].includes(s)) return 'done'
    if (s === 'failed' && !(project.value?.total_chapters)) return 'error'
    return 'done'
  }
  if (phase === 2) {
    if (['pending','analyzing'].includes(s)) return 'locked'
    if (s === 'bible_ready') return 'active'
    if (['rewriting','completed'].includes(s)) return 'done'
    return 'active'
  }
  // phase 3
  if (['pending','analyzing','bible_ready'].includes(s)) return 'locked'
  if (s === 'rewriting') return 'running'
  if (s === 'completed') return 'done'
  if (s === 'failed' && (project.value?.total_chapters ?? 0) > 0) return 'error'
  return 'locked'
}

function pipelineStepClass(step: 1 | 2 | 3) {
  const ps = phaseStatus(step)
  if (ps === 'done') return 'bg-emerald-500 text-white'
  if (ps === 'running' || ps === 'active') return 'bg-amber-500 text-white'
  if (ps === 'error') return 'bg-red-500 text-white'
  return 'bg-gray-700 text-gray-400'
}

function pipelineLabelClass(step: 1 | 2 | 3) {
  const ps = phaseStatus(step)
  if (ps === 'done') return 'text-emerald-400'
  if (ps === 'running' || ps === 'active') return 'text-amber-400 font-medium'
  return 'text-gray-500'
}

const analysisSummary = computed(() => {
  if (!analysis.value) return []
  return [
    { icon: '🎙', label: '叙事声音', data: analysis.value.voice_fingerprint },
    { icon: '🏗', label: '场景架构', data: analysis.value.scene_architecture },
    { icon: '🧠', label: '角色心理', data: analysis.value.character_psych },
    { icon: '💡', label: '主题内核', data: analysis.value.theme_core },
    { icon: '🌍', label: '世界逻辑', data: analysis.value.world_logic },
    { icon: '⚠️', label: '高风险元素', data: analysis.value.high_risk_markers },
  ]
})
</script>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active { transition: opacity 0.2s ease; }
.modal-fade-enter-from,
.modal-fade-leave-to { opacity: 0; }
</style>
