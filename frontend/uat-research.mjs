import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'fs'

const OUT = 'uat-screenshots/artemis-ai-v3-research-003'
mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:3002'

const CASES = [
  { name: 'buy',  ticker: 'NBIS', aiScore: 78, risk: 28, upside: 24.0 },
  { name: 'hold', ticker: 'AMD',  aiScore: 52, risk: 48, upside:  6.0 },
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
  const bullMap = { BUY: 'Strong AI demand. Analyst upgrades accelerating. Earnings momentum solid. Fair value gap widening.', HOLD: 'Mixed earnings signals. Some analyst support remains. Sector momentum intact.', SELL: 'Price stabilisation early. Some relative value emerging. Sector rotation possible.' }
  const bearMap = { BUY: 'Valuation stretched. Macro uncertainty rising. Multiple compression risk.', HOLD: 'Guidance risk elevated. Valuation not cheap. Macro headwinds building.', SELL: 'Weak momentum sustained. Analyst downgrades accelerating. Multiple compression ongoing.' }
  return { ticker: c.ticker,
    fundamentals: { last: 24.18, price: 24.18, fair_value: 24.18*(1+c.upside/100),
      ai_score: c.aiScore, name: c.ticker+' Corp', momentum_score: c.aiScore, trend_score: c.aiScore-5,
      sentiment_score: c.aiScore+2, risk: c.risk, risk_score: c.risk, upside_downside: c.upside,
      bull_case: bullMap[v], bear_case: bearMap[v] }, shares: 10, qty: 10 }
}
function mockAI(c) {
  return { symbol: c.ticker, score: c.aiScore, verdict: VERDICT(c.aiScore), metrics: { momentum: c.aiScore, risk: c.risk },
    bull_case: 'Strong AI demand, analyst upgrades accelerating.', bear_case: 'Elevated valuation, compression risk.',
    what_could_change: 'Material change in analyst targets, macro risk mode.' }
}

// Mock the research endpoint with realistic data
function mockResearch(c) {
  const v = VERDICT(c.aiScore)
  const moatScore = Math.round(50 + c.aiScore * 0.3)
  const riskScore = c.risk + Math.round(Math.random() * 10)
  const price = 24.18 * (1 + Math.random() * 2)
  const fairVal = price * (1 + c.upside / 100)
  return {
    type: 'AIIntelligenceResearchPayload', schemaVersion: 'HERMES-AI-V3-003.0',
    symbol: c.ticker, generatedAt: new Date().toISOString(),
    sourceStatus: { companyFundamentals: { status: 'fresh', provider: 'Yahoo Finance', updatedAt: new Date().toISOString(), ttlSeconds: 900 } },
    research: {
      investmentThesis: {
        status: 'available', dataType: 'ai_summary', confidence: 65,
        sources: ['companyFundamentals', 'newsSentiment', 'sectorComparison'],
        lastUpdated: new Date().toISOString(), refreshFrequency: '15m, 2m',
        calculationMethod: 'Rule-based research summary from sourced company profile, catalysts, moat, and sector context.',
        summary: `${c.ticker} Corp operates in the AI cloud and infrastructure sector with strong GPU demand driving the investment thesis.`,
        keyPoints: [
          `${c.ticker} Corp is a fast-growing AI infrastructure platform with GPU cloud capabilities serving enterprise and sovereign AI clients. Positioned to capitalize on the global AI buildout cycle.`,
          `Primary investor focus: AI Demand Acceleration.`, `Moat profile: ${moatScore >= 65 ? 'Strong' : 'Moderate'}.`, `Sector context: AI Infrastructure.`
        ],
        metrics: {
          companyName: { value: c.ticker + ' Corp', calculationMethod: 'Direct field.' },
          sector: { value: 'AI Infrastructure', calculationMethod: 'Direct field.' },
          industry: { value: 'GPU Cloud / Data Centers', calculationMethod: 'Direct field.' },
          primaryCatalyst: { value: 'AI Demand Acceleration', calculationMethod: 'Derived catalyst.' },
          moatRating: { value: moatScore >= 65 ? 'Strong' : 'Moderate', calculationMethod: 'Derived from V2.5 moat score.' },
        },
        sourceStatus: {}, missingData: [], readFullAnalysis: '',
      },
      financialHealth: {
        status: 'partial', dataType: 'derived', confidence: 55,
        sources: ['companyFundamentals'],
        lastUpdated: new Date().toISOString(), refreshFrequency: '15m',
        calculationMethod: 'Combines available market/EPS fields.',
        summary: 'Financial health partially available from EPS and market data.',
        keyPoints: ['EPS data available.'],
        metrics: {
          revenue: { value: null, unit: 'USD', isPlaceholder: true, calculationMethod: 'Missing: income statement provider.' },
          freeCashFlow: { value: null, unit: 'USD', isPlaceholder: true, calculationMethod: 'Missing: cash flow provider.' },
          netIncome: { value: null, unit: 'USD', isPlaceholder: true, calculationMethod: 'Missing: income statement provider.' },
          margins: { value: null, unit: 'percent', isPlaceholder: true, calculationMethod: 'Missing: income statement provider.' },
          marketCap: { value: 7280000000, unit: 'USD', calculationMethod: 'Direct field.' },
          eps: { value: 2.11, unit: 'USD', calculationMethod: 'Direct EPS field.' },
          pe: { value: 110.3, unit: 'ratio', calculationMethod: 'Price / EPS.' },
        },
        sourceStatus: {}, missingData: [], readFullAnalysis: '',
      },
      growthEngine: {
        status: 'partial', dataType: 'derived', confidence: 50,
        sources: ['newsSentiment', 'companyFundamentals'],
        lastUpdated: new Date().toISOString(), refreshFrequency: '2m',
        calculationMethod: 'Rule-derived from sourced catalysts, company context, and news exposure.',
        summary: 'Growth engine derived from catalysts and news; segment data unavailable.',
        keyPoints: [`AI exposure level: ${c.aiScore >= 65 ? 'Very High' : c.aiScore >= 50 ? 'High' : 'Moderate'}.`],
        metrics: {
          aiExposure: { value: { level: c.aiScore >= 65 ? 'Very High' : c.aiScore >= 50 ? 'High' : 'Moderate', advantage: 'Company, sector, and news signals all aligned.' }, calculationMethod: 'Derived.' },
          revenueDrivers: { value: ['AI Demand Acceleration', 'Analyst Upgrades', 'New Product Cycle', 'Infrastructure Expansion'], calculationMethod: 'Derived.' },
          productGrowth: { value: [{ title: 'New Product Cycle', impact: 'Medium', probability: 64, timeframe: '3-6 months' }], calculationMethod: 'Derived.' },
          tam: { value: null, isPlaceholder: true, calculationMethod: 'Missing: TAM requires market-sizing provider.' },
          managementGuidance: { value: null, isPlaceholder: true, calculationMethod: 'Missing: guidance provider.' },
        },
        sourceStatus: {}, missingData: [], readFullAnalysis: '',
      },
      moatAnalysis: {
        status: 'partial', dataType: 'derived', confidence: 58,
        sources: ['companyFundamentals', 'sectorComparison'],
        lastUpdated: new Date().toISOString(), refreshFrequency: '15m',
        calculationMethod: 'Rule-derived V2.5 moat components from available profile, sector, scale, and technology signals.',
        summary: `Moat analysis is ${moatScore >= 65 ? 'strong' : 'moderate'} based on derived component scoring.`,
        keyPoints: [`Moat score: ${moatScore}.`],
        metrics: {
          score: { value: moatScore, unit: 'score_0_100', calculationMethod: 'V2.5 moat score.' },
          rating: { value: moatScore >= 65 ? 'Strong' : 'Moderate', calculationMethod: 'Bucketed from score.' },
          components: { value: { networkEffects: 70, switchingCosts: 81, brandStrength: 50, technologyAdvantage: 78, costAdvantage: 45, scale: 68 }, calculationMethod: 'V2.5 components.' },
          drivers: { value: ['High Switching Costs', 'Technology Leadership', 'Network Effects'], calculationMethod: 'Top V2.5 moat drivers.' },
        },
        sourceStatus: {}, missingData: [], readFullAnalysis: '',
      },
      valuation: {
        status: 'partial', dataType: 'derived', confidence: 60,
        sources: ['companyFundamentals', 'analystTargets'],
        lastUpdated: new Date().toISOString(), refreshFrequency: '15m',
        calculationMethod: 'Partially available from current price, fair value, analyst targets, and derived EPS metrics.',
        summary: 'Valuation partially available.',
        keyPoints: [`Current price: $${price.toFixed(2)}.`],
        metrics: {
          currentPrice: { value: Number(price.toFixed(2)), unit: 'USD', calculationMethod: 'Direct price field.' },
          fairValue: { value: Number(fairVal.toFixed(2)), unit: 'USD', calculationMethod: 'Derived fair value.' },
          analystTarget: { value: { average: price * 0.88, high: price * 1.38, low: price * 0.55 }, calculationMethod: 'Analyst target data.' },
          valuationMultiples: { value: { pe: 110.3, eps: 2.11, marketCap: 7280000000 }, calculationMethod: 'Derived multiples.' },
          upsideDownsideRange: { value: { basePct: c.upside, bullPct: c.upside * 1.6, bearPct: c.upside * -0.7 }, calculationMethod: 'Scenario range.' },
        },
        sourceStatus: {}, missingData: [], readFullAnalysis: '',
      },
      institutionalThesis: {
        status: 'partial', dataType: 'derived', confidence: 60,
        sources: ['analystConsensus', 'newsSentiment'],
        lastUpdated: new Date().toISOString(), refreshFrequency: '1h',
        calculationMethod: 'Derived from V2.5 institutional view using analyst, moat, catalyst, and news evidence.',
        summary: 'Institutional investors are likely to be constructive due to AI infrastructure exposure.',
        keyPoints: ['Constructive institutional rationale based on moat and catalyst evidence.'],
        metrics: {
          supportiveRationale: { value: ['High Switching Costs', 'Technology Leadership', 'AI Demand Acceleration', 'Strong Analyst Coverage'], calculationMethod: 'Derived.' },
          cautionRationale: { value: ['Elevated risk score', 'Valuation Compression', 'Multiple compression risk', 'Beta exposure'], calculationMethod: 'Derived.' },
          analystSentiment: { value: { sentimentLabel: v === 'BUY' ? 'Constructive' : v === 'SELL' ? 'Cautious' : 'Neutral', consensusRating: v }, calculationMethod: 'Derived.' },
          institutionalScore: { value: c.aiScore * 0.9, calculationMethod: 'Derived institutional score.' },
          institutionalFlow30d: { value: c.aiScore >= 65 ? 31927545483 : c.aiScore >= 45 ? 8500000000 : -4200000000, calculationMethod: 'Derived flow.' },
        },
        sourceStatus: {}, missingData: [], readFullAnalysis: '',
      },
      competitiveComparison: {
        status: 'missing', shouldRender: false,
        dataType: 'missing', confidence: 0,
        sources: [],
        lastUpdated: null, refreshFrequency: null,
        calculationMethod: 'No peer data available.',
        summary: 'Competitive comparison not available.',
        keyPoints: [],
        metrics: { peerSelectionMethod: { value: 'missing', calculationMethod: 'Contract status.' }, peers: { value: null, calculationMethod: 'Missing.' }, peerMetrics: { value: null, calculationMethod: 'Missing.' } },
        sourceStatus: {}, missingData: [], readFullAnalysis: '',
      },
      riskAnalysis: {
        status: 'partial', dataType: 'derived', confidence: 62,
        sources: ['technicalIndicators', 'analystTargets'],
        lastUpdated: new Date().toISOString(), refreshFrequency: '5m',
        calculationMethod: 'Rule-derived from technical risk, valuation spread, macro context.',
        summary: 'Risk analysis rule-derived from technical and valuation signals.',
        keyPoints: ['Elevated volatility detected.'],
        metrics: {
          riskScore: { value: riskScore, unit: 'score_0_100', calculationMethod: 'V2.5 risk score.' },
          beta: { value: 2.87, calculationMethod: 'Calculated beta.' },
          risks: { value: [
            { title: 'Elevated Volatility', severity: 'High', probability: 87, impactOnThesis: 'Volatility can weaken confidence in the long-form thesis.', mitigationOrWatchItem: 'Monitor volatility, drawdown, and beta together.' },
            { title: 'Target Downside', severity: 'Medium', probability: 78, impactOnThesis: 'Negative target spread can pressure valuation confidence.', mitigationOrWatchItem: 'Track target revisions and range changes.' },
            { title: 'Valuation Compression', severity: v === 'SELL' ? 'High' : 'Medium', probability: 75, impactOnThesis: 'The valuation multiple is elevated relative to broad market baseline.', mitigationOrWatchItem: 'Watch the 0-6 months timeframe.' },
          ], calculationMethod: 'Risk cards from evidence.' },
        },
        sourceStatus: {}, missingData: [], readFullAnalysis: '',
      },
      bullBearDebate: {
        status: 'available', dataType: 'ai_summary', confidence: 55,
        sources: ['companyFundamentals', 'analystTargets', 'newsSentiment'],
        lastUpdated: new Date().toISOString(), refreshFrequency: '15m',
        calculationMethod: 'Rule-based neutral debate synthesis from research evidence.',
        summary: `The neutral synthesis is to weigh ${v === 'BUY' ? 'durable business drivers' : 'risk factors'} against ${v === 'BUY' ? 'valuation multiples' : 'potential recovery signals'}.`,
        keyPoints: ['Moat and catalyst evidence versus risk and valuation compression.'],
        metrics: {
          bullArgument: { value: 'Moat profile with High Switching Costs, Technology Leadership, and Network Effects provides durable competitive advantage. AI demand cycle still accelerating.', calculationMethod: 'Rule-based synthesis.' },
          bearArgument: { value: 'Risk score elevated at ' + riskScore + '/100. Valuation multiple extended relative to broad market baseline. Target downside risk present.', calculationMethod: 'Rule-based synthesis.' },
          bullEvidence: { value: ['Strong moat: High Switching Costs, Technology Leadership, Network Effects.', 'Catalyst: AI Demand Acceleration.', 'Catalyst: Analyst Upgrades accelerating.', 'New Product Cycle with Medium probability.'], calculationMethod: 'Evidence rows.' },
          bearEvidence: { value: ['Risk: Elevated Volatility score ' + riskScore + '/100.', 'Risk: Target downside present.', 'Risk: Valuation Compression risk.', 'Risk: Macro uncertainty backdrop.'], calculationMethod: 'Evidence rows.' },
          neutralSynthesis: { value: `The neutral research position is to weigh the durable business drivers — high switching costs, technology leadership, and AI demand acceleration — against the elevated risk score and valuation multiple pressure. Position sizing should reflect conviction level and risk budget.`, calculationMethod: 'Neutral synthesis.' },
        },
        sourceStatus: {}, missingData: [], readFullAnalysis: '',
      },
      earningsBreakdown: {
        status: 'partial', shouldRender: true, dataType: 'derived', confidence: 80,
        sources: ['earningsHistory', 'earningsCalendar'],
        lastUpdated: new Date().toISOString(), refreshFrequency: '1h',
        calculationMethod: 'Direct EPS result from earnings history.',
        summary: 'Earnings context is EPS/date driven.',
        keyPoints: ['Reported EPS: 2.11.'],
        metrics: {
          lastEarningsResult: { value: { reportedEps: 2.11, epsEstimate: -0.49, surprisePct: 530, period: '2026-03-31' }, calculationMethod: 'Direct EPS result.' },
          epsVsEstimate: { value: { reportedEps: 2.11, estimate: -0.49, surprisePct: 530, period: '2026-03-31' }, calculationMethod: 'EPS comparison.' },
          nextEarningsDate: { value: '2026-08-06', calculationMethod: 'Earnings calendar.' },
          keyTakeaway: { value: 'EPS strongly beat estimate. Watch for next quarter guidance revision.', calculationMethod: 'Derived takeaway.' },
        },
        sourceStatus: {}, missingData: [], readFullAnalysis: '',
      },
    }
  }
}

const mockSettings = { ibkr: { connected: false }, privacy: { hide_values: false }, theme: 'dark' }

const browser = await chromium.launch({ headless: true })

for (const c of CASES) {
  console.log(`\n── ${c.name.toUpperCase()} (${c.ticker}) ──`)
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()

  // Same routes that work in uat-capture-v3.mjs
  await page.route('**/api/dashboard**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDash(c)) }))
  await page.route('**/api/stock/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockStock(c)) }))
  await page.route('**/api/ai-intelligence/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockAI(c)) }))
  await page.route('**/api/settings**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockSettings) }))
  await page.route('**/api/portfolio/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route('**/api/watchlist**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/scanner**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/macros**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"market_strip":[]}' }))
  await page.route('**/api/intelligence/**', r => {
    const url = r.request().url()
    if (/\/intelligence\/[^/?]+\/research/.test(url))
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockResearch(c)) })
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.goto(`${BASE}/mobile`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {})
  await page.waitForTimeout(2500)

  // Nav to portfolio
  for (const btn of await page.$$('.mobile-bottom-nav button')) {
    if ((await btn.innerText().catch(() => '')).toLowerCase().includes('port')) {
      await btn.click(); await page.waitForTimeout(2000); break
    }
  }

  // Click position card
  let found = false
  for (const sel of ['.mptbl-frow', '.mobile-position-card']) {
    const els = await page.$$(sel)
    if (els.length > 0) {
      try { await els[0].tap() } catch { await els[0].click() }
      await page.waitForTimeout(2500); found = true; break
    }
  }
  if (!found) { console.log('  ⚠ no position card'); await ctx.close(); continue }

  // Open expanded view
  const sai = await page.$('.sai-p2')
  if (sai) {
    try { await sai.tap() } catch { await sai.click() }
    await page.waitForTimeout(2000)
  }

  // Click Research tab
  const panel = await page.$('.sai-exp25-panel')
  if (!panel) { console.log('  ⚠ panel not found'); await ctx.close(); continue }

  // Find Research tab button
  const tabs = await page.$$('.sai-exp25-tab')
  let researchTab = null
  for (const tab of tabs) {
    const txt = (await tab.innerText().catch(() => '')).toLowerCase()
    if (txt.includes('research')) { researchTab = tab; break }
  }

  if (!researchTab) { console.log('  ⚠ research tab not found'); await ctx.close(); continue }

  await researchTab.click()
  await page.waitForTimeout(2500)

  // Screenshot: Research tab top
  writeFileSync(`${OUT}/${c.name}-research-top.png`, await panel.screenshot())
  console.log(`  ✓ research-top`)

  // Scroll down to see more sections
  await page.$eval('.sai-exp25-body', el => el.scrollTop += 500).catch(() => {})
  await page.waitForTimeout(500)
  writeFileSync(`${OUT}/${c.name}-research-mid.png`, await panel.screenshot())
  console.log(`  ✓ research-mid`)

  // Scroll more for bull/bear etc
  await page.$eval('.sai-exp25-body', el => el.scrollTop += 700).catch(() => {})
  await page.waitForTimeout(500)
  writeFileSync(`${OUT}/${c.name}-research-bottom.png`, await panel.screenshot())
  console.log(`  ✓ research-bottom`)

  // Expand additional sections to capture their body content
  await page.$eval('.sai-exp25-body', el => el.scrollTop = 0).catch(() => {})
  await page.waitForTimeout(300)
  // Click Financial Health, Growth Engine, Moat Analysis sections to expand them
  const sectionHeaders = await page.$$('.sai-res-sec-hdr')
  for (const hdr of sectionHeaders) {
    const txt = (await hdr.innerText().catch(() => '')).trim()
    if (['Financial Health', 'Growth Engine', 'Moat Analysis'].includes(txt.split('\n')[0]?.trim())) {
      try { await hdr.click() } catch {}
      await page.waitForTimeout(200)
    }
  }
  await page.waitForTimeout(500)
  writeFileSync(`${OUT}/${c.name}-sections-fh-ge-ma.png`, await panel.screenshot())
  console.log(`  ✓ sections expanded (FH/GE/MA)`)

  // Scroll down and expand Valuation, Risk Analysis, Bull vs Bear
  await page.$eval('.sai-exp25-body', el => el.scrollTop += 600).catch(() => {})
  await page.waitForTimeout(300)
  const sectionHeaders2 = await page.$$('.sai-res-sec-hdr')
  for (const hdr of sectionHeaders2) {
    const txt = (await hdr.innerText().catch(() => '')).trim()
    if (['Valuation', 'Risk Analysis', 'Bull vs Bear Debate'].includes(txt.split('\n')[0]?.trim())) {
      try { await hdr.click() } catch {}
      await page.waitForTimeout(200)
    }
  }
  await page.waitForTimeout(500)
  writeFileSync(`${OUT}/${c.name}-sections-val-risk-bvb.png`, await panel.screenshot())
  console.log(`  ✓ sections expanded (Val/Risk/BvB)`)

  // Open Customize drawer
  const custBtn = await page.$('.sai-res-cust-btn')
  if (custBtn) {
    await page.$eval('.sai-exp25-body', el => el.scrollTop = 99999).catch(() => {})
    await page.waitForTimeout(400)
    try { await custBtn.tap() } catch { await custBtn.click() }
    await page.waitForTimeout(800)
    writeFileSync(`${OUT}/${c.name}-customize.png`, await page.screenshot())
    console.log(`  ✓ customize`)
    // Close
    const close = await page.$('.sai-rsc-close')
    if (close) { await close.click(); await page.waitForTimeout(400) }
  }

  await ctx.close()
}

await browser.close()
console.log(`\n✓ Done — ${OUT}/`)
