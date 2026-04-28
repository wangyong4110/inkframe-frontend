import type { PlotPoint, PlotPointType } from '~/types'

export interface CreatePlotPointPayload {
  novel_id: number
  type: PlotPointType
  description: string
  characters?: string[]
  locations?: string[]
}

export interface UpdatePlotPointPayload {
  type?: PlotPointType
  description?: string
  characters?: string[]
  locations?: string[]
  is_resolved?: boolean
  resolved_in?: number
}

export function usePlotPointApi() {
  const { request } = useApi()

  async function listByChapter(chapterId: number): Promise<{ plot_points: PlotPoint[]; total: number }> {
    return request(`/chapters/${chapterId}/plot-points`)
  }

  async function listByNovel(
    novelId: number,
    opts: { type?: PlotPointType; unresolved?: boolean } = {},
  ): Promise<{ plot_points: PlotPoint[]; total: number }> {
    const params = new URLSearchParams()
    if (opts.type) params.set('type', opts.type)
    if (opts.unresolved) params.set('unresolved', 'true')
    const qs = params.toString()
    return request(`/novels/${novelId}/plot-points${qs ? '?' + qs : ''}`)
  }

  async function create(chapterId: number, payload: CreatePlotPointPayload): Promise<PlotPoint> {
    return request(`/chapters/${chapterId}/plot-points`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  // extract triggers server-side AI extraction of plot points from the chapter.
  // The server loads the chapter content itself — no body payload needed.
  async function extract(chapterId: number): Promise<{ plot_points: PlotPoint[]; total: number }> {
    return request(`/chapters/${chapterId}/plot-points/extract`, { method: 'POST' })
  }

  async function update(id: number, payload: UpdatePlotPointPayload): Promise<PlotPoint> {
    return request(`/plot-points/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  }

  async function resolve(id: number, resolvedInChapterId: number): Promise<PlotPoint> {
    return request(`/plot-points/${id}/resolve`, {
      method: 'PUT',
      body: JSON.stringify({ resolved_in_chapter_id: resolvedInChapterId }),
    })
  }

  async function remove(id: number): Promise<void> {
    return request(`/plot-points/${id}`, { method: 'DELETE' })
  }

  async function aiExtractFromNovel(novelId: number): Promise<{ task_id: string }> {
    return request(`/novels/${novelId}/plot-points/ai-extract`, { method: 'POST' })
  }

  return { listByChapter, listByNovel, create, extract, update, resolve, remove, aiExtractFromNovel }
}
