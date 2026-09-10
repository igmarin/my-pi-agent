# my-pi-agent

Personal Pi Coding Agent harness: pick a life, load the right extensions and skill packs, run in a target repo.

## Language

**Life**:
One of four identities this harness launches: `rust`, `elixir`, `ruby`, or `python`.
_Avoid_: persona, stack, role (those are narrower); `ecto` as a life (it is a library)

CLI aliases: `phoenix` → `elixir`, `rails` → `ruby`. `rails-python` is not a life; use `ruby` or `python`.

**API pack**:
Optional GraphQL or REST skill set loaded on a life. Not a fifth life.
_Avoid_: calling GraphQL/REST a life

**Profile**:
Named launch config for a life: extensions, skill allowlist, tracker, provider class, model policy. Stored as YAML under `profiles/<life>.yaml`. Launch is `-e extensions/damage-control-continue.ts` then `--no-skills` then allowlisted `--skill`. **Solo mode also appends** `-e extensions/status-line.ts` (turn counter in the footer; chain/team do not load it). Invalid YAML, a missing mantra path, or a missing configured tracker path fails closed (exit 2). Omit tracker (elixir) or `tracker: none` = no tracker skill. Missing packs warn.
_Avoid_: theme, preset; TOML for harness config

**Solo**:
Default launch mode. The single primary Pi session with the full per-life toolset, the solo-only status-line extension, and the solo allowlist. The other modes do not load the status line. `team` keeps the solo allowlist plus the dispatcher extension; `chain` keeps the solo allowlist plus the chain extension (`/chain`, `/chain-list`, `run_chain`).
_Avoid_: single, default (ambiguous; "solo" names the harness mode specifically)

**Agent (persona)**:
YAML under `profiles/<life>/agents/` or shared `profiles/agents/`, then cwd `.pi/agents/`, then `.claude/.gemini/.codex` (cwd then home). First name wins. `cross-agent` registers `/name` and `/skill:name`. `system-select` `/system` prepends the chosen body. Not passed by `pi-life` yet.
_Avoid_: flattening pack playbooks into these files

**Project overlay**:
File in the target repo (`.pi/capabilities.yaml`) that turns capabilities on or off. Default all off; missing file ≡ all off. `bin/pi-life` parses the overlay (strict, fail closed on bad YAML) and exports the result as `PI_OVERLAY` for `extensions/capabilities.ts`, which appends a `<capabilities>` block to the system prompt at `before_agent_start` when anything is on. When all are off, the prompt is left alone — the model never sees a capability the project has not enabled. The overlay's `extra_skills` and `tracker.skill` are also turned into `--skill` arguments in the launcher so the model can actually use them, not just see them in the prompt. `bin/pi-life` resolves the script's real location via `BASH_SOURCE[0]` for the import, independent of any `MY_PI_AGENT_HOME` override. The overlay also carries optional `models:`/`thinking:` role maps (issue #15) — see Boot Config.
_Avoid_: settings, config (too broad)

**Boot Config**:
First-launch wizard (issue #15): when `.pi/capabilities.yaml` does not exist, `extensions/boot-config.ts` (loaded before `capabilities.ts` in the `-e` chain) walks the user through the six capability toggles and optional per-role model/thinking defaults (roles: solo, planner, builder, reviewer, researcher), then writes the overlay only on explicit confirmation. Skipped entirely when the file exists (`PI_OVERLAY_EXISTS=1`, exported by the launcher) or when UI is unavailable. On save it updates `PI_OVERLAY` in-process so `capabilities.ts` reads the fresh overlay and applies the solo model/thinking immediately via `pi.setModel`/`pi.setThinkingLevel`. On later launches the launcher reads the overlay's `models.solo`/`thinking.solo` into `--model`/`--thinking`; profile YAML may carry optional `models:`/`thinking:` defaults that the overlay overrides.
_Avoid_: setup command (it is a launch-time wizard, not a CLI)

**Machine**:
Local facts that never go in git: keys, hardware, tokengate vs personal, rapid-mlx model.
_Avoid_: environment (overloaded)

**Harness**:
This repo: extensions, profiles, `pi-life`, doctor. Host is Pi.
_Avoid_: runtime, orchestrator, framework

**Doctor**:
`pi-life doctor [life]` health check (replaces the pre-#13 stub). Fail-closed (exit 2): `pi`, `bun`, overlay parse failure, and — for the given `[life]` — a missing required mantra or tracker skill path (the same contract the launcher enforces; mantra skills are user-provisioned under `PI_SKILLS_HOME`/`~/.agents/skills`, never vendored). Warns and exits 0: optional gaps (missing packs for the given `[life]`, `just`, `rs-guard`, `herdr`, `core.excludesfile` patterns). Prints the report keys `life`/`harness`/`cwd`/`overlay`/`required`/`optional`. Diagnostics (warnings, parse errors) go to stderr; the report goes to stdout.
_Avoid_: diagnostics on stdout (warnings are `warning: `-prefixed on stderr)

**Mantra**:
Always-on skill overlay for every life: `i-have-adhd`, `ponytail`, `deslop`, `clarify`, TDD gate, per-life constraint style, `herdr` (no-ops outside Herdr). Backed by the clarify-gate extension, which blocks `write` and `edit` tool calls until the user runs `/clarify` to accept the prompt; read-only tools stay available. The gate is per-session: once opened, it stays open. Print/JSON mode skips the gate.
_Avoid_: system prompt (the prompt is how mantra is injected)

**Capability**:
Optional tool a project may enable in its overlay (graphify, codegraph, serena, rs-guard, obscura, playwright). Default off. The overlay's `extra_skills` and `tracker.skill` are also capabilities: paths to local skill directories and to a machine-local tracker skill, respectively. The overlay may not invent a fourth life.
_Avoid_: plugin, MCP (MCP is one way to expose a capability)

**Role**:
Chain/team seat a model or thinking level can be assigned to: `solo` (primary session), `planner`, `builder`, `reviewer`, `researcher`. Configured under optional `models:`/`thinking:` keys in `profiles/<life>.yaml` (harness defaults) and `.pi/capabilities.yaml` (per-project override). The launcher passes `solo` into `pi --model`/`--thinking`; chain/team/subagent children dispatch with the overlay's model/thinking keyed on the child's agent name, falling back to the primary's current model. Profile defaults reach children only when saved into the overlay (live merge is not wired, #11).
_Avoid_: agent (a role is a seat, an agent is a persona file)

**Chain**:
Sequential roles (`plan → build → review`) driven by named chains from `agent-chain.yaml` (`/chain`, `/chain-list`, `run_chain`). File precedence: project `.pi/agents/agent-chain.yaml` overrides harness `profiles/<life>/agents/` then shared `profiles/agents/agent-chain.yaml` (default `plan-build-review`; optional `research-plan-build-review` prepends a researcher step, issue #12). Each step is a child `pi` (`{task}`/`{previous}` templates, fail-fast). A step may set `rs_guard: true` (issue #7, chain-level): when the overlay enables `rs-guard`, the chain shells out to `rs-guard --diff-file` on `git diff HEAD` before the agent runs and feeds the findings into the step; overlay off or empty diff = skills-only; overlay on + missing binary or a non-zero rs-guard exit fails the chain closed. Launched via `pi-life <life> chain`, which loads the chain extension on top of the solo allowlist (#8).
_Avoid_: pipeline, workflow (those include overnight/unattended systems)

**Subagent**:
Tool that delegates a task to a specialized agent with an isolated context window. Three modes: `single` (one agent, one task), `parallel` (array of tasks, max 8, max 4 concurrent), `chain` (sequential with `{previous}` placeholder, fail-fast on first non-zero exit). Children spawn `pi` in JSON mode and inherit `-e extensions/damage-control-continue.ts --no-skills` (INV-skills). Agent discovery reuses the harness's first-wins order: `profiles/<life>/agents/` → `profiles/agents/` → cwd `.pi/agents/`. Implementation: `extensions/subagent.ts` (glue) + `extensions/subagentHelpers.ts` (types, pure helpers, child-process plumbing) + `extensions/subagent.test.ts` (bun test).
_Avoid_: orchestrator, multi-agent (overloaded; "subagent" is the harness's name for the single-tool delegation)

**Team**:
Dispatcher-only mode, launched only via `pi-life <life> team`. The primary loads `extensions/agent-team.ts`, which sets `dispatch_agent` as the ONLY active tool (no read/write/bash) and dispatches tasks to team members as child `pi` processes that always inherit the damage-control gate. Teams live under the `teams:` key of `agent-chain.yaml` (same file and precedence as chains); the default team is `planner, builder, reviewer, researcher`; `PI_TEAM` env overrides the active team; `/team-list` lists them. Structurally mutually exclusive with chain (`agent-chain.ts`) and tilldone (`status-line.ts`): the launcher never loads those in team mode, so `setActiveTools` cannot conflict.
_Avoid_: swarm, crew

**Tracker**:
Where tickets are created. `rust`, `ruby`, and `python` use `github-issue`. `elixir` (work) uses a machine-local overlay skill for the internal tool. The overlay's `tracker.skill` is loaded as a `--skill` arg in the argv, so the work-internal tool is available without committing its name to the public repo.
_Avoid_: board, project (GitHub Project is a surface of the tracker)

**Herdr**:
Terminal multiplexer that hosts parallel work: workspaces, panes, `herdr worktree`, and `herdr agent start <name> --kind pi -- pi-life <life>` as the way to start sibling lives. Herdr is a **host**, not something the harness wraps: no Pi extension shells out to it (issue #19). The `herdr` skill is on the mantra allowlist of every life but no-ops unless `HERDR_ENV=1`, so a plain terminal is unaffected. Doctor warns (never fails) when the `herdr` binary is off PATH.
_Avoid_: multiplexer-as-host confusion (Herdr hosts Pi lives; Pi is the agent)

## Config format

Harness-authored files (profiles, overlay, chains, damage-control rules) are **YAML**. Pi already ships a `yaml` parser for damage-control. One format, one dependency. Do not add TOML for those files.
