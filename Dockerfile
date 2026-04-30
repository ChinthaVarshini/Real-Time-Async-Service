FROM oven/bun:1 AS base
WORKDIR /app

# Copy root package files
COPY package.json bun.lockb* ./

# Copy all app packages
COPY apps/ ./apps/
COPY packages/ ./packages/

# Install dependencies
RUN bun install

# Install gateway dependencies
WORKDIR /app/apps/gateway
RUN bun install

# Go back to root
WORKDIR /app

# Expose port
EXPOSE 4004

# Start the gateway
CMD ["bun", "run", "--cwd", "apps/gateway", "start"]
