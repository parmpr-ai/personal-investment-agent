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

const apiLog = []

// Catch-all for all API routes
await page.route('**/api/**', r => {
  const url = r.request().url()
  const path = url.split('/api/')[1]?.split('?')[0] || url
  apiLog.push(`${r.request().method()} /api/${path}`)

  if (url.includes('/api/dashboard')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dash) })
  if (url.includes('/api/stock/') || url.includes('/api/stock?')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(stock) })
  if (url.includes('/api/ai-intelligence/') || url.includes('/api/ai-intelligence?')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ai) })
  if (url.includes('/api/settings')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ibkr: { connected: false }, privacy: { hide_values: false }, theme: 'dark' }) })
  // Catch-all: return empty success
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
})

await page.goto('http://localhost:3000/mobile', { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {})
await page.waitForTimeout(3000)

console.log('API calls intercepted:')
for (const l of [...new Set(apiLog)]) console.log(' ', l)

writeFileSync('uat-screenshots/cr-ai-v3-ui-001/dbg-all-01-home.png', await page.screenshot())

// Navigate to portfolio
const btns = await page.$$('.mobile-bottom-nav button')
for (const btn of btns) {
  if ((await btn.innerText().catch(() => '')).toLowerCase().includes('port')) {
    await btn.click(); await page.waitForTimeout(2500); break
  }
}

apiLog.length = 0
await page.waitForTimeout(1000)

console.log('\nAPI calls after portfolio nav:')
for (const l of [...new Set(apiLog)]) console.log(' ', l)

writeFileSync('uat-screenshots/cr-ai-v3-ui-001/dbg-all-02-portfolio.png', await page.screenshot())

// Check DOM elements
const domInfo = await page.evaluate(() => {
  const allClasses = [...new Set([...document.querySelectorAll('*')].map(e => e.className).filter(c => typeof c === 'string' && c.includes('-') && c.length < 80))]
  return {
    portfolioRelated: allClasses.filter(c => c.includes('port') || c.includes('mptbl') || c.includes('position') || c.includes('pf-')),
    saiRelated: allClasses.filter(c => c.includes('sai')),
    bodyText: document.body.textContent?.slice(0, 200)
  }
})
console.log('\nPortfolio-related classes:', domInfo.portfolioRelated)
console.log('SAI classes:', domInfo.saiRelated)
console.log('Body text preview:', domInfo.bodyText?.replace(/\s+/g, ' ').trim().slice(0, 150))

await browser.close()
