const { chromium } = require('@playwright/test')
const path = require('path')
const fs = require('fs')

const OUT = path.join(__dirname, '../uat-screenshots/cr-ps-021')
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
const PORT = 3019

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const failures = []
  const pass = (l) => console.log(`  ✓ ${l}`)
  const fail = (l, d = '') => { console.log(`  ✗ ${l}${d ? ': ' + d : ''}`); failures.push(l) }
  const check = (c, l, d = '') => c ? pass(l) : fail(l, d)

  // ── Mobile session ─────────────────────────────────────────────────────────
  const mobileCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  })
  const page = await mobileCtx.newPage()

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

  // Open expanded sheet
  console.log('\n=== Open expanded sheet ===')
  await page.evaluate(() => document.querySelector('.sps')?.click())
  await page.waitForTimeout(1000)
  const sheetOpen = await page.evaluate(() => !!document.querySelector('.spse-sheet'))
  check(sheetOpen, 'Expanded V3 sheet opened (.spse-sheet)')
  if (!sheetOpen) { console.log('\nRESULT: BLOCKED — sheet did not open'); await browser.close(); return }

  // ── Metrics grid — 2×4 no scroll ──────────────────────────────────────────
  console.log('\n=== Metrics grid (2×4) ===')
  const stripEl = await page.evaluate(() => {
    const el = document.querySelector('.spse-strip')
    if (!el) return null
    const style = window.getComputedStyle(el)
    const items = el.querySelectorAll('.spse-strip-item').length
    const overflowX = style.overflowX
    const display = style.display
    return { items, overflowX, display }
  })
  check(stripEl !== null, 'Metrics strip element exists')
  check(stripEl?.items === 8, `8 metric cells found (got ${stripEl?.items})`)
  check(stripEl?.display === 'grid', `Strip is CSS grid (got ${stripEl?.display})`)
  check(!['auto', 'scroll'].includes(stripEl?.overflowX || ''), `No horizontal scroll (overflow-x: ${stripEl?.overflowX})`)

  const stripLabels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.spse-strip-label')).map(el => el.textContent?.trim() || ''))
  console.log('  Labels:', stripLabels.join(' | '))
  check(stripLabels.some(l => l.toLowerCase().includes('market')), 'Market Value label present')
  check(stripLabels.some(l => l.toLowerCase().includes('shares')), 'Shares label present')
  check(stripLabels.some(l => l.toLowerCase().includes('avg cost')), 'Avg Cost label present')

  // No P&L arrows
  const stripSubs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.spse-strip-sub')).map(el => el.textContent || ''))
  const hasArrows = stripSubs.some(t => t.includes('↑') || t.includes('↓') || t.includes('▲') || t.includes('▼'))
  check(!hasArrows, 'No directional arrows in metrics')

  // Screenshot: top
  await page.screenshot({ path: path.join(OUT, '01-mobile-top.png') })
  console.log('  Saved 01-mobile-top.png')

  // ── Section order ──────────────────────────────────────────────────────────
  console.log('\n=== Section order ===')
  const sections = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.spse-section'))
      .map(s => s.querySelector('.spse-section-head h4')?.textContent?.trim() || ''))
  console.log('  Sections:', sections)
  check(sections.length >= 3, `At least 3 sections found (got ${sections.length})`)
  check(sections[0] === 'Position Health', `Section 1 = Position Health (got: ${sections[0]})`)
  check(sections[1] === 'Position Value Evolution', `Section 2 = Position Value Evolution (got: ${sections[1]})`)

  // ── No chevrons in section headers ────────────────────────────────────────
  console.log('\n=== No chevrons ===')
  const hasChevrons = await page.evaluate(() => {
    const heads = document.querySelectorAll('.spse-section-head')
    for (const h of heads) {
      if (h.tagName === 'BUTTON') return 'section-head is a button'
      if (h.querySelector('svg')) return 'svg found in section-head'
    }
    return false
  })
  check(!hasChevrons, `No chevrons/svg in section headers (${hasChevrons || 'clean'})`)

  // ── Section body always visible ────────────────────────────────────────────
  console.log('\n=== Sections always visible ===')
  const allBodiesVisible = await page.evaluate(() => {
    const bodies = document.querySelectorAll('.spse-section-body')
    return bodies.length >= 2 && Array.from(bodies).every(b => {
      const s = window.getComputedStyle(b)
      return s.display !== 'none' && s.visibility !== 'hidden'
    })
  })
  check(allBodiesVisible, 'All section bodies are visible (no collapse)')

  // ── AI exclusion ───────────────────────────────────────────────────────────
  console.log('\n=== AI exclusion ===')
  const sheetText = await page.evaluate(() => document.querySelector('.spse-sheet')?.textContent || '')
  const aiTerms = ['AI Score', 'Bullish', 'Bearish', 'News', 'Catalysts', 'Analyst Target', 'Fair Value', 'Sentiment']
  for (const term of aiTerms) {
    check(!sheetText.includes(term), `No "${term}" in expanded sheet`)
  }

  // ── Position Health section ────────────────────────────────────────────────
  console.log('\n=== Position Health ===')
  const healthScore = await page.evaluate(() =>
    document.querySelector('.spse-health-num')?.textContent?.trim() || '')
  check(healthScore.length > 0 && !isNaN(Number(healthScore)), `Health score rendered: ${healthScore}`)
  const healthFactors = await page.evaluate(() =>
    document.querySelectorAll('.spse-health-factor').length)
  check(healthFactors === 5, `5 health factors (got ${healthFactors})`)

  // ── Scroll to chart, screenshot ────────────────────────────────────────────
  await page.evaluate(() => document.querySelector('.spse-sheet')?.scrollBy(0, 460))
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(OUT, '02-mobile-chart.png') })
  console.log('  Saved 02-mobile-chart.png')

  // ── Position Value Evolution ───────────────────────────────────────────────
  console.log('\n=== Position Value Evolution ===')
  const hasChart = await page.evaluate(() => !!document.querySelector('.spse-evo-chart'))
  check(hasChart, 'Evolution chart SVG rendered')
  const rangeTabs = await page.evaluate(() => document.querySelectorAll('.spse-range-tab').length)
  check(rangeTabs >= 5, `Range tabs present (${rangeTabs})`)
  const hasLegend = await page.evaluate(() => !!document.querySelector('.spse-evo-legend'))
  check(hasLegend, 'Chart legend present')
  const hasMarkers = await page.evaluate(() => document.querySelectorAll('.spse-evo-chart circle').length > 0)
  check(hasMarkers, 'Trade markers rendered on chart')

  // ── 1M filter ─────────────────────────────────────────────────────────────
  console.log('\n=== 1M filter ===')
  const tabs1M = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.spse-range-tab'))
    const tab = tabs.find(t => t.textContent?.trim() === '1M')
    if (tab) { tab.click(); return true }
    return false
  })
  await page.waitForTimeout(400)
  check(tabs1M, '1M range tab found and clicked')
  const active1M = await page.evaluate(() => {
    const tabs = document.querySelectorAll('.spse-range-tab')
    return Array.from(tabs).find(t => t.classList.contains('active'))?.textContent?.trim() || ''
  })
  check(active1M === '1M', `1M tab is active (got: ${active1M})`)
  await page.screenshot({ path: path.join(OUT, '06-1m-filter.png') })
  console.log('  Saved 06-1m-filter.png')

  // ── ALL filter ─────────────────────────────────────────────────────────────
  const tabsALL = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.spse-range-tab'))
    const tab = tabs.find(t => t.textContent?.trim() === 'ALL')
    if (tab) { tab.click(); return true }
    return false
  })
  await page.waitForTimeout(400)
  check(tabsALL, 'ALL range tab clicked')
  await page.screenshot({ path: path.join(OUT, '07-all-filter.png') })
  console.log('  Saved 07-all-filter.png')

  // ── Marker tap ─────────────────────────────────────────────────────────────
  console.log('\n=== Marker tap ===')
  const markerTapped = await page.evaluate(() => {
    const markers = document.querySelectorAll('.spse-evo-chart g[style*="cursor"]')
    if (markers.length === 0) return 'no clickable markers found'
    const first = markers[0]
    first.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  })
  await page.waitForTimeout(300)
  const markerCardVisible = await page.evaluate(() => !!document.querySelector('.spse-marker-card'))
  check(markerCardVisible, 'Marker detail card appears on tap')
  if (markerCardVisible) {
    const cardType = await page.evaluate(() =>
      document.querySelector('.spse-marker-card-type')?.textContent?.trim() || '')
    check(['Buy', 'Add', 'Trim', 'Sell'].includes(cardType), `Card shows trade type: ${cardType}`)
    await page.screenshot({ path: path.join(OUT, '05-marker-detail.png') })
    console.log('  Saved 05-marker-detail.png')
    // Close marker
    await page.evaluate(() => { const el = document.querySelector('.spse-marker-card-close'); if (el) el.click() })
    await page.waitForTimeout(200)
  } else {
    console.log(`  Marker tap result: ${markerTapped}`)
  }

  // ── Sample data (analytics section) ───────────────────────────────────────
  console.log('\n=== Sample data ===')
  await page.evaluate(() => document.querySelector('.spse-sheet')?.scrollBy(0, 500))
  await page.waitForTimeout(300)
  const analyticsText = await page.evaluate(() => {
    const sections = document.querySelectorAll('.spse-section')
    for (const s of sections) {
      if (s.querySelector('h4')?.textContent?.includes('Position Analytics')) {
        return s.querySelector('.spse-analytics-cards')?.textContent || ''
      }
    }
    return ''
  })
  const hasSampleData = analyticsText.length > 0 && !analyticsText.includes('—')
  check(hasSampleData, `Position Analytics has sample data (not empty): ${analyticsText.slice(0, 80)}`)
  await page.screenshot({ path: path.join(OUT, '03-mobile-lower.png') })
  console.log('  Saved 03-mobile-lower.png')

  // ── Trade timeline sample data ─────────────────────────────────────────────
  console.log('\n=== Trade Timeline ===')
  await page.evaluate(() => document.querySelector('.spse-sheet')?.scrollBy(0, 800))
  await page.waitForTimeout(300)
  const timelineTrades = await page.evaluate(() =>
    document.querySelectorAll('.spse-timeline-row').length)
  check(timelineTrades >= 3, `Trade timeline has ${timelineTrades} entries (sample data)`)

  // ── Customize View ─────────────────────────────────────────────────────────
  console.log('\n=== Customize View ===')
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
  check(custOpen, 'Customize View sheet opened')

  if (custOpen) {
    const pinnedRows = await page.evaluate(() => document.querySelectorAll('.spse-cust-pinned-row').length)
    check(pinnedRows === 2, `2 pinned rows in customize (got ${pinnedRows})`)
    const optionalRows = await page.evaluate(() => document.querySelectorAll('.spse-cust-row').length)
    check(optionalRows === 4, `4 optional rows with toggles (got ${optionalRows})`)
    const hasPinnedBadge = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.spse-cust-pinned-badge')).some(el => el.textContent?.includes('visible')))
    check(hasPinnedBadge, '"Always visible" badge on pinned sections')
    const custHasReset = await page.evaluate(() => !!document.querySelector('.spse-cust-reset'))
    check(custHasReset, 'Reset button present')

    await page.screenshot({ path: path.join(OUT, '04-mobile-customize.png') })
    console.log('  Saved 04-mobile-customize.png')

    await page.evaluate(() => { const el = document.querySelector('.spse-cust-close'); if (el) el.click() })
    await page.waitForTimeout(400)
  }

  await mobileCtx.close()

  // ── Desktop session ────────────────────────────────────────────────────────
  console.log('\n=== Desktop ===')
  const desktopCtx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  })
  const dPage = await desktopCtx.newPage()
  await dPage.goto(`http://localhost:${PORT}/mobile?si=NVDA`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await dPage.waitForTimeout(4000)

  let dSpsVisible = await dPage.evaluate(() => !!document.querySelector('.sps'))
  if (!dSpsVisible) {
    for (let i = 0; i < 14; i++) {
      await dPage.evaluate(() => {
        const p = document.querySelector('.stock-intel-mobile-dialog,.si-body,.stock-intel-body')
        if (p) p.scrollTop += 220; else window.scrollBy(0, 220)
      })
      await dPage.waitForTimeout(150)
      dSpsVisible = await dPage.evaluate(() => !!document.querySelector('.sps'))
      if (dSpsVisible) break
    }
  }
  if (dSpsVisible) {
    await dPage.evaluate(() => { const el = document.querySelector('.sps'); if (el) el.click() })
    await dPage.waitForTimeout(800)
    const dSheetOpen = await dPage.evaluate(() => !!document.querySelector('.spse-sheet'))
    check(dSheetOpen, 'Desktop: expanded sheet opened')
    if (dSheetOpen) {
      await dPage.screenshot({ path: path.join(OUT, '08-desktop-full.png') })
      console.log('  Saved 08-desktop-full.png')
      const dStripGrid = await dPage.evaluate(() => {
        const el = document.querySelector('.spse-strip')
        if (!el) return null
        return window.getComputedStyle(el).display
      })
      check(dStripGrid === 'grid', `Desktop: strip is grid (${dStripGrid})`)
    }
  } else {
    fail('Desktop: .sps compact not found')
  }
  await desktopCtx.close()

  // ── Result ─────────────────────────────────────────────────────────────────
  await browser.close()
  console.log(`\n${'='.repeat(50)}`)
  if (failures.length === 0) console.log('RESULT: ALL PASS ✓')
  else { console.log(`RESULT: ${failures.length} FAILURE(S) ✗`); failures.forEach(f => console.log(`  - ${f}`)) }
  console.log('='.repeat(50))
})()
