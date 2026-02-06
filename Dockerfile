FROM node:20-bookworm

RUN npx -y playwright install chromium --with-deps

ADD . .
RUN npm install

CMD ["npx", "tsx", "src/index.ts"]