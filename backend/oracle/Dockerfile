FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
# tsx runs the TypeScript sources directly, and it is a dev dependency.
RUN npm ci && npm cache clean --force

COPY tsconfig.json pool.config.json scenarios.json ./
COPY src ./src
# The program IDL lives at the repo root; docker-compose.yml passes it in as the "idl" build context.
COPY --from=idl reliefpool.json /app/idl/reliefpool.json

RUN mkdir -p /app/data && chown node:node /app/data
USER node

ENV PORT=3001 \
    IDL_PATH=/app/idl/reliefpool.json \
    DATA_FILE=/app/data/events.json

EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "--import", "tsx", "src/index.ts"]
