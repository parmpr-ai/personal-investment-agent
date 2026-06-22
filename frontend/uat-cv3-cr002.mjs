/**
 * CR-AI-COMPACT-REDESIGN-002 + CR-AI-COMPACT-REDESIGN-003 UAT
 * Verifies: card height, three-dot button, customize sheet, tone classes.
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'fs'

const BASE = 'http://localhost:3005'
const OUT  = 'uat-screenshots/cr-ai-compact-v3-cr002'
mkdirSync(OUT, { recursive: true })

const SYMBOLS = ['NVDA', 'NBIS', 'AAPL']

async function capture(browser, symbol, vp) {
  const ctx  = await browser.newContext({ viewport: vp })
  const page = await ctx.newPage()
  page.on('console', m => { if (m.type() === 'error') console.log(`  [err] ${m.text().slice(0, 100)}`) })

  await page.goto(`${BASE}/mobile?si=${symbol}`, { waitUntil: 'networkidle', timeout: 22000 }).catch(() => {})
  await page.waitForTimeout(3500)

  const sai = await page.waitForSelector('.sai', { timeout: 8000 }).catch(() => null)
  if (!sai) { console.log(`  ⚠ .sai not found for ${symbol}`); await ctx.close(); return }
  await sai.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)

  const cv3 = await page.$('.cv3-root')
  const v2  = await page.$('.sai-p2')
  console.log(`  cv3-root: ${cv3 ? '✓' : '⚠ MISSING'} | sai-p2: ${v2 ? '⚠ STILL PRESENT' : 'replaced ✓'}`)

  if (!cv3) { await ctx.close(); return }

  // Check card height
  const cardH = await page.$eval('.cv3-card', el => el.getBoundingClientRect().height).catch(() => null)
  console.log(`  card height: ${cardH != null ? cardH.toFixed(0) + 'px' : '?'} (target ~160px)`)

  // Check tone classes present
  const toneClasses = await page.$$eval('.cv3-card', cards =>
    [...new Set(cards.flatMap(c => [...c.classList].filter(cl => cl.startsWith('cv3-card--'))))]
  ).catch(() => [])
  console.log(`  tone classes: ${toneClasses.join(', ') || '⚠ none'}`)

  // Check three-dot button
  const dotBtn = await page.$('.cv3-hdr-btn')
  console.log(`  three-dot btn: ${dotBtn ? '✓' : '⚠ MISSING'}`)

  // Widget screenshot
  await cv3.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  writeFileSync(`${OUT}/${symbol.toLowerCase()}-widget-${vp.width}.png`, await cv3.screenshot())
  console.log(`  ✓ widget screenshot`)

  // Open customize sheet
  if (dotBtn) {
    await page.evaluate(el => el.click(), dotBtn)
    await page.waitForTimeout(600)
    const sheet = await page.$('.sps-custom-sheet')
    console.log(`  customize sheet: ${sheet ? '✓ opened' : '⚠ NOT FOUND'}`)
    if (sheet) {
      writeFileSync(`${OUT}/${symbol.toLowerCase()}-customize-${vp.width}.png`, await sheet.screenshot())
      console.log(`  ✓ customize sheet screenshot`)
      // Close it
      const closeBtn = await page.$('.sps-custom-close')
      if (closeBtn) await page.evaluate(el => el.click(), closeBtn)
      await page.waitForTimeout(300)
    }
  }

  await ctx.close()
}

const browser = await chromium.launch({ headless: true })

for (const vp of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
  console.log(`\n══ ${vp.width}px ══`)
  for (const sym of SYMBOLS) {
    console.log(` ${sym}`)
    await capture(browser, sym, vp)
  }
}

await browser.close()
console.log('\n✓ Done →', OUT)
