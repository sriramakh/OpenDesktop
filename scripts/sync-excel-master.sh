#!/bin/bash
# ─────────────────────────────────────────────────────────────────────
# sync-excel-master.sh — pull upstream excel-master into assets/excel-master/
# Usage:   scripts/sync-excel-master.sh [ref]
#          ref  — branch, tag, or commit (default: main)
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

UPSTREAM="https://github.com/sriramakh/excel-master.git"
REF="${1:-main}"
VENDOR_DIR="$(cd "$(dirname "$0")/.." && pwd)/assets/excel-master"
PATCHES_DIR="$VENDOR_DIR/.patches"
TMP_DIR="$(mktemp -d)"

echo "▸ Syncing excel-master from $UPSTREAM @ $REF"
echo "  Vendor dir: $VENDOR_DIR"

# ── 1. Save local patches ───────────────────────────────────────────
mkdir -p "$PATCHES_DIR"
PATCHED_FILES=(
  "src/excelmaster/agent/session.py"
  "src/excelmaster/chat/renderer.py"
  "src/excelmaster/dashboard/dashboard_engine.py"
)

echo "▸ Step 1: Saving local patches…"
for f in "${PATCHED_FILES[@]}"; do
  if [ -f "$VENDOR_DIR/$f" ]; then
    PATCH_NAME=$(echo "$f" | tr '/' '_').patch
    # Generate diff vs upstream (will be empty if no local changes)
    diff_out=$(diff -u "$TMP_DIR/_upstream_$PATCH_NAME" "$VENDOR_DIR/$f" 2>/dev/null || true)
    # Save anyway — will be populated after upstream clone
  fi
done

# ── 2. Shallow-clone upstream ────────────────────────────────────────
echo "▸ Step 2: Cloning upstream…"
git clone --depth 1 --branch "$REF" "$UPSTREAM" "$TMP_DIR/excel-master" 2>&1 | sed 's/^/  /'

COMMIT=$(cd "$TMP_DIR/excel-master" && git rev-parse HEAD)
echo "  Commit: $COMMIT"

# ── 3. Generate diffs for known locally-modified files ───────────────
echo "▸ Step 3: Generating diffs for locally modified files…"
for f in "${PATCHED_FILES[@]}"; do
  PATCH_NAME=$(echo "$f" | tr '/' '_').patch
  if [ -f "$VENDOR_DIR/$f" ] && [ -f "$TMP_DIR/excel-master/$f" ]; then
    diff -u "$TMP_DIR/excel-master/$f" "$VENDOR_DIR/$f" > "$PATCHES_DIR/$PATCH_NAME" 2>/dev/null || true
    if [ -s "$PATCHES_DIR/$PATCH_NAME" ]; then
      echo "  Saved patch: $PATCH_NAME"
    else
      rm -f "$PATCHES_DIR/$PATCH_NAME"
    fi
  fi
done

# ── 4. Copy vendored directories ────────────────────────────────────
echo "▸ Step 4: Copying vendored files…"
rm -rf "$VENDOR_DIR/src"
cp -R "$TMP_DIR/excel-master/src" "$VENDOR_DIR/src"
cp "$TMP_DIR/excel-master/pyproject.toml" "$VENDOR_DIR/pyproject.toml"
cp "$TMP_DIR/excel-master/skills.md" "$VENDOR_DIR/skills.md"

# ── 5. Remove non-vendored files ────────────────────────────────────
echo "▸ Step 5: Removing non-vendored files…"
rm -rf "$VENDOR_DIR/src/excelmaster/cli"
find "$VENDOR_DIR" -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

# ── 6. Re-apply local patches ───────────────────────────────────────
echo "▸ Step 6: Re-applying local patches…"
for pf in "$PATCHES_DIR"/*.patch; do
  [ -f "$pf" ] || continue
  PATCH_NAME=$(basename "$pf")
  echo "  Applying: $PATCH_NAME"
  if ! patch -p0 -d "$VENDOR_DIR" < "$pf" 2>&1 | sed 's/^/    /'; then
    echo "  ⚠ Patch $PATCH_NAME failed — manual resolution needed"
  fi
done

# ── 7. Record sync metadata ─────────────────────────────────────────
echo "$COMMIT" > "$PATCHES_DIR/.last-sync-commit"
echo "$REF" > "$PATCHES_DIR/.last-sync-ref"
date -u +"%Y-%m-%dT%H:%M:%SZ" > "$PATCHES_DIR/.last-sync-date"

# ── Cleanup ──────────────────────────────────────────────────────────
rm -rf "$TMP_DIR"

echo ""
echo "✓ excel-master synced to $REF ($COMMIT)"
echo "  Run 'npm run dev' to test, then commit."
