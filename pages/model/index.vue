<script setup lang="ts">
import type { AIModel, ModelProvider } from '~/types'

const activeTab = ref('providers')
const showAddProviderModal = ref(false)
const showAddModelModal = ref(false)
const showConfigModal = ref(false)
const testingProvider = ref<string | null>(null)
const testingModel = ref<string | null>(null)

// Mock data
const providers = ref<ModelProvider[]>([
  {
    id: 1,
    name: 'OpenAI',
    health_status: 'healthy',
    models: [
      { id: 1, name: 'gpt-4', display_name: 'GPT-4', quality: 0.95, cost_per_1k: 0.03, is_active: true },
      { id: 2, name: 'gpt-4-turbo', display_name: 'GPT-4 Turbo', quality: 0.92, cost_per_1k: 0.01, is_active: true },
      { id: 3, name: 'gpt-3.5-turbo', display_name: 'GPT-3.5 Turbo', quality: 0.80, cost_per_1k: 0.0005, is_active: true },
    ],
  },
  {
    id: 2,
    name: 'Anthropic',
    health_status: 'healthy',
    models: [
      { id: 4, name: 'claude-3-opus', display_name: 'Claude 3 Opus', quality: 0.96, cost_per_1k: 0.015, is_active: true },
      { id: 5, name: 'claude-3-sonnet', display_name: 'Claude 3 Sonnet', quality: 0.90, cost_per_1k: 0.003, is_active: true },
    ],
  },
  {
    id: 3,
    name: 'Google',
    health_status: 'healthy',
    models: [
      { id: 6, name: 'gemini-pro', display_name: 'Gemini Pro', quality: 0.85, cost_per_1k: 0.002, is_active: true },
    ],
  },
])

const taskConfigs = ref([
  { task: '大纲生成', model: 'GPT-4 Turbo', strategy: 'balanced', primary: true },
  { task: '章节生成', model: 'Claude 3 Opus', strategy: 'quality_first', primary: true },
  { task: '对话生成', model: 'GPT-3.5 Turbo', strategy: 'cost_first', primary: true },
  { task: '分镜生成', model: 'GPT-4 Turbo', strategy: 'balanced', primary: true },
  { task: '世界观生成', model: 'Claude 3 Opus', strategy: 'quality_first', primary: true },
])

const experiments = ref([
  { id: 1, name: '章节生成模型对比', status: 'completed', winner: 'Claude 3 Opus', date: '2024-01-18' },
  { id: 2, name: '对话生成速度测试', status: 'running', winner: null, date: '2024-01-19' },
])

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    healthy: 'bg-green-100 text-green-800',
    degraded: 'bg-yellow-100 text-yellow-800',
    down: 'bg-red-100 text-red-800',
    completed: 'bg-green-100 text-green-800',
    running: 'bg-blue-100 text-blue-800',
    pending: 'bg-gray-100 text-gray-800',
    failed: 'bg-red-100 text-red-800',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    healthy: '健康',
    degraded: '降级',
    down: '离线',
    completed: '已完成',
    running: '运行中',
    pending: '待处理',
    failed: '失败',
  }
  return labels[status] || status
}

async function testProvider(id: number) {
  testingProvider.value = String(id)
  // 模拟测试
  await new Promise(resolve => setTimeout(resolve, 2000))
  testingProvider.value = null
}

async function testModel(id: number) {
  testingModel.value = String(id)
  await new Promise(resolve => setTimeout(resolve, 1500))
  testingModel.value = null
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">模型管理</h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          配置和管理 AI 模型提供商及模型
        </p>
      </div>
      <button
        class="btn-primary"
        @click="showAddProviderModal = true"
      >
        <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        添加提供商
      </button>
    </div>

    <!-- Tabs -->
    <div class="border-b border-gray-200 dark:border-gray-700">
      <nav class="flex space-x-8">
        <button
          v-for="tab in [
            { key: 'providers', label: '模型提供商' },
            { key: 'models', label: '模型列表' },
            { key: 'config', label: '任务配置' },
            { key: 'experiments', label: '对比实验' },
          ]"
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

    <!-- Providers Tab -->
    <div v-if="activeTab === 'providers'" class="space-y-4">
      <div
        v-for="provider in providers"
        :key="provider.id"
        class="card"
      >
        <div class="p-4 border-b border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-3">
              <div class="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                <span class="text-lg font-bold">{{ provider.name.charAt(0) }}</span>
              </div>
              <div>
                <h3 class="font-semibold text-gray-900 dark:text-white">{{ provider.name }}</h3>
                <div class="flex items-center space-x-2 mt-1">
                  <span
                    class="px-2 py-0.5 text-xs font-medium rounded-full"
                    :class="getStatusColor(provider.health_status)"
                  >
                    {{ getStatusLabel(provider.health_status) }}
                  </span>
                  <span class="text-sm text-gray-500">{{ provider.models.length }} 个模型</span>
                </div>
              </div>
            </div>
            <div class="flex items-center space-x-2">
              <button
                class="btn-outline text-sm"
                :disabled="testingProvider === String(provider.id)"
                @click="testProvider(provider.id)"
              >
                {{ testingProvider === String(provider.id) ? '测试中...' : '测试连接' }}
              </button>
              <button class="btn-ghost text-sm">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 12a1 1 0 110-2 1 1 0 010 2zm0-7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div class="p-4">
          <table class="w-full">
            <thead>
              <tr class="text-left text-sm text-gray-500 dark:text-gray-400">
                <th class="pb-2">模型</th>
                <th class="pb-2">质量</th>
                <th class="pb-2">成本</th>
                <th class="pb-2">状态</th>
                <th class="pb-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="model in provider.models"
                :key="model.id"
                class="border-t border-gray-100 dark:border-gray-700"
              >
                <td class="py-3">
                  <span class="font-medium text-gray-900 dark:text-white">{{ model.display_name }}</span>
                  <span class="ml-2 text-sm text-gray-500">{{ model.name }}</span>
                </td>
                <td class="py-3">
                  <div class="flex items-center space-x-2">
                    <div class="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        class="h-full bg-primary-500 rounded-full"
                        :style="{ width: `${model.quality * 100}%` }"
                      ></div>
                    </div>
                    <span class="text-sm text-gray-500">{{ (model.quality * 100).toFixed(0) }}%</span>
                  </div>
                </td>
                <td class="py-3 text-gray-500">${{ model.cost_per_1k }}/1K</td>
                <td class="py-3">
                  <span
                    class="px-2 py-0.5 text-xs font-medium rounded-full"
                    :class="model.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'"
                  >
                    {{ model.is_active ? '启用' : '禁用' }}
                  </span>
                </td>
                <td class="py-3 text-right">
                  <button
                    class="text-primary-600 hover:text-primary-700 text-sm mr-2"
                    @click="testModel(model.id)"
                  >
                    {{ testingModel === String(model.id) ? '测试中...' : '测试' }}
                  </button>
                  <button class="text-gray-500 hover:text-gray-700 text-sm">编辑</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Task Config Tab -->
    <div v-if="activeTab === 'config'" class="card">
      <div class="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 class="font-semibold text-gray-900 dark:text-white">任务模型配置</h3>
        <p class="text-sm text-gray-500 mt-1">为不同任务配置默认使用的模型</p>
      </div>
      <div class="p-4">
        <table class="w-full">
          <thead>
            <tr class="text-left text-sm text-gray-500 dark:text-gray-400">
              <th class="pb-3">任务类型</th>
              <th class="pb-3">主模型</th>
              <th class="pb-3">选择策略</th>
              <th class="pb-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="config in taskConfigs"
              :key="config.task"
              class="border-t border-gray-100 dark:border-gray-700"
            >
              <td class="py-4 font-medium text-gray-900 dark:text-white">{{ config.task }}</td>
              <td class="py-4">
                <select class="input w-48">
                  <option>{{ config.model }}</option>
                </select>
              </td>
              <td class="py-4">
                <select class="input w-40">
                  <option value="quality_first" :selected="config.strategy === 'quality_first'">质量优先</option>
                  <option value="cost_first" :selected="config.strategy === 'cost_first'">成本优先</option>
                  <option value="balanced" :selected="config.strategy === 'balanced'">平衡模式</option>
                </select>
              </td>
              <td class="py-4 text-right">
                <button class="btn-ghost text-sm">编辑备选</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="p-4 border-t border-gray-200 dark:border-gray-700">
        <button class="btn-primary">保存配置</button>
      </div>
    </div>

    <!-- Experiments Tab -->
    <div v-if="activeTab === 'experiments'" class="space-y-4">
      <div class="flex justify-between items-center">
        <h3 class="font-semibold text-gray-900 dark:text-white">对比实验</h3>
        <button class="btn-primary">
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          新建实验
        </button>
      </div>
      <div
        v-for="exp in experiments"
        :key="exp.id"
        class="card p-4"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <div
              class="w-10 h-10 rounded-lg flex items-center justify-center"
              :class="exp.status === 'completed' ? 'bg-green-100' : 'bg-blue-100'"
            >
              <svg class="w-5 h-5" :class="exp.status === 'completed' ? 'text-green-600' : 'text-blue-600'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h4 class="font-medium text-gray-900 dark:text-white">{{ exp.name }}</h4>
              <p class="text-sm text-gray-500">{{ exp.date }}</p>
            </div>
          </div>
          <div class="flex items-center space-x-3">
            <span
              class="px-2 py-1 text-xs font-medium rounded-full"
              :class="getStatusColor(exp.status)"
            >
              {{ getStatusLabel(exp.status) }}
            </span>
            <span v-if="exp.winner" class="text-sm text-gray-500">
              获胜者: <span class="font-medium">{{ exp.winner }}</span>
            </span>
            <button class="btn-outline text-sm">查看详情</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Provider Modal -->
    <div v-if="showAddProviderModal" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="fixed inset-0 bg-black/50" @click="showAddProviderModal = false"></div>
      <div class="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">添加模型提供商</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">提供商名称</label>
            <input type="text" class="input" placeholder="如：OpenAI" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">提供商类型</label>
            <select class="input">
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="google">Google</option>
              <option value="alibaba">阿里云</option>
              <option value="local">本地模型</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API 端点</label>
            <input type="text" class="input" placeholder="https://api.openai.com/v1" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API Key</label>
            <input type="password" class="input" placeholder="sk-..." />
          </div>
        </div>
        <div class="mt-6 flex justify-end space-x-2">
          <button class="btn-outline" @click="showAddProviderModal = false">取消</button>
          <button class="btn-primary" @click="showAddProviderModal = false">添加</button>
        </div>
      </div>
    </div>
  </div>
</template>
