#!/bin/zsh
set -euo pipefail

project_dir="/Users/holtserver/Documents/Bedtime Companion"
runtime_dir="/Users/holtserver/Library/Application Support/Bedtime Companion"
server_dir="$runtime_dir/server"

cd "$project_dir"
[[ -f .next/standalone/server.js ]] || { print -u2 "Standalone build missing. Run npm run build first."; exit 1; }

mkdir -p "$server_dir/.next" "$server_dir/public" "$runtime_dir/data/media" "$runtime_dir/logs"
rsync -a .next/standalone/ "$server_dir/"
rsync -a .next/static/ "$server_dir/.next/static/"
rsync -a public/ "$server_dir/public/"
cp .env "$server_dir/.env"

if [[ ! -f "$runtime_dir/data/dev.db" ]]; then
  cp prisma/dev.db "$runtime_dir/data/dev.db"
fi

print "Deployed Bedtime Companion server to $server_dir"
