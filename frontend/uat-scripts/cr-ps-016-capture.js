const { chromium } = require('@playwright/test')
const path = require('path')
const fs = require('fs')

const OUT = path.join(__dirname, '../uat-screenshots/cr-ps-016')
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
const PORT = 3018

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  })
  const page = await ctx.newPage()
  const failures = []
  const pass = (l) => console.log(`  ✓ ${l}`)
  const fail = (l, d = '') => { console.log(`  ✗ ${l}${d ? ': ' + d : ''}`); failures.push(l) }
  const check = (c, l, d = '') => c ? pass(l) : fail(l, d)

  await page.goto(`http://localhost:${PORT}/mobile?si=NVDA`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(4000)

  // Scroll to .sps
  let spsVisible = await page.evaluate(() => !!document.querySelector('.sps'))
  if (!spsVisible) {
    for (let i = 0; i < 14; i++) {
      await page.evaluate(() => {
        const p = document.querySelector('.stock-intel-mobile-dialog,.si-body,.stock-intel-body')
        if (p) p.scrollTop += 220; else window.scrollBy(0, 220)
      })
      await page.waitForTimeout(150)
      spsVisible = await page.evaluate(() => !!document.querySelector('.sps'))
      if (spsVisible) break
    }
  }
  check(spsVisible, '.sps compact found')

  // ── Compact: no arrows ─────────────────────────────────────────────────
  console.log('\n=== No P&L arrows in compact ===')
  const subTexts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.sps-metric small')).map(el => el.textContent || '')
  })
  const hasArrows = subTexts.some(t => t.includes('↑') || t.includes('↓') || t.includes('▲') || t.includes('▼'))
  check(!hasArrows, 'No directional arrows in compact metric sub-text', hasArrows ? `found: ${subTexts.find(t => t.includes('↑') || t.includes('↓'))}` : '')
  console.log(`  Sub-texts: ${subTexts.slice(0, 4).join(' | ')}`)

  // ── Open expanded sheet ─────────────────────────────────────────────────
  console.log('\n=== Open expanded sheet ===')
  await page.evaluate(() => document.querySelector('.sps')?.click())
  await page.waitForTimeout(800)
  const sheetOpen = await page.evaluate(() => !!document.querySelector('.spse-sheet'))
  check(sheetOpen, 'Expanded V3 sheet opened (.spse-sheet)')

  if (!sheetOpen) { console.log('\nRESULT: BLOCKED — sheet did not open'); await browser.close(); return }

  // Screenshot: top of sheet
  await page.screenshot({ path: path.join(OUT, '01-expanded-top.png') })
  console.log('  Saved 01-expanded-top.png')

  // ── Header checks ──────────────────────────────────────────────────────
  console.log('\n=== Header ===')
  const hasCustomizeBtn = await page.evaluate(() => !!document.querySelector('.spse-customize-btn'))
  check(hasCustomizeBtn, 'Customize View button present')
  const hasCloseBtn = await page.evaluate(() => {
    const sheet = document.querySelector('.spse-sheet')
    return sheet ? !!sheet.querySelector('.sps-sheet-close') : false
  })
  check(hasCloseBtn, 'X close button present')

  // ── Top strip ──────────────────────────────────────────────────────────
  console.log('\n=== Top strip ===')
  const stripItems = await page.evaluate(() => {
    const items = document.querySelectorAll('.spse-strip-item')
    return Array.from(items).map(el => ({
      label: el.querySelector('.spse-strip-label')?.textContent?.trim() || '',
      value: el.querySelector('.spse-strip-value')?.textContent?.trim() || '',
    }))
  })
  check(stripItems.length >= 6, `Strip has ${stripItems.length} items (expected ≥6)`)
  const hasShares = stripItems.some(i => i.label.toLowerCase().includes('shares'))
  const hasAvgCost = stripItems.some(i => i.label.toLowerCase().includes('avg cost'))
  check(hasShares, 'Shares in top strip')
  check(hasAvgCost, 'Avg Cost in top strip')
  console.log('  Strip:', stripItems.slice(0, 4).map(i => `${i.label}: ${i.value}`).join(' | '))

  // Strip no arrows
  const stripSubTexts = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.spse-strip-sub')).map(el => el.textContent || ''))
  const stripHasArrows = stripSubTexts.some(t => t.includes('↑') || t.includes('↓'))
  check(!stripHasArrows, 'No arrows in strip sub-text')

  // ── Sections ───────────────────────────────────────────────────────────
  console.log('\n=== Sections ===')
  const sections = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.spse-section')).map(s =>
      s.querySelector('.spse-section-head h4')?.textContent?.trim() || '')
  })
  console.log('  Sections found:', sections)
  check(sections.length >= 6, `At least 6 sections (found ${sections.length})`)
  check(sections[0] === 'Position Health', `Position Health is first (got: ${sections[0]})`)
  check(sections[1] === 'Position Analytics', `Position Analytics is second (got: ${sections[1]})`)
  check(sections[sections.length - 1] === 'Trade Timeline', `Trade Timeline is last (got: ${sections[sections.length - 1]})`)

  // ── AI exclusion ───────────────────────────────────────────────────────
  console.log('\n=== AI exclusion ===')
  const sheetText = await page.evaluate(() => document.querySelector('.spse-sheet')?.textContent || '')
  const aiTerms = ['AI Score', 'Bullish', 'Bearish', 'News', 'Catalysts', 'Analyst Target', 'Fair Value', 'Sentiment']
  for (const term of aiTerms) {
    check(!sheetText.includes(term), `No "${term}" in expanded sheet`)
  }

  // ── Position Health section ────────────────────────────────────────────
  console.log('\n=== Position Health ===')
  const healthExpanded = await page.evaluate(() => {
    const first = document.querySelector('.spse-section')
    return first ? !!first.querySelector('.spse-health') : false
  })
  check(healthExpanded, 'Position Health section body visible (default expanded)')
  const healthScore = await page.evaluate(() =>
    document.querySelector('.spse-health-num')?.textContent?.trim() || '')
  check(healthScore.length > 0 && !isNaN(Number(healthScore)), `Health score rendered: ${healthScore}`)
  const healthFactors = await page.evaluate(() =>
    document.querySelectorAll('.spse-health-factor').length)
  check(healthFactors === 5, `5 health factors (got ${healthFactors})`)

  // ── Scroll middle screenshot ───────────────────────────────────────────
  await page.evaluate(() => document.querySelector('.spse-sheet')?.scrollBy(0, 500))
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(OUT, '02-expanded-middle.png') })
  console.log('  Saved 02-expanded-middle.png')

  // ── Position Value Evolution ───────────────────────────────────────────
  console.log('\n=== Position Value Evolution ===')
  const evoSection = await page.evaluate(() => {
    const sections = document.querySelectorAll('.spse-section')
    for (const s of sections) {
      if (s.querySelector('h4')?.textContent?.includes('Position Value Evolution')) return true
    }
    return false
  })
  check(evoSection, 'Position Value Evolution section present')
  const hasChart = await page.evaluate(() => !!document.querySelector('.spse-evo-chart'))
  check(hasChart, 'Evolution chart SVG rendered')
  const hasRangeTabs = await page.evaluate(() => document.querySelectorAll('.spse-range-tab').length)
  check(hasRangeTabs >= 5, `Range tabs present (${hasRangeTabs})`)
  const hasLegend = await page.evaluate(() => !!document.querySelector('.spse-evo-legend'))
  check(hasLegend, 'Chart legend present')

  // ── Vertical scroll ────────────────────────────────────────────────────
  await page.evaluate(() => document.querySelector('.spse-sheet')?.scrollBy(0, 800))
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(OUT, '03-expanded-bottom.png') })
  console.log('  Saved 03-expanded-bottom.png')

  // ── Customize View sheet ───────────────────────────────────────────────
  console.log('\n=== Customize View ===')
  // Scroll back to top first
  await page.evaluate(() => document.querySelector('.spse-sheet')?.scrollTo(0, 0))
  await page.waitForTimeout(200)
  const custBtn = await page.evaluate(() => {
    const btn = document.querySelector('.spse-customize-btn')
    if (!btn) return null
    const r = btn.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  if (custBtn) await page.touchscreen.tap(custBtn.x, custBtn.y)
  await page.waitForTimeout(700)
  const custOpen = await page.evaluate(() => !!document.querySelector('.spse-cust-sheet'))
  check(custOpen, 'Section customize sheet opened')

  if (custOpen) {
    await page.screenshot({ path: path.join(OUT, '04-customize-view.png') })
    console.log('  Saved 04-customize-view.png')

    const custRows = await page.evaluate(() => document.querySelectorAll('.spse-cust-row').length)
    check(custRows === 6, `6 section rows in customize (got ${custRows})`)
    const custHasReset = await page.evaluate(() => !!document.querySelector('.spse-cust-reset'))
    check(custHasReset, 'Reset button in customize')
    const custCloseRight = await page.evaluate(() => {
      const head = document.querySelector('.spse-cust-head')
      if (!head) return false
      const children = Array.from(head.children)
      const closeIdx = children.findIndex(el => el.classList.contains('spse-cust-close'))
      return closeIdx === children.length - 1
    })
    check(custCloseRight, 'X close is last in customize header (right)')

    // Close customize
    await page.evaluate(() => document.querySelector('.spse-cust-close')?.click())
    await page.waitForTimeout(400)
  }

  // ── Compact view unchanged ─────────────────────────────────────────────
  console.log('\n=== Compact unchanged ===')
  // Close expanded
  await page.evaluate(() => document.querySelector('.sps-sheet-close')?.click())
  await page.waitForTimeout(400)
  const compactStillThere = await page.evaluate(() => !!document.querySelector('.sps'))
  check(compactStillThere, 'Compact .sps still present after closing expanded')
  const compact3x3 = await page.evaluate(() => {
    const rows = document.querySelectorAll('.sps .sps-metric-row')
    return rows.length === 3 && Array.from(rows).every(r => r.querySelectorAll('.sps-metric').length === 3)
  })
  check(compact3x3, 'Compact 3×3 grid unchanged')
  await page.evaluate(() => document.querySelector('.sps')?.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(200)
  await page.screenshot({ path: path.join(OUT, '05-compact-unchanged.png') })
  console.log('  Saved 05-compact-unchanged.png')

  console.log(`\n${'='.repeat(50)}`)
  if (failures.length === 0) console.log('RESULT: ALL PASS ✓')
  else { console.log(`RESULT: ${failures.length} FAILURE(S) ✗`); failures.forEach(f => console.log(`  - ${f}`)) }
  console.log('='.repeat(50))

  await browser.close()
})()
