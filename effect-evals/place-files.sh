#!/usr/bin/env bash
# Usage: place-files.sh <dest> [with-memory]
set -eu
src="$(cd "$(dirname "$0")/fixture" && pwd)"; dest="$1"
mkdir -p "$dest"
cp -R "$src/project" "$src/shop-api" "$src/shop-desktop" "$dest/"
[ "${2:-}" = with-memory ] && cp -R "$src/memory" "$dest/"
cd "$dest/project" && git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm init
