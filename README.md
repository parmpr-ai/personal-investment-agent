# Personal Investment Agent v5.6

## Run backend
```powershell
cd C:\invest-dashboard\backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

## Run frontend
```powershell
cd C:\invest-dashboard\frontend
npm config set registry https://registry.npmjs.org/
npm install
npm run build
npm run dev
```

Open: http://localhost:3000

## Integration Center
Go to **Integrations** inside the app. Each connection has:
- required fields
- inline documentation
- save button
- health check button
- status: Data OK / No data / Failed

## Seeking Alpha
Recommended mode: RSS + email alerts. Optional authenticated deep parsing scaffold accepts your own active subscriber session cookie/header. It does not store your password. Reliability depends on your subscription/session and site changes.
