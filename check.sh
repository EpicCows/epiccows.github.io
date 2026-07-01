#!/bin/bash
# Quick syntax check - run before committing
# Usage: bash check.sh

set -e
echo "=== Syntax check ==="

# JS parse check (node --check)
for f in app-*.js; do
    printf "  %-25s " "$f"
    if node --check "$f" 2>&1; then
        echo "OK"
    else
        echo "FAIL"
        exit 1
    fi
done

# CSS brace check (simple count)
CSS_FILE="styles.css"
OPEN=$(grep -o '{' "$CSS_FILE" | wc -l)
CLOSE=$(grep -o '}' "$CSS_FILE" | wc -l)
printf "  %-25s " "$CSS_FILE"
if [ "$OPEN" -ne "$CLOSE" ]; then
    echo "FAIL - brace mismatch: $OPEN open, $CLOSE close"
    exit 1
else
    echo "OK ($OPEN braces balanced)"
fi

echo ""
echo "All checks passed."
