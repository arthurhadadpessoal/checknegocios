FROM node:20-slim

# Dependências do sistema: Chromium + libs para sharp (libvips nativo)
RUN apt-get update && apt-get install -y \
  chromium \
  fonts-liberation \
  fonts-noto \
  libvips-dev \
  --no-install-recommends && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# Sharp precisa da plataforma linux/x64 — forçamos o download do binário correto
RUN npm install --omit=dev

COPY server.js ./

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROMIUM_PATH=/usr/bin/chromium

EXPOSE 3000

CMD ["node", "server.js"]
