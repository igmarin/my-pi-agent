# my-pi-agent

Personal Pi Coding Agent harness: pick a life, load the right extensions and skill packs, run in a target repo.

## Language

**Life**:
One of three human identities this harness launches: `rust`, `elixir`, or `rails-python`. CLI also accepts `rails` as an alias for `rails-python`.
_Avoid_: persona, stack, role (those are narrower)

**Profile**:
Named launch config for a life: extensions, skill allowlist, tracker, provider class, model policy.
_Avoid_: theme, preset

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
Where tickets are created. Lives 1 and 3 use `github-issue`. Life 2 uses a machine-local overlay skill for the work internal tool.
_Avoid_: board, project (GitHub Project is a surface of the tracker)
