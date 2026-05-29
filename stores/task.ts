import { defineStore } from 'pinia'
import type { AsyncTask } from '~/types'

const POLL_INITIAL_MS = 2000
const POLL_MAX_MS = 15000
const POLL_BACKOFF_FACTOR = 1.5
const AUTO_DISMISS_MS = 5000 // auto-remove completed/failed tasks after 5s
const DATA_REFRESH_MS = 3000  // fixed interval for refreshing entity data while a task runs

export const useTaskStore = defineStore('task', {
  state: () => ({
    tasks: [] as AsyncTask[],
    _timers: {} as Record<string, ReturnType<typeof setTimeout>>,
    _dismissTimers: {} as Record<string, ReturnType<typeof setTimeout>>,
    // Fixed 3s data-refresh intervals (separate from task-status backoff polling)
    _refreshIntervals: {} as Record<string, ReturnType<typeof setInterval>>,
    // Track manually dismissed task IDs so in-flight refreshTask calls don't re-add them
    _dismissed: {} as Record<string, true>,
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
    // dataRefresh: optional callback fired every 3 s while the task is active,
    // allowing the caller to reload entity data incrementally (e.g. shots, SFX items).
    trackTask(taskId: string, onDone?: (task: AsyncTask) => void, dataRefresh?: () => unknown) {
      this._startPolling(taskId, onDone, dataRefresh)
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

    // Remove a single task from the panel (manual dismiss or auto-dismiss).
    dismiss(taskId: string) {
      this._dismissed[taskId] = true
      if (this._dismissTimers[taskId]) {
        clearTimeout(this._dismissTimers[taskId])
        delete this._dismissTimers[taskId]
      }
      // Also stop any active poll timer
      if (this._timers[taskId]) {
        clearTimeout(this._timers[taskId])
        delete this._timers[taskId]
      }
      // Stop data-refresh interval
      if (this._refreshIntervals[taskId]) {
        clearInterval(this._refreshIntervals[taskId])
        delete this._refreshIntervals[taskId]
      }
      const idx = this.tasks.findIndex(t => t.task_id === taskId)
      if (idx >= 0) this.tasks.splice(idx, 1)
    },

    // Remove all completed/failed/cancelled tasks from the panel.
    dismissAll() {
      const doneIds = this.tasks
        .filter(t => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled')
        .map(t => t.task_id)
      for (const id of doneIds) {
        this._dismissed[id] = true
        if (this._dismissTimers[id]) {
          clearTimeout(this._dismissTimers[id])
          delete this._dismissTimers[id]
        }
        if (this._timers[id]) {
          clearTimeout(this._timers[id])
          delete this._timers[id]
        }
        if (this._refreshIntervals[id]) {
          clearInterval(this._refreshIntervals[id])
          delete this._refreshIntervals[id]
        }
      }
      const doneSet = new Set(doneIds)
      for (let i = this.tasks.length - 1; i >= 0; i--) {
        if (doneSet.has(this.tasks[i].task_id)) this.tasks.splice(i, 1)
      }
    },

    _upsert(task: AsyncTask) {
      // Skip tasks that have been explicitly dismissed (guards against in-flight race conditions)
      if (this._dismissed[task.task_id]) return
      const idx = this.tasks.findIndex(t => t.task_id === task.task_id)
      if (idx >= 0) {
        this.tasks[idx] = task
      } else {
        this.tasks.push(task)
      }
    },

    _startPolling(taskId: string, onDone?: (task: AsyncTask) => void, dataRefresh?: () => unknown) {
      if (this._timers[taskId]) return // already polling

      // Start a fixed 3 s interval for entity data refresh (separate from status backoff)
      if (dataRefresh && !this._refreshIntervals[taskId]) {
        this._refreshIntervals[taskId] = setInterval(() => { dataRefresh() }, DATA_REFRESH_MS)
      }

      let delay = POLL_INITIAL_MS

      const poll = async () => {
        // Stop if dismissed while poll was in flight
        if (this._dismissed[taskId]) return

        const task = await this.refreshTask(taskId)
        if (!task) {
          // 网络或服务端瞬时错误，继续轮询，不永久停止
          delay = Math.min(delay * POLL_BACKOFF_FACTOR, POLL_MAX_MS)
          this._timers[taskId] = setTimeout(poll, delay)
          return
        }

        if (task.status === 'completed' || task.status === 'failed') {
          clearTimeout(this._timers[taskId])
          delete this._timers[taskId]
          // Stop data-refresh interval before calling onDone (onDone will do its own final fetch)
          if (this._refreshIntervals[taskId]) {
            clearInterval(this._refreshIntervals[taskId])
            delete this._refreshIntervals[taskId]
          }
          onDone?.(task)
          // Schedule auto-dismiss (only if not already dismissed)
          if (!this._dismissed[taskId]) {
            this._dismissTimers[taskId] = setTimeout(() => {
              this.dismiss(taskId)
            }, AUTO_DISMISS_MS)
          }
          return
        }

        // Still running — schedule next poll with backoff.
        // Cap at 3 s when progress is visible so the bar feels responsive.
        const effectiveMax = task.progress > 0 ? 3000 : POLL_MAX_MS
        delay = Math.min(delay * POLL_BACKOFF_FACTOR, effectiveMax)
        this._timers[taskId] = setTimeout(poll, delay)
      }

      this._timers[taskId] = setTimeout(poll, delay)
    },

    stopPolling(taskId: string) {
      if (this._timers[taskId]) {
        clearTimeout(this._timers[taskId])
        delete this._timers[taskId]
      }
      if (this._refreshIntervals[taskId]) {
        clearInterval(this._refreshIntervals[taskId])
        delete this._refreshIntervals[taskId]
      }
    },

    async cancelTask(taskId: string) {
      // Stop polling and data-refresh immediately
      this.stopPolling(taskId)
      // Optimistically update local status
      const idx = this.tasks.findIndex(t => t.task_id === taskId)
      if (idx >= 0) this.tasks[idx] = { ...this.tasks[idx], status: 'cancelled' }
      // Call backend
      try {
        const api = useTaskApi()
        await api.cancelTask(taskId)
      } catch {
        // ignore — local state already updated
      }
      // Auto-dismiss after 3s
      if (!this._dismissed[taskId]) {
        this._dismissTimers[taskId] = setTimeout(() => {
          this.dismiss(taskId)
        }, 3000)
      }
    },
  },
})
