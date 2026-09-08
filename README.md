# my-pi-agent

Personal [Pi](https://github.com/earendil-works/pi) harness. Glossary: [CONTEXT.md](CONTEXT.md).

## Launch

From the **target repo**, not this one:

```text
pi-life ruby               # Rails packs
pi-life ruby chain
pi-life ruby team
pi-life python             # mantra only (pandas / FastAPI)
pi-life elixir             # Elixir/Phoenix (no github-issue)
pi-life rust
pi-life --dry-run ruby     # print pi argv
pi-life doctor             # machine + cwd overlay health
pi-life doctor ruby         # same, plus ruby pack checks
```

Aliases: `rails` → `ruby`, `phoenix` → `elixir`. `ecto` and `rails-python` are not lives.

`pi-life` loads `profiles/<life>.yaml`, then execs `pi -e extensions/damage-control-continue.ts --no-skills` plus allowlisted `--skill`. Invalid YAML, a missing mantra path, or a missing configured tracker path exits 2. Omit tracker = no tracker. Missing packs warn. Team mode additionally loads `extensions/agent-team.ts`: the primary is a dispatcher with `dispatch_agent` as its only tool (children inherit the damage-control gate); team definitions live under the `teams:` key of `agent-chain.yaml`. Chain mode is accepted but not wired — load `extensions/agent-chain.ts` manually for `/chain`. Blocked `git push` / `reset --hard` / `clean -fd` / `.env` / `auth.json` / writes outside cwd return feedback; the turn continues.

### First launch (boot config)

On the first `pi-life` launch in a target repo — when `.pi/capabilities.yaml` does not exist — a wizard walks you through the six capability toggles (graphify, codegraph, serena, rs-guard, obscura, playwright) and optional per-role model/thinking defaults, then writes the overlay only if you confirm. Existing file → the wizard is skipped. Later launches pass the overlay's solo `models`/`thinking` into `pi --model/--thinking`; `profiles/<life>.yaml` may carry optional `models:`/`thinking:` defaults that the overlay overrides. See CONTEXT.md (**Boot Config**, **Role**).

### Rails-repo smoke

`just smoke` ends with `just smoke-rails`: it runs `pi-life --dry-run ruby` from a Rails repo and asserts the ruby pack argv. Pass a repo explicitly (`just smoke-rails ~/path/to/app` — a path without a `Gemfile` fails loudly with exit 1); without an argument it auto-discovers a `Gemfile` containing `gem "rails"` under `~/Developer` and, when nothing is found, falls back to a synthetic Rails fixture — so the default run is never a manual step and never a hard fail.

```text
just install
```

## Herdr (host)

Herdr is the host for parallel work: workspaces, panes, `herdr worktree`, and `herdr agent start --kind pi`. Herdr launches `pi-life` itself; the harness never wraps Herdr in a Pi extension. Example: `herdr agent start reviewer --kind pi -- pi-life ruby`.

The `herdr` skill is on the mantra allowlist of every life. It no-ops unless `HERDR_ENV=1`, so a plain terminal is unaffected. `pi-life doctor` warns (never fails) when `herdr` is not on PATH. Prefer `herdr worktree` when already inside Herdr; `stacked-pr-worktree-workflow` stays for gh-stack PR topology.

## Harness dev

```text
bun install
just smoke
just ext-purpose-gate   # purpose widget + context meter
just ext-minimal        # model + 10-block context meter
just ext-cross-agent    # .claude/.gemini/.codex commands
just ext-system-select  # /system persona from discovered agents (profiles, .pi, .claude/.gemini/.codex)
just ext-damage-control # continue-variant safety rules
```

## AI code review

This repository uses [rs-guard](https://github.com/nebulaideas/rs-guard) for automated code review, both as a pre-commit hook and as a GitHub Actions workflow on pull requests.

### Pre-commit hook

The hook is in `.githooks/pre-commit`. Activate it for this clone:

```sh
git config core.hooksPath .githooks
```

Or use the helper script:

```sh
./scripts/install-hooks.sh
```

Requirements:

- `rs-guard` 1.8.3 installed (`cargo install rs-guard --locked --version 1.8.3`)
- An API key exported (e.g. `DEEPSEEK_API_KEY`) or in `~/.config/rs-guard/env`

Bypass the hook when needed:

```sh
git commit --no-verify
```

### CI / GitHub Actions

The workflow `.github/workflows/rs-guard-review.yml` runs on every non-draft pull request. It requires a `DEEPSEEK_API_KEY` repository secret and publishes a GitHub Check Run.

> **Note:** `pull_request` workflows do not receive secrets from forks. Reviews run only for PRs from branches in this repo or for trusted collaborators.

## Configuration

- `CONTEXT.md` — domain glossary (lives, overlay, mantra).
- `AGENTS.md` — project rules; auto-loaded by rs-guard as supplemental context.
- `.github/review-prompt.md` — the review prompt used by both local and CI runs.
- `.reviewer.toml` — rs-guard configuration (provider, model, timeout).
- `.rs-guardignore` — paths excluded from review diffs.

Harness profiles and project overlays are **YAML** (same parser as damage-control rules). See CONTEXT.md.
