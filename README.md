# my-pi-agent

Personal [Pi](https://github.com/mariozechner/pi-coding-agent) harness. Glossary: [CONTEXT.md](CONTEXT.md).

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
pi-life doctor             # stub until #13
```

Aliases: `rails` → `ruby`, `phoenix` → `elixir`. `ecto` and `rails-python` are not lives.

`pi-life` loads `profiles/<life>.yaml`, then execs `pi -e extensions/damage-control-continue.ts --no-skills` plus allowlisted `--skill`. Invalid YAML, a missing mantra path, or a missing configured tracker path exits 2. Omit tracker = no tracker. Missing packs warn. `chain`/`team` use the solo allowlist until #6/#8. Blocked `git push` / `reset --hard` / `clean -fd` / `.env` / `auth.json` / writes outside cwd return feedback; the turn continues.

```text
just install
```

## Harness dev

```text
bun install
just smoke
just ext-purpose-gate   # purpose widget + context meter
just ext-minimal        # model + 10-block context meter
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
