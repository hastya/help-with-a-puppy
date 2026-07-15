# ===== Help with a puppy — production image =====
FROM node:20-bookworm-slim

# better-sqlite3 needs a build toolchain for its native addon
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source
COPY . .

# Run copy-vendor again in case node_modules layer was cached before source copy
RUN node scripts/copy-vendor.js

# Persist the SQLite database outside the image
VOLUME ["/app/data"]
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3000)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server/index.js"]
