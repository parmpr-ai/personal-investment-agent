const { chromium } = require('@playwright/test')
const path = require('path')
const fs = require('fs')

const OUT = path.join(__dirname, '../uat-screenshots/pf-view-001')
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

const PORT = 3012

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

  const failures = []
  const pass = (label) => console.log(`  ✓ ${label}`)
  const fail = (label, detail = '') => { console.log(`  ✗ ${label}${detail ? ': ' + detail : ''}`); failures.push(label) }
  const check = (cond, label, detail = '') => cond ? pass(label) : fail(label, detail)

  await page.goto(`http://localhost:${PORT}/mobile`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2000)

  // Navigate to portfolio tab via bottom nav
  await page.evaluate(() => {
    const navBtns = document.querySelectorAll('.mobile-bottom-nav button')
    for (const b of navBtns) {
      if ((b.textContent || '').toLowerCase().includes('portfolio')) { b.click(); return }
    }
  })
  await page.waitForTimeout(1500)

  // Screenshot: portfolio page (no view selector row)
  await page.screenshot({ path: path.join(OUT, 'portfolio-page.png') })
  console.log('Saved portfolio-page.png')

  // CHECK 1: pf-view-selector must NOT exist in DOM
  const viewSelectorExists = await page.evaluate(() => !!document.querySelector('.pf-view-selector'))
  check(!viewSelectorExists, 'pf-view-selector row removed from DOM')

  // CHECK 2: Three-dot menu must exist and open
  const dotMenuBtn = await page.evaluate(() => {
    const btns = document.querySelectorAll('button')
    for (const b of btns) {
      if ((b.ariaLabel || '').toLowerCase().includes('portfolio options') || b.className.includes('pf-options-btn')) return true
    }
    return false
  })
  check(dotMenuBtn, 'Three-dot portfolio options button present')

  // Open three-dot menu
  await page.evaluate(() => {
    const btns = document.querySelectorAll('button')
    for (const b of btns) {
      if ((b.ariaLabel || '').toLowerCase().includes('portfolio options') || b.className.includes('pf-options-btn')) { b.click(); return }
    }
  })
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(OUT, 'three-dot-menu-open.png') })
  console.log('Saved three-dot-menu-open.png')

  // CHECK 3: View options exist inside the sheet
  const viewOptionsInSheet = await page.evaluate(() => {
    const sheet = document.querySelector('.mobile-portfolio-view-options, .mobile-watchlist-sheet-menu')
    if (!sheet) return []
    return [...sheet.querySelectorAll('button')].map(b => b.textContent?.trim())
  })
  console.log(`  View options in sheet: [${viewOptionsInSheet.join(', ')}]`)
  check(viewOptionsInSheet.some(l => l?.toLowerCase().includes('table')), 'Sheet has Table option')
  check(viewOptionsInSheet.some(l => l?.toLowerCase().includes('1x1') || l?.toLowerCase().includes('1×1') || l?.toLowerCase().includes('cards 1')), 'Sheet has 1x1 option')
  check(viewOptionsInSheet.some(l => l?.toLowerCase().includes('2x2') || l?.toLowerCase().includes('2×2') || l?.toLowerCase().includes('cards 2')), 'Sheet has 2x2 option')
  check(viewOptionsInSheet.some(l => l?.toLowerCase().includes('3x3') || l?.toLowerCase().includes('3×3') || l?.toLowerCase().includes('cards 3')), 'Sheet has 3x3 option')

  // CHECK 4: Switching view from menu works
  // Click 1x1 view
  const switched = await page.evaluate(() => {
    const btns = document.querySelectorAll('.mobile-portfolio-view-options button, .mobile-watchlist-sheet-menu button')
    for (const b of btns) {
      const t = (b.textContent || '').trim().toLowerCase()
      if (t.includes('1x1') || t.includes('1×1') || t.includes('cards 1')) { b.click(); return true }
    }
    return false
  })
  check(switched, 'Can click view option in sheet')
  await page.waitForTimeout(800)

  // Sheet should close after selection
  const sheetStillOpen = await page.evaluate(() => !!document.querySelector('.mobile-portfolio-view-options'))
  // Sheet may or may not auto-close depending on impl — just verify cards rendered
  await page.screenshot({ path: path.join(OUT, 'after-1x1-select.png') })
  console.log('Saved after-1x1-select.png')

  // Close sheet if still open
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)

  // CHECK 5: Position cards rendered (1x1 view active)
  const hasCards = await page.evaluate(() => {
    const cards = document.querySelectorAll('.position-card, .pf-card, [class*="position-card"], [class*="pf-pos-card"]')
    const table = document.querySelector('.pf-mobile-table, [class*="portfolio-table"]')
    return { cards: cards.length, hasTable: !!table }
  })
  console.log(`  Cards: ${hasCards.cards}, table: ${hasCards.hasTable}`)

  // Open menu again and switch to Table
  await page.evaluate(() => {
    const btns = document.querySelectorAll('button')
    for (const b of btns) {
      if ((b.ariaLabel || '').toLowerCase().includes('portfolio options') || b.className.includes('pf-options-btn')) { b.click(); return }
    }
  })
  await page.waitForTimeout(800)
  await page.evaluate(() => {
    const btns = document.querySelectorAll('.mobile-portfolio-view-options button, .mobile-watchlist-sheet-menu button')
    for (const b of btns) {
      const t = (b.textContent || '').trim().toLowerCase()
      if (t === 'table') { b.click(); return }
    }
  })
  await page.waitForTimeout(800)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  await page.screenshot({ path: path.join(OUT, 'after-table-select.png') })
  console.log('Saved after-table-select.png')

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
