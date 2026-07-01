FROM python:3.11-slim

WORKDIR /app

# System deps for scikit-learn / numpy wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# feedparser depends on sgmllib3k which has a broken wheel; skip it and use a known-good subset
RUN pip install --no-cache-dir \
    fastapi "uvicorn[standard]" pydantic python-dotenv httpx python-multipart \
    "numpy>=1.24.0" "scikit-learn>=1.3.0" \
    && pip install --no-cache-dir feedparser || true \
    && pip install --no-cache-dir ib_insync || true

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
