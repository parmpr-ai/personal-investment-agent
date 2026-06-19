import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'fs'

mkdirSync('uat-screenshots/cr-ai-v3-ui-001', { recursive: true })

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()

const dash = { portfolio: { total_value: 116071, daily_pnl: 800, daily_pnl_pct: 0.67, unrealized: 18000, unrealized_pct: 15,
  positions: [{ symbol: 'NBIS', name: 'Neuberger Berman', type: 'stocks', shares: 10, cost_basis: 20, last: 24.18,
    market_value: 241.8, unrealized: 0, unrealized_pct: 0, day_change_pct: 1.81, momentum_score: 78, sparkline: [] }]
}, macros: { market_strip: [] }, scanner: [], guardrails: [], today_actions: [], watchlists: [] }

const stock = { ticker: 'NBIS', fundamentals: { last: 24.18, price: 24.18, fair_value: 30, ai_score: 78,
  name: 'Neuberger Berman', momentum_score: 78, trend_score: 73, sentiment_score: 80, risk: 28, risk_score: 28, upside_downside: 24 }, shares: 10 }

const ai = { symbol: 'NBIS', score: 78, verdict: 'BUY', metrics: { momentum: 78, risk: 28 },
  bull_case: 'Strong AI demand, analyst upgrades.', bear_case: 'Elevated valuation, compression.',
  what_could_change: 'Material change in analyst targets.' }

const settings = { ibkr: { connected: false }, privacy: { hide_values: false }, theme: 'dark' }

await page.route('**/api/dashboard**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dash) }))
await page.route('**/api/stock/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(stock) }))
await page.route('**/api/ai-intelligence/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ai) }))
await page.route('**/api/settings**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(settings) }))
await page.route('**/api/**', r => {
  const url = r.request().url()
  if (!url.includes('/api/dashboard') && !url.includes('/api/stock') && !url.includes('/api/ai-intelligence') && !url.includes('/api/settings')) {
    console.log('Unhandled API:', url.split('/api/')[1]?.split('?')[0])
    r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  } else { r.continue() }
})

await page.goto('http://localhost:3000/mobile', { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {})
await page.waitForTimeout(2000)

writeFileSync('uat-screenshots/cr-ai-v3-ui-001/dbg-01-home.png', await page.screenshot())
console.log('Home page captured')

// Click My Portfolio
const navBtns = await page.$$('.mobile-bottom-nav button')
for (const btn of navBtns) {
  if ((await btn.innerText().catch(() => '')).toLowerCase().includes('port')) {
    await btn.click(); await page.waitForTimeout(2500); break
  }
}

writeFileSync('uat-screenshots/cr-ai-v3-ui-001/dbg-02-portfolio.png', await page.screenshot())
console.log('Portfolio page captured')

// List all available elements
const available = await page.evaluate(() => {
  const res = {}
  for (const cls of ['mptbl-frow', 'mobile-position-card', 'pf-header', 'portfolio-table', 'port-', 'position']) {
    res[cls] = document.querySelectorAll(`[class*="${cls}"]`).length
  }
  return res
})
console.log('Available elements:', available)

// Try clicking pf-header to expand portfolio section
const pfHeader = await page.$('.pf-header')
if (pfHeader) {
  console.log('Found pf-header, clicking')
  await pfHeader.click()
  await page.waitForTimeout(1500)
  writeFileSync('uat-screenshots/cr-ai-v3-ui-001/dbg-03-pf-expanded.png', await page.screenshot())

  const rows = await page.$$('.mptbl-frow')
  console.log('mptbl-frow after expand:', rows.length)
  if (rows.length > 0) {
    await rows[0].click()
    await page.waitForTimeout(2500)
    writeFileSync('uat-screenshots/cr-ai-v3-ui-001/dbg-04-stock-detail.png', await page.screenshot())
    const sai = await page.$('.sai-p2')
    console.log('sai-p2 found:', !!sai)
  }
}

await browser.close()
