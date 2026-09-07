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
Default launch mode. The single primary Pi session with the full per-life toolset, the solo-only status-line extension, and the solo allowlist. The other modes (`chain`, `team`) do not load the status line and (until #6/#8 land) use the solo allowlist too.
_Avoid_: single, default (ambiguous; "solo" names the harness mode specifically)

**Agent (persona)**:
YAML under `profiles/<life>/agents/` or shared `profiles/agents/`, then cwd `.pi/agents/`, then `.claude/.gemini/.codex` (cwd then home). First name wins. `cross-agent` registers `/name` and `/skill:name`. `system-select` `/system` prepends the chosen body. Not passed by `pi-life` yet.
_Avoid_: flattening pack playbooks into these files

**Project overlay**:
File in the target repo (`.pi/capabilities.yaml`) that turns capabilities on or off. Default all off; missing file ≡ all off. `bin/pi-life` parses the overlay (strict, fail closed on bad YAML) and exports the result as `PI_OVERLAY` for `extensions/capabilities.ts`, which appends a `<capabilities>` block to the system prompt at `before_agent_start` when anything is on. When all are off, the prompt is left alone — the model never sees a capability the project has not enabled. `bin/pi-life` resolves the script's real location via `BASH_SOURCE[0]` for the import, independent of any `MY_PI_AGENT_HOME` override.
_Avoid_: settings, config (too broad)

**Machine**:
Local facts that never go in git: keys, hardware, tokengate vs personal, rapid-mlx model.
_Avoid_: environment (overloaded)

**Harness**:
This repo: extensions, profiles, `pi-life`, doctor. Host is Pi.
_Avoid_: runtime, orchestrator, framework

**Mantra**:
Always-on skill overlay for every life: `i-have-adhd`, `ponytail`, `deslop`, `clarify`, TDD gate, per-life constraint style.
_Avoid_: system prompt (the prompt is how mantra is injected)

**Capability**:
Optional tool a project may enable in its overlay (graphify, codegraph, serena, rs-guard, obscura, playwright). Default off. The overlay's `extra_skills` and `tracker.skill` are also capabilities: paths to local skill directories and to a machine-local tracker skill, respectively. The overlay may not invent a fourth life.
_Avoid_: plugin, MCP (MCP is one way to expose a capability)

**Chain**:
Sequential roles (`plan → build → review`). Primary Pi may still do small solo work.
_Avoid_: pipeline, workflow (those include overnight/unattended systems)

**Subagent**:
Tool that delegates a task to a specialized agent with an isolated context window. Three modes: `single` (one agent, one task), `parallel` (array of tasks, max 8, max 4 concurrent), `chain` (sequential with `{previous}` placeholder, fail-fast on first non-zero exit). Children spawn `pi` in JSON mode and inherit `-e extensions/damage-control-continue.ts --no-skills` (INV-skills). Agent discovery reuses the harness's first-wins order: `profiles/<life>/agents/` → `profiles/agents/` → cwd `.pi/agents/`. Implementation: `extensions/subagent.ts` (glue) + `extensions/subagentHelpers.ts` (types, pure helpers, child-process plumbing) + `extensions/subagent.test.ts` (bun test).
_Avoid_: orchestrator, multi-agent (overloaded; "subagent" is the harness's name for the single-tool delegation)

**Team**:
Dispatcher-only mode. Primary Pi has no codebase tools.
_Avoid_: swarm, crew

**Tracker**:
Where tickets are created. `rust`, `ruby`, and `python` use `github-issue`. `elixir` (work) uses a machine-local overlay skill for the internal tool.
_Avoid_: board, project (GitHub Project is a surface of the tracker)

## Config format

Harness-authored files (profiles, overlay, chains, damage-control rules) are **YAML**. Pi already ships a `yaml` parser for damage-control. One format, one dependency. Do not add TOML for those files.
