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
    "{{root}}/bin/pi-life" --help
