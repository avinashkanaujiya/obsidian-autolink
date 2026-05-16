#!/usr/bin/env bash
#
# install.sh — Build and install the Autolink plugin into an Obsidian vault
#
# Usage:
#   ./install.sh                        Build and install once
#   ./install.sh --watch                Watch mode: rebuild + reinstall on every change
#   ./install.sh --vault /path/to/vault Override vault path
#   ./install.sh --help                 Show this help
#

set -euo pipefail

# ── Paths ────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_SRC="$SCRIPT_DIR"
PLUGIN_ID="autolink"

# Default vault location — override with --vault
DEFAULT_VAULT="$HOME/obsidian/notes"

INSTALL_FILES=(main.js manifest.json styles.css)

# ── ANSI colors ──────────────────────────────────────────────────────────────

BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'
RED='\033[1;31m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
CYAN='\033[1;36m'
WHITE='\033[1;37m'

TERM_WIDTH=${COLUMNS:-80}

# ── Helpers ──────────────────────────────────────────────────────────────────

rule() {
    local char="$1" color="$2"
    printf "${color}%*s${RESET}\n" "$TERM_WIDTH" "" | sed "s/ /${char}/g"
}

print_header() {
    rule "─" "$BLUE"
    printf "${CYAN}${BOLD}  %s${RESET}\n" "$1"
    rule "─" "$BLUE"
}

print_step()    { printf "${WHITE}  → %s${RESET}\n" "$1"; }
print_success() { printf "${GREEN}  ✔ %s${RESET}\n" "$1"; }
print_warn()    { printf "${YELLOW}  ⚠ %s${RESET}\n" "$1"; }
print_error()   { printf "${RED}  ✖ %s${RESET}\n" "$1" >&2; }

print_file() {
    local fname="$1" dst_dir="$2"
    local size
    size="$(du -sh "$PLUGIN_SRC/$fname" 2>/dev/null | cut -f1)"
    printf "${DIM}    %-20s →  %s  (%s)${RESET}\n" "$fname" "$dst_dir/$fname" "$size"
}

# ── Argument parsing ─────────────────────────────────────────────────────────

usage() {
    cat <<EOF
Usage: ${0##*/} [options]

Options:
  -w, --watch            Watch mode: rebuild and reinstall on every source change
  -v, --vault <path>     Override vault path (default: $DEFAULT_VAULT)
  -h, --help             Show this help message

EOF
}

WATCH=0
VAULT="$DEFAULT_VAULT"

while [[ $# -gt 0 ]]; do
    case "$1" in
        -w|--watch)        WATCH=1; shift ;;
        -v|--vault)        VAULT="${2:?--vault requires a path}"; shift 2 ;;
        -h|--help)         usage; exit 0 ;;
        *) print_error "Unknown option: $1"; usage; exit 1 ;;
    esac
done

INSTALL_DIR="$VAULT/.obsidian/plugins/$PLUGIN_ID"

# ── Validation ───────────────────────────────────────────────────────────────

validate_env() {
    if [[ ! -f "$PLUGIN_SRC/package.json" ]]; then
        print_error "package.json not found — is $PLUGIN_SRC the repo root?"
        exit 1
    fi

    if [[ ! -d "$VAULT/.obsidian" ]]; then
        print_error "Vault not found: $VAULT"
        print_error "Pass a different path with: --vault /path/to/vault"
        exit 1
    fi

    if ! command -v npm &>/dev/null; then
        print_error "npm not found in PATH"
        exit 1
    fi
}

# ── Build ────────────────────────────────────────────────────────────────────

ensure_deps() {
    if [[ ! -d "$PLUGIN_SRC/node_modules" ]] || \
       [[ "$PLUGIN_SRC/package-lock.json" -nt "$PLUGIN_SRC/node_modules/.package-lock.json" ]]; then
        print_step "Installing dependencies..."
        npm --prefix "$PLUGIN_SRC" install --silent
        print_success "Dependencies installed"
    fi
}

build_plugin() {
    print_step "Building plugin..."

    local build_failed=0
    npm --prefix "$PLUGIN_SRC" run build 2>&1 \
        | while IFS= read -r line; do
            printf "${DIM}    %s${RESET}\n" "$line"
          done \
        || build_failed=1

    # pipefail surfaces npm's exit code through the pipe
    if [[ $build_failed -ne 0 ]] || [[ ! -f "$PLUGIN_SRC/main.js" ]]; then
        print_error "Build failed — check output above"
        exit 1
    fi

    print_success "Build succeeded"
}

# ── Install ──────────────────────────────────────────────────────────────────

install_plugin() {
    print_step "Installing to vault..."
    mkdir -p "$INSTALL_DIR"

    local installed=0
    local skipped=0

    for fname in "${INSTALL_FILES[@]}"; do
        if [[ ! -f "$PLUGIN_SRC/$fname" ]]; then
            print_warn "Skipping $fname (not found in build output)"
            skipped=$((skipped + 1))
            continue
        fi
        cp "$PLUGIN_SRC/$fname" "$INSTALL_DIR/$fname"
        print_file "$fname" "$INSTALL_DIR"
        installed=$((installed + 1))
    done

    print_success "$installed file(s) installed → $INSTALL_DIR"
    if [[ $skipped -gt 0 ]]; then
        print_warn "$skipped file(s) skipped"
    fi
}

# ── Reload hint ──────────────────────────────────────────────────────────────

print_reload_hint() {
    printf "\n"
    rule "─" "$DIM"
    printf "${DIM}  To activate in Obsidian:${RESET}\n"
    printf "${DIM}    Settings → Community plugins → enable \"Autolink\"${RESET}\n"
    printf "${DIM}    (already enabled? disable → re-enable, or use Hot Reload plugin)${RESET}\n"
    rule "─" "$DIM"
    printf "\n"
}

# ── Watch mode ───────────────────────────────────────────────────────────────

watch_plugin() {
    print_step "Watch mode active — Ctrl+C to stop"
    printf "\n"

    # esbuild (via `npm run dev`) prints "watch build succeeded" after each rebuild
    npm --prefix "$PLUGIN_SRC" run dev 2>&1 \
        | while IFS= read -r line; do
            printf "${DIM}    %s${RESET}\n" "$line"
            if [[ "$line" == *"watch build succeeded"* ]]; then
                printf "\n"
                print_step "Rebuild detected — reinstalling..."
                for fname in "${INSTALL_FILES[@]}"; do
                    if [[ -f "$PLUGIN_SRC/$fname" ]]; then
                        cp "$PLUGIN_SRC/$fname" "$INSTALL_DIR/$fname"
                    fi
                done
                print_success "Reinstalled at $(date '+%H:%M:%S')"
                printf "\n"
            fi
          done
}

# ── Main ─────────────────────────────────────────────────────────────────────

print_header "Autolink Plugin Installer"
printf "${WHITE}  Source :${RESET}  %s\n" "$PLUGIN_SRC"
printf "${WHITE}  Install:${RESET}  %s\n" "$INSTALL_DIR"
printf "${WHITE}  Mode   :${RESET}  %s\n\n" \
    "$([ "$WATCH" -eq 1 ] && echo 'watch (continuous)' || echo 'build + install once')"

validate_env
ensure_deps

if [[ "$WATCH" -eq 1 ]]; then
    build_plugin
    install_plugin
    print_reload_hint
    watch_plugin
else
    build_plugin
    install_plugin
    print_reload_hint
fi
