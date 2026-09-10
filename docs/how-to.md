# my-pi-agent how-to

Task-oriented guide: install, launch, configure, run chains and teams, troubleshoot.
Domain terms are in [CONTEXT.md](../CONTEXT.md); project rules in [AGENTS.md](../AGENTS.md).

## Install

```sh
git clone git@github.com:igmarin/my-pi-agent.git && cd my-pi-agent
just install          # bun install + symlink pi-life onto ~/.local/bin
git config core.hooksPath .githooks   # rs-guard pre-commit (or scripts/install-hooks.sh)
```

Requirements: `pi` and `bun` on PATH (fail-closed, checked by `pi-life doctor`); optional `just`, `rs-guard`, `herdr` (warn only). The `DEEPSEEK_API_KEY` for rs-guard reviews lives in the environment or `~/.config/rs-guard/env` — never in a target repo.

## First launch in a target repo

`pi-life` runs from the **target repo** (a Rails app, a Rust crate, whatever), not from the harness clone:

```sh
cd ~/Work/my-rails-app
pi-life ruby          # solo mode (default)
```

First launch walks the boot-config wizard (`extensions/boot-config.ts`):

1. **Purpose gate** — declare what this session is for.
2. **Clarify gate** — `write`/`edit` are blocked until you run `/clarify` to accept the prompt. Read-only tools stay available so the model can explore.
3. **Boot TUI** (only when `.pi/capabilities.yaml` does not exist): the six capability toggles (graphify, codegraph, serena, rs-guard, obscura, playwright) and optional per-role model/thinking. Saving is explicit — a cancelled prompt skips the write.

Second launch with a saved overlay: no TUI. The overlay's `models.solo`/`thinking.solo` become `pi --model`/`--thinking`.

## Daily driver: lives and modes

```sh
pi-life ruby solo     # full toolset + status line (default)
pi-life ruby chain    # + /chain, /chain-list, run_chain tool
pi-life ruby team     # dispatcher-only primary (dispatch_agent is the only tool)
pi-life python        # mantra only (pandas / FastAPI)
pi-life elixir        # no github-issue tracker
pi-life rust
pi-life --dry-run ruby  # print the pi argv, launch nothing
```

Aliases: `rails` → `ruby`, `phoenix` → `elixir`. `ecto` and `rails-python` are not lives (exit 2).

Mode exclusivity is structural: solo loads the status line, chain loads the chain extension, team loads the dispatcher — never more than one of the three.

## Project overlay (`.pi/capabilities.yaml`)

Turn capabilities on per project; missing file ≡ all off; malformed YAML exits 2:

```yaml
graphify: true
rs-guard: true
extra_skills:            # local, uncommitted skill dirs (paths relative to the repo)
  - .pi/local-skills/team-rule
tracker:
  skill: .pi/local-tracker/work   # machine-local tracker (elixir lives use this)
models:
  planner: openrouter/z-ai/glm-5.3-flash
  builder: openrouter/other
thinking:
  planner: max
  builder: low
```

- Capabilities gate the `<capabilities>` system-prompt block; the model never sees a capability that is off.
- `extra_skills` and `tracker.skill` become `--skill` argv entries so the model can actually use them.
- `models`/`thinking` roles: `solo` (primary `--model`/`--thinking`) and `planner`/`builder`/`reviewer`/`researcher` — chain/team/subagent children dispatch with the entry keyed on the **child's agent name**, falling back to the primary's current model when the agent has no entry.
- Hand-edit freely; the launcher re-parses and re-validates every launch.

## Per-project agents, chains, teams

Discovery (first-wins on name): `profiles/<life>/agents/` → `profiles/agents/` → cwd `.pi/agents/` → `.claude/.gemini/.codex` (cwd, then `$HOME`).

**Agent file** (`.pi/agents/my-agent.yaml`):

```yaml
name: my-agent
description: One line
tools: read, grep, bash   # comma list or YAML array; empty = default toolset
body: |
  System prompt for this agent.
```

**Custom chain or team** (`.pi/agents/agent-chain.yaml` overrides the harness default entirely):

```yaml
chains:
  my-flow:
    description: One-line description
    steps:
      - agent: my-agent
        task: "Plan: {task}"       # {task} = original request, {previous} = prior step output
      - agent: builder
        rs_guard: true             # rs-guard reviews `git diff HEAD` before this step
teams:
  fast:
    description: Two-member team
    members: [builder, reviewer]
```

`rs_guard: true` needs the overlay's `rs-guard: true` plus the binary on PATH; a non-zero rs-guard exit fails the chain closed.

## Running chains and teams

```sh
pi-life ruby chain
# in the session:
/chain-list                       # what's available
/chain plan-build-review Fix the N+1 in OrdersController#show
/chain research-plan-build-review <task>   # research-first variant
```

Steps run as child `pi` processes (JSON mode, isolated context, damage-control gate always inherited). Fail-fast: the first failed step stops the chain. The `run_chain` tool lets the primary session run a chain programmatically.

```sh
pi-life ruby team
# the primary cannot read/write/bash — it plans and dispatches:
# dispatch_agent(agent: "builder", task: "...") for each team member
/team-list                        # teams, active team marked
PI_TEAM=fast pi-life ruby team    # override the active team (default: planner, builder, reviewer, researcher)
```

## rs-guard review flow

- **Pre-commit**: reviews **staged** files; `REQUEST_CHANGES` (exit 2) aborts the commit. Bypass: `git commit --no-verify`.
- **PRs**: `.github/workflows/rs-guard-review.yml` reviews every non-draft PR.
- **Chain steps**: `rs_guard: true` runs rs-guard on `git diff HEAD` before the step and feeds findings into the agent — the agent verifies findings, it does not re-run the binary.
- Config: `.reviewer.toml` (provider, model); ignore list: `.rs-guardignore`.

## Doctor, excludesfile, herdr

```sh
pi-life doctor           # machine + cwd health; prints the resolved overlay
pi-life doctor ruby      # + checks ruby pack paths
```

`doctor` fails closed on missing `pi`/`bun` or missing mantra/tracker skill paths; warns on missing packs, `just`, `rs-guard`, `herdr`, and a missing/incomplete `git config --get core.excludesfile` (needs: `node_modules`, `.pi/agent-sessions/`, `.env`, `graphify-out/`, `.codegraph/`).

Herdr hosts parallel lives: `herdr agent start reviewer --kind pi -- pi-life ruby`. The `herdr` skill is allowlisted everywhere but no-ops unless `HERDR_ENV=1`.

## Troubleshooting

| Symptom | Meaning | Fix |
|---|---|---|
| exit 2, `missing required mantra …` | allowlisted skill path does not exist under `PI_SKILLS_HOME` (or `~/.agents/skills`) | create/symlink the skill dir, or set `PI_SKILLS_HOME` |
| exit 2, `invalid YAML` | profile or overlay failed the strict parser | fix the YAML; one format, one parser (`yaml` npm) |
| exit 2, `unknown life` / `not a life` | typo or `ecto`/`rails-python` | use `rust`, `elixir`, `ruby`, `python` (or alias) |
| `Unknown session` | resume/attach with an ID the local store doesn't know | start from the same repo/machine; `pi --list-sessions`; or just relaunch `pi-life <life>` |
| `Damage-Control: <tool> blocked` | the gate caught `git push`, `reset --hard`, `clean`, a protected path (`.env`, `auth.json`), or a write outside cwd | intended behavior; ask the user how to proceed — the turn continues |
| `Clarify gate: write/edit is blocked…` | the session hasn't accepted a prompt yet | run `/clarify` after landing the prompt you want |
| `chain … rs-guard failed (exit 2)` | rs-guard `REQUEST_CHANGES` on the diff | address the findings, commit, re-run the chain |
| write prompt missing on first boot | no UI (print/JSON mode) | boot TUI needs a terminal; run interactively once |

## Environment variables

| Var | Purpose |
|---|---|
| `PI_SKILLS_HOME` | skill root (default `~/.agents/skills`) |
| `MY_PI_AGENT_HOME` | harness root override (default: the directory containing `pi-life`) |
| `PI_TEAM` | active team in team mode |
| `PI_LIFE` | exported to children; agent/chain discovery uses it |
| `PI_OVERLAY` / `PI_OVERLAY_EXISTS` | launcher → extension overlay payload / first-launch skip flag |
| `HERDR_ENV` | set by Herdr; enables the `herdr` skill |
| `DEEPSEEK_API_KEY` | rs-guard provider key (env or `~/.config/rs-guard/env`) |

## Harness development

```sh
just smoke        # the proof: launches nothing, asserts argv invariants, ends with smoke-rails
bun test          # unit suites for extensions
just --list       # ext-* recipes for hacking on extensions standalone
```

Never add a `justfile` to a target repo. Harness config (profiles, overlays, damage-control rules, chains) is YAML — do not introduce TOML.
