#!/bin/sh
# Stamp asset URLs so browsers fetch fresh CSS/JS after each deploy.
V=$(date +%Y%m%d%H%M)
FILES="index.html numbers.html bonds.html shared.js bonds-progress.js $(find bonds -name '*.js' 2>/dev/null)"
sed -i '' -E "s/(\.(css|js))\?v=[0-9]+/\1?v=$V/g" $FILES
echo "stamped $V"
