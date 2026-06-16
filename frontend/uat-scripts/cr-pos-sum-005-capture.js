const { chromium } = require('@playwright/test')
const path = require('path')
const fs = require('fs')

const OUT = path.join(__dirname, '../uat-screenshots/cr-pos-sum-005')
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
  const fail = (label, detail = '') => { console.log(`  ✗ ${label}${detail ? ': ' + detail : ''}`); failures.push(label) }
  const check = (cond, label, detail = '') => cond ? pass(label) : fail(label, detail)

  await page.goto(`http://localhost:${PORT}/mobile?si=NVDA`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(4000)

  // Scroll to .sps
  let spsVisible = await page.evaluate(() => !!document.querySelector('.sps'))
  if (!spsVisible) {
    for (let i = 0; i < 14; i++) {
      await page.evaluate(() => {
        const panel = document.querySelector('.stock-intel-mobile-dialog, .si-body, .stock-intel-body')
        if (panel) panel.scrollTop += 220
        else window.scrollBy(0, 220)
      })
      await page.waitForTimeout(150)
      spsVisible = await page.evaluate(() => !!document.querySelector('.sps'))
      if (spsVisible) break
    }
  }
  check(spsVisible, '.sps exists')
  if (!spsVisible) {
    await page.screenshot({ path: path.join(OUT, 'debug-no-sps.png') })
    await browser.close(); return
  }

  await page.evaluate(() => document.querySelector('.sps')?.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT, '01-compact-after.png') })
  console.log('  Saved 01-compact-after.png')

  // ── Grid structure checks ──────────────────────────────────────────────────
  const rowCount = await page.evaluate(() => document.querySelectorAll('.sps .sps-metric-row').length)
  check(rowCount === 3, `Exactly 3 metric rows (got ${rowCount})`)

  const row1Cols = await page.evaluate(() => document.querySelectorAll('.sps .sps-metric-row:nth-child(1) .sps-metric').length)
  check(row1Cols === 3, `Row 1 has 3 columns (got ${row1Cols}) — symmetric 3×3`)

  const row2Cols = await page.evaluate(() => document.querySelectorAll('.sps .sps-metric-row:nth-child(2) .sps-metric').length)
  check(row2Cols === 3, `Row 2 has 3 columns (got ${row2Cols})`)

  const row3Cols = await page.evaluate(() => document.querySelectorAll('.sps .sps-metric-row:nth-child(3) .sps-metric').length)
  check(row3Cols === 3, `Row 3 has 3 columns (got ${row3Cols})`)

  const hasCompactGrid = await page.evaluate(() => !!document.querySelector('.sps-compact-grid'))
  check(hasCompactGrid, '.sps-compact-grid class applied')

  // ── No ellipsis / truncation ───────────────────────────────────────────────
  const noEllipsis = await page.evaluate(() => {
    const vals = Array.from(document.querySelectorAll('.sps-compact-grid .sps-metric b'))
    for (const el of vals) {
      if (el.scrollWidth > el.offsetWidth + 2) return { ok: false, text: el.textContent }
    }
    return { ok: true, text: null }
  })
  check(noEllipsis.ok, `No value overflow/truncation (problem: ${noEllipsis.text})`)

  // ── Layout order: Row 1 = Shares, Avg Cost, Today's P&L ───────────────────
  const row1Labels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.sps .sps-metric-row:nth-child(1) .sps-metric span'))
      .map(el => el.textContent?.trim())
  )
  check(
    row1Labels[0] === 'Shares' && row1Labels[1] === 'Avg Cost' && row1Labels[2] === "Today's P&L",
    `Row 1 = Shares / Avg Cost / Today's P&L (got: ${row1Labels.join(' / ')})`
  )

  const row2Labels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.sps .sps-metric-row:nth-child(2) .sps-metric span'))
      .map(el => el.textContent?.trim())
  )
  check(
    row2Labels[0] === 'P&L' && row2Labels[1] === 'P&L %' && row2Labels[2] === 'MV',
    `Row 2 = P&L / P&L % / MV (got: ${row2Labels.join(' / ')})`
  )

  const row3Labels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.sps .sps-metric-row:nth-child(3) .sps-metric span'))
      .map(el => el.textContent?.trim())
  )
  check(
    row3Labels[0] === 'Cost Basis' && row3Labels[1] === 'Unrealized P&L' && row3Labels[2] === 'Portfolio %',
    `Row 3 = Cost Basis / Unrealized P&L / Portfolio % (got: ${row3Labels.join(' / ')})`
  )

  // ── Font size check (value b should be ≤16px, not 18px) ──────────────────
  const valueFontSize = await page.evaluate(() => {
    const el = document.querySelector('.sps-compact-grid .sps-metric b')
    return el ? window.getComputedStyle(el).fontSize : null
  })
  check(valueFontSize && parseFloat(valueFontSize) <= 16, `Value font ≤16px (got ${valueFontSize})`)

  // ── No boxes / cards ──────────────────────────────────────────────────────
  const noBoxes = await page.evaluate(() => !document.querySelector('.sps .sps-metric-box, .sps .sps-card'))
  check(noBoxes, 'No boxes or cards in compact')

  const noChart = await page.evaluate(() => !document.querySelector('.sps > .sps-chart, .sps > svg'))
  check(noChart, 'No chart in compact')

  console.log(`\n${'='.repeat(50)}`)
  if (failures.length === 0) {
    console.log('RESULT: ALL PASS ✓')
  } else {
    console.log(`RESULT: ${failures.length} FAILURE(S) ✗`)
    failures.forEach(f => console.log(`  - ${f}`))
  }
  console.log('='.repeat(50))

  await browser.close()
})()
