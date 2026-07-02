'use client'

import React, { createContext, useContext, useState, ReactNode } from 'react'

const TabsContext = createContext<{
  activeTab: string
  setActiveTab: (value: string) => void
} | null>(null)

export function Tabs({ children, defaultValue = '', className }: { children: ReactNode; defaultValue?: string; className?: string }) {
  const [activeTab, setActiveTab] = useState(defaultValue)
  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={className} style={{
      display: 'flex',
      borderBottom: '1px solid rgba(255,255,255,0.1)',
      marginBottom: '16px',
      gap: '0'
    }}>
      {children}
    </div>
  )
}

export function TabsTrigger({
  value,
  children,
  className,
}: {
  value: string
  children: ReactNode
  className?: string
}) {
  const context = useContext(TabsContext)
  if (!context) throw new Error('TabsTrigger must be used within Tabs')

  const { activeTab, setActiveTab } = context
  const isActive = activeTab === value

  return (
    <button
      className={className}
      onClick={() => setActiveTab(value)}
      style={{
        padding: '12px 16px',
        background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
        border: isActive ? '2px solid #00ff88' : 'none',
        borderBottom: isActive ? '2px solid #00ff88' : '1px solid transparent',
        color: isActive ? '#00ff88' : '#9ca3af',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: isActive ? 600 : 500,
      }}
    >
      {children}
    </button>
  )
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string
  children: ReactNode
  className?: string
}) {
  const context = useContext(TabsContext)
  if (!context) throw new Error('TabsContent must be used within Tabs')

  if (context.activeTab !== value) return null
  return <div className={className}>{children}</div>
}
