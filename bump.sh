#!/bin/sh
# Stamp asset URLs so browsers fetch fresh CSS/JS after each deploy.
V=$(date +%Y%m%d%H%M)
sed -i '' -E "s/(\.(css|js))\?v=[0-9]+/\1?v=$V/g" index.html numbers.html shared.js
echo "stamped $V"
