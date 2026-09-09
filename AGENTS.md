# my-pi-agent — Project Rules

This repo is the **pi-life** harness. Host is Pi. Run `pi-life` from the **target repo**.

Pointers (load when the branch fires):

- `CONTEXT.md` — glossary (life, profile, mantra, overlay, tracker, chain, team)
- `README.md` — launch, install, rs-guard hook/CI
- `.github/review-prompt.md` — rs-guard axes, severity, verdict metadata

## Shipped

- Lives: `rust` | `elixir` | `ruby` | `python`. Aliases: `phoenix` → `elixir`, `rails` → `ruby`. `ecto` and `rails-python` exit 2 (`use ruby or python`).
- Profiles: YAML at `profiles/<life>.yaml`. Launch is `pi -e extensions/damage-control-continue.ts --no-skills` then `--skill` for each allowlisted mantra, pack, and tracker (INV-skills).
- Fail closed (exit 2): invalid YAML; missing mantra path; missing path for a **configured** tracker. `tracker: none` or omitting tracker (elixir) loads no tracker skill. Missing packs warn and still launch.
- `chain` loads `extensions/agent-chain.ts` (`/chain`, `/chain-list`, `run_chain`) on top of the solo allowlist. `team` loads `extensions/agent-team.ts`: dispatcher-only primary (`dispatch_agent` as the only tool), teams defined under the `teams:` key of `agent-chain.yaml` (default: planner, builder, reviewer, researcher). `pi-life doctor [life]` checks required launcher pieces (`pi`, `bun`) and required mantra/tracker skill paths fail-closed, warns on optional gaps (packs, `just`, `rs-guard`, `herdr`, excludesfile), and prints the resolved overlay.
- `python` is pandas/FastAPI, not a Rails companion. GraphQL/REST are API packs, not lives.
- Extensions: `export default function (pi)`. Skip `ctx.ui` when `!ctx.hasUI`. Stacked `-e`: first extension wins the theme. `cross-agent` / `system-select` live under `extensions/` but are not passed by `pi-life` yet. Agent search: `profiles/<life>/agents/` (YAML), shared `profiles/agents/`, cwd `.pi/agents/`, then `.claude/.gemini/.codex`. First-wins on name. Alias `rails` → `ruby`.
- Config for profiles/overlays/damage-control is YAML. Do not add TOML for those files. `yaml` npm is the parser.
- Skills live under `PI_SKILLS_HOME` or `~/.agents/skills`. Do not vendor packs into this repo.
- Harness tasks: `bun` + `just`. Never add a `justfile` to a target repo. Proof: `just smoke` (no tokengate, no mlx).
- Herdr is a host: `herdr agent start <name> --kind pi -- pi-life <life>`. Do not wrap Herdr in a Pi extension.
- Boot config: first launch with no `.pi/capabilities.yaml` runs the `extensions/boot-config.ts` wizard (skips when `PI_OVERLAY_EXISTS=1` or no UI). Overlay `models.solo`/`thinking.solo` override profile `models:`/`thinking:` defaults into `pi --model`/`--thinking`.
- Ponytail: shortest working code. `ponytail-review` the staged diff before every push; cut findings first.
- Secrets stay in the environment or `~/.config/rs-guard/env`. Never commit keys, `auth.json`, or `.env`, and never read them from a target repo.

## rs-guard

rs-guard 1.8.3 reviews **staged** files on commit (`.githooks/pre-commit`) and every non-draft PR (`.github/workflows/rs-guard-review.yml`). It auto-loads this file as project rules (`project_rules_enabled`). Prompt: `.github/review-prompt.md`. Ignore: `.rs-guardignore` (includes `graphify-out/`).

Pre-commit: `REQUEST_CHANGES` is exit 2 and **aborts the commit**. `[Critical]` / `[Security]` / `NEGATIVE` must block. `[Important]` below the threshold is COMMENT, not a merge gate. Bypass: `git commit --no-verify`.

Provider: DeepSeek (`DEEPSEEK_API_KEY`). Prefer `deepseek-v4-flash` for local reviews.

## Not shipped — do not implement or review as if present

Overlay merge (#11), per-role child dispatch (only `solo` drives `--model`/`--thinking`).

## Docs

Changed launch invariants or new domain terms → update `CONTEXT.md`, keep `README.md` short, extend `just smoke`.
