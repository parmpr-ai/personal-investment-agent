const { chromium } = require('@playwright/test')
const path = require('path')
const fs = require('fs')

const OUT = path.join(__dirname, '../uat-screenshots/bug-pf-card-012')
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

const PORT = 3013

async function navToPortfolio(page) {
  await page.goto(`http://localhost:${PORT}/mobile`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2000)
  await page.evaluate(() => {
    const navBtns = document.querySelectorAll('.mobile-bottom-nav button')
    for (const b of navBtns) {
      if ((b.textContent || '').toLowerCase().includes('portfolio')) { b.click(); return }
    }
  })
  await page.waitForTimeout(1500)
}

async function switchView(page, viewLabel) {
  await page.evaluate(() => {
    const btns = document.querySelectorAll('button')
    for (const b of btns) {
      if ((b.ariaLabel || '').toLowerCase().includes('portfolio options') || b.className.includes('pf-options-btn')) { b.click(); return }
    }
  })
  await page.waitForTimeout(700)
  await page.evaluate((label) => {
    const btns = document.querySelectorAll('.mobile-portfolio-view-options button, .mobile-watchlist-sheet-menu button')
    for (const b of btns) {
      if ((b.textContent || '').trim().toLowerCase().includes(label.toLowerCase())) { b.click(); return }
    }
  }, viewLabel)
  await page.waitForTimeout(700)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
}

async function checkUnrealizedTruncation(page) {
  return page.evaluate(() => {
    const cells = document.querySelectorAll('.mps-cell-full b, .mps-cell-full .green, .mps-cell-full .red')
    const results = []
    for (const b of cells) {
      const text = b.textContent || ''
      if (!text || text.includes('●')) continue // privacy mask
      const isTruncated = b.scrollWidth > b.clientWidth + 2
      // Also check if text ends with "..." which would mean CSS truncation leaked through
      const hasEllipsis = text.endsWith('...') || text.endsWith('…')
      // Check that % is present (means the value wasn't cut off)
      const hasPct = text.includes('%')
      const rect = b.getBoundingClientRect()
      results.push({
        text: text.substring(0, 40),
        isTruncated,
        hasEllipsis,
        hasPct,
        scrollWidth: b.scrollWidth,
        clientWidth: b.clientWidth,
        visible: rect.width > 0 && rect.height > 0,
      })
    }
    return results
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

  const failures = []
  const pass = (label) => console.log(`  ✓ ${label}`)
  const fail = (label, detail = '') => { console.log(`  ✗ ${label}${detail ? ': ' + detail : ''}`); failures.push(label) }
  const check = (cond, label, detail = '') => cond ? pass(label) : fail(label, detail)

  await navToPortfolio(page)

  for (const [viewId, viewLabel] of [['1x1', 'cards 1x1'], ['2x2', 'cards 2x2'], ['3x3', 'cards 3x3']]) {
    console.log(`\n=== ${viewId} ===`)
    await switchView(page, viewLabel)

    const results = await checkUnrealizedTruncation(page)
    console.log(`  Found ${results.length} unrealized cell(s)`)

    if (results.length === 0) {
      console.log('  (No unrealized cells visible — unrealized field may not be on cards)')
      await page.screenshot({ path: path.join(OUT, `${viewId}-cards.png`) })
      continue
    }

    for (const r of results) {
      console.log(`  Value: "${r.text}" | truncated=${r.isTruncated} ellipsis=${r.hasEllipsis} hasPct=${r.hasPct} scroll=${r.scrollWidth} client=${r.clientWidth}`)
      check(!r.isTruncated, `[${viewId}] No scroll-overflow truncation: "${r.text.substring(0, 30)}"`)
      check(!r.hasEllipsis, `[${viewId}] No ellipsis in value`)
      check(r.hasPct, `[${viewId}] Percentage part is visible`, `text="${r.text}"`)
    }

    await page.screenshot({ path: path.join(OUT, `${viewId}-cards.png`) })
    console.log(`  Saved ${viewId}-cards.png`)

    // Zoom in on the first unrealized cell
    const cellBox = await page.evaluate(() => {
      const cell = document.querySelector('.mps-cell-full')
      if (!cell) return null
      const r = cell.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    })
    if (cellBox && cellBox.height > 0 && cellBox.y >= 0 && cellBox.y + cellBox.height <= 844) {
      await page.screenshot({
        path: path.join(OUT, `${viewId}-unrealized-cell.png`),
        clip: { x: Math.max(0, cellBox.x - 2), y: Math.max(0, cellBox.y - 2), width: Math.min(cellBox.width + 4, 390), height: Math.min(cellBox.height + 4, 844) }
      })
      console.log(`  Saved ${viewId}-unrealized-cell.png`)
    }
  }

  // Also check table view doesn't regress
  console.log('\n=== Table (regression) ===')
  await switchView(page, 'table')
  const tableExists = await page.evaluate(() => !!document.querySelector('.pf-mobile-table, [class*="portfolio-table"], table'))
  check(tableExists, 'Table view renders')
  await page.screenshot({ path: path.join(OUT, 'table-view.png') })
  console.log('  Saved table-view.png')

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
