import type {
  Asset,
  AssetCollection,
  AssetComment,
  AssetSearchParams,
  AssetShareRequest,
  AssetStorageQuota,
  AssetVersion,
  CrawlJob,
  ShareLink,
  Tag,
} from '~/types'

interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export const useAssetApi = () => {
  const { request, requestMultipart } = useApi()

  const buildQ = (p: Record<string, unknown>): string => {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(p)) {
      if (v == null || v === '') continue
      if (Array.isArray(v)) {
        v.forEach(item => params.append(k, String(item)))
      } else {
        params.set(k, String(v))
      }
    }
    return params.toString()
  }

  // ─── Asset CRUD ────────────────────────────────────────────────────────────

  const searchAssets = (params: AssetSearchParams = {}) => {
    const q = buildQ({ ...params, page: params.page ?? 1, page_size: params.page_size ?? 20 })
    return request<ApiResponse<PaginatedResponse<Asset>>>(`/assets?${q}`)
  }

  const getAsset = (id: number) =>
    request<ApiResponse<Asset>>(`/assets/${id}`)

  const uploadAsset = async (file: File, meta: { title?: string; type?: string; sub_type?: string }) => {
    const { request: rawRequest } = useApi()
    const config = useRuntimeConfig()
    const { getAuthToken } = await import('~/utils/auth')
    const token = getAuthToken()

    const form = new FormData()
    form.append('file', file)
    if (meta.title) form.append('title', meta.title)
    if (meta.type) form.append('type', meta.type)
    if (meta.sub_type) form.append('sub_type', meta.sub_type)

    const res = await fetch(`${config.public.apiBase}/assets`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    return res.json() as Promise<ApiResponse<Asset>>
  }

  const updateAsset = (id: number, data: Partial<Pick<Asset, 'title' | 'description'>>) =>
    request<ApiResponse<Asset>>(`/assets/${id}`, { method: 'PUT', body: JSON.stringify(data) })

  const softDeleteAsset = (id: number) =>
    request<void>(`/assets/${id}`, { method: 'DELETE' })

  const restoreAsset = (id: number) =>
    request<ApiResponse<Asset>>(`/assets/${id}/restore`, { method: 'POST' })

  const purgeAsset = (id: number) =>
    request<void>(`/assets/${id}/purge`, { method: 'DELETE' })

  const listTrash = (page = 1) =>
    request<ApiResponse<PaginatedResponse<Asset>>>(`/assets/trash?page=${page}`)

  // ─── Share Workflow ─────────────────────────────────────────────────────────

  const requestShare = (id: number) =>
    request<ApiResponse<AssetShareRequest>>(`/assets/${id}/share-request`, { method: 'POST' })

  const getShareRequest = (id: number) =>
    request<ApiResponse<AssetShareRequest>>(`/assets/${id}/share-request`)

  const cancelShareRequest = (id: number) =>
    request<void>(`/assets/${id}/share-request`, { method: 'DELETE' })

  const withdrawShare = (id: number) =>
    request<ApiResponse<Asset>>(`/assets/${id}/withdraw`, { method: 'POST' })

  // ─── Versions ──────────────────────────────────────────────────────────────

  const listVersions = (id: number) =>
    request<ApiResponse<AssetVersion[]>>(`/assets/${id}/versions`)

  const createVersion = async (id: number, file: File, note: string) => {
    const config = useRuntimeConfig()
    const { getAuthToken } = await import('~/utils/auth')
    const token = getAuthToken()
    const form = new FormData()
    form.append('file', file)
    form.append('note', note)
    const res = await fetch(`${config.public.apiBase}/assets/${id}/versions`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    return res.json() as Promise<ApiResponse<AssetVersion>>
  }

  const restoreVersion = (id: number, versionNo: number) =>
    request<void>(`/assets/${id}/versions/${versionNo}/restore`, { method: 'POST' })

  // ─── Tags ───────────────────────────────────────────────────────────────────

  const listTags = () =>
    request<ApiResponse<Record<string, Tag[]>>>('/assets/tags')

  const suggestTags = (q: string) =>
    request<ApiResponse<Tag[]>>(`/assets/tags/suggest?q=${encodeURIComponent(q)}`)

  const addTags = (id: number, tagNames: string[]) =>
    request<ApiResponse<Tag[]>>(`/assets/${id}/tags`, { method: 'POST', body: JSON.stringify({ tag_names: tagNames }) })

  const removeTag = (id: number, tagId: number) =>
    request<void>(`/assets/${id}/tags/${tagId}`, { method: 'DELETE' })

  // ─── Public Library ─────────────────────────────────────────────────────────

  const toggleLike = (id: number) =>
    request<ApiResponse<{ liked: boolean }>>(`/assets/${id}/like`, { method: 'POST' })

  const useAsset = (id: number, ctx: { used_by_type?: string; used_by_id?: number }) =>
    request<ApiResponse<{ storage_url: string; attribution_text?: string }>>(`/assets/${id}/use`, { method: 'POST', body: JSON.stringify(ctx) })

  // ─── Batch Operations ───────────────────────────────────────────────────────

  const batchDelete = (assetIds: number[]) =>
    request<void>('/assets/batch-delete', { method: 'POST', body: JSON.stringify({ asset_ids: assetIds }) })

  const batchShareRequest = (assetIds: number[]) =>
    request<ApiResponse<{ submitted: number; failed: number }>>('/assets/batch-share-request', { method: 'POST', body: JSON.stringify({ asset_ids: assetIds }) })

  // ─── Collections ────────────────────────────────────────────────────────────

  const listCollections = () =>
    request<ApiResponse<AssetCollection[]>>('/asset-collections')

  const createCollection = (data: { name: string; description?: string; scope: 'personal' | 'public' }) =>
    request<ApiResponse<AssetCollection>>('/asset-collections', { method: 'POST', body: JSON.stringify(data) })

  const listCollectionItems = (collectionId: number) =>
    request<ApiResponse<Asset[]>>(`/asset-collections/${collectionId}/items`)

  const addToCollection = (collectionId: number, assetIds: number[]) =>
    request<void>(`/asset-collections/${collectionId}/items`, { method: 'POST', body: JSON.stringify({ asset_ids: assetIds }) })

  const removeFromCollection = (collectionId: number, assetIds: number[]) =>
    request<void>(`/asset-collections/${collectionId}/items`, { method: 'DELETE', body: JSON.stringify({ asset_ids: assetIds }) })

  // ─── Share Links ─────────────────────────────────────────────────────────────

  const createShareLink = (data: { asset_id?: number; collection_id?: number; expires_in?: number; download_allowed: boolean }) =>
    request<ApiResponse<ShareLink>>('/share-links', { method: 'POST', body: JSON.stringify(data) })

  const listShareLinks = () =>
    request<ApiResponse<ShareLink[]>>('/share-links')

  const revokeShareLink = (token: string) =>
    request<void>(`/share-links/${token}`, { method: 'DELETE' })

  const getSharePage = (token: string) =>
    request<ApiResponse<ShareLink>>(`/share/${token}`)

  // ─── Comments ───────────────────────────────────────────────────────────────

  const listComments = (id: number) =>
    request<ApiResponse<AssetComment[]>>(`/assets/${id}/comments`)

  const addComment = (id: number, data: { content: string; parent_id?: number; x_ratio?: number; y_ratio?: number }) =>
    request<ApiResponse<AssetComment>>(`/assets/${id}/comments`, { method: 'POST', body: JSON.stringify(data) })

  const deleteComment = (id: number, cid: number) =>
    request<void>(`/assets/${id}/comments/${cid}`, { method: 'DELETE' })

  // ─── Crawl Jobs ──────────────────────────────────────────────────────────────

  const listCrawlJobs = () =>
    request<ApiResponse<PaginatedResponse<CrawlJob>>>('/crawl-jobs')

  const createCrawlJob = (data: { source: string; query: string; asset_type: string; license?: string; limit: number }) =>
    request<ApiResponse<CrawlJob>>('/crawl-jobs', { method: 'POST', body: JSON.stringify(data) })

  const getCrawlJob = (id: number) =>
    request<ApiResponse<CrawlJob>>(`/crawl-jobs/${id}`)

  // ─── Analytics ───────────────────────────────────────────────────────────────

  const getQuota = () =>
    request<ApiResponse<AssetStorageQuota>>('/account/quota')

  const getValueRanking = (limit = 20) =>
    request<ApiResponse<Asset[]>>(`/assets/stats/ranking?limit=${limit}`)

  const getSearchGaps = (scope = 'public') =>
    request<ApiResponse<{ query: string; count: number }[]>>(`/assets/stats/search-gaps?scope=${scope}`)

  // Admin
  const listPendingShareRequests = () =>
    request<ApiResponse<PaginatedResponse<AssetShareRequest>>>('/admin/share-requests')

  const approveShareRequest = (id: number, note = '') =>
    request<void>(`/admin/share-requests/${id}/approve`, { method: 'POST', body: JSON.stringify({ note }) })

  const rejectShareRequest = (id: number, note: string) =>
    request<void>(`/admin/share-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) })

  return {
    searchAssets, getAsset, uploadAsset, updateAsset, softDeleteAsset, restoreAsset, purgeAsset, listTrash,
    requestShare, getShareRequest, cancelShareRequest, withdrawShare,
    listVersions, createVersion, restoreVersion,
    listTags, suggestTags, addTags, removeTag,
    toggleLike, useAsset,
    batchDelete, batchShareRequest,
    listCollections, createCollection, listCollectionItems, addToCollection, removeFromCollection,
    createShareLink, listShareLinks, revokeShareLink, getSharePage,
    listComments, addComment, deleteComment,
    listCrawlJobs, createCrawlJob, getCrawlJob,
    getQuota, getValueRanking, getSearchGaps,
    listPendingShareRequests, approveShareRequest, rejectShareRequest,
  }
}
