import type { NovelMember, EditingLock } from '~/types'

export function useCollabApi() {
  const { request } = useApi()

  const listMembers = (novelId: number) =>
    request<{ members: NovelMember[] }>(`/novels/${novelId}/members`)

  const inviteMember = (novelId: number, email: string, role: string) =>
    request<{ invite_token: string; invite_link: string }>(
      `/novels/${novelId}/members/invite`,
      { method: 'POST', body: JSON.stringify({ email, role }) },
    )

  const acceptInvite = (token: string) =>
    request<{ novel_id: number }>('/collab/accept', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })

  const removeMember = (novelId: number, userId: number) =>
    request<void>(`/novels/${novelId}/members/${userId}`, { method: 'DELETE' })

  const updateMemberRole = (novelId: number, userId: number, role: string) =>
    request<void>(`/novels/${novelId}/members/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    })

  const acquireLock = (entityType: string, entityId: number, novelId?: number) =>
    request<{ lock: EditingLock }>('/editing-locks', {
      method: 'POST',
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId, novel_id: novelId }),
    })

  const releaseLock = (entityType: string, entityId: number, novelId?: number) =>
    request<void>(
      `/editing-locks/${entityType}/${entityId}${novelId ? `?novel_id=${novelId}` : ''}`,
      { method: 'DELETE' },
    )

  const heartbeatLock = (entityType: string, entityId: number) =>
    request<void>(`/editing-locks/${entityType}/${entityId}/heartbeat`, { method: 'PUT' })

  const getLock = (entityType: string, entityId: number) =>
    request<{ lock: EditingLock | null }>(`/editing-locks/${entityType}/${entityId}`)

  return {
    listMembers,
    inviteMember,
    acceptInvite,
    removeMember,
    updateMemberRole,
    acquireLock,
    releaseLock,
    heartbeatLock,
    getLock,
  }
}
