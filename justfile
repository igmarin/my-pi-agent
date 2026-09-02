set dotenv-load := false

root := justfile_directory()

default:
    @just --list

# Install JS deps and symlink pi-life onto PATH
install:
    bun install
    mkdir -p "{{env_var_or_default('HOME', '/')}}/.local/bin"
    ln -sfn "{{root}}/bin/pi-life" "{{env_var_or_default('HOME', '/')}}/.local/bin/pi-life"
    @echo "pi-life -> {{root}}/bin/pi-life"

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
    stub 'life=elixir' phoenix
    status=0
    "$bin" ecto >/dev/null 2>&1 || status=$?
    test "${status}" -eq 2
    status=0
    "$bin" doctor >/dev/null 2>&1 || status=$?
    test "${status}" -eq 2
