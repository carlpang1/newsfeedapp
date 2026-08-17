# ==========================================
# STAGE 1: Builder
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install all dependencies (including devDependencies)
RUN npm install

# Copy application source files
COPY . .

# Build Vite client and bundle the Express server with esbuild
RUN npm run build

# ==========================================
# STAGE 2: Runner (Slim Production Image)
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/news.db

# Copy package descriptors for installing production dependencies
COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Copy built artifacts from the builder stage
COPY --from=builder /app/dist ./dist

# Create folder for persistent SQLite database
RUN mkdir -p /app/data && chmod 777 /app/data

# Expose server port
EXPOSE 3000

# Start server
CMD ["npm", "run", "start"]
