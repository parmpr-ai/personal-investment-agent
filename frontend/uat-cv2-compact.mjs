/**
 * ARTEMIS-AI-011 V2 — Compact V2 + Expanded V2 validation screenshots
 * Required: BUY/HOLD/SELL compact at 390/430/Desktop
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'fs'

const BASE = 'http://localhost:3000'
const OUT = 'uat-screenshots/artemis-ai-011'
mkdirSync(OUT, { recursive: true })

const CASES = [
  {
    name: 'buy', ticker: 'NBIS', aiScore: 78, risk: 28, upside: 24.0, sentiment: 'Bullish',
    momentumScore: 75, trendScore: 68, sentimentScore: 72,
    summary: 'Analyst revisions accelerating with strong momentum and constructive technical setup.',
    shares: 0,
  },
  {
    name: 'hold', ticker: 'NBIS', aiScore: 52, risk: 48, upside: 6.0, sentiment: 'Neutral',
    momentumScore: 55, trendScore: 50, sentimentScore: 49,
    summary: 'Mixed earnings and valuation signals. Momentum intact but sentiment is neutral.',
    shares: 0,
  },
  {
    name: 'sell', ticker: 'NBIS', aiScore: 22, risk: 78, upside: -18.0, sentiment: 'Bearish',
    momentumScore: 28, trendScore: 25, sentimentScore: 22,
    summary: 'Earnings deterioration and negative revisions. Risk elevated with poor momentum.',
    shares: 0,
  },
]

function makeDashboard(c) {
  return {
    portfolio: {
      total_value: 116071, daily_pnl: 800, daily_pnl_pct: 0.67, unrealized: 18000, unrealized_pct: 15,
      positions: [
        {
          symbol: c.ticker, name: 'Neuberger Berman', type: 'stocks',
          shares: c.shares, cost_basis: c.shares > 0 ? 18.50 : 0, last: 24.18,
          market_value: c.shares * 24.18, unrealized: c.shares > 0 ? 852 : 0, unrealized_pct: c.shares > 0 ? 30.7 : 0,
          day_change_pct: 1.81, momentum_score: c.momentumScore, sparkline: [],
        },
      ],
    },
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
      institutional_score: 58, data_quality: 'High', upside_downside: c.upside,
    },
    intelligence: {
      overview: { summary: c.summary, momentum_state: c.sentiment, why_moving: c.summary },
      technical: { trend: c.sentiment === 'Bearish' ? 'Downtrend' : c.sentiment === 'Bullish' ? 'Uptrend' : 'Sideways', trend_score: c.trendScore },
      targets: { average: fairValue, upside_downside: c.upside },
    },
    news: [],
  }
}

function makeAiIntelligence(c) {
  return {
    symbol: c.ticker, score: c.aiScore,
    verdict: c.aiScore >= 65 ? 'BUY' : c.aiScore < 40 ? 'SELL' : 'HOLD',
    data_quality: 'High', cache_hit: false, as_of: '2026-06-18', latency_ms: 120,
    metrics: { momentum: c.momentumScore, trend: c.trendScore, sentiment: c.sentimentScore, risk: c.risk, institutional_score: 58, fair_value: null },
    reasons: [c.summary], sources: { news: 'available' },
  }
}

async function openWidget(page) {
  // Portfolio tab
  for (const btn of await page.$$('.mobile-bottom-nav button')) {
    const txt = (await btn.innerText().catch(() => '')).trim().toLowerCase()
    if (txt.includes('port')) { await btn.click(); await page.waitForTimeout(1800); break }
  }
  // Open position panel
  for (const sel of ['.mptbl-frow', '.mobile-position-card']) {
    const els = await page.$$(sel)
    if (els.length > 0) {
      try { await els[0].tap() } catch { await els[0].click() }
      await page.waitForTimeout(2200)
      for (const btn of await page.$$('button')) {
        if ((await btn.innerText().catch(() => '')).trim() === 'Overview') { await btn.click(); await page.waitForTimeout(700); break }
      }
      return true
    }
  }
  return false
}

async function captureCompact(browser, c, viewport, suffix) {
  const ctx = await browser.newContext({ viewport })
  const page = await ctx.newPage()
  page.on('console', msg => { if (msg.type() === 'error') console.log(`  [err] ${msg.text().slice(0, 80)}`) })

  await page.route('**/api/dashboard**',       route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeDashboard(c)) }))
  await page.route('**/api/stock/**',           route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeStock(c)) }))
  await page.route('**/api/ai-intelligence/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeAiIntelligence(c)) }))

  await page.goto(`${BASE}/mobile`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => page.goto(`${BASE}/mobile`, { waitUntil: 'load' }))
  await page.waitForTimeout(1800)

  const opened = await openWidget(page)
  if (!opened) { console.log(`  ⚠ Panel not opened`); await ctx.close(); return }

  const sai = await page.$('.sai')
  if (sai) {
    await sai.scrollIntoViewIfNeeded()
    await page.waitForTimeout(600)
    const fname = `${OUT}/${suffix}.png`
    writeFileSync(fname, await sai.screenshot())
    console.log(`  ✓ ${fname}`)
  } else {
    console.log(`  ⚠ .sai not found`)
  }
  await ctx.close()
}

async function captureExpanded(browser, c, viewport, suffix) {
  const ctx = await browser.newContext({ viewport })
  const page = await ctx.newPage()
  page.on('console', msg => { if (msg.type() === 'error') console.log(`  [err] ${msg.text().slice(0, 80)}`) })

  await page.route('**/api/dashboard**',       route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeDashboard(c)) }))
  await page.route('**/api/stock/**',           route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeStock(c)) }))
  await page.route('**/api/ai-intelligence/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeAiIntelligence(c)) }))

  await page.goto(`${BASE}/mobile`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => page.goto(`${BASE}/mobile`, { waitUntil: 'load' }))
  await page.waitForTimeout(1800)

  const opened = await openWidget(page)
  if (!opened) { console.log(`  ⚠ Panel not opened`); await ctx.close(); return }

  // Tap compact card to open expanded sheet
  const sai = await page.$('.sai-p2')
  if (!sai) { console.log(`  ⚠ .sai-p2 not found`); await ctx.close(); return }
  try { await sai.tap() } catch { await sai.click() }
  await page.waitForTimeout(1200)

  const panel = await page.$('.sai-exp25-panel')
  if (panel) {
    await page.waitForTimeout(400)
    const fname = `${OUT}/${suffix}.png`
    writeFileSync(fname, await panel.screenshot())
    console.log(`  ✓ ${fname}`)
  } else {
    console.log(`  ⚠ .sai-exp25-panel not found — taking full page screenshot`)
    const fname = `${OUT}/${suffix}.png`
    writeFileSync(fname, await page.screenshot({ fullPage: false }))
    console.log(`  ✓ ${fname} (fallback viewport)`)
  }
  await ctx.close()
}

const browser = await chromium.launch({ headless: true })

console.log('\n══ Compact — 390px ══')
for (const c of CASES) {
  console.log(`  ${c.name.toUpperCase()}`)
  await captureCompact(browser, c, { width: 390, height: 844 }, `${c.name}-390`)
}

console.log('\n══ Compact — 430px ══')
for (const c of CASES) {
  console.log(`  ${c.name.toUpperCase()}`)
  await captureCompact(browser, c, { width: 430, height: 932 }, `${c.name}-430`)
}

console.log('\n══ Compact — Desktop 768px ══')
for (const c of CASES) {
  console.log(`  ${c.name.toUpperCase()}`)
  await captureCompact(browser, c, { width: 768, height: 1024 }, `${c.name}-desktop`)
}

console.log('\n══ Expanded — 390px ══')
for (const c of CASES) {
  console.log(`  ${c.name.toUpperCase()} expanded`)
  await captureExpanded(browser, c, { width: 390, height: 844 }, `${c.name}-expanded-390`)
}

await browser.close()
console.log(`\n✓ Done — screenshots in frontend/${OUT}/`)
