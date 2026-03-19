FROM node:20-bookworm

WORKDIR /app

COPY package*.json ./
RUN npm install
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation && rm -rf /var/lib/apt/lists/*

COPY --chown=node:node . .
ENV BROWSER_EXECUTABLE_PATH=/usr/bin/chromium
USER node

CMD ["npx", "tsx", "src/index.ts"]