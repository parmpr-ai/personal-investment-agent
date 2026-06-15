const { chromium } = require('@playwright/test')
const path = require('path')
const fs = require('fs')

const OUT = path.join(__dirname, '../uat-screenshots/cr-pos-sum-mob-004')
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

const PORT = 3016

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

  await page.goto(`http://localhost:${PORT}/mobile?si=NVDA`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)

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
  check(spsVisible, '.sps exists after scroll')

  if (!spsVisible) {
    await page.screenshot({ path: path.join(OUT, 'debug-no-sps.png') })
    console.log('  Debug screenshot saved')
    await browser.close()
    return
  }

  // ── COMPACT screenshot ──────────────────────────────────────────────────────
  await page.evaluate(() => document.querySelector('.sps')?.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(OUT, '01-compact.png') })
  console.log('  Saved 01-compact.png')

  // Verify colors are NOT neon (#25ed55)
  const positiveColor = await page.evaluate(() => {
    const el = document.querySelector('.sps-metric.positive b')
    if (!el) return null
    return window.getComputedStyle(el).color
  })
  check(positiveColor !== null, 'Positive metric found')
  // rgb(36,209,140) = #24d18c  — NOT rgb(37,237,85) = #25ed55
  const isCalmerGreen = positiveColor && !positiveColor.includes('37, 237') && !positiveColor.includes('37,237')
  check(!!isCalmerGreen, `Positive color is not neon green (got ${positiveColor})`)

  const negativeColor = await page.evaluate(() => {
    const el = document.querySelector('.sps-metric.negative b')
    if (!el) return null
    return window.getComputedStyle(el).color
  })
  // rgb(248,113,113) = #f87171 — NOT rgb(255,79,95) = #ff4f5f
  const isCalmerRed = negativeColor && !negativeColor.includes('255, 79') && !negativeColor.includes('255,79')
  check(!!isCalmerRed, `Negative color is softer red (got ${negativeColor})`)

  // ── Open customize ──────────────────────────────────────────────────────────
  const menuBox = await page.evaluate(() => {
    const menu = document.querySelector('.sps-menu')
    if (!menu) return null
    const r = menu.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  if (menuBox) await page.touchscreen.tap(menuBox.x, menuBox.y)
  else await page.evaluate(() => document.querySelector('.sps-menu')?.click())
  await page.waitForTimeout(700)

  const customizeOpen = await page.evaluate(() => !!document.querySelector('.sps-custom-sheet'))
  check(customizeOpen, 'Customize sheet opened')

  if (customizeOpen) {
    await page.screenshot({ path: path.join(OUT, '02-customize.png') })
    console.log('  Saved 02-customize.png')

    // Verify grip is LAST in the row (right side) — check DOM order
    const gripIsLast = await page.evaluate(() => {
      const row = document.querySelector('.sps-custom-row')
      if (!row) return null
      const children = Array.from(row.children)
      const gripIndex = children.findIndex(el => el.classList.contains('sps-custom-grip'))
      return { gripIndex, total: children.length }
    })
    check(gripIsLast !== null, 'sps-custom-row found')
    check(gripIsLast?.gripIndex === gripIsLast?.total - 1, `Grip is last element (index ${gripIsLast?.gripIndex} of ${gripIsLast?.total})`)

    // Verify toggle is green when on
    const toggleOn = await page.evaluate(() => !!document.querySelector('.sps-custom-row .skm-edit-toggle.on'))
    check(toggleOn, 'Toggles have .on class (green state)')

    // No eye icon
    const noEye = await page.evaluate(() => !document.querySelector('.sps-custom-row [aria-label*="eye"], .sps-custom-row .eye-icon'))
    check(noEye, 'No eye icon in customize rows')

    // Scroll to show full list
    await page.evaluate(() => {
      const sheet = document.querySelector('.sps-custom-sheet')
      if (sheet) sheet.scrollTop = 250
    })
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(OUT, '03-customize-scrolled.png') })
    console.log('  Saved 03-customize-scrolled.png')
  }

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
