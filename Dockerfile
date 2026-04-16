FROM node:20-slim

# Dependências do Chromium
RUN apt-get update && apt-get install -y \
  chromium \
  fonts-liberation \
  fonts-noto \
  --no-install-recommends && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY server.js ./

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROMIUM_PATH=/usr/bin/chromium

EXPOSE 3000

CMD ["node", "server.js"]
