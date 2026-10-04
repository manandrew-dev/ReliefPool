FROM node:22-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite bakes these into the bundle at build time (see .env.example).
# The browser calls the oracle, so VITE_ORACLE_URL must be reachable from the host, not the compose network.
ARG VITE_RPC_URL=https://api.devnet.solana.com
ARG VITE_ORACLE_URL=http://localhost:3001/api
ARG VITE_ORACLE_MOCK=false
ARG VITE_PROGRAM_ID=
ENV VITE_RPC_URL=$VITE_RPC_URL \
    VITE_ORACLE_URL=$VITE_ORACLE_URL \
    VITE_ORACLE_MOCK=$VITE_ORACLE_MOCK \
    VITE_PROGRAM_ID=$VITE_PROGRAM_ID
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
