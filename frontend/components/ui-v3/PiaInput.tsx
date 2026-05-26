import type { InputHTMLAttributes, ReactNode } from 'react'

export type PiaInputDensity = 'compact' | 'default' | 'spacious'

export type PiaInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  helperText?: string
  errorText?: string
  density?: PiaInputDensity
  leadingIcon?: ReactNode
  trailingAction?: ReactNode
  privacySafe?: boolean
}

export function PiaInput({
  label,
  helperText,
  errorText,
  density = 'default',
  leadingIcon,
  trailingAction,
  privacySafe = false,
  className,
  id,
  ...props
}: PiaInputProps) {
  const inputId = id ?? (label ? `pia-v3-input-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : undefined)
  const describedBy = inputId && errorText ? `${inputId}-error` : inputId && helperText ? `${inputId}-helper` : undefined

  return (
    <label className={['pia-v3-field', `pia-v3-density-${density}`, className].filter(Boolean).join(' ')}>
      {label ? <span className="pia-v3-field-label">{label}</span> : null}
      <span className={['pia-v3-input-wrap', errorText ? 'pia-v3-input-error' : ''].filter(Boolean).join(' ')}>
        {leadingIcon ? <span className="pia-v3-input-icon">{leadingIcon}</span> : null}
        <input
          id={inputId}
          className={privacySafe ? 'pia-v3-private' : undefined}
          aria-invalid={Boolean(errorText) || undefined}
          aria-describedby={describedBy}
          {...props}
        />
        {trailingAction ? <span className="pia-v3-input-action">{trailingAction}</span> : null}
      </span>
      {errorText ? (
        <span className="pia-v3-field-error" id={inputId ? `${inputId}-error` : undefined}>
          {errorText}
        </span>
      ) : helperText ? (
        <span className="pia-v3-field-helper" id={inputId ? `${inputId}-helper` : undefined}>
          {helperText}
        </span>
      ) : null}
    </label>
  )
}
