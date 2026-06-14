#!/usr/bin/env bash
set -euo pipefail

REPO="https://github.com/secretbuilds/loopy.git"
INSTALL_DIR="$HOME/.loopy-app"
BOLD="\033[1m"
DIM="\033[2m"
GREEN="\033[32m"
RED="\033[31m"
RESET="\033[0m"

info()  { echo -e "  ${DIM}$*${RESET}"; }
ok()    { echo -e "  ${GREEN}✓${RESET} $*"; }
fail()  { echo -e "  ${RED}✗${RESET} $*"; exit 1; }
header(){ echo -e "\n${BOLD}$*${RESET}"; }

header "loopy installer"

# ── prerequisites ────────────────────────────────────────────────────────────

header "checking prerequisites"

if ! command -v git &>/dev/null; then
  fail "git is required but not found"
fi
ok "git found"

if ! command -v node &>/dev/null; then
  fail "Node.js ≥ 20 is required — install from https://nodejs.org"
fi

NODE_VER=$(node -e "process.stdout.write(process.versions.node)")
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Node.js ≥ 20 required (found $NODE_VER)"
fi
ok "Node $NODE_VER"

if ! command -v npm &>/dev/null; then
  fail "npm is required but not found"
fi
ok "npm found"

# claude CLI is required at runtime but not at install time — warn only
if ! command -v claude &>/dev/null; then
  echo -e "  ${RED}!${RESET} claude CLI not found — install Claude Code before running loopy setup"
fi

# ── clone or update ───────────────────────────────────────────────────────────

header "installing loopy"

if [ -d "$INSTALL_DIR/.git" ]; then
  info "found existing install at $INSTALL_DIR — updating"
  git -C "$INSTALL_DIR" pull --ff-only --quiet
  ok "updated to latest"
else
  info "cloning to $INSTALL_DIR"
  git clone --quiet "$REPO" "$INSTALL_DIR"
  ok "cloned"
fi

# ── build ────────────────────────────────────────────────────────────────────

info "installing dependencies"
npm install --prefix "$INSTALL_DIR" --silent

info "building"
npm run build --prefix "$INSTALL_DIR" --silent
ok "build complete"

# ── link binary ───────────────────────────────────────────────────────────────

info "linking loopy binary"
npm link --prefix "$INSTALL_DIR" "$INSTALL_DIR" --silent 2>/dev/null || \
  npm link --prefix "$INSTALL_DIR" --silent
ok "loopy linked to $(command -v loopy 2>/dev/null || echo 'PATH — open a new shell if not found')"

# ── fable slash command ───────────────────────────────────────────────────────

header "installing /fable command"

mkdir -p "$HOME/.loopy/prompts"
cp "$INSTALL_DIR/CLAUDE-FABLE-5.md" "$HOME/.loopy/prompts/fable.md"
ok "fable prompt → ~/.loopy/prompts/fable.md"

mkdir -p "$HOME/.claude/commands"
cp "$INSTALL_DIR/commands/fable.md" "$HOME/.claude/commands/fable.md"
ok "/fable command → ~/.claude/commands/fable.md"

# ── done ──────────────────────────────────────────────────────────────────────

header "done"
echo ""
echo -e "  Run ${BOLD}loopy setup${RESET} to finish configuration."
echo -e "  Run ${BOLD}loopy${RESET} to open the dashboard."
echo -e "  Use ${BOLD}/fable <prompt>${RESET} in any Claude Code session to route through Fable 5."
echo ""
