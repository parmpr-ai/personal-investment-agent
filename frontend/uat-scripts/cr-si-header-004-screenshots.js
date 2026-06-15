const { chromium } = require('@playwright/test')
const path = require('path')
const fs = require('fs')

const OUT = path.join(__dirname, '../uat-screenshots/cr-si-header-004')
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

const PORT = 3009

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

async function scrollAndVerifyCollapse(page, tabName) {
  // Reset scroll to top first
  await page.evaluate(() => { document.querySelector('.stock-intel-body')?.scrollTo({ top: 0 }) })
  await page.waitForTimeout(400)

  const panelInfo = await page.evaluate(() => {
    const b = document.querySelector('.stock-intel-body')
    if (!b) return null
    return { scrollTop: b.scrollTop, scrollHeight: b.scrollHeight, clientHeight: b.clientHeight }
  })
  console.log(`[${tabName}] Panel scroll info:`, JSON.stringify(panelInfo))

  // Verify NOT collapsed at scroll top
  const notCollapsed = await page.evaluate(() => !document.querySelector('.stock-intel-panel')?.classList.contains('stock-intel-panel-header-collapsed'))
  console.log(`[${tabName}] Not collapsed at top: ${notCollapsed}`)

  // Scroll to trigger collapse
  await page.evaluate(() => { document.querySelector('.stock-intel-body')?.scrollTo({ top: 80 }) })
  await page.waitForTimeout(500)

  const collapsed = await page.evaluate(() => {
    // class is on the outer panel, but scroll was done on body
    const panel = document.querySelector('.stock-intel-panel')
    const body = document.querySelector('.stock-intel-body')
    return {
      collapsed: panel?.classList.contains('stock-intel-panel-header-collapsed'),
      bodyScrollTop: body?.scrollTop
    }
  })
  console.log(`[${tabName}] After scroll: ${JSON.stringify(collapsed)}`)

  return collapsed
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
  if (!panelCount) {
    await page.screenshot({ path: path.join(OUT, 'debug-no-panel.png') })
    await browser.close(); process.exit(1)
  }

  const tabs = ['Overview', 'Analysis', 'Financials', 'News', 'Chart']

  for (const tabName of tabs) {
    console.log(`\n--- Testing tab: ${tabName} ---`)
    await switchToTab(page, tabName)

    const collapsed = await scrollAndVerifyCollapse(page, tabName)

    // Screenshot collapsed state
    const compactBox = await page.evaluate(() => {
      const el = document.querySelector('.stock-intel-compact-header')
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    })
    if (compactBox && compactBox.height > 0 && collapsed?.collapsed) {
      await page.screenshot({
        path: path.join(OUT, `${tabName.toLowerCase()}-collapsed.png`),
        clip: { x: Math.max(0, compactBox.x), y: Math.max(0, compactBox.y - 2), width: compactBox.width, height: compactBox.height + 4 }
      })
      console.log(`[${tabName}] Saved ${tabName.toLowerCase()}-collapsed.png (height=${compactBox.height})`)
    } else {
      console.log(`[${tabName}] ⚠ compact header box: ${JSON.stringify(compactBox)}`)
      await page.screenshot({ path: path.join(OUT, `${tabName.toLowerCase()}-debug.png`) })
    }

    // Also full viewport
    await page.screenshot({ path: path.join(OUT, `${tabName.toLowerCase()}-full.png`) })
  }

  // Test: switch tabs while collapsed (state preservation)
  console.log('\n--- Testing tab switch while collapsed ---')
  await switchToTab(page, 'Overview')
  await page.evaluate(() => { document.querySelector('.stock-intel-body')?.scrollTo({ top: 80 }) })
  await page.waitForTimeout(400)
  const collapsedBefore = await page.evaluate(() => document.querySelector('.stock-intel-panel')?.classList.contains('stock-intel-panel-header-collapsed'))
  console.log('Collapsed on Overview:', collapsedBefore)

  await switchToTab(page, 'Financials')
  await page.waitForTimeout(400)
  const collapsedAfterSwitch = await page.evaluate(() => document.querySelector('.stock-intel-panel')?.classList.contains('stock-intel-panel-header-collapsed'))
  const scrollAfterSwitch = await page.evaluate(() => document.querySelector('.stock-intel-body')?.scrollTop)
  console.log('Collapsed after switching to Financials:', collapsedAfterSwitch, '(scrollTop:', scrollAfterSwitch, ')')
  await page.screenshot({ path: path.join(OUT, 'tab-switch-while-collapsed.png') })

  await browser.close()
  console.log('\nDONE')
})()
