/**
 * ARTEMIS-AI-011 — Compact V2 validation screenshots (BUY / HOLD / SELL)
 * Viewport: 390×844 (iPhone 14)
 *
 * The widget reads composite score from /api/ai-intelligence/{ticker}.score
 * and risk from /api/ai-intelligence/{ticker}.metrics.risk.
 * Both routes must be mocked to control verdict state.
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'fs'

const BASE = 'http://localhost:3000'
const OUT = 'uat-screenshots/artemis-ai-011'
mkdirSync(OUT, { recursive: true })

const CASES = [
  {
    name: 'buy',
    ticker: 'NBIS',
    aiScore: 78, risk: 28, upside: 24.0, sentiment: 'Bullish',
    momentumScore: 75, trendScore: 68, sentimentScore: 72,
    summary: 'Analyst revisions accelerating with strong momentum and constructive technical setup.',
  },
  {
    name: 'hold',
    ticker: 'NBIS',
    aiScore: 52, risk: 48, upside: 6.0, sentiment: 'Neutral',
    momentumScore: 55, trendScore: 50, sentimentScore: 49,
    summary: 'Mixed earnings and valuation signals. Momentum intact but sentiment is neutral.',
  },
  {
    name: 'sell',
    ticker: 'NBIS',
    aiScore: 22, risk: 78, upside: -18.0, sentiment: 'Bearish',
    momentumScore: 28, trendScore: 25, sentimentScore: 22,
    summary: 'Earnings deterioration and negative revisions. Risk elevated with poor momentum.',
  },
]

function makeDashboard(c) {
  return {
    portfolio: { total_value: 116071, daily_pnl: 800, daily_pnl_pct: 0.67, unrealized: 18000, unrealized_pct: 15 },
    positions: [
      {
        symbol: c.ticker, name: 'Neuberger Berman', type: 'stocks',
        shares: 150, cost_basis: 18.50, last: 24.18,
        market_value: 3627, unrealized: 852, unrealized_pct: 30.7,
        day_change_pct: 1.81, momentum_score: c.momentumScore, sparkline: [],
      },
    ],
    macros: { market_strip: [] }, scanner: [], guardrails: [], today_actions: [], watchlists: [],
  }
}

function makeStock(c) {
  const fairValue = 24.18 * (1 + c.upside / 100)
  return {
    ticker: c.ticker,
    fundamentals: {
      last: 24.18, price: 24.18, fair_value: fairValue,
      ai_score: c.aiScore, ai_view: c.summary,
      sentiment: c.sentiment,
      momentum_score: c.momentumScore, momentum_delta: 3,
      trend_score: c.trendScore, trend_delta: 1,
      sentiment_score: c.sentimentScore, news_score: c.sentimentScore,
      risk: c.risk, risk_score: c.risk,
      institutional_score: 58,
      data_quality: 'High',
      upside_downside: c.upside,
      analyst_target_avg: fairValue,
    },
    intelligence: {
      overview: {
        summary: c.summary,
        momentum_state: c.sentiment,
        why_moving: c.summary,
      },
      technical: {
        trend: c.sentiment === 'Bearish' ? 'Downtrend' : c.sentiment === 'Bullish' ? 'Uptrend' : 'Sideways',
        trend_score: c.trendScore,
      },
      targets: {
        average: fairValue, base: fairValue,
        high: fairValue * 1.15, low: fairValue * 0.85,
        upside_downside: c.upside,
      },
    },
    news: [],
  }
}

// The widget derives composite from ai_intelligence.score and risk from ai_intelligence.metrics.risk
// isUsableAi requires: score != null && data_quality !== 'no_data'
function makeAiIntelligence(c) {
  return {
    symbol: c.ticker,
    score: c.aiScore,
    verdict: c.aiScore >= 65 ? 'BUY' : c.aiScore < 40 ? 'SELL' : 'HOLD',
    data_quality: 'High',
    cache_hit: false,
    as_of: '2026-06-17',
    latency_ms: 120,
    metrics: {
      momentum: c.momentumScore,
      trend: c.trendScore,
      sentiment: c.sentimentScore,
      risk: c.risk,
      institutional_score: 58,
      fair_value: null,  // keep null so upside comes from /api/stock target
    },
    reasons: [c.summary],
    sources: { news: 'available' },
  }
}

const browser = await chromium.launch({ headless: true })

for (const c of CASES) {
  console.log(`\n── ${c.name.toUpperCase()} (aiScore=${c.aiScore}, risk=${c.risk}) ──`)

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()

  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`  [console.error] ${msg.text()}`)
  })

  await page.route('**/api/dashboard**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeDashboard(c)) })
  )
  await page.route('**/api/stock/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeStock(c)) })
  )
  await page.route('**/api/ai-intelligence/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeAiIntelligence(c)) })
  )

  await page.goto(`${BASE}/mobile`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() =>
    page.goto(`${BASE}/mobile`, { waitUntil: 'load' })
  )
  await page.waitForTimeout(2000)

  // Navigate to Portfolio tab
  const navBtns = await page.$$('.mobile-bottom-nav button')
  for (const btn of navBtns) {
    const txt = (await btn.innerText().catch(() => '')).trim().toLowerCase()
    if (txt.includes('port')) { await btn.click(); await page.waitForTimeout(2000); break }
  }

  // Click first position
  let opened = false
  for (const sel of ['.mptbl-frow', '.mobile-position-card']) {
    const els = await page.$$(sel)
    if (els.length > 0) {
      try { await els[0].tap() } catch { await els[0].click() }
      await page.waitForTimeout(2500)
      // Click Overview tab
      for (const btn of await page.$$('button')) {
        const txt = (await btn.innerText().catch(() => '')).trim()
        if (txt === 'Overview') { await btn.click(); await page.waitForTimeout(1000); break }
      }
      opened = true
      break
    }
  }

  if (!opened) {
    console.log(`  ⚠ Panel not opened — saving fallback full screenshot`)
    await page.screenshot({ path: `${OUT}/${c.name}-panel-fail.png`, fullPage: false })
    await ctx.close()
    continue
  }

  // Screenshot the .sai widget
  const sai = await page.$('.sai')
  if (sai) {
    await sai.scrollIntoViewIfNeeded()
    await page.waitForTimeout(600)
    writeFileSync(`${OUT}/${c.name}-widget.png`, await sai.screenshot())
    console.log(`  ✓ ${c.name}-widget.png`)
  } else {
    console.log(`  ⚠ .sai NOT FOUND — saving full panel screenshot`)
    await page.screenshot({ path: `${OUT}/${c.name}-panel-nosai.png`, fullPage: false })
  }

  await ctx.close()
}

await browser.close()
console.log(`\n✓ Done — screenshots in frontend/${OUT}/`)
