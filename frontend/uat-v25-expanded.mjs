import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'fs'

const OUT = 'uat-screenshots/artemis-ai-012'
mkdirSync(OUT, { recursive: true })

const CASES = [
  { ticker: 'NBIS', score: 78, verdict: 'BUY',  risk: 28, name: 'Neuberger Berman' },
  { ticker: 'AMD',  score: 52, verdict: 'HOLD', risk: 48, name: 'Advanced Micro Devices' },
  { ticker: 'NVDA', score: 22, verdict: 'SELL', risk: 74, name: 'NVIDIA Corp' },
]

function mockDash(c) {
  return {
    portfolio: {
      total_value: 116071, daily_pnl: 800, daily_pnl_pct: 0.67, unrealized: 18000, unrealized_pct: 15,
      positions: [{ symbol: c.ticker, name: c.name, type: 'stocks', shares: 10, cost_basis: 20, last: 24.18,
        market_value: 241.8, unrealized: 0, unrealized_pct: 0, day_change_pct: 1.81,
        momentum_score: c.score, sparkline: [] }],
    },
    macros: { market_strip: [] }, scanner: [], guardrails: [], today_actions: [], watchlists: [],
  }
}

function mockStock(c) {
  return {
    ticker: c.ticker, fundamentals: {
      last: 24.18, price: 24.18, fair_value: 30, ai_score: c.score,
      name: c.name, momentum_score: c.score, trend_score: c.score - 5,
      sentiment_score: c.score + 2, risk: c.risk, risk_score: c.risk, upside_downside: 24,
    }, shares: 10, qty: 10,
  }
}

function mockAI(c) {
  return {
    symbol: c.ticker, score: c.score, verdict: c.verdict,
    metrics: { momentum: c.score, risk: c.risk },
    bull_case: 'Strong AI demand driving revenue acceleration. Analyst upgrades accelerating with constructive technical setup.',
    bear_case: 'Elevated valuation creates multiple compression risk. Earnings uncertainty near catalyst event.',
  }
}

const browser = await chromium.launch({ headless: true })

for (const c of CASES) {
  console.log(`\n── ${c.verdict} (${c.ticker}) ──`)
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()

  await page.route('**/api/dashboard**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDash(c)) }))
  await page.route('**/api/stock/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockStock(c)) }))
  await page.route('**/api/ai-intelligence/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockAI(c)) }))

  await page.goto('http://localhost:3000/mobile', { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1500)

  // Navigate to portfolio tab
  for (const btn of await page.$$('.mobile-bottom-nav button')) {
    const txt = (await btn.innerText().catch(() => '')).toLowerCase()
    if (txt.includes('port') || txt.includes('portfolio')) { await btn.click(); await page.waitForTimeout(1200); break }
  }

  // Click first position card
  for (const sel of ['.mptbl-frow', '.mobile-position-card', '.port-row']) {
    const els = await page.$$(sel)
    if (els.length > 0) {
      try { await els[0].tap() } catch { await els[0].click() }
      await page.waitForTimeout(2000); break
    }
  }

  // Click compact widget to expand
  for (const sel of ['.sai-p2', '.sai-compact-v2', '.sai-cr-si-026']) {
    const el = await page.$(sel)
    if (el) { try { await el.tap() } catch { await el.click() }; await page.waitForTimeout(1500); break }
  }

  // Screenshot expanded panel
  const panel = await page.$('.sai-exp25-panel')
  if (panel) {
    const path = `${OUT}/${c.verdict.toLowerCase()}-expanded-390.png`
    writeFileSync(path, await panel.screenshot())
    console.log(`  ✓ ${path}`)
  } else {
    const path = `${OUT}/${c.verdict.toLowerCase()}-expanded-390-fallback.png`
    writeFileSync(path, await page.screenshot())
    console.log(`  ⚠ panel not found — ${path}`)
  }

  // Screenshot customize panel
  const dotsBtn = await page.$('.sai-exp2-dots')
  if (dotsBtn) {
    try { await dotsBtn.tap() } catch { await dotsBtn.click() }
    await page.waitForTimeout(800)
    const customize = await page.$('.sai-exp2-customize')
    if (customize && c.ticker === 'NBIS') {
      writeFileSync(`${OUT}/customize-panel.png`, await customize.screenshot())
      console.log(`  ✓ ${OUT}/customize-panel.png`)
    }
  }

  await ctx.close()
}

await browser.close()
console.log(`\n✓ Done — ${OUT}/`)
