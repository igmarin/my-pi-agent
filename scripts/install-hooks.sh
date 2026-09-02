#!/bin/sh
# Install rs-guard git hooks for this repository
set -e

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

if [ ! -d .githooks ]; then
    mkdir -p .githooks
fi

if [ ! -f .githooks/pre-commit ]; then
    echo "No .githooks/pre-commit found. Nothing to install."
    exit 1
fi

chmod +x .githooks/pre-commit
git config core.hooksPath .githooks

echo "rs-guard pre-commit hook installed."
echo "core.hooksPath set to: .githooks"
echo ""
echo "Next steps:"
echo "  1. Ensure rs-guard is installed (cargo install rs-guard)."
echo "  2. Set your API key, e.g. DEEPSEEK_API_KEY, in your shell or ~/.config/rs-guard/env."
echo "  3. Test with a commit: git commit -m 'test: rs-guard pre-commit'"
echo "  4. To bypass: git commit --no-verify"
