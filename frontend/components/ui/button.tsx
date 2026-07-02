'use client'

import React, { ReactNode } from 'react'

export function Button({
  children,
  onClick,
  disabled,
  variant = 'default',
  className = '',
  style,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'default' | 'outline' | 'ghost'
  className?: string
  style?: React.CSSProperties
  type?: 'button' | 'submit' | 'reset'
}) {
  const baseStyle: React.CSSProperties = {
    padding: '8px 16px',
    borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: variant === 'default' ? 'rgba(0,255,136,0.1)' : 'transparent',
    color: variant === 'default' ? '#00ff88' : '#9ca3af',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '14px',
    fontWeight: 500,
    opacity: disabled ? 0.5 : 1,
    ...style
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={className}
      style={baseStyle}
    >
      {children}
    </button>
  )
}
