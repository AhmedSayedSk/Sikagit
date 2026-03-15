#!/bin/sh

# Setup git credential store
git config --global credential.helper store
touch /root/.git-credentials

# GitHub credentials from gh CLI config
GH_HOSTS="/root/.config/gh/hosts.yml"
if [ -f "$GH_HOSTS" ]; then
  TOKEN=$(grep 'oauth_token:' "$GH_HOSTS" | head -1 | awk '{print $2}')
  USER=$(grep -B1 'oauth_token:' "$GH_HOSTS" | head -1 | sed 's/://g' | awk '{$1=$1};1')
  if [ -n "$TOKEN" ] && [ -n "$USER" ]; then
    echo "https://${USER}:${TOKEN}@github.com" >> /root/.git-credentials
  fi
fi

# Azure DevOps credentials from env var (AZURE_DEVOPS_PAT)
# Usage: set AZURE_DEVOPS_PAT=your-pat in docker-compose.yml or .env
if [ -n "$AZURE_DEVOPS_PAT" ]; then
  echo "https://pat:${AZURE_DEVOPS_PAT}@dev.azure.com" >> /root/.git-credentials
  echo "https://GoldenSands:${AZURE_DEVOPS_PAT}@dev.azure.com" >> /root/.git-credentials
fi

# Append any extra credentials from mounted file
if [ -f "/root/.extra-git-credentials" ]; then
  cat /root/.extra-git-credentials >> /root/.git-credentials
fi

# Execute the original command
exec "$@"
