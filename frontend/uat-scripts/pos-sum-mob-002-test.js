const { chromium } = require('@playwright/test')
const path = require('path')
const fs = require('fs')

const OUT = path.join(__dirname, '../uat-screenshots/pos-sum-mob-002')
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

const PORT = 3015

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

  // Helper: scroll element into view and mouse-click at its center
  async function realClick(selector) {
    const rect = await page.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      el.scrollIntoView({ block: 'center', inline: 'center' })
      return null
    }, selector)
    await page.waitForTimeout(400)
    const box = await page.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }
    }, selector)
    if (!box || box.w === 0 || box.h === 0) return false
    await page.mouse.click(box.x, box.y)
    return true
  }

  // Navigate with ?si=NVDA — MobileExperience auto-opens SI panel on mount for this param
  await page.goto(`http://localhost:${PORT}/mobile?si=NVDA`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: path.join(OUT, '00-home-si-open.png') })
  console.log('Saved 00-home-si-open.png')

  // ── WAIT FOR SI PANEL + SCROLL TO POSITION SUMMARY ───────────────────────
  console.log('\n=== STOCK INTELLIGENCE PANEL ===')
  const panelOpen2 = await page.evaluate(() => !!document.querySelector('.stock-intel-shell'))
  console.log(`  Panel open: ${panelOpen2}`)

  // Find and scroll the SI panel body to the Position Summary section
  if (panelOpen2) {
    // Reset panel scroll to top
    await page.evaluate(() => {
      const panel = document.querySelector('.stock-intel-mobile-dialog, .si-body, .stock-intel-body')
      if (panel) panel.scrollTo(0, 0)
    })
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(OUT, '01-si-panel-top.png') })
    console.log('  Saved 01-si-panel-top.png')

    // Scroll SI panel to find .sps
    let spsVisible = await page.evaluate(() => !!document.querySelector('.sps'))
    if (!spsVisible) {
      for (let i = 0; i < 12; i++) {
        await page.evaluate(() => {
          const panel = document.querySelector('.stock-intel-mobile-dialog, .si-body, .stock-intel-body')
          if (panel) panel.scrollTop += 250
          else window.scrollBy(0, 250)
        })
        await page.waitForTimeout(200)
        spsVisible = await page.evaluate(() => !!document.querySelector('.sps'))
        if (spsVisible) break
      }
    }
    console.log(`  .sps found: ${spsVisible}`)
  }

  // ── COMPACT VIEW ──────────────────────────────────────────────────────────
  console.log('\n=== COMPACT VIEW ===')

  const spsExists = await page.evaluate(() => !!document.querySelector('.sps'))
  check(spsExists, 'Position Summary section (.sps) exists')

  if (spsExists) {
    // Scroll sps into view for screenshot
    await page.evaluate(() => document.querySelector('.sps')?.scrollIntoView({ block: 'center' }))
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(OUT, '03-compact.png') })
    console.log('  Saved 03-compact.png')

    const noChartInCompact = await page.evaluate(() => !document.querySelector('.sps > .sps-chart, .sps > svg, .sps-chart'))
    check(noChartInCompact, 'No chart in compact view')

    const noTapText = await page.evaluate(() => {
      const sps = document.querySelector('.sps')
      return !sps || !(sps.textContent || '').toLowerCase().includes('tap to expand')
    })
    check(noTapText, 'No "tap to expand" text')

    const hasMetricRows = await page.evaluate(() => !!document.querySelector('.sps-metric-rows'))
    check(hasMetricRows, 'Metric rows (.sps-metric-rows) present')

    const rowCount = await page.evaluate(() => document.querySelectorAll('.sps .sps-metric-row').length)
    check(rowCount === 3, `Three metric rows (got ${rowCount})`)

    const row1Cols = await page.evaluate(() => document.querySelectorAll('.sps .sps-metric-row:first-child .sps-metric').length)
    check(row1Cols === 4, `Row 1 has 4 metrics (got ${row1Cols})`)

    const hasMenu = await page.evaluate(() => !!document.querySelector('.sps-menu'))
    check(hasMenu, '"..." customize menu present')

    const noAI = await page.evaluate(() => !document.querySelector('.sps .ai-intelligence, .sps .sps-ai, .sps [class*="ai-intel"]'))
    check(noAI, 'No AI section in compact')

    // ── EXPANDED VIEW ────────────────────────────────────────────────────────
    console.log('\n=== EXPANDED VIEW (tap .sps) ===')

    // Tap the sps section
    const spsBox = await page.evaluate(() => {
      const sps = document.querySelector('.sps')
      if (!sps) return null
      const r = sps.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + 20 }
    })
    if (spsBox) {
      await page.touchscreen.tap(spsBox.x, spsBox.y)
    } else {
      await page.evaluate(() => document.querySelector('.sps')?.click())
    }
    await page.waitForTimeout(800)

    const sheetOpen = await page.evaluate(() => !!document.querySelector('.sps-detail-sheet'))
    check(sheetOpen, 'Detail sheet opened on tap')

    if (sheetOpen) {
      await page.screenshot({ path: path.join(OUT, '04-expanded.png') })
      console.log('  Saved 04-expanded.png')

      const hasChart = await page.evaluate(() => !!document.querySelector('.sps-chart'))
      check(hasChart, 'Performance chart (.sps-chart) present')

      const hasRangeTabs = await page.evaluate(() => !!document.querySelector('.sps-range-tabs'))
      check(hasRangeTabs, 'Range tabs (.sps-range-tabs) present')

      const activeTab = await page.evaluate(() => document.querySelector('.sps-range-tabs button.active')?.textContent?.trim() ?? null)
      check(activeTab === '1W', `1W tab is active (got "${activeTab}")`)

      const hasKeyInsights = await page.evaluate(() => !!document.querySelector('.sps-key-insights'))
      check(hasKeyInsights, 'Key Insights section present')

      const insightCount = await page.evaluate(() => document.querySelectorAll('.sps-insight-item').length)
      check(insightCount === 3, `Three Key Insights (got ${insightCount})`)

      const hasNews = await page.evaluate(() => !!document.querySelector('.sps-news-catalysts'))
      check(hasNews, 'Top News / Catalysts section present')

      const hasBottomGrid = await page.evaluate(() => !!document.querySelector('.sps-bottom-grid'))
      check(hasBottomGrid, 'Bottom 2-col grid (.sps-bottom-grid) present')

      const noWeekHero = await page.evaluate(() => !document.querySelector('.sps-week-hero'))
      check(noWeekHero, 'No .sps-week-hero (removed per mock)')

      const noDetailGrid = await page.evaluate(() => !document.querySelector('.sps-detail-grid'))
      check(noDetailGrid, 'No .sps-detail-grid (replaced)')

      const noQuickActions = await page.evaluate(() => !document.querySelector('.sps-quick-actions'))
      check(noQuickActions, 'No .sps-quick-actions (not in mock)')

      const hasCloseBtn = await page.evaluate(() => !!document.querySelector('.sps-sheet-close'))
      check(hasCloseBtn, 'Close button present')

      // Scroll expanded sheet to show bottom grid
      await page.evaluate(() => {
        const sheet = document.querySelector('.sps-detail-sheet')
        if (sheet) sheet.scrollTop = 500
      })
      await page.waitForTimeout(400)
      await page.screenshot({ path: path.join(OUT, '05-expanded-scrolled.png') })
      console.log('  Saved 05-expanded-scrolled.png')

      // Close
      await page.evaluate(() => document.querySelector('.sps-sheet-close')?.click())
      await page.waitForTimeout(600)
    }

    // ── CUSTOMIZE VIEW ──────────────────────────────────────────────────────
    console.log('\n=== CUSTOMIZE VIEW ===')

    const menuBox = await page.evaluate(() => {
      const menu = document.querySelector('.sps-menu')
      if (!menu) return null
      const r = menu.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    if (menuBox) {
      await page.touchscreen.tap(menuBox.x, menuBox.y)
    } else {
      await page.evaluate(() => document.querySelector('.sps-menu')?.click())
    }
    await page.waitForTimeout(700)

    const customizeOpen = await page.evaluate(() => !!document.querySelector('.sps-custom-sheet'))
    check(customizeOpen, 'Customize sheet opened via "..." menu')

    if (customizeOpen) {
      await page.screenshot({ path: path.join(OUT, '06-customize.png') })
      console.log('  Saved 06-customize.png')

      const customRows = await page.evaluate(() => document.querySelectorAll('.sps-custom-row').length)
      check(customRows === 10, `10 metric rows in customize (got ${customRows})`)

      const greenToggles = await page.evaluate(() => document.querySelectorAll('.sps-custom-row .skm-edit-toggle.on').length)
      check(greenToggles === 10, `All 10 toggles ON/green by default (got ${greenToggles})`)

      const noEyeIcon = await page.evaluate(() => !document.querySelector('.sps-custom-row [aria-label*="eye"], .sps-custom-row .eye-icon'))
      check(noEyeIcon, 'No eye icon in customize rows')

      const gripCount = await page.evaluate(() => document.querySelectorAll('.sps-custom-grip').length)
      check(gripCount === 10, `10 drag grips present (got ${gripCount})`)

      const hasTip = await page.evaluate(() => !!document.querySelector('.sps-custom-tip'))
      check(hasTip, 'Auto-save tip present')

      // Scroll customize to show full list
      await page.evaluate(() => {
        const sheet = document.querySelector('.sps-custom-sheet')
        if (sheet) sheet.scrollTop = 200
      })
      await page.waitForTimeout(300)
      await page.screenshot({ path: path.join(OUT, '07-customize-scrolled.png') })
      console.log('  Saved 07-customize-scrolled.png')

      await page.evaluate(() => document.querySelector('.sps-custom-close')?.click())
      await page.waitForTimeout(400)
    }
  } else {
    console.log('\n  No .sps found — taking debug screenshot')
    await page.screenshot({ path: path.join(OUT, 'debug-no-sps.png') })
    // Log DOM state
    const domInfo = await page.evaluate(() => {
      return {
        panelEl: !!document.querySelector('[class*="stock-intel"]'),
        panelClasses: Array.from(document.querySelectorAll('[class*="intel"]')).map(e => e.className.substring(0, 60)).slice(0, 5),
        siBody: !!document.querySelector('.si-body'),
        sps: !!document.querySelector('.sps'),
        bodyChildren: Array.from(document.body.children).map(e => e.tagName + '.' + e.className.substring(0, 30)).slice(0, 10),
      }
    })
    console.log('  DOM info:', JSON.stringify(domInfo, null, 2))
  }

  // ── SUMMARY ────────────────────────────────────────────────────────────────
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
