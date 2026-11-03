#!/usr/bin/env bash
set -eu
cp -R "$(dirname "$0")/files/." .
mkdir -p repo && cd repo
git init -q -b main
git -c user.name=t -c user.email=t@t commit -q --allow-empty -m "init"
git checkout -q -b features/SHOP-12
git -c user.name=t -c user.email=t@t commit -q --allow-empty -m "feat: báo cáo kho (SHOP-12)"
git checkout -q main
git -c user.name=t -c user.email=t@t merge -q --no-ff features/SHOP-12 -m "Merge branch 'features/SHOP-12' into 'main'"
git checkout -q -b features/SHOP-15
git -c user.name=t -c user.email=t@t commit -q --allow-empty -m "feat: lộ trình (SHOP-15)"
