import type { ApiResponse, RewriteProject, LiteraryAnalysis, RewriteBible, ChapterRewriteTask } from '~/types'

export const useRewriteApi = () => {
  const { request } = useApi()

  const listProjects = (page = 1, pageSize = 20) =>
    request<ApiResponse<{ items: RewriteProject[]; total: number }>>(`/rewrite/projects?page=${page}&page_size=${pageSize}`)

  const createProject = (data: { novel_id: number; name: string; level: number }) =>
    request<ApiResponse<RewriteProject>>('/rewrite/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const getProject = (id: number) =>
    request<ApiResponse<RewriteProject>>(`/rewrite/projects/${id}`)

  const deleteProject = (id: number) =>
    request<void>(`/rewrite/projects/${id}`, { method: 'DELETE' })

  const startAnalysis = (id: number) =>
    request<ApiResponse<{ task_id: string; message: string }>>(`/rewrite/projects/${id}/analyze`, { method: 'POST' })

  const startRewriting = (id: number) =>
    request<ApiResponse<{ task_id: string; message: string }>>(`/rewrite/projects/${id}/rewrite`, { method: 'POST' })

  const getAnalysis = (id: number) =>
    request<ApiResponse<LiteraryAnalysis>>(`/rewrite/projects/${id}/analysis`)

  const getBible = (id: number) =>
    request<ApiResponse<RewriteBible>>(`/rewrite/projects/${id}/bible`)

  const listChapterTasks = (id: number) =>
    request<ApiResponse<{ items: ChapterRewriteTask[]; total: number }>>(`/rewrite/projects/${id}/chapters`)

  const getChapterTask = (projectId: number, taskId: number) =>
    request<ApiResponse<ChapterRewriteTask>>(`/rewrite/projects/${projectId}/chapters/${taskId}`)

  const approveChapter = (projectId: number, taskId: number) =>
    request<ApiResponse<{ message: string }>>(`/rewrite/projects/${projectId}/chapters/${taskId}/approve`, { method: 'POST' })

  return {
    listProjects,
    createProject,
    getProject,
    deleteProject,
    startAnalysis,
    startRewriting,
    getAnalysis,
    getBible,
    listChapterTasks,
    getChapterTask,
    approveChapter,
  }
}
