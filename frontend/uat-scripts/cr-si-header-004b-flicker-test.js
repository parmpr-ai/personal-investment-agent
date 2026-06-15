const { chromium } = require('@playwright/test')
const path = require('path')
const fs = require('fs')

const OUT = path.join(__dirname, '../uat-screenshots/cr-si-header-004b')
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

const PORT = 3010

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
  await page.waitForTimeout(600)
}

async function getState(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.stock-intel-panel')
    const body = document.querySelector('.stock-intel-body')
    return {
      collapsed: panel?.classList.contains('stock-intel-panel-header-collapsed'),
      scrollTop: body?.scrollTop,
      scrollHeight: body?.scrollHeight,
      clientHeight: body?.clientHeight,
    }
  })
}

// Reset to expanded state cleanly
async function resetToTop(page) {
  await page.evaluate(() => { document.querySelector('.stock-intel-body')?.scrollTo({ top: 0 }) })
  await page.waitForTimeout(450)
}

// Collapse header and verify
async function collapseAt(page, pos) {
  await resetToTop(page)
  await page.evaluate((p) => { document.querySelector('.stock-intel-body')?.scrollTo({ top: p }) }, pos)
  await page.waitForTimeout(450)
  return getState(page)
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

  const tabs = ['Overview', 'Analysis', 'Chart', 'News', 'Financials']

  for (const tabName of tabs) {
    console.log(`\n=== ${tabName} ===`)
    await switchToTab(page, tabName)

    // A: Tab switch always resets to top + expanded
    const afterSwitch = await getState(page)
    check(afterSwitch.scrollTop === 0 && !afterSwitch.collapsed,
      `[${tabName}] Tab switch resets scroll+header`,
      `got scrollTop=${afterSwitch.scrollTop} collapsed=${afterSwitch.collapsed}`)

    // B: Collapse at 80px
    const atEighty = await collapseAt(page, 80)
    check(atEighty.collapsed, `[${tabName}] Collapses at 80px`)

    // C: THE FLICKER FIX — stays collapsed at 56px (old bug: would expand because 80-56=24 >= 24)
    // Scroll from 80 down a bit more to 90 (highwater=90), then up to 56
    await resetToTop(page)
    await page.evaluate(() => { document.querySelector('.stock-intel-body')?.scrollTo({ top: 90 }) })
    await page.waitForTimeout(350)
    await page.evaluate(() => { document.querySelector('.stock-intel-body')?.scrollTo({ top: 56 }) })
    await page.waitForTimeout(350)
    const at56 = await getState(page)
    // 90-56=34 >= 24, BUT 56 >= 40 → should NOT expand with new logic
    check(at56.collapsed, `[${tabName}] Stays collapsed at 56px (flicker fix)`,
      `collapsed=${at56.collapsed} (old logic would expand here)`)

    // D: Expand only happens below collapse threshold (< 40px)
    // highwater = 90 (or wherever after C), scroll up to 15px (< 40, pullback >= 24)
    await resetToTop(page)
    await page.evaluate(() => { document.querySelector('.stock-intel-body')?.scrollTo({ top: 80 }) })
    await page.waitForTimeout(350)
    await page.evaluate(() => { document.querySelector('.stock-intel-body')?.scrollTo({ top: 15 }) })
    await page.waitForTimeout(450)
    const at15 = await getState(page)
    check(!at15.collapsed, `[${tabName}] Expands at 15px (< threshold, > 24px pullback)`)

    // E: After expanding at 15, stays expanded at 39 (no spurious re-collapse)
    await page.evaluate(() => { document.querySelector('.stock-intel-body')?.scrollTo({ top: 39 }) })
    await page.waitForTimeout(350)
    const at39 = await getState(page)
    check(!at39.collapsed, `[${tabName}] Stays expanded at 39px (< collapse threshold)`)

    // F: Re-collapses at 40 (must scroll down, use fresh start)
    await resetToTop(page)
    await page.evaluate(() => { document.querySelector('.stock-intel-body')?.scrollTo({ top: 40 }) })
    await page.waitForTimeout(400)
    const at40 = await getState(page)
    check(at40.collapsed, `[${tabName}] Collapses at 40px`)

    // G: Expanded at top (≤ 2px), even after being collapsed
    await resetToTop(page)
    const atTop = await getState(page)
    check(!atTop.collapsed && atTop.scrollTop === 0, `[${tabName}] Always expanded at top`)

    // Screenshot
    await collapseAt(page, 80)
    await page.screenshot({ path: path.join(OUT, `${tabName.toLowerCase()}-collapsed.png`) })
    await resetToTop(page)
    await page.screenshot({ path: path.join(OUT, `${tabName.toLowerCase()}-expanded.png`) })
    console.log(`  Screenshots saved`)
  }

  // Tab-switch deep-scroll clamp test
  console.log('\n=== Tab-switch clamp test (deep scroll) ===')
  await switchToTab(page, 'Overview')
  await page.evaluate(() => { document.querySelector('.stock-intel-body')?.scrollTo({ top: 350 }) })
  await page.waitForTimeout(500)
  const deepState = await getState(page)
  console.log(`  Overview at 350px: collapsed=${deepState.collapsed}`)

  await switchToTab(page, 'Chart')
  await page.waitForTimeout(400)
  const afterClamp = await getState(page)
  check(afterClamp.scrollTop === 0 && !afterClamp.collapsed,
    'Tab switch Overview(350px)→Chart resets state',
    `got scrollTop=${afterClamp.scrollTop} collapsed=${afterClamp.collapsed}`)
  await page.screenshot({ path: path.join(OUT, 'tab-switch-clamp-reset.png') })

  // State preservation during same-session tab switch (both expanded)
  console.log('\n=== Tab switch while at top ===')
  await switchToTab(page, 'Overview')
  await resetToTop(page)
  await switchToTab(page, 'Financials')
  const finTop = await getState(page)
  check(!finTop.collapsed, 'Tab switch at top stays expanded')

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
