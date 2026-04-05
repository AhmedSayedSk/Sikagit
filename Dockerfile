# ============================================
# Base stage — shared deps
# ============================================
FROM node:22-alpine AS base
RUN apk add --no-cache git openssh-client python3 make g++ ffmpeg && git config --global safe.directory '*'
WORKDIR /app

# Copy workspace root + all package.json files
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

RUN npm ci

# Copy all source
COPY shared/ shared/
COPY server/ server/
COPY client/ client/

# ============================================
# Dev server — ts-node-dev with hot reload
# ============================================
FROM base AS dev-server
WORKDIR /app
COPY server/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 3001
ENTRYPOINT ["/entrypoint.sh"]
CMD ["npm", "run", "dev", "-w", "server"]

# ============================================
# Dev client — Vite dev server with HMR
# ============================================
FROM base AS dev-client
WORKDIR /app
EXPOSE 5173
CMD ["npm", "run", "dev", "-w", "client"]

# ============================================
# Production build
# ============================================
FROM base AS build
RUN npm run build -w client

# ============================================
# Production image — serves built client + API
# ============================================
FROM node:22-alpine AS production
RUN apk add --no-cache git openssh-client python3 make g++ && git config --global safe.directory '*'
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

RUN npm ci --omit=dev

COPY shared/ shared/
COPY server/ server/
COPY --from=build /app/client/dist client/dist

# Build server
RUN npx -w server tsc

EXPOSE 3001
ENV NODE_ENV=production
CMD ["node", "server/dist/src/index.js"]
