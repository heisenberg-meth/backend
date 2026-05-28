FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first for layer caching
COPY package*.json ./

RUN npm ci --omit=dev

# Copy application
COPY . .

# Generate Prisma client
RUN npx prisma generate

# ---------- Production Stage ----------

FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Copy built app
COPY --from=builder /app ./

# Security hardening
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

USER appuser

EXPOSE 5000

CMD ["node", "src/fastify-server.js"]