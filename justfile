set dotenv-load := false

root := justfile_directory()

default:
    @just --list

# Install JS deps and symlink pi-life onto PATH
install:
    #!/usr/bin/env bash
    set -euo pipefail
    bun install
    : "${HOME:?HOME must be set}"
    mkdir -p "${HOME}/.local/bin"
    ln -sfn "{{root}}/bin/pi-life" "${HOME}/.local/bin/pi-life"
    echo "pi-life -> {{root}}/bin/pi-life"

# Help-only smoke for #1 (does not launch Pi)
smoke:
    #!/usr/bin/env bash
    set -euo pipefail
    bin="{{root}}/bin/pi-life"
    "$bin" --help >/dev/null
    stub() {
      local needle="$1"; shift
      local out status=0
      out="$("$bin" "$@" 2>&1)" || status=$?
      test "${status}" -eq 2
      [[ "${out}" == *"${needle}"* ]]
    }
    stub 'life=ruby' rails
    stub 'life=ruby' ruby
    stub 'life=elixir' phoenix
    stub 'life=python' python
    status=0
    "$bin" ecto >/dev/null 2>&1 || status=$?
    test "${status}" -eq 2
    status=0
    out="$("$bin" rails-python 2>&1)" || status=$?
    test "${status}" -eq 2
    [[ "${out}" == *"use ruby or python"* ]]
    status=0
    "$bin" doctor >/dev/null 2>&1 || status=$?
    test "${status}" -eq 2
    status=0
    "$bin" ruby team typo >/dev/null 2>&1 || status=$?
    test "${status}" -eq 2
    status=0
    "$bin" doctor extra >/dev/null 2>&1 || status=$?
    test "${status}" -eq 2
    bun build "{{root}}/extensions/themeMap.ts" "{{root}}/extensions/minimal.ts" "{{root}}/extensions/purpose-gate.ts" \
      --outdir="${TMPDIR:-/tmp}/mpa-ext-smoke" --packages=external

# Harness-dev: model name + 10-block context meter
ext-minimal:
    cd "{{root}}" && pi -e extensions/minimal.ts

# Harness-dev: purpose-gate then minimal footer (does not launch via pi-life)
ext-purpose-gate:
    cd "{{root}}" && pi -e extensions/purpose-gate.ts -e extensions/minimal.ts
