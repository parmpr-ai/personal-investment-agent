'use client'

import { useCallback, useRef } from 'react'
import type { MouseEvent, TouchEvent } from 'react'

const INTERACTIVE =
  'button,a,input,select,textarea,[data-grip],[role="tab"],[role="button"],[role="option"],[role="menuitem"],[role="slider"]'

/**
 * Returns an onClick/onTouchEnd handler that calls onClose when the user
 * double-taps a non-interactive area of a mobile sheet within `thresholdMs`.
 *
 * Safe areas: any element that is NOT a button, link, input, drag handle,
 * tab, or other interactive role.
 */
export function useDoubleTapToClose(onClose: () => void, thresholdMs = 300) {
  const lastTapRef = useRef(0)

  return useCallback(
    (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement
      if (target.closest(INTERACTIVE)) return

      const now = Date.now()
      const delta = now - lastTapRef.current
      if (delta > 0 && delta < thresholdMs) {
        onClose()
        lastTapRef.current = 0
      } else {
        lastTapRef.current = now
      }
    },
    [onClose, thresholdMs],
  )
}
