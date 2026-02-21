FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /usr/src/app

# Copy package files for production install
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built artifacts from builder stage (dist folder contains the compiled js)
COPY --from=builder /usr/src/app/dist ./dist
# We might need other folders like processes if they are not compiled into dist/root properly or if we run them via ts-node in dev (but this is prod dockerfile)
# Ideally 'npm run build' compiles everything to dist.
# Checking package.json 'build' script: "tsc -p tsconfig.build.json"
# Assuming tsconfig.build.json includes 'src' and 'processes'

COPY --from=builder /usr/src/app/processes ./processes
# Check if scripts are needed. Migration scripts are in scripts/
COPY --from=builder /usr/src/app/scripts ./scripts
# Config might be needed
COPY --from=builder /usr/src/app/config ./config

# Expose the API port
EXPOSE 3000

# Default command (can be overridden in docker-compose)
CMD ["npm", "run", "start:api"]
