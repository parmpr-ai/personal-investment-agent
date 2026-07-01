'use client'

import React, { ReactNode } from 'react'

export function Card({ children, className = '', style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={className}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px',
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '', style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={className}
      style={{
        padding: '20px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function CardTitle({ children, className = '', style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <h3
      className={className}
      style={{
        fontSize: '18px',
        fontWeight: 700,
        color: '#ffffff',
        margin: 0,
        ...style,
      }}
    >
      {children}
    </h3>
  )
}

export function CardDescription({ children, className = '', style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <p
      className={className}
      style={{
        fontSize: '13px',
        color: '#9ca3af',
        margin: '8px 0 0',
        ...style,
      }}
    >
      {children}
    </p>
  )
}

export function CardContent({ children, className = '', style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={className}
      style={{
        padding: '20px',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
