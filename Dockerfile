FROM node:20-bookworm

WORKDIR /app

COPY package*.json ./
RUN npm install
RUN npx playwright install chromium --with-deps

COPY . .

CMD ["npx", "tsx", "src/index.ts"]