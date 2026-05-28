from datetime import datetime, timezone, timedelta
import random

DEMO_POSITIONS=[
 {"symbol":"AMD","name":"Advanced Micro Devices","sec_type":"STK","sector":"Semis","qty":120,"avg_price":138.2,"last":194.1,"day_change_pct":0.78,"market_value":23292,"unrealized":6708,"portfolio_pct":22.84,"risk":72,"brand":"#ED1C24","accent":"#ff6b6b","logo":"AMD","momentum_score":68,"news_score":61,"macro_sensitivity":77},
 {"symbol":"NBIS","name":"Nebius Group","sec_type":"STK","sector":"AI Infra","qty":150,"avg_price":197,"last":256.28,"day_change_pct":1.42,"market_value":38442,"unrealized":8892,"portfolio_pct":37.7,"risk":88,"brand":"#7C3AED","accent":"#a78bfa","logo":"NB","momentum_score":75,"news_score":53,"macro_sensitivity":98},
 {"symbol":"SOFI","name":"SoFi Technologies","sec_type":"STK","sector":"Fintech","qty":500,"avg_price":18.4,"last":25.61,"day_change_pct":3.32,"market_value":12805,"unrealized":3605,"portfolio_pct":12.56,"risk":66,"brand":"#00A3E0","accent":"#67e8f9","logo":"SF","momentum_score":83,"news_score":78,"macro_sensitivity":83},
 {"symbol":"SOFI  JUN2027 22 C","underlying":"SOFI","name":"SOFI Jun 2027 22C","sec_type":"OPT","sector":"Options","qty":4,"avg_price":2.75,"last":2.60,"day_change_pct":-1.2,"market_value":1040,"unrealized":-60,"portfolio_pct":1.02,"risk":92,"brand":"#00A3E0","accent":"#67e8f9","logo":"SF","momentum_score":52,"news_score":58,"macro_sensitivity":90},
 {"symbol":"MELI","name":"MercadoLibre","sec_type":"STK","sector":"E-Commerce","qty":5,"avg_price":1580,"last":1970.25,"day_change_pct":4.04,"market_value":9851.25,"unrealized":1951.25,"portfolio_pct":9.66,"risk":55,"brand":"#FFE600","accent":"#fde047","logo":"ML","momentum_score":92,"news_score":85,"macro_sensitivity":59},
 {"symbol":"IREN","name":"Iris Energy","sec_type":"STK","sector":"AI Compute","qty":300,"avg_price":10.50,"last":14.82,"day_change_pct":5.14,"market_value":4446,"unrealized":1296,"portfolio_pct":4.36,"risk":91,"brand":"#10B981","accent":"#6ee7b7","logo":"IR","momentum_score":78,"news_score":64,"macro_sensitivity":88},
]
WATCHLIST=[
 {"symbol":"META","name":"Meta Platforms","sector":"Mega-cap Tech","price":522.1,"change_pct":1.2,"market_cap":"1.32T","rvol":1.25,"risk":42,"opportunity":74,"momentum":69,"macro_fit":"Good","label":"Starter position"},
 {"symbol":"NVDA","name":"NVIDIA","sector":"AI Semis","price":143.44,"change_pct":3.06,"market_cap":"3.5T","rvol":1.85,"risk":78,"opportunity":68,"momentum":87,"macro_fit":"Neutral","label":"Day trade"},
 {"symbol":"CRWV","name":"CoreWeave","sector":"AI Cloud","price":115.52,"change_pct":3.27,"market_cap":"52B","rvol":1.83,"risk":84,"opportunity":61,"momentum":89,"macro_fit":"Weak","label":"High risk"},
 {"symbol":"GOOGL","name":"Alphabet","sector":"Mega-cap Tech","price":176.8,"change_pct":0.45,"market_cap":"2.1T","rvol":0.95,"risk":39,"opportunity":78,"momentum":55,"macro_fit":"Good","label":"Long term watch"},
 {"symbol":"AVAV","name":"AeroVironment","sector":"Aerospace & Defense","price":272.45,"change_pct":1.88,"market_cap":"6.9B","rvol":1.12,"risk":48,"opportunity":72,"momentum":66,"macro_fit":"Good","label":"Defense cycle watch"},
 {"symbol":"TSLA","name":"Tesla","sector":"EV / AI / Energy","price":348.52,"change_pct":-0.84,"market_cap":"1.12T","rvol":1.42,"risk":76,"opportunity":54,"momentum":44,"macro_fit":"Mixed","label":"Event-driven only"},
]

def macro_snapshot():
 return {"vix":18.4,"skew":137.2,"dxy":104.1,"us10y":4.43,"move":104.5,"tga":812,"sofr":5.31,"hy_spread":3.18,"risk_mode":"BUY WITH CASH","market_strip":[{"name":"S&P 500","value":"5,934","chg":0.38},{"name":"Nasdaq","value":"18,917","chg":0.62},{"name":"Russell","value":"2,118","chg":-0.18},{"name":"VIX","value":"18.4","chg":-2.1},{"name":"DXY","value":"104.1","chg":0.2},{"name":"BTC","value":"$102.4K","chg":1.4}]}

def enrich_position(p, total):
 cost=round(float(p.get('avg_price',0))*float(p.get('qty',0))*(100 if p.get('sec_type')=='OPT' else 1),2)
 mv=float(p.get('market_value',0))
 p={**p}
 p.setdefault('cost_basis', cost)
 p.setdefault('unrealized_pct', round((float(p.get('unrealized',0))/cost*100),2) if cost else 0)
 p.setdefault('day_pnl', round(mv*float(p.get('day_change_pct',0))/100,2))
 p.setdefault('ai_view', 'Rules-based live view. Use portfolio exposure and macro regime before adding risk.')
 p.setdefault('why_moving','Momentum/sector move. Confirm with news and volume.')
 p.setdefault('portfolio_pct', round(mv/total*100,2) if total else 0)
 return p

def compute_exposures(positions,total):
 rows=[]; by={}
 for p in positions:
  by[p.get('sector','Other')]=by.get(p.get('sector','Other'),0)+float(p.get('market_value',0))
 for k,v in by.items(): rows.append({"name":k,"value":round(v,2),"pct":round(v/total*100,2) if total else 0})
 rows=sorted(rows,key=lambda x:x['value'], reverse=True)
 return {"rows":rows,"top_name":rows[0]['name'] if rows else '-',"top_pct":rows[0]['pct'] if rows else 0}

def portfolio_snapshot():
 total=sum(float(p['market_value']) for p in DEMO_POSITIONS)+18650
 positions=[enrich_position(p,total) for p in DEMO_POSITIONS]
 unreal=sum(float(p.get('unrealized',0)) for p in positions)
 cb=sum(float(p.get('cost_basis',0)) for p in positions)
 daily_pnl=round(sum(float(p.get('day_pnl',0)) for p in positions),2)
 daily_pnl_pct=round(daily_pnl/max(total-daily_pnl,1)*100,2)
 return {"source":"DEMO","as_of":datetime.now(timezone.utc).isoformat(),"total_value":round(total,2),"cost_basis":round(cb,2),"daily_pnl":daily_pnl,"daily_pnl_pct":daily_pnl_pct,"unrealized":round(unreal,2),"unrealized_pct":round(unreal/cb*100,2) if cb else 0,"cash":18650,"buying_power":42400,"margin_used":22.4,"risk_mode":"BUY WITH CASH","positions":positions,"exposures":compute_exposures(positions,total),"guardrails":risk_doctor(positions,macro_snapshot()),"today_actions":today_actions(positions,macro_snapshot()),"stress_tests":stress_tests(total),"journal":[{"date":"2026-05-15","ticker":"NBIS","action":"Watch","lesson":"Avoid adding margin when already concentrated."},{"date":"2026-05-22","ticker":"IREN","action":"Watch","lesson":"AI compute narrative — keep sizing small, GPU cloud execution risk is real."}]}

def risk_doctor(positions,macro):
 out=[]
 for p in positions:
  if p.get('portfolio_pct',0)>25: out.append({"level":"danger","title":f"{p['symbol']} concentration","text":f"{p['portfolio_pct']}% of portfolio. Trim/avoid margin adds if VIX rises or SKEW >160."})
  if p.get('risk',0)>85: out.append({"level":"warning","title":f"{p['symbol']} high risk","text":"Use smaller sizing and define invalidation."})
 if macro['us10y']>4.4: out.append({"level":"warning","title":"Yields pressure growth","text":"AI/high-beta exposure is more fragile while 10Y remains elevated."})
 return out

def today_actions(positions,macro):
 top=max(positions,key=lambda p:p.get('portfolio_pct',0)) if positions else {"symbol":"-","portfolio_pct":0}
 return [{"priority":1,"title":"Respect macro regime","text":f"Risk mode: {macro['risk_mode']}. Use cash, avoid margin adds."},{"priority":2,"title":f"Control {top['symbol']} weight","text":f"Top exposure {top.get('portfolio_pct',0)}%. New trades should not increase concentration."},{"priority":3,"title":"Use Trade Engine","text":"Only act when entry/stop/target are defined and macro filter is not hostile."}]

def stress_tests(total):
 return [{"scenario":"Nasdaq -3%","estimated_pnl":round(-total*.042,2),"estimated_pct":-4.2},{"scenario":"VIX >25","estimated_pnl":round(-total*.065,2),"estimated_pct":-6.5},{"scenario":"Top position -10%","estimated_pnl":round(-total*.037,2),"estimated_pct":-3.7}]

def news_items():
 return [
  {"source":"Yahoo/RSS","ticker":"AMD","title":"AI semis strength continues — MI300X bookings ahead of expectations","impact":"Positive","action":"Watch, do not chase extended move above $200"},
  {"source":"Macro","ticker":"SOFI","title":"Yields and credit sentiment in focus — rate cut odds rise","impact":"Mixed","action":"Rates sensitive; hold current position, trim above $27.50"},
  {"source":"Advisor Intel","ticker":"NBIS","title":"Chart thread: $256 resistance breakout watch — add risk only on confirmed hold","impact":"High","action":"Do not add — portfolio weight already at 37.7%"},
  {"source":"Yahoo/RSS","ticker":"IREN","title":"Iris Energy GPU cloud bookings surge; Q3 capacity targets reaffirmed","impact":"Positive","action":"High beta — protect gains, invalidation $12.50"},
 ]

def catalyst_calendar():
 base=datetime.now().date()
 return [
  {"date":str(base+timedelta(days=2)),"event":"CPI print","impact":"Macro volatility — rates-sensitive names (SOFI, NBIS, CRWV) most exposed"},
  {"date":str(base+timedelta(days=5)),"event":"NVDA earnings","impact":"AI basket read-through — AMD, NBIS, IREN, CRWV all correlated"},
  {"date":str(base+timedelta(days=12)),"event":"AMD earnings","impact":"Direct position — watch guidance on MI300 data-center revenue"},
  {"date":str(base+timedelta(days=17)),"event":"AVAV earnings","impact":"Defense sector check — AVAV watchlist"},
  {"date":str(base+timedelta(days=24)),"event":"SOFI earnings","impact":"Direct position — EPS trajectory toward GAAP profitability"},
 ]
