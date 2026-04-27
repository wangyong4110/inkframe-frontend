import { defineStore } from 'pinia'
import type { AsyncTask } from '~/types'

const POLL_INTERVAL_MS = 2000

export const useTaskStore = defineStore('task', {
  state: () => ({
    tasks: [] as AsyncTask[],
    _timers: {} as Record<string, ReturnType<typeof setTimeout>>,
  }),

  getters: {
    activeTasks: (state): AsyncTask[] =>
      state.tasks.filter(t => t.status === 'pending' || t.status === 'running'),
    taskById: (state) => (taskId: string): AsyncTask | undefined =>
      state.tasks.find(t => t.task_id === taskId),
  },

  actions: {
    // Load all active (pending/running) tasks from the server on page load.
    async loadActiveTasks() {
      try {
        const api = useTaskApi()
        const [pendingRes, runningRes] = await Promise.all([
          api.listTasks({ status: 'pending', page_size: 50 }),
          api.listTasks({ status: 'running', page_size: 50 }),
        ])
        const items = [
          ...(pendingRes.data?.items ?? []),
          ...(runningRes.data?.items ?? []),
        ]
        for (const task of items) {
          this._upsert(task)
          this._startPolling(task.task_id)
        }
      } catch {
        // non-fatal — silently ignore if the endpoint fails
      }
    },

    // Track a newly-started task and begin polling.
    trackTask(taskId: string, onDone?: (task: AsyncTask) => void) {
      this._startPolling(taskId, onDone)
    },

    // Manually refresh a single task.
    async refreshTask(taskId: string): Promise<AsyncTask | undefined> {
      try {
        const api = useTaskApi()
        const res = await api.getTask(taskId)
        if (res.data) {
          this._upsert(res.data)
          return res.data
        }
      } catch {
        // ignore
      }
    },

    _upsert(task: AsyncTask) {
      const idx = this.tasks.findIndex(t => t.task_id === task.task_id)
      if (idx >= 0) {
        this.tasks[idx] = task
      } else {
        this.tasks.push(task)
      }
    },

    _startPolling(taskId: string, onDone?: (task: AsyncTask) => void) {
      if (this._timers[taskId]) return // already polling

      const poll = async () => {
        const task = await this.refreshTask(taskId)
        if (!task) return

        if (task.status === 'completed' || task.status === 'failed') {
          clearTimeout(this._timers[taskId])
          delete this._timers[taskId]
          onDone?.(task)
          return
        }

        // Still running — schedule next poll
        this._timers[taskId] = setTimeout(poll, POLL_INTERVAL_MS)
      }

      this._timers[taskId] = setTimeout(poll, POLL_INTERVAL_MS)
    },

    stopPolling(taskId: string) {
      if (this._timers[taskId]) {
        clearTimeout(this._timers[taskId])
        delete this._timers[taskId]
      }
    },
  },
})
