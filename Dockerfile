# ---------- BASE ----------
  FROM node:18-alpine AS base

  RUN apk add --no-cache dumb-init curl
  
  WORKDIR /app
  
  # Create non-root user
  RUN addgroup -S nodejs -g 1001 \
   && adduser -S nodeuser -u 1001 -G nodejs
  
  # ---------- DEPENDENCIES ----------
  FROM base AS deps
  
  COPY package.json package-lock.json* ./
  
  # Install all deps (dev needed for TS build)
  RUN npm ci --no-audit --no-fund
  
  # ---------- BUILD ----------
  FROM base AS build
  
  COPY --from=deps /app/node_modules ./node_modules
  COPY tsconfig.json ./
  COPY src ./src
  
  RUN npm run build
  
  # ---------- PRODUCTION ----------
  FROM node:18-alpine AS production
  
  RUN apk add --no-cache dumb-init curl
  
  WORKDIR /app
  
  ENV NODE_ENV=production
  ENV PORT=4008
  
  # Copy only production deps
  COPY package.json ./
  COPY --from=deps /app/node_modules ./node_modules
  RUN npm prune --omit=dev
  
  # Copy compiled output
  COPY --from=build /app/dist ./dist
  
  # Permissions
  RUN chown -R nodeuser:nodejs /app
  USER nodeuser
  
  EXPOSE 4008
  
  HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:4008/api/v1/health || exit 1
  
  ENTRYPOINT ["dumb-init", "--"]
  CMD ["node", "dist/server.js"]
  