# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Runtime stage
FROM node:20-alpine

WORKDIR /app

RUN adduser -D -g '' appuser

COPY --from=builder /app/.output ./.output

RUN chown -R appuser:appuser /app

USER appuser

ENV NODE_ENV=production
ENV NUXT_PUBLIC_API_BASE=http://localhost:8080/api/v1

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

CMD ["node", ".output/server/index.mjs"]
