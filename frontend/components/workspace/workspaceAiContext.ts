import { DEFAULT_WORKSPACE_ID, WORKSPACE_MAP, type WorkspaceId } from './workspaceRegistry'

const fallbackContext = WORKSPACE_MAP[DEFAULT_WORKSPACE_ID].defaultAiContext

export function getWorkspaceAiContext(workspaceId: WorkspaceId) {
  return WORKSPACE_MAP[workspaceId]?.defaultAiContext || fallbackContext
}

export function getWorkspaceAiPromptPrefix(workspaceId: WorkspaceId) {
  const workspace = WORKSPACE_MAP[workspaceId] || WORKSPACE_MAP[DEFAULT_WORKSPACE_ID]
  return `Active workspace: ${workspace.title}. ${workspace.defaultAiContext}`
}
