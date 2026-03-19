FROM node:20-bookworm

WORKDIR /app

COPY package*.json ./
RUN npm install
RUN npx patchright install chrome --with-deps

COPY . .

CMD ["npx", "tsx", "src/index.ts"]