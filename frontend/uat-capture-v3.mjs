import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'fs'

const OUT = 'uat-screenshots/cr-ai-v3-ui-001'
mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:3002'

const CASES = [
  { name: 'buy',  ticker: 'NBIS', aiScore: 78, risk: 28, upside: 24.0 },
  { name: 'hold', ticker: 'AMD',  aiScore: 52, risk: 48, upside: 6.0 },
  { name: 'sell', ticker: 'NVDA', aiScore: 22, risk: 74, upside: -18.0 },
]

const VERDICT = (s) => s >= 65 ? 'BUY' : s < 40 ? 'SELL' : 'HOLD'

function mockDash(c) {
  return { portfolio: { total_value: 116071, daily_pnl: 800, daily_pnl_pct: 0.67, unrealized: 18000, unrealized_pct: 15,
    positions: [{ symbol: c.ticker, name: c.ticker + ' Corp', type: 'stocks', shares: 10, cost_basis: 20, last: 24.18,
      market_value: 241.8, unrealized: 0, unrealized_pct: 0, day_change_pct: 1.81, momentum_score: c.aiScore, sparkline: [] }]
  }, macros: { market_strip: [] }, scanner: [], guardrails: [], today_actions: [], watchlists: [] }
}
function mockStock(c) {
  const v = VERDICT(c.aiScore)
  const bullMap = { BUY: 'Strong AI demand. Analyst upgrades accelerating. Earnings momentum solid. Fair value gap widening.', HOLD: 'Mixed earnings signals. Some analyst support remains. Sector momentum intact. Relative value emerging.', SELL: 'Price stabilisation early. Some relative value emerging. Sector rotation possible. Analyst coverage watching.' }
  const bearMap = { BUY: 'Valuation stretched. Macro uncertainty rising. Multiple compression risk. Earnings miss possible.', HOLD: 'Guidance risk elevated. Valuation not cheap. Macro headwinds building. Momentum weakening.', SELL: 'Weak momentum sustained. Analyst downgrades accelerating. Multiple compression ongoing. Earnings deteriorating.' }
  return { ticker: c.ticker,
    fundamentals: { last: 24.18, price: 24.18, fair_value: 24.18*(1+c.upside/100),
      ai_score: c.aiScore, name: c.ticker+' Corp', momentum_score: c.aiScore, trend_score: c.aiScore-5,
      sentiment_score: c.aiScore+2, risk: c.risk, risk_score: c.risk, upside_downside: c.upside,
      bull_case: bullMap[v], bear_case: bearMap[v] }, shares: 10, qty: 10 }
}
function mockAI(c) {
  return { symbol: c.ticker, score: c.aiScore, verdict: VERDICT(c.aiScore), metrics: { momentum: c.aiScore, risk: c.risk },
    bull_case: 'Strong AI demand, analyst upgrades accelerating with constructive setup.',
    bear_case: 'Elevated valuation, multiple compression risk near catalyst event.',
    what_could_change: 'Material change in analyst targets, macro risk mode.' }
}
const mockSettings = { ibkr: { connected: false }, privacy: { hide_values: false }, theme: 'dark' }

const browser = await chromium.launch({ headless: true })
const apiErrors = []

for (const c of CASES) {
  console.log(`\n── ${c.name.toUpperCase()} (${c.ticker}) ──`)
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()

  // Log ALL API calls to see what's failing
  page.on('response', resp => {
    if (resp.url().includes('/api/') && resp.status() >= 400) {
      const msg = `${resp.status()} ${resp.url().split('/api/')[1]?.split('?')[0]}`
      if (!apiErrors.includes(msg)) apiErrors.push(msg)
    }
  })

  // Intercept all known API endpoints
  await page.route('**/api/dashboard**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDash(c)) }))
  await page.route('**/api/stock/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockStock(c)) }))
  await page.route('**/api/ai-intelligence/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockAI(c)) }))
  await page.route('**/api/settings**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockSettings) }))
  await page.route('**/api/portfolio/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route('**/api/watchlist**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/scanner**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/macros**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"market_strip":[]}' }))

  await page.goto(`${BASE}/mobile`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {})
  await page.waitForTimeout(2500)

  // Click My Portfolio nav
  for (const btn of await page.$$('.mobile-bottom-nav button')) {
    if ((await btn.innerText().catch(() => '')).toLowerCase().includes('port')) {
      await btn.click(); await page.waitForTimeout(2000); break
    }
  }

  // Find position card
  let found = false
  for (const sel of ['.mptbl-frow', '.mobile-position-card']) {
    const els = await page.$$(sel)
    if (els.length > 0) {
      try { await els[0].tap() } catch { await els[0].click() }
      await page.waitForTimeout(2500)
      found = true; break
    }
  }

  if (!found) {
    // Check what's on screen
    const info = await page.evaluate(() => ({
      url: location.href,
      classes: [...document.querySelectorAll('*')].slice(0,5).map(e=>e.className).filter(Boolean),
    }))
    console.log('  no position card, page state:', info.url)
    writeFileSync(`${OUT}/${c.name}-page-debug.png`, await page.screenshot())
    await ctx.close(); continue
  }

  // Compact
  const sai = await page.$('.sai-p2')
  if (sai) {
    writeFileSync(`${OUT}/${c.name}-compact-390.png`, await sai.screenshot())
    console.log(`  ✓ compact`)
    // Tap to expand
    try { await sai.tap() } catch { await sai.click() }
    await page.waitForTimeout(1800)
  }

  // Expanded
  const panel = await page.$('.sai-exp25-panel')
  if (panel) {
    writeFileSync(`${OUT}/${c.name}-expanded-390.png`, await panel.screenshot())
    console.log(`  ✓ expanded top`)
    await page.$eval('.sai-exp25-body', el => el.scrollTop += 400).catch(() => {})
    await page.waitForTimeout(400)
    writeFileSync(`${OUT}/${c.name}-expanded-sections.png`, await panel.screenshot())
    console.log(`  ✓ expanded sections`)
  } else {
    console.log(`  ⚠ panel not found`)
    writeFileSync(`${OUT}/${c.name}-debug.png`, await page.screenshot())
  }

  await ctx.close()
}

if (apiErrors.length > 0) console.log('\nAPI errors seen:', apiErrors)
await browser.close()
console.log(`\n✓ Done — ${OUT}/`)
