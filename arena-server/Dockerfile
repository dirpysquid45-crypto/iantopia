FROM node:20-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy package files
COPY package*.json ./

# Install dependencies. npm install (not ci) — no package-lock.json is
# committed for this package, and ci hard-requires one.
RUN npm install --omit=dev

# Copy application code
COPY . .

# Change ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

EXPOSE 4001

# Node 20 has no global WebSocket -- must use the ws package explicitly,
# not the browser-style `new WebSocket(...)` this previously (and always,
# since the image was first built) used, which threw ReferenceError on
# every single check and left the container permanently "unhealthy".
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "const WS = require('ws'); const ws = new WS('ws://localhost:4001'); ws.on('open', () => { ws.close(); process.exit(0); }); ws.on('error', () => process.exit(1)); setTimeout(() => process.exit(1), 5000);"

CMD ["node", "server.js"]
