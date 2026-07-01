#!/bin/bash
# Quick syntax check - run before committing
# Usage: bash check.sh

echo "=== TypeScript check ==="
if npx tsc --noEmit 2>&1; then
    echo "  OK:   All TypeScript compiles"
else
    echo "  FAIL: TypeScript errors found"
    exit 1
fi

echo ""
echo "=== CSS brace check ==="
CSS_FILE="src/styles.css"
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
echo "=== Build check ==="
if npx vite build 2>&1; then
    echo "  OK:   Vite build succeeds"
else
    echo "  FAIL: Build failed"
    exit 1
fi

echo ""
echo "All checks passed."
