FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM litestream/litestream:0.3.13 AS litestream

FROM node:26-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 CHARTSIDE_DB=/data/chartside.db NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=litestream /usr/local/bin/litestream /usr/local/bin/litestream
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/src ./src
COPY --from=build /app/codesets ./codesets
COPY package.json next.config.ts tsconfig.json server.ts ./
COPY deploy/litestream.yml /etc/litestream.yml
COPY deploy/start.sh ./start.sh
EXPOSE 8080
CMD ["./start.sh"]
