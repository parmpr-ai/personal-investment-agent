/**
 * Workspace AI Context - Default AI behaviors per workspace
 */

import type { WorkspaceId } from './workspaceRegistry'

export type WorkspaceAiContext = {
  systemPrompt: string
  tools: string[]
  temperature: number
}

const defaultContext: WorkspaceAiContext = {
  systemPrompt: 'You are a helpful trading assistant.',
  tools: [],
  temperature: 0.7,
}

const workspaceContexts: Record<string, WorkspaceAiContext> = {
  home: defaultContext,
  portfolio: defaultContext,
  watchlist: defaultContext,
  scanner: defaultContext,
  agent: {
    systemPrompt: 'You are an AI trading assistant helping with agent configuration and monitoring.',
    tools: ['agent_control', 'backtest_runner'],
    temperature: 0.5,
  },
  risk: defaultContext,
  tax: defaultContext,
  about: defaultContext,
  settings: defaultContext,
}

export function getWorkspaceAiContext(workspaceId: WorkspaceId): WorkspaceAiContext {
  return workspaceContexts[workspaceId] || defaultContext
}
