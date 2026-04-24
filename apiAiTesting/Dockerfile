FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libxml2-dev \
        libxslt1-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=7860
EXPOSE 7860

CMD ["sh", "-c", "gunicorn -w 2 -b 0.0.0.0:${PORT:-7860} --timeout 600 app:app"]
