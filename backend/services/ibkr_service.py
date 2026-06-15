import os, re
from datetime import datetime, timezone
from dotenv import load_dotenv
from ib_insync import IB, util

load_dotenv()
try: util.startLoop()
except Exception: pass
IBKR_HOST=os.getenv('IBKR_HOST','127.0.0.1')
IBKR_PORT=int(os.getenv('IBKR_PORT','4001'))
IBKR_CLIENT_ID=int(os.getenv('IBKR_CLIENT_ID','31'))
_ib=None

def _num(v,d=0.0):
 try: return float(v) if v not in [None,''] else d
 except Exception: return d

def ensure_connection():
 global _ib
 if _ib and _ib.isConnected(): return _ib
 _ib=IB(); _ib.connect(IBKR_HOST,IBKR_PORT,clientId=IBKR_CLIENT_ID,readonly=True,timeout=10)
 return _ib

def clean_option_symbol(contract):
 try:
  right=getattr(contract,'right','')
  strike=getattr(contract,'strike','')
  expiry=getattr(contract,'lastTradeDateOrContractMonth','')
  return f"{contract.symbol} {expiry} {strike:g}{right}"
 except Exception:
  return getattr(contract,'localSymbol','OPTION')

def get_ibkr_portfolio():
 ib=ensure_connection()
 account_map={v.tag:v.value for v in ib.accountSummary()}
 net=_num(account_map.get('NetLiquidation')); cash=_num(account_map.get('TotalCashValue')); bp=_num(account_map.get('BuyingPower')); maint=_num(account_map.get('MaintMarginReq'))
 port={item.contract.conId:item for item in ib.portfolio()}
 positions=[]; total_mv=0; total_cb=0; total_unr=0
 for pos in ib.positions():
  c=pos.contract; item=port.get(c.conId); sec=getattr(c,'secType',''); symbol=getattr(c,'symbol','UNKNOWN') or getattr(c,'localSymbol','UNKNOWN')
  qty=_num(pos.position); avg=_num(pos.avgCost); price=_num(getattr(item,'marketPrice',0)) if item else 0; mv=_num(getattr(item,'marketValue',0)) if item else 0; unr=_num(getattr(item,'unrealizedPNL',0)) if item else 0; real=_num(getattr(item,'realizedPNL',0)) if item else 0
  cb=mv-unr if mv else qty*avg
  display=clean_option_symbol(c) if sec=='OPT' else symbol
  if sec=='OPT': avg=avg/_num(getattr(c,'multiplier',100),100)
  positions.append({"symbol":display,"underlying":symbol,"sec_type":sec,"name":display,"sector":"Options" if sec=='OPT' else sec or 'Stock',"qty":qty,"avg_price":round(avg,4),"last":round(price,4),"day_change_pct":0,"day_change":0,"market_value":round(mv,2),"cost_basis":round(cb,2),"unrealized":round(unr,2),"realized":round(real,2),"unrealized_pct":round((unr/cb*100),2) if cb else 0,"portfolio_pct":round((mv/net*100),2) if net else 0,"risk":90 if sec=='OPT' else 70,"brand":"#3B82F6","accent":"#60A5FA","logo":symbol[:2],"momentum_score":55,"news_score":50,"macro_sensitivity":75,"ai_view":"Live IBKR position"})
  total_mv+=mv; total_cb+=cb; total_unr+=unr
 return {"source":"IBKR_LIVE","as_of":datetime.now(timezone.utc).isoformat(),"total_value":round(net or total_mv,2),"cost_basis":round(total_cb,2),"daily_pnl":0,"daily_pnl_pct":0,"unrealized":round(total_unr,2),"unrealized_pct":round(total_unr/total_cb*100,2) if total_cb else 0,"cash":round(cash,2),"buying_power":round(bp,2),"margin_used":round(maint/net*100,2) if net else 0,"risk_mode":"LIVE IBKR","positions":positions,"exposures":{"rows":[]},"guardrails":[],"today_actions":[],"stress_tests":[],"journal":[]}

def _normalize_side(side):
 s=(side or '').upper()
 if s in('BOT','B','BUY'):return 'BUY'
 if s in('SLD','S','SELL','SS'):return 'SELL'
 return s or 'UNKNOWN'

def _parse_exec_time(t):
 t=(t or '').strip()
 m=re.match(r'(\d{8})\s+(\d{2}:\d{2}:\d{2})',t)
 if m:
  try:
   dt=datetime.strptime(f"{m.group(1)} {m.group(2)}","%Y%m%d %H:%M:%S")
   return dt.replace(tzinfo=timezone.utc).isoformat()
  except ValueError:pass
 return t

def get_ibkr_executions(symbol=None):
 from ib_insync import ExecutionFilter
 ib=ensure_connection()
 try:fills=ib.reqExecutions(ExecutionFilter())
 except Exception:fills=ib.fills()
 result=[]
 for fill in fills:
  try:
   c=fill.contract; ex=fill.execution; cr=fill.commissionReport
   sec=getattr(c,'secType','STK') or 'STK'
   sym=getattr(c,'symbol','') or ''
   display=clean_option_symbol(c) if sec=='OPT' else sym
   commission=_num(getattr(cr,'commission',None))
   realized=_num(getattr(cr,'realizedPNL',None))
   normalized={'execution_id':getattr(ex,'execId','') or '','symbol':display,'underlying':sym,'sec_type':sec,'side':_normalize_side(getattr(ex,'side','') or ''),'quantity':abs(_num(getattr(ex,'shares',0))),'price':_num(getattr(ex,'price',0)),'execution_time':_parse_exec_time(str(getattr(ex,'time','') or '')),'commission':commission if commission else None,'currency':getattr(cr,'currency','') or getattr(c,'currency','USD') or 'USD','account':getattr(ex,'acctNumber',None) or None,'order_id':str(getattr(ex,'orderId','')) or None,'realized_pnl':realized if realized else None}
   if symbol and sym.upper()!=symbol.upper() and display.upper()!=symbol.upper():continue
   if not normalized['execution_id']:continue
   result.append(normalized)
  except Exception:continue
 return result
