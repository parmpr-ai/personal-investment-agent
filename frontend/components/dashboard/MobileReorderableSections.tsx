'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, LayoutGrid } from 'lucide-react'
import { MOBILE_SECTION_MAP } from './widgetRegistry'
import type { MobileHomeSectionId, MobileSectionRenderMap } from './types'

type MobileReorderableSectionsProps = {
  order: MobileHomeSectionId[]
  sections: MobileSectionRenderMap
  onMoveUp: (id: MobileHomeSectionId) => void
  onMoveDown: (id: MobileHomeSectionId) => void
  onReset: () => void
}

export default function MobileReorderableSections({
  order,
  sections,
  onMoveUp,
  onMoveDown,
  onReset,
}: MobileReorderableSectionsProps) {
  const [reorderMode, setReorderMode] = useState(false)

  return (
    <div className="mobile-dashboard-sections">
      <div className="mobile-layout-toolbar">
        <button type="button" className={`tab ${reorderMode ? 'active' : ''}`} onClick={() => setReorderMode((value) => !value)}>
          <LayoutGrid size={15} /> {reorderMode ? 'Done' : 'Reorder'}
        </button>
        {reorderMode ? (
          <button type="button" className="tab" onClick={onReset}>
            Reset
          </button>
        ) : null}
      </div>
      {order.map((id, index) => {
        const meta = MOBILE_SECTION_MAP[id]
        const content = sections[id]
        if (!meta || !content) return null
        return (
          <div className={`mobile-section-slot ${reorderMode ? 'reorder-mode' : ''}`.trim()} key={id}>
            {reorderMode ? (
              <div className="mobile-section-controls" aria-label={`Reorder ${meta.label}`}>
                <span>{meta.label}</span>
                <div>
                  <button type="button" className="mobile-section-move" disabled={index === 0} onClick={() => onMoveUp(id)} aria-label={`Move ${meta.label} up`}>
                    <ArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    className="mobile-section-move"
                    disabled={index === order.length - 1}
                    onClick={() => onMoveDown(id)}
                    aria-label={`Move ${meta.label} down`}
                  >
                    <ArrowDown size={16} />
                  </button>
                </div>
              </div>
            ) : null}
            {content}
          </div>
        )
      })}
    </div>
  )
}
