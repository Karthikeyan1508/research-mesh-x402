FROM node:20-alpine
WORKDIR /app

# Copy root workspace configurations and package locks
COPY package.json package-lock.json ./

# Copy each package manifest to ensure proper dependency installation for workspaces
COPY orchestrator/package.json ./orchestrator/
COPY registry/package.json ./registry/
COPY workers/provenance-agent/package.json ./workers/provenance-agent/
COPY workers/trust-synthesis-agent/package.json ./workers/trust-synthesis-agent/
COPY workers/verification-agent/package.json ./workers/verification-agent/
COPY workers/translation-agent/package.json ./workers/translation-agent/

# Install all workspace dependencies
RUN npm ci

# Copy all source files
COPY . .
