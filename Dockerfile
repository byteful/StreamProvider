FROM node:20-bookworm

RUN npx -y playwright@1.57.0 install --with-deps

ADD . .
RUN npm install

CMD ["npx", "tsx", "src/index.ts"]