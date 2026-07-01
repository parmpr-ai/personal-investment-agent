'use client'

import { ReactNode, createContext, useContext, useState } from 'react'

interface TabsContextType {
  activeTab: string
  setActiveTab: (value: string) => void
}

const TabsContext = createContext<TabsContextType | null>(null)

export function Tabs({
  children,
  defaultValue,
  className = '',
}: {
  children: ReactNode
  defaultValue: string
  className?: string
}) {
  const [activeTab, setActiveTab] = useState(defaultValue)

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`flex border-b border-gray-200 ${className}`.trim()}>
      {children}
    </div>
  )
}

export function TabsTrigger({
  value,
  children,
  className = '',
}: {
  value: string
  children: ReactNode
  className?: string
}) {
  const context = useContext(TabsContext)
  const isActive = context?.activeTab === value

  return (
    <button
      onClick={() => context?.setActiveTab(value)}
      className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
        isActive
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-gray-600 hover:text-gray-900'
      } ${className}`.trim()}
    >
      {children}
    </button>
  )
}

export function TabsContent({
  value,
  children,
  className = '',
}: {
  value: string
  children: ReactNode
  className?: string
}) {
  const context = useContext(TabsContext)
  const isActive = context?.activeTab === value

  if (!isActive) return null

  return <div className={className}>{children}</div>
}
