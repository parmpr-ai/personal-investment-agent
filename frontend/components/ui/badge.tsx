'use client'

import React, { ReactNode } from 'react'

export function Badge({
  children,
  className = '',
  style,
  variant = 'default',
}: {
  children: ReactNode
  className?: string
  style?: React.CSSProperties
  variant?: 'default' | 'outline' | 'success' | 'destructive' | 'secondary'
}) {
  let bgColor = 'rgba(59,130,246,0.1)'
  let textColor = '#3b82f6'

  if (variant === 'success') {
    bgColor = 'rgba(0,255,136,0.1)'
    textColor = '#00ff88'
  } else if (variant === 'destructive') {
    bgColor = 'rgba(255,68,68,0.1)'
    textColor = '#ff4444'
  } else if (variant === 'secondary') {
    bgColor = 'rgba(107,114,128,0.1)'
    textColor = '#d1d5db'
  }

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 12px',
        borderRadius: '20px',
        background: bgColor,
        color: textColor,
        fontSize: '12px',
        fontWeight: 600,
        border: `1px solid ${textColor}33`,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  )
}
