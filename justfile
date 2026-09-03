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

# Help + dry-run profile smoke (does not launch Pi TUI)
smoke:
    #!/usr/bin/env bash
    set -euo pipefail
    root="{{root}}"
    bin="${root}/bin/pi-life"
    "$bin" --help >/dev/null
    tmp="$(mktemp -d)"
    trap 'rm -rf "${tmp}"' EXIT
    for name in i-have-adhd ponytail ponytail-review deslop clarify requirements-clarifier tdd \
                github-issue agnostic-planning-skills ruby-core-skills rails-agent-skills elixir-phoenix-skills; do
      mkdir -p "${tmp}/${name}"
      printf '%s\n' "# ${name}" >"${tmp}/${name}/SKILL.md"
    done
    export PI_SKILLS_HOME="${tmp}"

    rust_out="$("${bin}" --dry-run rust 2>"${tmp}/rust.err")"
    elixir_out="$("${bin}" --dry-run elixir 2>"${tmp}/elixir.err")"
    ruby_out="$("${bin}" --dry-run ruby 2>"${tmp}/ruby.err")"
    rails_out="$("${bin}" --dry-run rails 2>"${tmp}/rails.err")"
    python_out="$("${bin}" --dry-run python 2>"${tmp}/python.err")"

    case "${rust_out}" in
      pi\ -e\ *damage-control-continue.ts\ --no-skills\ *) ;;
      *) echo "INV-skills: rust argv must start with -e damage-control-continue --no-skills: ${rust_out}" >&2; exit 1 ;;
    esac
    echo "${rust_out}" | grep -q -- "-e ${root}/extensions/damage-control-continue.ts"
    echo "${rust_out}" | grep -q -- "--skill ${tmp}/ponytail"
    echo "${rust_out}" | grep -q -- "--skill ${tmp}/github-issue"
    ! grep -q -- "elixir-phoenix-skills" <<<"${rust_out}"
    ! grep -q -- "rails-agent-skills" <<<"${rust_out}"
    grep -q 'missing pack rust-core-skills' "${tmp}/rust.err"

    echo "${elixir_out}" | grep -q -- "--skill ${tmp}/elixir-phoenix-skills"
    ! grep -q -- "github-issue" <<<"${elixir_out}"
    ! grep -q -- "rails-agent-skills" <<<"${elixir_out}"

    echo "${ruby_out}" | grep -q -- "--skill ${tmp}/rails-agent-skills"
    echo "${ruby_out}" | grep -q -- "--skill ${tmp}/ruby-core-skills"
    echo "${ruby_out}" | grep -q -- "--skill ${tmp}/github-issue"
    ! grep -q -- "elixir-phoenix-skills" <<<"${ruby_out}"
    [[ "${rails_out}" == "${ruby_out}" ]]

    echo "${python_out}" | grep -q -- "--no-skills"
    echo "${python_out}" | grep -q -- "--skill ${tmp}/ponytail"
    ! grep -q -- "rails-agent-skills" <<<"${python_out}"
    echo "${python_out}" | grep -q -- "--skill ${tmp}/github-issue"

    status=0
    out="$("${bin}" rails-python 2>&1)" || status=$?
    test "${status}" -eq 2
    [[ "${out}" == *"use ruby or python"* ]]

    bad="$(mktemp -d)"
    mkdir -p "${bad}/profiles"
    printf ':\n  [\n' >"${bad}/profiles/python.yaml"
    status=0
    MY_PI_AGENT_HOME="${bad}" "${bin}" --dry-run python >/dev/null 2>"${tmp}/bad.err" || status=$?
    test "${status}" -eq 2
    grep -q 'invalid profile YAML' "${tmp}/bad.err"
    rm -rf "${bad}"

    empty="$(mktemp -d)"
    status=0
    PI_SKILLS_HOME="${empty}" "${bin}" --dry-run python >/dev/null 2>"${tmp}/empty.err" || status=$?
    test "${status}" -eq 2
    grep -q 'missing required mantra' "${tmp}/empty.err"
    rm -rf "${empty}"

    notrack="$(mktemp -d)"
    for name in i-have-adhd ponytail ponytail-review deslop clarify requirements-clarifier tdd; do
      mkdir -p "${notrack}/${name}"
      printf '%s\n' "# ${name}" >"${notrack}/${name}/SKILL.md"
    done
    status=0
    PI_SKILLS_HOME="${notrack}" "${bin}" --dry-run python >/dev/null 2>"${tmp}/notrack.err" || status=$?
    test "${status}" -eq 2
    grep -q 'missing required tracker' "${tmp}/notrack.err"
    rm -rf "${notrack}"

    none="$(mktemp -d)"
    mkdir -p "${none}/profiles"
    printf '%s\n' 'life: python' 'tracker: none' 'packs: []' 'mantra: [i-have-adhd]' >"${none}/profiles/python.yaml"
    mkdir -p "${tmp}/omit-tracker/i-have-adhd"
    printf '%s\n' '# i-have-adhd' >"${tmp}/omit-tracker/i-have-adhd/SKILL.md"
    none_out="$(MY_PI_AGENT_HOME="${none}" PI_SKILLS_HOME="${tmp}/omit-tracker" "${bin}" --dry-run python 2>"${tmp}/none.err")"
    echo "${none_out}" | grep -q -- "--skill ${tmp}/omit-tracker/i-have-adhd"
    ! grep -E -- '--skill [^[:space:]]+/none([[:space:]]|$)' <<<"${none_out}"
    rm -rf "${none}"

    badmap="$(mktemp -d)"
    mkdir -p "${badmap}/profiles"
    printf '%s\n' 'life: python' 'tracker: github-issue' 'packs: {bad: true}' 'mantra: [i-have-adhd]' >"${badmap}/profiles/python.yaml"
    status=0
    MY_PI_AGENT_HOME="${badmap}" PI_SKILLS_HOME="${tmp}" "${bin}" --dry-run python >/dev/null 2>"${tmp}/badmap.err" || status=$?
    test "${status}" -eq 2
    grep -q 'must be a string or list of strings' "${tmp}/badmap.err"
    rm -rf "${badmap}"
    status=0
    "${bin}" ecto >/dev/null 2>&1 || status=$?
    test "${status}" -eq 2
    status=0
    "${bin}" doctor >/dev/null 2>&1 || status=$?
    test "${status}" -eq 2
    status=0
    "${bin}" ruby team typo >/dev/null 2>&1 || status=$?
    test "${status}" -eq 2
    echo "smoke ok"
    bun test "{{root}}/extensions/agentScan.test.ts"
    bun build "{{root}}/extensions/themeMap.ts" "{{root}}/extensions/minimal.ts" "{{root}}/extensions/purpose-gate.ts" \
      "{{root}}/extensions/cross-agent.ts" "{{root}}/extensions/system-select.ts" \
      "{{root}}/extensions/damage-control-continue.ts" \
      --outdir="${TMPDIR:-/tmp}/mpa-ext-smoke" --packages=external
    bun -e '
      import { parse } from "yaml";
      import { readFileSync } from "node:fs";
      const r = parse(readFileSync("damage-control-rules.yaml", "utf8"));
      const hit = (cmd) => r.bashToolPatterns.some((p) => new RegExp(p.pattern).test(cmd));
      for (const cmd of ["git push origin main", "git reset --hard", "git clean -fd", "git clean -fdx"]) {
        if (!hit(cmd)) { console.error("expected block:", cmd); process.exit(1); }
      }
      if (hit("git status")) { console.error("false positive: git status"); process.exit(1); }
      if (!r.noDeletePaths?.includes(".git")) { console.error("expected noDeletePaths .git"); process.exit(1); }
    '
    bun -e '
      import { isPathMatch, bashWriteTargets, expansionOperandRisk } from "./extensions/damage-control-continue.ts";
      import { resolve } from "node:path";
      const cwd = process.cwd();
      const m = (p, pat) => isPathMatch(resolve(cwd, p), pat, cwd);
      if (m("/work/docs-archive/file", "docs")) { console.error("docs matched docs-archive"); process.exit(1); }
      if (!m(cwd + "/docs/file", "docs/")) { console.error("dir pattern failed"); process.exit(1); }
      if (!m(cwd + "/.env", ".env")) { console.error(".env not matched"); process.exit(1); }
      if (!bashWriteTargets("echo data > /tmp/damage-control-test").targets.includes("/tmp/damage-control-test")) { console.error("redir target missed"); process.exit(1); }
      if (bashWriteTargets("echo hi > ./ok.txt").targets.length !== 1) { console.error("cwd target missed"); process.exit(1); }
      if (!bashWriteTargets("gzip -c .env | tee /tmp/out").targets.includes("/tmp/out")) { console.error("tee target missed"); process.exit(1); }
      if (!bashWriteTargets("dd if=a of=$UNSET").unresolvable) { console.error("unresolvable not flagged"); process.exit(1); }
      if (!expansionOperandRisk("rm -rf .g[it]")) { console.error("bracket rm not flagged"); process.exit(1); }
      if (!expansionOperandRisk("rm -rf \"$DIR\"")) { console.error("var rm not flagged"); process.exit(1); }
      if (expansionOperandRisk("rm -rf build/cache")) { console.error("plain rm flagged"); process.exit(1); }
      if (expansionOperandRisk("git mv a b")) { console.error("git mv flagged"); process.exit(1); }
      console.log("damage-control unit checks ok");
    '

# Harness-dev: damage-control-continue (does not launch via pi-life)
ext-damage-control:
    cd "{{root}}" && pi -e extensions/damage-control-continue.ts

# Harness-dev: model name + 10-block context meter
ext-minimal:
    cd "{{root}}" && pi -e extensions/minimal.ts

# Harness-dev: purpose-gate then minimal footer (does not launch via pi-life)
ext-purpose-gate:
    cd "{{root}}" && pi -e extensions/purpose-gate.ts -e extensions/minimal.ts

# Harness-dev: register .claude/.gemini/.codex commands (does not launch via pi-life)
ext-cross-agent:
    cd "{{root}}" && pi -e extensions/cross-agent.ts -e extensions/minimal.ts

# Harness-dev: /system persona picker (does not launch via pi-life)
ext-system-select:
    cd "{{root}}" && pi -e extensions/system-select.ts -e extensions/minimal.ts
