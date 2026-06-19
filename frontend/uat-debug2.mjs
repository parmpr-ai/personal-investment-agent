import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'fs'

mkdirSync('uat-screenshots/cr-ai-v3-ui-001', { recursive: true })

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()

await page.route('**/api/dashboard**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
  portfolio: { total_value: 116071, daily_pnl: 800, daily_pnl_pct: 0.67, unrealized: 18000, unrealized_pct: 15,
    positions: [{ symbol: 'NBIS', name: 'Neuberger Berman', type: 'stocks', shares: 10, cost_basis: 20, last: 24.18,
      market_value: 241.8, unrealized: 0, unrealized_pct: 0, day_change_pct: 1.81, momentum_score: 78, sparkline: [] }] },
  macros: { market_strip: [] }, scanner: [], guardrails: [], today_actions: [], watchlists: [],
}) }))
await page.route('**/api/stock/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
  ticker: 'NBIS', fundamentals: { last: 24.18, price: 24.18, fair_value: 30, ai_score: 78, name: 'Neuberger Berman',
    momentum_score: 78, trend_score: 73, sentiment_score: 80, risk: 28, risk_score: 28, upside_downside: 24 }, shares: 10, qty: 10,
}) }))
await page.route('**/api/ai-intelligence/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
  symbol: 'NBIS', score: 78, verdict: 'BUY', metrics: { momentum: 78, risk: 28 },
  bull_case: 'Strong AI demand, analyst upgrades.', bear_case: 'Elevated valuation, compression risk.',
  what_could_change: 'Material change in targets.',
}) }))

await page.goto('http://localhost:3000/mobile', { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {})
await page.waitForTimeout(2000)

writeFileSync('uat-screenshots/cr-ai-v3-ui-001/debug-01-home.png', await page.screenshot())
console.log('Screenshot: home page')

// Click "My Portfolio"
const allBtns = await page.$$('.mobile-bottom-nav button')
console.log('Nav buttons count:', allBtns.length)
if (allBtns.length > 1) {
  await allBtns[1].click()
  await page.waitForTimeout(2000)
}

writeFileSync('uat-screenshots/cr-ai-v3-ui-001/debug-02-portfolio.png', await page.screenshot())
console.log('Screenshot: after portfolio click')

// List all clickable elements
const clickable = await page.evaluate(() => {
  const els = document.querySelectorAll('button, [role="button"], a')
  return [...els].slice(0, 20).map(el => ({
    tag: el.tagName,
    class: el.className.slice(0, 60),
    text: el.textContent?.slice(0, 30)
  }))
})
console.log('Clickable elements:', JSON.stringify(clickable, null, 2))

// Try clicking any stock-looking element
for (const sel of ['.mobile-position-card', '.mptbl-frow', '.mobile-visual-card', '[class*="card"]', '[class*="row"]', '[class*="position"]']) {
  const els = await page.$$(sel)
  if (els.length > 0) {
    console.log(`Found ${sel}: ${els.length} items, clicking first`)
    try { await els[0].tap() } catch { await els[0].click() }
    await page.waitForTimeout(2500)
    writeFileSync(`uat-screenshots/cr-ai-v3-ui-001/debug-03-after-${sel.replace(/[^a-z]/gi,'_')}.png`, await page.screenshot())
    break
  }
}

const saiFinal = await page.evaluate(() => document.querySelectorAll('[class*="sai"]').length)
console.log('sai elements after all clicks:', saiFinal)

await browser.close()
