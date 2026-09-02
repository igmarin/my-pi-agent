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
    "{{root}}/bin/pi-life" --help >/dev/null
    set +e
    out="$("{{root}}/bin/pi-life" rails 2>&1)"
    test $? -eq 2
    [[ "${out}" == *"life=ruby"* ]]
    out="$("{{root}}/bin/pi-life" phoenix 2>&1)"
    test $? -eq 2
    [[ "${out}" == *"life=elixir"* ]]
    "{{root}}/bin/pi-life" ecto
    test $? -eq 2
    "{{root}}/bin/pi-life" doctor
    test $? -eq 2
