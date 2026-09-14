# my-pi-agent how-to

Task-oriented guide: install, launch, configure, run chains and teams, troubleshoot.
Domain terms are in [CONTEXT.md](../CONTEXT.md); project rules in [AGENTS.md](../AGENTS.md).

## Install

```sh
git clone git@github.com:igmarin/my-pi-agent.git && cd my-pi-agent
npm i -g @earendil-works/pi-coding-agent   # the pi binary itself
just install          # bun install + symlink pi-life onto ~/.local/bin
git config core.hooksPath .githooks   # rs-guard pre-commit (or scripts/install-hooks.sh)
```

Skills: every allowlisted mantra/pack/tracker name resolves to a directory under `PI_SKILLS_HOME` (default `~/.agents/skills`). Install packs with dotskills, or drop/symlink any directory containing a `SKILL.md` in there. A missing allowlisted path exits 2 at launch — install your packs before the first `pi-life <life>`.

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

Mode exclusivity is structural: solo loads the status line, chain loads the chain extension, team loads the dispatcher, fusion loads the vendored multi-model extension — never more than one of them.

## Model fusion

```sh
# one-time per target repo: copy the template, then edit model:/thinking: per slot
# (pi-life is a symlink — readlink resolves it to the harness clone where stacks/ lives)
mkdir -p .pi/fusion-harness && cp "$(dirname "$(readlink "$(command -v pi-life)")")/../stacks/model-stack-trio.yaml" .pi/fusion-harness/
pi-life ruby fusion .pi/fusion-harness/model-stack-trio.yaml
```

Slot rules, validation, and the `/fh-*` commands: CONTEXT.md **Fusion**.

### Cognition (SWE) slots

Cognition's SWE models are served over an OpenAI-compatible endpoint but aren't a built-in Pi provider — register one in `~/.pi/agent/models.json`:

```json
{
  "providers": {
    "cognition": {
      "baseUrl": "https://api.cognition.ai/v1",
      "api": "openai-completions",
      "apiKey": "$COGNITION_API_KEY",
      "models": [{ "id": "swe-1.7", "name": "SWE 1.7", "contextWindow": 262144, "maxTokens": 32768 }]
    }
  }
}
```

`apiKey` interpolates `$VAR`/`${VAR}` from the environment (or a `!command`, or a literal — keep secrets out of the file per the secrets rule). Because it lives in `models.json`, the provider is visible to clean-room children (`pi --no-extensions --list-models`), which is what fusion's slot validation requires. `stacks/model-stack-cognition.yaml` is the copy template. Set `COGNITION_API_KEY` or put a literal in `models.json` — the launcher does not parse the stack for keys.

`https://api.cognition.ai/v1` is the conventional default, but Cognition provisions endpoints per customer — if a request 401s with a valid key, use the base URL from your Cognition onboarding (as `baseUrl` here, or `COGNITION_API_BASE` for LiteLLM-style tools). Sanity-check the key before touching the stack: `curl https://api.cognition.ai/v1/chat/completions -H "Authorization: Bearer $COGNITION_API_KEY" -d '{"model":"swe-1.7","messages":[{"role":"user","content":"hi"}],"max_tokens":20}'`.

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
- `models`/`thinking` roles: `solo` (primary `--model`/`--thinking`) and `planner`/`builder`/`reviewer`/`researcher` — chain/team/subagent children dispatch with the entry keyed on the **child's agent name**, falling back to the primary's current model when the agent has no entry. Profile-level `models:`/`thinking:` merge under the overlay's as defaults (overlay wins per role), so profile defaults reach children without repeating them in every project.
- Hand-edit freely; the launcher re-parses and re-validates every launch.

## Per-project agents, chains, teams

Discovery (first-wins on name): `profiles/<life>/agents/` → `profiles/agents/` → cwd `.pi/agents/` → cwd `.claude/.gemini/.codex` → `$HOME/.claude/.gemini/.codex`.

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

## Shared memory (`/remember`, `/recall`)

Every mode loads `extensions/memory.ts`. Memory is plain files on this machine, outside any repo, so Devin/Cline/Grok/Codex can read and write the same store:

```
${PI_MEMORY_HOME:-${PI_SKILLS_HOME%/*}/memory}   # default ~/.agents/memory
└── <project-id>/                                # github.com-owner-repo (git remote), else toplevel/cwd basename
    ├── memory.md                                # durable notes: "- YYYY-MM-DD note"
    └── sessions/<ts>-<life>[-<herdr-scope>].md  # append-only per-session journal
```

- `remember` tool / `/remember <note>` — append a dated bullet to `memory.md`.
- `/session-note <note>` — append to this session's journal.
- `/recall` — print `memory.md` and the most recent journals.
- On launch, `memory.md` plus the 3 newest journals are appended to the system prompt as `<memory>` (capped at 24 KiB). Missing store = empty memory; launch never fails on memory.
- Chain/team/subagent children get the same block **read-only** inside their task — only the primary writes. Parallel Herdr panes are separate primaries: their journals stay race-free via the `-<herdr-scope>` filename suffix, and `memory.md` notes are small single-line appends (atomic on local filesystems; not guaranteed for concurrent writers on NFS).
- **Herdr scoping**: with `HERDR_ENV=1`, journal names gain `-<workspace-id>-<pane-id>` from Herdr's `HERDR_WORKSPACE_ID`/`HERDR_PANE_ID` env vars (fallback `-herdr`). Nothing shells out to `herdr`.
- Keep the store out of git. If you ever point `PI_MEMORY_HOME` inside a repo, add that path to `.gitignore` or your excludesfile.

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

`doctor` fails closed on missing `pi`/`bun` or missing mantra/tracker skill paths; warns on missing packs, `just`, `rs-guard`, `ocr` (or `npx` to run it on demand), `herdr`, an absent memory root (`~/.agents/memory`, created on first `/remember`), and a missing/incomplete `git config --get core.excludesfile` (needs: `node_modules`, `.pi/agent-sessions/`, `.env`, `graphify-out/`, `.codegraph/`).

Herdr hosts parallel lives: `herdr agent start reviewer --kind pi -- pi-life ruby`. The `herdr` skill is allowlisted everywhere but no-ops unless `HERDR_ENV=1`.

## Troubleshooting

| Symptom | Meaning | Fix |
|---|---|---|
| exit 2, `missing required mantra …` | allowlisted skill path does not exist under `PI_SKILLS_HOME` (or `~/.agents/skills`) | create/symlink the skill dir, or set `PI_SKILLS_HOME` |
| exit 2, `invalid YAML` | profile or overlay failed the strict parser | fix the YAML; one format, one parser (`yaml` npm) |
| exit 2, `unknown key(s): …` | overlay has a key the parser doesn't know (e.g. a removed capability) | delete the key from `.pi/capabilities.yaml` |
| exit 2, `invalid skill identity manifest` / `missing installed skill` | `.dotskills-manifest.json` is corrupt or an installed skill dir was removed | reinstall the pack with dotskills, or remove the manifest to fall back to plain dirs |
| exit 2, `unknown life` / `not a life` | typo or `ecto`/`rails-python` | use `rust`, `elixir`, `ruby`, `python` (or alias) |
| `Unknown session` | resume/attach with an ID the local store doesn't know | start from the same repo/machine; `pi --list-sessions`; or just relaunch `pi-life <life>` |
| `Damage-Control: <tool> blocked` | the gate caught `git push`, `reset --hard`, `clean`, a protected path (`.env`, `auth.json`), or a write outside cwd | intended behavior; ask the user how to proceed — the turn continues |
| `Clarify gate: write/edit is blocked…` | the session hasn't accepted a prompt yet | run `/clarify` after landing the prompt you want |
| `chain … rs-guard failed (exit 2)` | rs-guard `REQUEST_CHANGES` on the diff | address the findings, commit, re-run the chain |
| `rs-guard: Error occurred (exit 1)` / `Request timed out` | the review provider's API is unreachable — a transport failure, not a verdict | retry; bypass with `git commit --no-verify` while the provider is down |
| `401: incorrect_api_key` when the agent speaks | the configured pi model's key is wrong or absent | `/model` to a working provider, or fix the key in pi's config |
| write prompt missing on first boot | no UI (print/JSON mode) | boot TUI needs a terminal; run interactively once |

## Environment variables

| Var | Purpose |
|---|---|
| `PI_SKILLS_HOME` | skill root (default `~/.agents/skills`) |
| `PI_MEMORY_HOME` | shared memory root (default `<skills-root>/../memory`, i.e. `~/.agents/memory`) |
| `MY_PI_AGENT_HOME` | harness root override (default: the directory containing `pi-life`) |
| `PI_TEAM` | active team in team mode |
| `PI_LIFE` | exported to children; agent/chain discovery uses it |
| `PI_OVERLAY` / `PI_OVERLAY_EXISTS` | launcher → extension overlay payload / first-launch skip flag |
| `HERDR_ENV` | set by Herdr; enables the `herdr` skill and Herdr-scoped memory journals (`HERDR_WORKSPACE_ID`/`HERDR_PANE_ID`) |
| `DEEPSEEK_API_KEY` | rs-guard provider key (env or `~/.config/rs-guard/env`) |
| `COGNITION_API_KEY` | Cognition SWE endpoint key for fusion stacks (`models.json` interpolates `$COGNITION_API_KEY`) |

## Harness development

```sh
just smoke        # the proof: launches nothing, asserts argv invariants, ends with smoke-rails
bun test          # unit suites for extensions
just test-dotskills  # manual e2e: real dotskills install -> pack resolution (needs a dotskills checkout)
just --list       # ext-* recipes for hacking on extensions standalone
```

Never add a `justfile` to a target repo. Harness config (profiles, overlays, damage-control rules, chains) is YAML — do not introduce TOML.
