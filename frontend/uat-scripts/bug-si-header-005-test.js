const { chromium } = require('@playwright/test')
const path = require('path')
const fs = require('fs')

const OUT = path.join(__dirname, '../uat-screenshots/bug-si-header-005')
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

const PORT = 3011

async function openPanelNVDA(page) {
  await page.goto(`http://localhost:${PORT}/mobile`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.evaluate(() => {
    for (const btn of document.querySelectorAll('button')) {
      if ((btn.ariaLabel || '').toLowerCase().includes('search')) { btn.click(); return }
    }
  })
  await page.waitForTimeout(1000)
  await page.keyboard.type('NVDA')
  await page.waitForTimeout(1800)
  await page.evaluate(() => { document.querySelector('.global-search-result')?.click() })
  await page.waitForTimeout(2500)
}

async function switchToTab(page, tabLabel) {
  await page.evaluate((label) => {
    const tabs = document.querySelectorAll('.stock-intel-tabs button, .stock-intel-tabs [role="tab"]')
    for (const tab of tabs) {
      if (tab.textContent.trim().toLowerCase() === label.toLowerCase()) { tab.click(); return }
    }
  }, tabLabel)
  await page.waitForTimeout(500)
}

async function getActionButtons(page) {
  return page.evaluate(() => {
    const expanded = [...document.querySelectorAll('.stock-intel-header-actions button')]
    const compact = [...document.querySelectorAll('.stock-intel-compact-actions button')]
    const star = document.querySelector('.stock-intel-inline-action')
    return {
      expanded: expanded.map(b => ({ label: b.ariaLabel, disabled: b.disabled })),
      compact: compact.map(b => ({ label: b.ariaLabel, disabled: b.disabled })),
      starVisible: star ? window.getComputedStyle(star).display !== 'none' : false,
    }
  })
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
  })
  const page = await ctx.newPage()

  console.log('Opening NVDA panel...')
  await openPanelNVDA(page)

  const panelCount = await page.evaluate(() => document.querySelectorAll('.stock-intel-panel').length)
  if (!panelCount) { await page.screenshot({ path: path.join(OUT, 'debug-no-panel.png') }); await browser.close(); process.exit(1) }

  const failures = []
  const pass = (label) => console.log(`  ✓ ${label}`)
  const fail = (label, detail = '') => { console.log(`  ✗ ${label}${detail ? ': ' + detail : ''}`); failures.push(label) }
  const check = (cond, label, detail = '') => cond ? pass(label) : fail(label, detail)

  const tabs = ['Overview', 'Chart', 'News', 'Financials', 'Analysis']

  for (const tabName of tabs) {
    console.log(`\n=== ${tabName} ===`)
    if (tabName !== 'Overview') await switchToTab(page, tabName)

    // Ensure expanded state
    await page.evaluate(() => { document.querySelector('.stock-intel-body')?.scrollTo({ top: 0 }) })
    await page.waitForTimeout(400)

    const expandedBtns = await getActionButtons(page)
    const expandedLabels = expandedBtns.expanded.map(b => b.label.toLowerCase())

    // Expanded header: Search, Bell, Menu must all be present
    check(expandedLabels.some(l => l.includes('search')), `[${tabName}] Expanded: Search present`, `got: ${expandedLabels.join(', ')}`)
    check(expandedLabels.some(l => l.includes('notif')), `[${tabName}] Expanded: Bell present`)
    check(expandedLabels.some(l => l.includes('more') || l.includes('menu')), `[${tabName}] Expanded: Menu present`)

    // Expanded: Search must be enabled (functional)
    const expandedSearchBtn = expandedBtns.expanded.find(b => b.label.toLowerCase().includes('search'))
    check(expandedSearchBtn && !expandedSearchBtn.disabled, `[${tabName}] Expanded: Search enabled`)

    // Star visible in expanded
    check(expandedBtns.starVisible, `[${tabName}] Expanded: Star visible`)

    // Screenshot expanded
    await page.screenshot({ path: path.join(OUT, `${tabName.toLowerCase()}-expanded.png`) })

    // Collapse
    await page.evaluate(() => { document.querySelector('.stock-intel-body')?.scrollTo({ top: 80 }) })
    await page.waitForTimeout(400)
    const isCollapsed = await page.evaluate(() => document.querySelector('.stock-intel-panel')?.classList.contains('stock-intel-panel-header-collapsed'))
    check(isCollapsed, `[${tabName}] Header collapses`)

    const collapsedBtns = await getActionButtons(page)
    const compactLabels = collapsedBtns.compact.map(b => b.label.toLowerCase())

    // Collapsed: Search, Bell, Menu must be present
    check(compactLabels.some(l => l.includes('search')), `[${tabName}] Collapsed: Search present`, `got: ${compactLabels.join(', ')}`)
    check(compactLabels.some(l => l.includes('notif')), `[${tabName}] Collapsed: Bell present`)
    check(compactLabels.some(l => l.includes('more') || l.includes('menu')), `[${tabName}] Collapsed: Menu present`)

    // Collapsed: Search enabled
    const compactSearchBtn = collapsedBtns.compact.find(b => b.label.toLowerCase().includes('search'))
    check(compactSearchBtn && !compactSearchBtn.disabled, `[${tabName}] Collapsed: Search enabled`)

    // Screenshot collapsed
    await page.screenshot({ path: path.join(OUT, `${tabName.toLowerCase()}-collapsed.png`) })

    // Test Search actually opens from expanded
    await page.evaluate(() => { document.querySelector('.stock-intel-body')?.scrollTo({ top: 0 }) })
    await page.waitForTimeout(400)
    await page.evaluate(() => {
      const btns = document.querySelectorAll('.stock-intel-header-actions button')
      for (const b of btns) { if ((b.ariaLabel || '').toLowerCase().includes('search')) { b.click(); return } }
    })
    await page.waitForTimeout(800)
    const searchOpenedExpanded = await page.evaluate(() =>
      !!document.querySelector('.global-search-input, input[placeholder*="Search"], input[aria-label*="search" i]')
    )
    check(searchOpenedExpanded, `[${tabName}] Expanded: Search opens overlay`)
    if (searchOpenedExpanded) await page.keyboard.press('Escape')
    await page.waitForTimeout(400)

    // Test Search opens from collapsed
    await page.evaluate(() => { document.querySelector('.stock-intel-body')?.scrollTo({ top: 80 }) })
    await page.waitForTimeout(400)
    await page.evaluate(() => {
      const btns = document.querySelectorAll('.stock-intel-compact-actions button')
      for (const b of btns) { if ((b.ariaLabel || '').toLowerCase().includes('search')) { b.click(); return } }
    })
    await page.waitForTimeout(800)
    const searchOpenedCollapsed = await page.evaluate(() =>
      !!document.querySelector('.global-search-input, input[placeholder*="Search"], input[aria-label*="search" i]')
    )
    check(searchOpenedCollapsed, `[${tabName}] Collapsed: Search opens overlay`)
    if (searchOpenedCollapsed) await page.keyboard.press('Escape')
    await page.waitForTimeout(400)

    // Reset for next tab
    await page.evaluate(() => { document.querySelector('.stock-intel-body')?.scrollTo({ top: 0 }) })
    await page.waitForTimeout(300)
  }

  // Final side-by-side screenshots on Overview
  console.log('\n=== Final overview screenshots ===')
  await switchToTab(page, 'Overview')
  await page.evaluate(() => { document.querySelector('.stock-intel-body')?.scrollTo({ top: 0 }) })
  await page.waitForTimeout(400)
  const expandedBox = await page.evaluate(() => {
    const el = document.querySelector('.stock-intel-header')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })
  if (expandedBox) {
    await page.screenshot({ path: path.join(OUT, 'overview-expanded-header.png'), clip: { x: 0, y: expandedBox.y, width: 390, height: expandedBox.height + 4 } })
    console.log('  Saved overview-expanded-header.png')
  }

  await page.evaluate(() => { document.querySelector('.stock-intel-body')?.scrollTo({ top: 80 }) })
  await page.waitForTimeout(400)
  const compactBox = await page.evaluate(() => {
    const el = document.querySelector('.stock-intel-compact-header')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })
  if (compactBox && compactBox.height > 0) {
    await page.screenshot({ path: path.join(OUT, 'overview-collapsed-header.png'), clip: { x: 0, y: Math.max(0, compactBox.y - 2), width: 390, height: compactBox.height + 4 } })
    console.log('  Saved overview-collapsed-header.png')
  }

  console.log(`\n${'='.repeat(50)}`)
  if (failures.length === 0) {
    console.log('RESULT: ALL PASS ✓')
  } else {
    console.log(`RESULT: ${failures.length} FAILURE(S) ✗`)
    failures.forEach((f) => console.log(`  - ${f}`))
  }
  console.log('='.repeat(50))

  await browser.close()
})()
