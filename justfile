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
    rust_solo_out="$("${bin}" --dry-run rust solo 2>"${tmp}/rust-solo.err")"
    rust_chain_out="$("${bin}" --dry-run rust chain 2>"${tmp}/rust-chain.err")"
    rust_team_out="$("${bin}" --dry-run rust team 2>"${tmp}/rust-team.err")"
    elixir_out="$("${bin}" --dry-run elixir 2>"${tmp}/elixir.err")"
    ruby_out="$("${bin}" --dry-run ruby 2>"${tmp}/ruby.err")"
    rails_out="$("${bin}" --dry-run rails 2>"${tmp}/rails.err")"
    python_out="$("${bin}" --dry-run python 2>"${tmp}/python.err")"

    case "${rust_out}" in
      pi\ -e\ *damage-control-continue.ts\ *capabilities.ts\ *clarify-gate.ts\ --no-skills\ *) ;;
      *) echo "INV-skills: rust argv must include -e damage-control-continue -e capabilities.ts -e clarify-gate.ts --no-skills: ${rust_out}" >&2; exit 1 ;;
    esac
    echo "${rust_out}" | grep -q -- "-e ${root}/extensions/damage-control-continue.ts"
    echo "${rust_out}" | grep -q -- "-e ${root}/extensions/capabilities.ts"
    echo "${rust_out}" | grep -q -- "-e ${root}/extensions/clarify-gate.ts"
    echo "${rust_out}" | grep -q -- "--skill ${tmp}/ponytail"
    echo "${rust_out}" | grep -q -- "--skill ${tmp}/github-issue"
    ! grep -q -- "elixir-phoenix-skills" <<<"${rust_out}"
    ! grep -q -- "rails-agent-skills" <<<"${rust_out}"
    grep -q 'missing pack rust-core-skills' "${tmp}/rust.err"

    echo "${rust_out}" | grep -q -- "-e ${root}/extensions/status-line.ts"
    echo "${rust_solo_out}" | grep -q -- "-e ${root}/extensions/status-line.ts"
    ! grep -q -- "status-line.ts" <<<"${rust_chain_out}"
    ! grep -q -- "status-line.ts" <<<"${rust_team_out}"

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
    # Issue #18: doctor-probe exercises check_excludesfile in isolation.
    # Read-only: writes to a temp HOME/cwd, never touches the real ~/.gitignore_global.
    probe_home="$(mktemp -d)"
    probe_cwd="$(mktemp -d)"
    git -C "${probe_cwd}" init -q
    probe_ignore="${probe_home}/fake-gitignore-global"
    printf 'node_modules\n.pi/agent-sessions/\n.env\ngraphify-out/\n.codegraph/\n' >"${probe_ignore}"
    git -C "${probe_cwd}" config core.excludesfile "${probe_ignore}"
    status=0
    out="$(cd "${probe_cwd}" && HOME="${probe_home}" GIT_CONFIG_NOSYSTEM=1 \
        "${bin}" doctor-probe 2>&1)" || status=$?
    test "${status}" -eq 0
    [[ "${out}" == *"excludesfile: ${probe_ignore} ok"* ]]
    printf 'node_modules\n.pi/agent-sessions/\ngraphify-out/\n.codegraph/\n' >"${probe_ignore}"
    status=0
    out="$(cd "${probe_cwd}" && HOME="${probe_home}" GIT_CONFIG_NOSYSTEM=1 \
        "${bin}" doctor-probe 2>&1)" || status=$?
    test "${status}" -eq 1
    [[ "${out}" == *"missing patterns: .env"* ]]
    # Unsetting the local value falls back to global, which is empty under the temp HOME.
    git -C "${probe_cwd}" config --unset core.excludesfile
    status=0
    out="$(cd "${probe_cwd}" && HOME="${probe_home}" GIT_CONFIG_NOSYSTEM=1 \
        "${bin}" doctor-probe 2>&1)" || status=$?
    test "${status}" -eq 1
    [[ "${out}" == *"missing patterns:"* ]]
    rm -rf "${probe_home}" "${probe_cwd}"
    # Issue #13: doctor. (i) all required present, exit 0 + structured report.
    doc_cwd="$(mktemp -d)"
    status=0
    out="$(cd "${doc_cwd}" && PI_SKILLS_HOME="${tmp}" "${bin}" doctor 2>&1)" || status=$?
    test "${status}" -eq 0
    [[ "${out}" == *"harness: ${root}"* ]]
    [[ "${out}" == *"cwd: ${doc_cwd}"* ]]
    [[ "${out}" == *"overlay:"* ]]
    [[ "${out}" == *"required: ok"* ]]
    [[ "${out}" == *"optional:"* ]]
    # (j) doctor <life> with a pack missing -> exit 0, warning named.
    doc_life_cwd="$(mktemp -d)"
    status=0
    out="$(cd "${doc_life_cwd}" && PI_SKILLS_HOME="${tmp}" "${bin}" doctor ruby 2>&1)" || status=$?
    test "${status}" -eq 0
    [[ "${out}" == *"life: ruby"* ]]
    [[ "${out}" == *"warning: missing pack ruby-core-skills"* ]]
    # (k) doctor with overlay parse failure -> exit 2.
    doc_bad="$(mktemp -d)"
    mkdir -p "${doc_bad}/.pi"
    printf ':\n  [\n' >"${doc_bad}/.pi/capabilities.yaml"
    status=0
    out="$(cd "${doc_bad}" && PI_SKILLS_HOME="${tmp}" "${bin}" doctor 2>&1)" || status=$?
    test "${status}" -eq 2
    [[ "${out}" == *"invalid overlay YAML"* ]]
    # (l) doctor <life> with a malformed profile -> exit 2 (not swallowed).
    doc_badprof_home="$(mktemp -d)"
    mkdir -p "${doc_badprof_home}/profiles"
    printf '%s\n' 'life: ruby' 'packs: {bad: true}' >"${doc_badprof_home}/profiles/ruby.yaml"
    doc_badprof_cwd="$(mktemp -d)"
    status=0
    out="$(cd "${doc_badprof_cwd}" && MY_PI_AGENT_HOME="${doc_badprof_home}" PI_SKILLS_HOME="${tmp}" "${bin}" doctor ruby 2>&1)" || status=$?
    test "${status}" -eq 2
    grep -q 'must be a string or list of strings' <<<"${out}"
    # (m) doctor with an existing overlay but bun absent from PATH -> clean
    # "required: FAIL missing: bun" (checked before read_overlay spawns bun).
    doc_nobun_home="$(mktemp -d)"
    mkdir -p "${doc_nobun_home}/bin"
    printf '%s\n' '#!/bin/bash' 'exit 0' >"${doc_nobun_home}/bin/pi"
    chmod +x "${doc_nobun_home}/bin/pi"
    doc_nobun_cwd="$(mktemp -d)"
    mkdir -p "${doc_nobun_cwd}/.pi"
    printf '%s\n' 'graphify: true' >"${doc_nobun_cwd}/.pi/capabilities.yaml"
    status=0
    out="$(cd "${doc_nobun_cwd}" && PATH="${doc_nobun_home}/bin:/bin:/usr/bin" MY_PI_AGENT_HOME="${doc_badprof_home}" PI_SKILLS_HOME="${tmp}" "${bin}" doctor 2>&1)" || status=$?
    test "${status}" -eq 2
    grep -q 'required: FAIL missing: bun' <<<"${out}"
    rm -rf "${doc_cwd}" "${doc_life_cwd}" "${doc_bad}" "${doc_badprof_home}" "${doc_badprof_cwd}" "${doc_nobun_home}" "${doc_nobun_cwd}"
    status=0
    "${bin}" ruby team typo >/dev/null 2>&1 || status=$?
    test "${status}" -eq 2
    # Issue #11: capabilities overlay. Smoke calls `bin/pi-life --dump-overlay`
    # to exercise the real read_overlay function, not a copy of it.
    # (a) Missing overlay -> all-off payload.
    nooverlay="$(mktemp -d)"
    nooverlay_payload="$("${bin}" --dump-overlay "${nooverlay}")"
    case "${nooverlay_payload}" in
      *'"graphify":false'*'"codegraph":false'*'"serena":false'*'"rs-guard":false'*'"obscura":false'*'"playwright":false'*) ;;
      *) echo "expected all-off overlay, got: ${nooverlay_payload}" >&2; exit 1 ;;
    esac
    # (b) Overlay on -> reflects the on capabilities.
    mkdir -p "${nooverlay}/.pi"
    printf '%s\n' 'graphify: true' 'codegraph: true' >"${nooverlay}/.pi/capabilities.yaml"
    on_payload="$("${bin}" --dump-overlay "${nooverlay}")"
    case "${on_payload}" in
      *'"graphify":true'*'"codegraph":true'*) ;;
      *) echo "expected graphify+codegraph on, got: ${on_payload}" >&2; exit 1 ;;
    esac
    # (c) Malformed overlay YAML -> exit 2 (fail closed).
    printf ':\n  [\n' >"${nooverlay}/.pi/capabilities.yaml"
    status=0
    "${bin}" --dump-overlay "${nooverlay}" >/dev/null 2>"${tmp}/badoverlay.err" || status=$?
    test "${status}" -eq 2
    grep -q 'invalid overlay YAML' "${tmp}/badoverlay.err"
    # (d) Schema error (unknown top-level key) -> exit 2.
    printf '%s\n' 'graphify: true' 'kittens: true' >"${nooverlay}/.pi/capabilities.yaml"
    status=0
    "${bin}" --dump-overlay "${nooverlay}" >/dev/null 2>"${tmp}/badkey.err" || status=$?
    test "${status}" -eq 2
    grep -q 'unknown key.*kittens' "${tmp}/badkey.err"
    # (e) Schema error (unknown tracker key) -> exit 2.
    printf '%s\n' 'tracker:' '  skill: local/x' '  retries: 3' >"${nooverlay}/.pi/capabilities.yaml"
    status=0
    "${bin}" --dump-overlay "${nooverlay}" >/dev/null 2>"${tmp}/badtracker.err" || status=$?
    test "${status}" -eq 2
    grep -q 'tracker has unknown key.*retries' "${tmp}/badtracker.err"
    # (f) Overlay extra_skills and tracker.skill become --skill args.
    # We need a valid profile + valid skills home for launch_life to run,
    # so this is a separate test scaffold.
    overlay_life="$(mktemp -d)"
    overlay_profile="$(mktemp -d)"
    overlay_skill1="${overlay_life}/.pi/local-skills/team-rule"
    overlay_skill2="${overlay_life}/.pi/local-tracker/work"
    mkdir -p "${overlay_skill1}" "${overlay_skill2}"
    mkdir -p "${overlay_profile}/profiles"
    printf '%s\n' 'life: python' 'tracker: github-issue' 'packs: []' 'mantra: [i-have-adhd]' >"${overlay_profile}/profiles/python.yaml"
    mkdir -p "${tmp}/overlay-skills-home/i-have-adhd" "${tmp}/overlay-skills-home/github-issue"
    printf '%s\n' '# i-have-adhd' '# github-issue' >"${tmp}/overlay-skills-home/i-have-adhd/SKILL.md" "${tmp}/overlay-skills-home/github-issue/SKILL.md"
    printf '%s\n' >"${overlay_skill1}/SKILL.md"
    printf '%s\n' >"${overlay_skill2}/SKILL.md"
    printf '%s\n' 'graphify: true' 'extra_skills:' "  - ${overlay_skill1}" 'tracker:' "  skill: ${overlay_skill2}" >"${overlay_life}/.pi/capabilities.yaml"
    overlay_out="$(cd "${overlay_life}" && MY_PI_AGENT_HOME="${overlay_profile}" PI_SKILLS_HOME="${tmp}/overlay-skills-home" "${bin}" --dry-run python 2>"${tmp}/overlay.err")"
    case "${overlay_out}" in
      *"--skill ${overlay_skill1}"*) ;;
      *) echo "expected --skill ${overlay_skill1} in argv, got: ${overlay_out}" >&2; exit 1 ;;
    esac
    case "${overlay_out}" in
      *"--skill ${overlay_skill2}"*) ;;
      *) echo "expected --skill ${overlay_skill2} in argv, got: ${overlay_out}" >&2; exit 1 ;;
    esac
    # (g) --dump-overlay . from a relative path works (cwd is normalized).
    dumprel="$(mktemp -d)"
    mkdir -p "${dumprel}/.pi"
    printf 'graphify: true\n' >"${dumprel}/.pi/capabilities.yaml"
    dumprel_payload="$(cd "${dumprel}" && "${bin}" --dump-overlay .)"
    case "${dumprel_payload}" in
      *'"graphify":true'*) ;;
      *) echo "expected graphify on for --dump-overlay ., got: ${dumprel_payload}" >&2; exit 1 ;;
    esac
    # (h) Missing overlay skill path produces a warning, not a fail.
    printf '%s\n' 'graphify: true' 'extra_skills:' '  - /no/such/skill' >"${dumprel}/.pi/capabilities.yaml"
    warn_out="$(cd "${dumprel}" && MY_PI_AGENT_HOME="${overlay_profile}" PI_SKILLS_HOME="${tmp}/overlay-skills-home" "${bin}" --dry-run python 2>&1)"
    case "${warn_out}" in
      *"missing overlay overlay (/no/such/skill)"*) ;;
      *) echo "expected missing-overlay warning, got: ${warn_out}" >&2; exit 1 ;;
    esac
    # (i) Issue #17: overlay tracker.skill works for a profile that omits
    # tracker. The only way the tracker path appears in argv is from the
    # overlay, proving the path is data-driven and local — never committed.
    notrack_overlay_life="$(mktemp -d)"
    notrack_overlay_profile="$(mktemp -d)"
    notrack_tracker="${notrack_overlay_life}/.pi/local-tracker/work"
    mkdir -p "${notrack_tracker}" "${notrack_overlay_profile}/profiles"
    # Profile omits `tracker:` like profiles/elixir.yaml.
    printf '%s\n' 'life: elixir' 'packs: []' 'mantra: [i-have-adhd]' >"${notrack_overlay_profile}/profiles/elixir.yaml"
    mkdir -p "${tmp}/notrack-overlay-skills-home/i-have-adhd"
    printf '%s\n' '# i-have-adhd' >"${tmp}/notrack-overlay-skills-home/i-have-adhd/SKILL.md"
    printf '%s\n' >"${notrack_tracker}/SKILL.md"
    printf '%s\n' 'tracker:' "  skill: ${notrack_tracker}" >"${notrack_overlay_life}/.pi/capabilities.yaml"
    notrack_out="$(cd "${notrack_overlay_life}" && MY_PI_AGENT_HOME="${notrack_overlay_profile}" PI_SKILLS_HOME="${tmp}/notrack-overlay-skills-home" "${bin}" --dry-run elixir 2>"${tmp}/notrack.err")"
    case "${notrack_out}" in
      *"--skill ${notrack_tracker}"*) ;;
      *) echo "expected overlay tracker.skill in argv, got: ${notrack_out}" >&2; exit 1 ;;
    esac
    # Profile did not require a tracker, so no "missing required tracker" error.
    ! grep -q 'missing required tracker' "${tmp}/notrack.err"
    # (j) Issue #17: no work-internal tracker name/URL/token in the public repo.
    # The sentinel is a placeholder; if it ever matches a real identifier, the
    # harness has leaked a private name. Excludes the justfile itself (which
    # contains the literal pattern) and CONTEXT.md (the doc is allowed to
    # describe the invariant). Includes everything else: code, profiles,
    # scripts, extensions, configs, .github.
    if grep -RIE 'worktracker|work-internal-tracker|http(s)?://[^[:space:]]*work[^[:space:]]*tracker' \
        "${root}" \
        --exclude-dir=.git \
        --exclude-dir=node_modules \
        --exclude=justfile \
        --exclude=CONTEXT.md \
        >"${tmp}/leakcheck.out" 2>/dev/null; then
      echo "public-repo invariant: work-internal tracker identifier leaked:" >&2
      cat "${tmp}/leakcheck.out" >&2
      exit 1
    fi
    rm -rf "${nooverlay}" "${overlay_life}" "${overlay_profile}" "${dumprel}" \
           "${notrack_overlay_life}" "${notrack_overlay_profile}"
    echo "smoke ok"
    bun test "{{root}}/extensions/agentScan.test.ts" "{{root}}/extensions/capabilities.test.ts" "{{root}}/extensions/clarify-gate.test.ts" "{{root}}/extensions/subagent.test.ts"
    bun build "{{root}}/extensions/themeMap.ts" "{{root}}/extensions/minimal.ts" "{{root}}/extensions/purpose-gate.ts" \
      "{{root}}/extensions/cross-agent.ts" "{{root}}/extensions/system-select.ts" \
      "{{root}}/extensions/damage-control-continue.ts" \
      "{{root}}/extensions/capabilities.ts" \
      "{{root}}/extensions/clarify-gate.ts" \
      "{{root}}/extensions/status-line.ts" \
      "{{root}}/extensions/subagent.ts" "{{root}}/extensions/subagentHelpers.ts" \
      --outdir="${TMPDIR:-/tmp}/mpa-ext-smoke" --packages=external
    bun -e '
      import { formatTurnLine } from "./extensions/status-line.ts";
      const noop = (_, s) => s;
      const ready = formatTurnLine("ready", 0, { fg: noop });
      if (ready !== " Ready") { console.error("ready expected \" Ready\", got", JSON.stringify(ready)); process.exit(1); }
      const running = formatTurnLine("running", 3, { fg: noop });
      if (running !== "● Turn 3...") { console.error("running expected \"● Turn 3...\", got", JSON.stringify(running)); process.exit(1); }
      const done = formatTurnLine("done", 3, { fg: noop });
      if (done !== "✓ Turn 3 complete") { console.error("done expected \"✓ Turn 3 complete\", got", JSON.stringify(done)); process.exit(1); }
      console.log("status-line format ok");
    '
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
