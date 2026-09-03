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
Named launch config for a life: extensions, skill allowlist, tracker, provider class, model policy. Stored as YAML under `profiles/<life>.yaml`. Launch is `-e damage-control-continue` then `--no-skills` then allowlisted `--skill`. Invalid YAML, a missing mantra path, or a missing configured tracker path fails closed (exit 2). Omit tracker (elixir) or `tracker: none` = no tracker skill. Missing packs warn.
_Avoid_: theme, preset; TOML for harness config

**Agent (persona)**:
YAML under `profiles/<life>/agents/` or shared `profiles/agents/`, then cwd `.pi/agents/`, then `.claude/.gemini/.codex` (cwd then home). First name wins. `cross-agent` registers `/name` and `/skill:name`. `system-select` `/system` prepends the chosen body. Not passed by `pi-life` yet.
_Avoid_: flattening pack playbooks into these files

**Project overlay**:
File in the target repo (`.pi/capabilities.yaml`) that turns capabilities on or off.
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
Optional tool a project may enable (graphify, codegraph, serena, rs-guard, obscura, playwright). Default off.
_Avoid_: plugin, MCP (MCP is one way to expose a capability)

**Chain**:
Sequential roles (`plan → build → review`). Primary Pi may still do small solo work.
_Avoid_: pipeline, workflow (those include overnight/unattended systems)

**Team**:
Dispatcher-only mode. Primary Pi has no codebase tools.
_Avoid_: swarm, crew

**Tracker**:
Where tickets are created. `rust`, `ruby`, and `python` use `github-issue`. `elixir` (work) uses a machine-local overlay skill for the internal tool.
_Avoid_: board, project (GitHub Project is a surface of the tracker)

## Config format

Harness-authored files (profiles, overlay, chains, damage-control rules) are **YAML**. Pi already ships a `yaml` parser for damage-control. One format, one dependency. Do not add TOML for those files.
