#!/usr/bin/env bash
#
# sync-ppt-master.sh — Pull latest ppt-master and merge into vendored assets.
#
# Usage:
#   ./scripts/sync-ppt-master.sh              # sync from main branch
#   ./scripts/sync-ppt-master.sh v2.1.0       # sync from a specific tag/branch
#
# What it does:
#   1. Shallow-clones the upstream repo to a temp directory
#   2. Saves local patches (diff between current vendored files and last sync)
#   3. Copies only the directories we need (src/, data/icons/, pyproject.toml)
#   4. Removes files we don't vendor (cli/, web/, chat/, mcp_server.py, __main__.py)
#   5. Re-applies local patches
#   6. Shows a summary of changes for review
#
# Local patches are stored in assets/ppt-master/.patches/ so they survive git operations.
# If a patch fails to apply cleanly, you'll need to resolve manually.
#
set -euo pipefail

REPO_URL="https://github.com/sriramakh/ppt-master.git"
REF="${1:-main}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR_DIR="$PROJECT_ROOT/assets/ppt-master"
PATCHES_DIR="$VENDOR_DIR/.patches"
TMP_DIR=$(mktemp -d)

# Cleanup on exit
trap 'rm -rf "$TMP_DIR"' EXIT

echo "=== PPT Master Sync ==="
echo "  Upstream: $REPO_URL @ $REF"
echo "  Vendor:   $VENDOR_DIR"
echo ""

# ── Step 1: Generate local patches before overwriting ─────────────────
echo "[1/6] Saving local patches..."
mkdir -p "$PATCHES_DIR"

# If we have a record of the last synced commit, generate a diff
if [ -f "$PATCHES_DIR/.last-sync-commit" ]; then
    LAST_COMMIT=$(cat "$PATCHES_DIR/.last-sync-commit")
    echo "  Last synced commit: $LAST_COMMIT"
else
    echo "  No previous sync recorded. Will save current local mods as patches."
fi

# Save any locally modified files as individual patches (relative to vendor dir)
# We track known local modifications
PATCHED_FILES=(
    "src/pptmaster/content/builder_content_gen.py"
    "src/pptmaster/builder/ai_builder.py"
    "src/pptmaster/chat/session.py"
    "src/pptmaster/chat/__init__.py"
)

for f in "${PATCHED_FILES[@]}"; do
    FULL="$VENDOR_DIR/$f"
    if [ -f "$FULL" ]; then
        PATCH_NAME=$(echo "$f" | tr '/' '_').patch
        # We'll generate the diff after cloning upstream
    fi
done

# ── Step 2: Shallow clone upstream (sparse — skip large blobs for speed) ──
echo "[2/6] Cloning upstream ($REF)..."
git clone --depth 1 --branch "$REF" "$REPO_URL" "$TMP_DIR/ppt-master" 2>&1 | sed 's/^/  /'
UPSTREAM_COMMIT=$(cd "$TMP_DIR/ppt-master" && git rev-parse HEAD)
echo "  Upstream commit: ${UPSTREAM_COMMIT:0:12}"

# ── Step 3: Generate diffs of local modifications ─────────────────────
echo "[3/6] Detecting local modifications..."
PATCH_COUNT=0
for f in "${PATCHED_FILES[@]}"; do
    LOCAL="$VENDOR_DIR/$f"
    UPSTREAM="$TMP_DIR/ppt-master/$f"
    PATCH_FILE="$PATCHES_DIR/$(echo "$f" | tr '/' '_').patch"

    if [ -f "$LOCAL" ] && [ -f "$UPSTREAM" ]; then
        if ! diff -u "$UPSTREAM" "$LOCAL" > "$PATCH_FILE" 2>/dev/null; then
            LINES=$(wc -l < "$PATCH_FILE" | tr -d ' ')
            echo "  MODIFIED: $f ($LINES lines diff) → saved to .patches/"
            PATCH_COUNT=$((PATCH_COUNT + 1))
        else
            rm -f "$PATCH_FILE"
            echo "  unchanged: $f (no local mods)"
        fi
    fi
done
echo "  $PATCH_COUNT local patch(es) saved."

# ── Step 4: Copy vendored directories ─────────────────────────────────
echo "[4/6] Copying upstream files..."

# Copy src/pptmaster/
echo "  src/pptmaster/ ..."
rm -rf "$VENDOR_DIR/src"
cp -R "$TMP_DIR/ppt-master/src" "$VENDOR_DIR/src"

# Copy data/icons/ (only if it exists and has changes)
if [ -d "$TMP_DIR/ppt-master/data/icons" ]; then
    echo "  data/icons/ ..."
    rm -rf "$VENDOR_DIR/data/icons"
    mkdir -p "$VENDOR_DIR/data"
    cp -R "$TMP_DIR/ppt-master/data/icons" "$VENDOR_DIR/data/icons"
fi

# Copy pyproject.toml for reference
cp "$TMP_DIR/ppt-master/pyproject.toml" "$VENDOR_DIR/pyproject.toml" 2>/dev/null || true

# ── Step 5: Remove files we don't vendor ──────────────────────────────
echo "[5/6] Removing non-vendored files..."
REMOVE_DIRS=(
    "src/pptmaster/cli"
    "src/pptmaster/web"
    "src/pptmaster/chat/loop.py"
    "src/pptmaster/chat/tools.py"
    "src/pptmaster/mcp_server.py"
    "src/pptmaster/__main__.py"
)
for d in "${REMOVE_DIRS[@]}"; do
    TARGET="$VENDOR_DIR/$d"
    if [ -e "$TARGET" ]; then
        rm -rf "$TARGET"
        echo "  removed: $d"
    fi
done

# Fix chat/__init__.py — upstream imports run_chat_loop from loop.py which we don't vendor
CHAT_INIT="$VENDOR_DIR/src/pptmaster/chat/__init__.py"
if [ -f "$CHAT_INIT" ]; then
    cat > "$CHAT_INIT" << 'PYEOF'
"""Conversational presentation editing."""

from pptmaster.chat.session import PresentationSession

__all__ = ["PresentationSession"]
PYEOF
    echo "  fixed: chat/__init__.py (removed loop.py import)"
fi

# ── Step 6: Re-apply local patches ───────────────────────────────────
echo "[6/6] Re-applying local patches..."
APPLIED=0
FAILED=0
for patch in "$PATCHES_DIR"/*.patch; do
    [ -f "$patch" ] || continue
    BASENAME=$(basename "$patch" .patch)
    # Convert filename back to path (underscores → slashes)
    # We use the patch file's content which has the correct paths
    echo -n "  Applying $(basename "$patch")... "
    if patch -p0 -d "$VENDOR_DIR" --forward --no-backup-if-mismatch < "$patch" > /dev/null 2>&1; then
        echo "OK"
        APPLIED=$((APPLIED + 1))
    else
        echo "FAILED — needs manual resolution"
        echo "    Patch file: $patch"
        echo "    Run: cd $VENDOR_DIR && patch -p0 < $patch"
        FAILED=$((FAILED + 1))
    fi
done

# Record the synced commit
echo "$UPSTREAM_COMMIT" > "$PATCHES_DIR/.last-sync-commit"
echo "$REF" > "$PATCHES_DIR/.last-sync-ref"
date -u '+%Y-%m-%dT%H:%M:%SZ' > "$PATCHES_DIR/.last-sync-date"

# ── Summary ───────────────────────────────────────────────────────────
echo ""
echo "=== Sync Complete ==="
echo "  Upstream: $REPO_URL @ $REF"
echo "  Commit:   ${UPSTREAM_COMMIT:0:12}"
echo "  Patches:  $APPLIED applied, $FAILED failed"
echo ""

if [ "$FAILED" -gt 0 ]; then
    echo "⚠  Some patches failed. Check the files above and resolve manually."
    echo "   After fixing, run:  npm run dev  to test."
    exit 1
fi

echo "Next steps:"
echo "  1. Review changes:  git diff assets/ppt-master/"
echo "  2. Test:            npm run dev → create a presentation"
echo "  3. Commit:          git add assets/ppt-master/ && git commit -m 'chore: sync ppt-master upstream'"
