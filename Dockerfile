FROM node:20-bookworm

RUN npx -y playwright install --with-deps chromium

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

WORKDIR /app
COPY . .

WORKDIR /app/frontend
RUN npm run build

WORKDIR /app
ENV NODE_ENV=production
EXPOSE 3000

CMD ["npx", "tsx", "src/index.ts"]