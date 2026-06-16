const { chromium } = require('@playwright/test')
const path = require('path')
const fs = require('fs')

const OUT = path.join(__dirname, '../uat-screenshots/cr-mobile-popup-ux-002')
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

const PORT = 3017

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17_0 Mobile/15E148 Safari/604.1',
  })
  const page = await ctx.newPage()
  const failures = []
  const pass = (label) => console.log(`  ✓ ${label}`)
  const fail = (label, detail = '') => { console.log(`  ✗ ${label}${detail ? ': '+detail : ''}`); failures.push(label) }
  const check = (cond, label, detail = '') => cond ? pass(label) : fail(label, detail)

  await page.goto(`http://localhost:${PORT}/mobile?si=NVDA`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(4000)

  // Scroll to .sps
  let spsVisible = await page.evaluate(() => !!document.querySelector('.sps'))
  if (!spsVisible) {
    for (let i = 0; i < 14; i++) {
      await page.evaluate(() => {
        const panel = document.querySelector('.stock-intel-mobile-dialog,.si-body,.stock-intel-body')
        if (panel) panel.scrollTop += 220; else window.scrollBy(0, 220)
      })
      await page.waitForTimeout(150)
      spsVisible = await page.evaluate(() => !!document.querySelector('.sps'))
      if (spsVisible) break
    }
  }
  check(spsVisible, '.sps found')

  // ── REQ 1: X on right in CustomizeSheet ────────────────────────────────────
  console.log('\n=== REQ 1: X position ===')

  // Open customize
  const menuBox = await page.evaluate(() => {
    const m = document.querySelector('.sps-menu')
    if (!m) return null
    const r = m.getBoundingClientRect()
    return { x: r.left + r.width/2, y: r.top + r.height/2 }
  })
  if (menuBox) await page.touchscreen.tap(menuBox.x, menuBox.y)
  else await page.evaluate(() => document.querySelector('.sps-menu')?.click())
  await page.waitForTimeout(700)

  const customOpen = await page.evaluate(() => !!document.querySelector('.sps-custom-sheet'))
  check(customOpen, 'Customize sheet opened')

  if (customOpen) {
    await page.screenshot({ path: path.join(OUT, '01-customize-x-right.png') })
    console.log('  Saved 01-customize-x-right.png')

    // Verify X is LAST child of header (rightmost)
    const xIsLast = await page.evaluate(() => {
      const head = document.querySelector('.sps-custom-head')
      if (!head) return null
      const children = Array.from(head.children)
      const closeIdx = children.findIndex(el => el.classList.contains('sps-custom-close'))
      return { closeIdx, total: children.length }
    })
    check(xIsLast?.closeIdx === xIsLast?.total - 1, `X close is last in header (idx ${xIsLast?.closeIdx}/${xIsLast?.total - 1})`)

    // Verify X is right of title h3 by DOM order
    const xAfterTitle = await page.evaluate(() => {
      const head = document.querySelector('.sps-custom-head')
      if (!head) return false
      const children = Array.from(head.children)
      const h3 = children.findIndex(el => el.tagName === 'H3')
      const close = children.findIndex(el => el.classList.contains('sps-custom-close'))
      return close > h3
    })
    check(xAfterTitle, 'X appears after title h3 in DOM order (right side)')

    // ── REQ 3: max-9 warning ────────────────────────────────────────────────
    console.log('\n=== REQ 3: Max-9 warning ===')

    // Default is 10 metrics, 0 hidden → 10 visible. With DEFAULT_ORDER now 10 items,
    // all visible = 10, but compact shows 9. Attempting to show any hidden one → warn.
    // First we need a state where 9 are visible and we try to enable a 10th.
    // Reset to ensure default prefs (all 10 metrics visible = 10 on, but compact shows 9).
    // The guard fires when visible count >= 9 AND we try to enable one more.
    // Since DEFAULT_PREFS has all 10 visible, let's hide one first, then try re-enabling
    // while already at 9 visible.

    // Count currently visible (not hidden)
    const visibleCount = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.sps-custom-row'))
      return rows.filter(r => r.querySelector('.skm-edit-toggle.on')).length
    })
    console.log(`  Currently visible metrics: ${visibleCount}`)

    if (visibleCount >= 9) {
      // All at max — try toggling any ON metric (hide it first, then re-enable)
      // Hide one metric
      const firstOn = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('.sps-custom-row'))
        const onRow = rows.find(r => r.querySelector('.skm-edit-toggle.on'))
        if (!onRow) return null
        const toggle = onRow.querySelector('.skm-edit-toggle')
        const r = toggle.getBoundingClientRect()
        return { x: r.left + r.width/2, y: r.top + r.height/2 }
      })
      if (firstOn) {
        await page.touchscreen.tap(firstOn.x, firstOn.y)
        await page.waitForTimeout(300)
      }

      const visibleAfterHide = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('.sps-custom-row'))
        return rows.filter(r => r.querySelector('.skm-edit-toggle.on')).length
      })
      console.log(`  Visible after hiding one: ${visibleAfterHide}`)

      // Now re-enable it (back to 9+ visible)
      const firstOff = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('.sps-custom-row'))
        const offRow = rows.find(r => !r.querySelector('.skm-edit-toggle.on'))
        if (!offRow) return null
        const toggle = offRow.querySelector('.skm-edit-toggle')
        const r = toggle.getBoundingClientRect()
        return { x: r.left + r.width/2, y: r.top + r.height/2 }
      })
      if (firstOff) {
        await page.touchscreen.tap(firstOff.x, firstOff.y)
        await page.waitForTimeout(300)
      }

      const visibleAfterReEnable = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('.sps-custom-row'))
        return rows.filter(r => r.querySelector('.skm-edit-toggle.on')).length
      })
      console.log(`  Visible after re-enabling: ${visibleAfterReEnable}`)

      // Now try to enable the LAST off metric to trigger the warning
      // (if all 10 are on, we can't trigger warning without hiding first)
      if (visibleAfterReEnable >= 9) {
        // Find a hidden metric if any, else hide one more and try to add it back twice
        const hasHidden = await page.evaluate(() => {
          const rows = Array.from(document.querySelectorAll('.sps-custom-row'))
          return rows.some(r => !r.querySelector('.skm-edit-toggle.on'))
        })

        if (!hasHidden) {
          // All 10 on — hide one to get to 9 visible
          const lastOnBox = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('.sps-custom-row'))
            const lastOn = [...rows].reverse().find(r => r.querySelector('.skm-edit-toggle.on'))
            if (!lastOn) return null
            const t = lastOn.querySelector('.skm-edit-toggle')
            const r = t.getBoundingClientRect()
            return { x: r.left + r.width/2, y: r.top + r.height/2 }
          })
          if (lastOnBox) { await page.touchscreen.tap(lastOnBox.x, lastOnBox.y); await page.waitForTimeout(300) }
        }

        // Now we should have exactly 9 on, 1 off — try enabling the off one
        const offToggleBox = await page.evaluate(() => {
          const rows = Array.from(document.querySelectorAll('.sps-custom-row'))
          const offRow = rows.find(r => !r.querySelector('.skm-edit-toggle.on'))
          if (!offRow) return null
          const t = offRow.querySelector('.skm-edit-toggle')
          const r = t.getBoundingClientRect()
          return { x: r.left + r.width/2, y: r.top + r.height/2 }
        })
        if (offToggleBox) {
          await page.touchscreen.tap(offToggleBox.x, offToggleBox.y)
          await page.waitForTimeout(400)
        }

        const warningVisible = await page.evaluate(() => !!document.querySelector('.sps-max-warning'))
        check(warningVisible, 'Max-9 warning toast appears when trying to enable 10th metric')

        if (warningVisible) {
          await page.screenshot({ path: path.join(OUT, '02-max-warning.png') })
          console.log('  Saved 02-max-warning.png')

          const warningText = await page.evaluate(() => {
            const el = document.querySelector('.sps-max-warning')
            return el ? el.textContent : null
          })
          check(warningText?.includes('Maximum reached'), `Warning says "Maximum reached" (got: "${warningText?.trim()}")`)
          check(warningText?.includes('up to 9 metrics'), `Warning says "up to 9 metrics" (got: "${warningText?.trim()}")`)

          // Wait for auto-dismiss
          await page.waitForTimeout(2500)
          const warningGone = await page.evaluate(() => !document.querySelector('.sps-max-warning'))
          check(warningGone, 'Warning auto-dismisses after ~2 seconds')
        }
      }
    }

    // Close customize
    await page.evaluate(() => document.querySelector('.sps-custom-close')?.click())
    await page.waitForTimeout(400)
  }

  // ── REQ 2: double-tap to close (SPS customize) ──────────────────────────
  console.log('\n=== REQ 2: Double-tap to close ===')

  // Reopen customize
  const menuBox2 = await page.evaluate(() => {
    const m = document.querySelector('.sps-menu')
    if (!m) return null
    const r = m.getBoundingClientRect()
    return { x: r.left + r.width/2, y: r.top + r.height/2 }
  })
  if (menuBox2) await page.touchscreen.tap(menuBox2.x, menuBox2.y)
  await page.waitForTimeout(600)

  const customOpen2 = await page.evaluate(() => !!document.querySelector('.sps-custom-sheet'))
  if (customOpen2) {
    // Find a safe blank area in the sheet (the subhead area)
    const blankArea = await page.evaluate(() => {
      const el = document.querySelector('.sps-custom-subhead')
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.left + 20, y: r.top + r.height/2 }
    })
    if (blankArea) {
      // Double tap: two taps within 300ms
      await page.touchscreen.tap(blankArea.x, blankArea.y)
      await page.waitForTimeout(120)
      await page.touchscreen.tap(blankArea.x, blankArea.y)
      await page.waitForTimeout(500)
    }
    const closedByDoubleTap = await page.evaluate(() => !document.querySelector('.sps-custom-sheet'))
    check(closedByDoubleTap, 'Double-tap on blank area closes customize sheet')
  } else {
    fail('Customize sheet not reopened for double-tap test')
  }

  // ── Compact layout unchanged ──────────────────────────────────────────────
  console.log('\n=== Compact layout unchanged ===')
  await page.evaluate(() => document.querySelector('.sps')?.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(OUT, '03-compact-unchanged.png') })
  console.log('  Saved 03-compact-unchanged.png')

  const rows3x3 = await page.evaluate(() => {
    const rows = document.querySelectorAll('.sps .sps-metric-row')
    if (rows.length !== 3) return false
    return Array.from(rows).every(r => r.querySelectorAll('.sps-metric').length === 3)
  })
  check(rows3x3, 'Compact 3×3 grid unchanged')

  console.log(`\n${'='.repeat(50)}`)
  if (failures.length === 0) console.log('RESULT: ALL PASS ✓')
  else { console.log(`RESULT: ${failures.length} FAILURE(S) ✗`); failures.forEach(f => console.log(`  - ${f}`)) }
  console.log('='.repeat(50))

  await browser.close()
})()
