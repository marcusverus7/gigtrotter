#!/bin/sh
# Xcode Cloud post-clone script.
# Installs Node + pnpm, then syncs Capacitor web assets into the iOS project.
set -e

# Install Node via nvm (Xcode Cloud has nvm pre-installed)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install 22
nvm use 22

# Enable corepack for pnpm
corepack enable
corepack prepare pnpm@latest --activate

# Go to the repo root (two levels up from ios/App/ci_scripts)
cd "$(dirname "$0")/../../.."

# Install JS dependencies
pnpm install --frozen-lockfile

# Sync Capacitor web content + plugins into the iOS project
npx cap sync ios
