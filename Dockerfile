FROM node:22-alpine AS builder

WORKDIR /app

# Copy root packages first (contracts dependency)
COPY packages/contracts/package.json /app/packages/contracts/
COPY packages/contracts/src /app/packages/contracts/src/
COPY packages/contracts/ /app/packages/contracts/

# Copy backend package.json and install
COPY backend/package*.json /app/backend/
WORKDIR /app/backend
RUN npm ci --silent

# Copy Prisma schema
COPY backend/prisma /app/backend/prisma
RUN npx prisma generate

# Copy backend source
COPY backend/src /app/backend/src

FROM node:22-alpine AS production

WORKDIR /app

# Copy node_modules and contracts
COPY --from=builder /app /app

WORKDIR /app/backend

EXPOSE 5000

ENV NODE_ENV=production

CMD ["node", "src/fastify-server.js"]
