import { chromium } from 'playwright'

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

const btns = await page.$$('.mobile-bottom-nav button')
const labels = await Promise.all(btns.map(b => b.innerText().catch(() => '')))
console.log('Nav buttons:', labels)

for (const btn of btns) {
  const t = (await btn.innerText().catch(() => '')).toLowerCase()
  if (t.includes('port')) { await btn.click(); await page.waitForTimeout(1500); break }
}
await page.waitForTimeout(1000)

const found = await page.evaluate(() => {
  const sels = ['.mptbl-frow', '.mobile-position-card', '.port-row', '.sai-p2', '[class*="sai"]', '[class*="port"]']
  return sels.map(s => `${s}: ${document.querySelectorAll(s).length}`)
})
console.log('Elements found:', found)

// try clicking any position-like element
for (const sel of ['.mptbl-frow', '.mobile-position-card', '.port-row']) {
  const els = await page.$$(sel)
  if (els.length > 0) {
    console.log(`Clicking ${sel}`)
    try { await els[0].tap() } catch { await els[0].click() }
    await page.waitForTimeout(2500)
    break
  }
}

const afterClick = await page.evaluate(() => {
  const sels = ['.sai-p2', '.sai-exp25-panel', '.sai-exp2-panel', '[class*="sai-p"]']
  return sels.map(s => `${s}: ${document.querySelectorAll(s).length}`)
})
console.log('After click:', afterClick)

// Screenshot for visual debug
await page.screenshot({ path: 'uat-screenshots/cr-ai-v3-ui-001/debug-page.png' })
console.log('Debug screenshot saved')

await browser.close()
