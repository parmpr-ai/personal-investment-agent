'use client'

import React from 'react'

export function Input({
  type = 'text',
  placeholder,
  value,
  onChange,
  disabled,
  className = '',
  style,
  step,
  min,
  max,
  ...props
}: {
  type?: string
  placeholder?: string
  value?: string | number
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
  step?: string | number
  min?: string | number
  max?: string | number
  [key: string]: any
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={className}
      step={step}
      min={min}
      max={max}
      {...props}
      style={{
        padding: '8px 12px',
        borderRadius: '6px',
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.02)',
        color: '#ffffff',
        fontSize: '14px',
        ...style
      }}
    />
  )
}
