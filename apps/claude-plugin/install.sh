#!/usr/bin/env bash
# Install the Loccy plugin for Claude Code, and keep it updating itself.
set -euo pipefail

REPO="loccy-dev/monorepo"
MARKETPLACE="loccy"
PLUGIN="loccy@loccy"

AUTO_UPDATE=1
FORCE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --no-auto-update) AUTO_UPDATE=0 ;;
    --force) FORCE=1 ;;
    -h|--help)
      cat <<'EOF'
Install the Loccy plugin for Claude Code.

  --no-auto-update  leave the marketplace on manual updates
  --force           reinstall even if the plugin is already there

Auto-update is a marketplace setting, off by default for marketplaces that are
not Anthropic's own, so this writes it to your Claude Code settings.json. Skip
that with --no-auto-update and run `claude plugin update loccy` yourself.
EOF
      exit 0
      ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

say() { printf '\033[1m%s\033[0m\n' "$1"; }
note() { printf '  %s\n' "$1"; }
fail() { printf '\033[31m%s\033[0m\n' "$1" >&2; exit 1; }

command -v claude >/dev/null 2>&1 || fail "claude was not found. Install Claude Code first: https://claude.com/claude-code"

say "Loccy plugin for Claude Code"

# 1. The marketplace this plugin is published through.
if claude plugin marketplace list 2>/dev/null | grep -q "❯ ${MARKETPLACE}$"; then
  note "marketplace ${MARKETPLACE} already configured"
else
  claude plugin marketplace add "$REPO" >/dev/null || fail "could not add the ${MARKETPLACE} marketplace"
  note "marketplace ${MARKETPLACE} added"
fi

# 2. The plugin itself.
if [ "$FORCE" = 0 ] && claude plugin list 2>/dev/null | grep -q "❯ ${PLUGIN}$"; then
  note "plugin ${PLUGIN} already installed (use --force to reinstall)"
else
  claude plugin install "$PLUGIN" --yes >/dev/null || fail "could not install ${PLUGIN}"
  note "plugin ${PLUGIN} installed"
fi

# 3. Auto-update, which is per marketplace and off unless it is asked for. The plugin carries the
# loccy-tool binary, so a plugin left behind is a tool left behind.
if [ "$AUTO_UPDATE" = 0 ]; then
  note "auto-update left alone (--no-auto-update)"
else
  command -v node >/dev/null 2>&1 || fail "node is needed to edit settings.json. Rerun with --no-auto-update, or turn auto-update on in /plugin"

  settings_dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
  settings="${settings_dir}/settings.json"

  # The written file is read back through the CLI, and put back as it was if that no longer works.
  backup=""
  if [ -f "$settings" ]; then
    backup="${settings}.loccy-backup"
    cp "$settings" "$backup"
  fi

  result=$(
    LOCCY_SETTINGS="$settings" LOCCY_MARKETPLACE="$MARKETPLACE" LOCCY_REPO="$REPO" node <<'EOF'
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { dirname } = require('node:path')

const path = process.env.LOCCY_SETTINGS
const name = process.env.LOCCY_MARKETPLACE

let settings = {}
try {
  settings = JSON.parse(readFileSync(path, 'utf-8'))
} catch (err) {
  if (err.code !== 'ENOENT') {
    console.log(`malformed:${err.message}`)
    process.exit(0)
  }
}

const known = (settings.extraKnownMarketplaces ??= {})
if (known[name]?.autoUpdate === true) {
  console.log('already')
  process.exit(0)
}

known[name] = {
  ...known[name],
  source: known[name]?.source ?? { source: 'github', repo: process.env.LOCCY_REPO },
  autoUpdate: true,
}

mkdirSync(dirname(path), { recursive: true })
writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`)
console.log('written')
EOF
  )

  case "$result" in
    already) note "auto-update already on" ;;
    written)
      if claude plugin marketplace list >/dev/null 2>&1; then
        note "auto-update on for the ${MARKETPLACE} marketplace"
        [ -n "$backup" ] && rm -f "$backup"
      else
        [ -n "$backup" ] && mv "$backup" "$settings"
        fail "settings.json was put back: Claude Code would not read it with that change"
      fi
      ;;
    malformed:*)
      [ -n "$backup" ] && rm -f "$backup"
      note "left ${settings} alone, it does not parse as JSON: ${result#malformed:}"
      note "turn auto-update on in /plugin instead"
      ;;
    *) fail "could not tell what happened to ${settings}" ;;
  esac
fi

say ""
say "Done. Restart Claude Code to pick the plugin up."
