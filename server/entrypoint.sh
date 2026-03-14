#!/bin/sh

# Setup git credentials from gh CLI config if available
GH_HOSTS="/root/.config/gh/hosts.yml"
if [ -f "$GH_HOSTS" ]; then
  TOKEN=$(grep 'oauth_token:' "$GH_HOSTS" | head -1 | awk '{print $2}')
  USER=$(grep -B1 'oauth_token:' "$GH_HOSTS" | head -1 | sed 's/://g' | awk '{$1=$1};1')
  if [ -n "$TOKEN" ] && [ -n "$USER" ]; then
    echo "https://${USER}:${TOKEN}@github.com" > /root/.git-credentials
    git config --global credential.helper store
  fi
fi

# Execute the original command
exec "$@"
