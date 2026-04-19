FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY public ./public
COPY src ./src
COPY server ./server
COPY .env.example ./.env.example

RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=build /app/build ./build
COPY --from=build /app/server ./server
COPY package.json package-lock.json ./
COPY .env.example ./.env.example

RUN mkdir -p /app/server/data

EXPOSE 4000

VOLUME ["/app/server/data"]

CMD ["node", "server/index.js"]

