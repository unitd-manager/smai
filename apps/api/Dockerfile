FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxkbcommon0 \
    libxrandr2 \
    libxrender1 \
    libxshmfence1 \
    libxss1 \
    libxtst6 \
    python3 \
    python3-venv \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

COPY . .
RUN DATABASE_URL="mysql://placeholder:placeholder@127.0.0.1:3306/placeholder" \
  npm run prisma:generate --workspace=@united-technologies/api \
  && npm run build --workspace=@united-technologies/api

RUN python3 -m venv /opt/piper \
  && /opt/piper/bin/pip install --no-cache-dir piper-tts \
  && mkdir -p /opt/piper/voices \
  && cd /opt/piper/voices \
  && /opt/piper/bin/python -m piper.download_voices en_US-libritts_r-medium

ENV NODE_ENV=production \
  API_PORT=10000 \
  PIPER_EXECUTABLE=/opt/piper/bin/piper \
  PIPER_MULTISPEAKER_VOICE_MODEL=/opt/piper/voices/en_US-libritts_r-medium.onnx

EXPOSE 10000

CMD ["sh", "-c", "npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && npm run start --workspace=@united-technologies/api"]
