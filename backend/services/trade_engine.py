from math import isnan

def _r(x,d=0):
 try: return round(float(x),d)
 except: return 0

def trade_plan_for(p, macro):
 price=_r(p.get('last'),2); pct=_r(p.get('day_change_pct'),2); risk=_r(p.get('risk')); weight=_r(p.get('portfolio_pct'),2)
 momentum=_r(p.get('momentum_score',50)); news=_r(p.get('news_score',50)); macro_sens=_r(p.get('macro_sensitivity',60))
 vix=_r(macro.get('vix')); skew=_r(macro.get('skew')); ten=_r(macro.get('us10y'))
 hostile = vix>25 or skew>160 or ten>4.65
 over_weight = weight>20
 extended = pct>3.5 or momentum>85
 label='WAIT'; setup='No clean setup'; conf=48
 if hostile and risk>70: label='AVOID'; setup='Macro hostile for high beta'; conf=72
 elif over_weight and extended: label='DAY TRADE ONLY'; setup='Momentum but oversized portfolio exposure'; conf=76
 elif momentum>75 and news>60 and not hostile: label='SWING WATCH'; setup='Momentum + news aligned'; conf=70
 elif pct<-3 and not hostile: label='BOUNCE WATCH'; setup='Pullback into possible mean reversion'; conf=62
 elif risk<50 and not hostile: label='STARTER POSITION'; setup='Lower risk watch candidate'; conf=64
 atr=max(price*0.035, price*0.015)
 entry_low=price-atr*.45; entry_high=price-atr*.15
 stop=price-atr*1.2
 t1=price+atr*.9; t2=price+atr*1.8
 if label in ['AVOID','WAIT']:
  entry_low=price*.98; entry_high=price*.995; stop=price*.965; t1=price*1.025; t2=price*1.05
 return {"ticker":p.get('symbol'),"price":price,"label":label,"setup":setup,"entry":f"{entry_low:.2f}–{entry_high:.2f}","entry_zone":f"{entry_low:.2f}–{entry_high:.2f}","stop":round(stop,2),"targets":[round(t1,2),round(t2,2)],"confidence":conf,"position_size":"Small / no margin" if over_weight or hostile else "Normal starter sizing","rationale":[f"Portfolio weight {weight}%",f"Momentum score {momentum}",f"News score {news}",f"Macro: VIX {vix}, SKEW {skew}, 10Y {ten}","Rule-based engine; use chart confirmation before execution."],"portfolio_impact":"High concentration risk" if over_weight else "Manageable portfolio impact", "reason": setup}

def scanner_items(positions=None, macros=None, watchlist=None):
 if positions is None: positions=[]
 if macros is None: macros={}
 out=[trade_plan_for(p,macros) for p in positions]
 out=sorted(out,key=lambda x:(x['label']=='AVOID',-x['confidence']))
 return out

def opportunity_for(w, macro):
 opp=w.get('opportunity',50); mom=w.get('momentum',50); risk=w.get('risk',50); change=w.get('change_pct',0)
 if risk>80 and change>2: action='DAY TRADE ONLY'
 elif opp>75 and risk<60: action='RESEARCH / STARTER'
 elif mom>80: action='MOMENTUM WATCH'
 else: action='WAIT'
 return {**w,"action":action,"reason":f"Opportunity {opp}, momentum {mom}, risk {risk}. Macro fit: {w.get('macro_fit','Neutral')}","entry":"Use pullback near prior support / VWAP; avoid chase if extended."}
