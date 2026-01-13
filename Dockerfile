# ============================================================================
# Multi-stage Dockerfile for ExtraHand Admin Service
# ============================================================================

# ---------- BASE STAGE ----------
FROM node:18-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -S nodejs -g 1001 && \
    adduser -S nodeuser -u 1001 -G nodejs

WORKDIR /app

# Set ownership early to avoid permission issues
RUN chown -R nodeuser:nodejs /app

# ---------- DEPENDENCIES STAGE ----------
FROM base AS deps

# Copy package files first for better layer caching
COPY --chown=nodeuser:nodejs package.json ./

# Copy package-lock.json if it exists (optional)
COPY --chown=nodeuser:nodejs package-lock.json* ./

# Switch to non-root user for npm install
USER nodeuser

# Install dependencies
# Try npm ci first (faster, more reliable), fall back to npm install if needed
RUN if [ -f package-lock.json ]; then \
      echo "📦 Using npm ci (package-lock.json found)"; \
      npm ci --no-audit --no-fund --ignore-scripts || ( \
        echo "⚠️  npm ci failed, falling back to npm install"; \
        npm install --no-audit --no-fund --ignore-scripts \
      ); \
    else \
      echo "📦 Using npm install (package-lock.json not found)"; \
      npm install --no-audit --no-fund --ignore-scripts; \
    fi

# ---------- BUILD STAGE ----------
FROM base AS build

# Copy node_modules from deps stage
COPY --from=deps --chown=nodeuser:nodejs /app/node_modules ./node_modules

# Copy package.json and tsconfig.json
COPY --chown=nodeuser:nodejs package.json ./
COPY --chown=nodeuser:nodejs tsconfig.json ./

# Copy source code
COPY --chown=nodeuser:nodejs src ./src

# Switch to non-root user
USER nodeuser

# Build TypeScript
RUN npm run build

# Verify build output exists
RUN test -d dist || (echo "❌ Build failed: dist directory not found" && exit 1)

# ---------- PRODUCTION STAGE ----------
FROM node:18-alpine AS production

# Install runtime dependencies only
RUN apk add --no-cache \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -S nodejs -g 1001 && \
    adduser -S nodeuser -u 1001 -G nodejs

WORKDIR /app

# Set environment variables
ENV NODE_ENV=production \
    PORT=4008 \
    NODE_OPTIONS="--max-old-space-size=512"

# Copy package.json for production dependencies
COPY --chown=nodeuser:nodejs package.json ./

# Copy node_modules from deps stage
COPY --from=deps --chown=nodeuser:nodejs /app/node_modules ./node_modules

# Remove dev dependencies to reduce image size
RUN npm prune --omit=dev --no-audit --no-fund

# Copy compiled output from build stage
COPY --from=build --chown=nodeuser:nodejs /app/dist ./dist

# Verify critical files exist
RUN test -f dist/server.js || (echo "❌ server.js not found in dist" && exit 1)

# Switch to non-root user
USER nodeuser

# Expose port
EXPOSE 4008

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:4008/api/v1/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/server.js"]
