# Use Node.js 18 LTS Alpine image for smaller size
FROM node:18-alpine AS base

# Install security updates and necessary packages
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init curl && \
    rm -rf /var/cache/apk/*

# Create app directory with proper permissions
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001

# Dependencies stage
FROM base AS dependencies

# Accept build cache buster argument
ARG CACHE_BUST=no-cache

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies only (aggressive cache busting)
# Using timestamp to ensure fresh builds
RUN BUILD_TIMESTAMP=$(date -u +%Y%m%d%H%M%S) && \
    npm cache clean --force && \
    if [ -f package-lock.json ]; then \
      npm ci --omit=dev --prefer-offline=false && npm cache clean --force; \
    else \
      npm install --omit=dev --prefer-offline=false && npm cache clean --force; \
    fi && \
    echo "Cache bust: ${CACHE_BUST}" > /tmp/deps-cache-bust.txt && \
    echo "Build timestamp: ${BUILD_TIMESTAMP}" >> /tmp/deps-cache-bust.txt && \
    rm -rf /root/.npm /tmp/npm-* && \
    cat /tmp/deps-cache-bust.txt

# Build stage
FROM base AS build

# Accept build cache buster argument
ARG CACHE_BUST=no-cache

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies (including dev dependencies for TypeScript) - aggressive cache busting
# Using timestamp to ensure fresh builds
RUN BUILD_TIMESTAMP=$(date -u +%Y%m%d%H%M%S) && \
    npm cache clean --force && \
    if [ -f package-lock.json ]; then \
      npm ci --prefer-offline=false && npm cache clean --force; \
    else \
      npm install --prefer-offline=false && npm cache clean --force; \
    fi && \
    echo "Cache bust: ${CACHE_BUST}" > /tmp/build-cache-bust.txt && \
    echo "Build timestamp: ${BUILD_TIMESTAMP}" >> /tmp/build-cache-bust.txt && \
    rm -rf /root/.npm /tmp/npm-* && \
    cat /tmp/build-cache-bust.txt

# Copy TypeScript configuration
COPY tsconfig.json ./

# Copy source code
COPY src ./src

# ✨ CRITICAL: Add cache buster to force fresh code copy and build
ARG CACHE_BUST=no-cache
RUN BUILD_TIMESTAMP=$(date -u +%Y%m%d%H%M%S) && \
    echo "Cache bust: ${CACHE_BUST}" > /tmp/cache-bust.txt && \
    echo "Build timestamp: ${BUILD_TIMESTAMP}" >> /tmp/cache-bust.txt && \
    echo "Source files count: $(find src -type f | wc -l)" >> /tmp/cache-bust.txt && \
    cat /tmp/cache-bust.txt

# Build TypeScript to JavaScript
RUN BUILD_TIMESTAMP=$(date -u +%Y%m%d%H%M%S) && \
    npm run build && \
    echo "Build completed at: ${BUILD_TIMESTAMP}" >> /tmp/cache-bust.txt && \
    cat /tmp/cache-bust.txt

# Remove dev dependencies after build
RUN npm prune --production

# Production stage
FROM base AS production

# Set default environment variables (can be overridden at runtime)
# Sensitive variables should be provided via CapRover envVars, not build args
ENV NODE_ENV=production
ENV PORT=4008
ENV LOG_LEVEL=info

# Note: The following environment variables should be set at runtime via CapRover:
# - MONGODB_URI
# - MONGO_DB
# - FIREBASE_PROJECT_ID
# - FIREBASE_PRIVATE_KEY
# - FIREBASE_CLIENT_EMAIL
# - SERVICE_AUTH_TOKEN
# - USER_SERVICE_URL
# - VERIFICATION_SERVICE_URL (optional)

# Copy production dependencies from dependencies stage
COPY --from=dependencies --chown=nodeuser:nodejs /app/node_modules ./node_modules

# Copy compiled JavaScript from build stage
COPY --from=build --chown=nodeuser:nodejs /app/dist ./dist
COPY --from=build --chown=nodeuser:nodejs /app/package.json ./

# Copy serviceAccountKey.json if it exists (for Firebase Admin SDK)
# Note: In production, this should ideally be provided via environment variables
COPY --chown=nodeuser:nodejs serviceAccountKey.json* ./

# Create logs directory with proper permissions
RUN mkdir -p logs && chown -R nodeuser:nodejs logs

# Remove unnecessary files for production
RUN rm -rf \
    .git \
    .gitignore \
    .env.example \
    *.md \
    .dockerignore \
    Dockerfile \
    tsconfig.json \
    src \
    node_modules/typescript \
    node_modules/@types \
    test-*.js

# Switch to non-root user
USER nodeuser

# Expose port
EXPOSE 4008

# ✅ HEALTH CHECK - Check localhost inside container
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:4008/api/v1/health || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application (run compiled JavaScript)
CMD ["node", "dist/server.js"]
