/**
 * ARTEMIS-AI-COMPACT-REDESIGN-001 — AiIntelligenceCompactV3 UAT screenshots
 * Uses the ?si= URL parameter to auto-open the Stock Intelligence panel.
 * Per MobileExperience.tsx line 2963: "Dev/test helper: ?si=NVDA auto-opens SI panel (used by UAT scripts)"
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'fs'

const BASE = 'http://localhost:3003'
const OUT  = 'uat-screenshots/artemis-ai-compact-v3'
mkdirSync(OUT, { recursive: true })

const SYMBOLS = ['NVDA', 'NBIS', 'AAPL']

async function captureSymbol(browser, symbol, vp) {
  const ctx  = await browser.newContext({ viewport: vp })
  const page = await ctx.newPage()
  page.on('console', msg => { if (msg.type() === 'error') console.log(`    [err] ${msg.text().slice(0, 120)}`) })

  // ?si= auto-opens the SI panel immediately
  await page.goto(`${BASE}/mobile?si=${symbol}`, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(3000) // wait for WS data + component render

  // Wait for .sai to appear (AI Intelligence section)
  const sai = await page.waitForSelector('.sai', { timeout: 8000 }).catch(() => null)
  if (!sai) {
    console.log(`    ⚠ .sai not found for ${symbol}`)
    await ctx.close()
    return
  }

  await sai.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)

  // Verify V3 compact is rendering
  const cv3 = await page.$('.cv3-root')
  const v2  = await page.$('.sai-p2')
  console.log(`    cv3-root: ${cv3 ? '✓ found' : '⚠ not found'} | sai-p2 (old): ${v2 ? 'still present' : 'replaced ✓'}`)

  // Full AI section screenshot
  const fname = `${OUT}/${symbol.toLowerCase()}-${vp.width}.png`
  writeFileSync(fname, await sai.screenshot())
  console.log(`    ✓ ${fname}`)

  // Widget-only screenshot if cv3 found
  if (cv3) {
    await cv3.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    const fnameWidget = `${OUT}/${symbol.toLowerCase()}-widget-${vp.width}.png`
    writeFileSync(fnameWidget, await cv3.screenshot())
    console.log(`    ✓ ${fnameWidget}`)
  }

  await ctx.close()
}

const browser = await chromium.launch({ headless: true })

for (const vp of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
  console.log(`\n══ ${vp.width}px viewport ══`)
  for (const sym of SYMBOLS) {
    console.log(`  ${sym}`)
    await captureSymbol(browser, sym, vp)
  }
}

await browser.close()
console.log('\n✓ Done — screenshots saved to', OUT)
