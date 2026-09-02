# my-pi-agent — Project Rules

This repo is the **pi-life** harness. Host is Pi. Run `pi-life` from the **target repo**.

Pointers (load when the branch fires):

- `CONTEXT.md` — glossary (life, profile, mantra, overlay, tracker, chain, team)
- `README.md` — launch, install, rs-guard hook/CI
- `.github/review-prompt.md` — rs-guard axes, severity, verdict metadata

## Shipped

- Lives: `rust` | `elixir` | `ruby` | `python`. Aliases: `phoenix` → `elixir`, `rails` → `ruby`. `ecto` and `rails-python` exit 2 (`use ruby or python`).
- Profiles: YAML at `profiles/<life>.yaml`. Launch is `pi --no-skills` then `--skill` for each allowlisted mantra, pack, and tracker (INV-skills).
- Fail closed (exit 2): invalid YAML; missing mantra path; missing path for a **configured** tracker. `tracker: none` or omitting tracker (elixir) loads no tracker skill. Missing packs warn and still launch.
- `chain` / `team` print “not wired yet (#6/#8)” and use the solo allowlist. `doctor` is a stub (exit 2, #13).
- `python` is pandas/FastAPI, not a Rails companion. GraphQL/REST are API packs, not lives.
- Extensions: `export default function (pi)`. Skip `ctx.ui` when `!ctx.hasUI`. Stacked `-e`: first extension wins the theme.
- Config for profiles/overlays/damage-control is YAML. Do not add TOML for those files. `yaml` npm is the parser.
- Skills live under `PI_SKILLS_HOME` or `~/.agents/skills`. Do not vendor packs into this repo.
- Harness tasks: `bun` + `just`. Never add a `justfile` to a target repo. Proof: `just smoke` (no tokengate, no mlx).
- Herdr is a host: `herdr agent start <name> --kind pi -- pi-life <life>`. Do not wrap Herdr in a Pi extension.
- Ponytail: shortest working code. `ponytail-review` the staged diff before every push; cut findings first.
- Secrets stay in the environment or `~/.config/rs-guard/env`. Never commit keys, `auth.json`, or `.env`, and never read them from a target repo.

## rs-guard

rs-guard 1.8.3 reviews **staged** files on commit (`.githooks/pre-commit`) and every non-draft PR (`.github/workflows/rs-guard-review.yml`). It auto-loads this file as project rules (`project_rules_enabled`). Prompt: `.github/review-prompt.md`. Ignore: `.rs-guardignore` (includes `graphify-out/`).

Pre-commit: `REQUEST_CHANGES` is exit 2 and **aborts the commit**. `[Critical]` / `[Security]` / `NEGATIVE` must block. `[Important]` below the threshold is COMMENT, not a merge gate. Bypass: `git commit --no-verify`.

Provider: DeepSeek (`DEEPSEEK_API_KEY`). Prefer `deepseek-v4-flash` for local reviews.

## Not shipped — do not implement or review as if present

Overlay merge (#11), doctor (#13), damage-control-continue (#3), chain (#6), team (#8), boot TUI / model policy (#15). `provider_class` and `models` in profiles are placeholders until #15.

## Docs

Changed launch invariants or new domain terms → update `CONTEXT.md`, keep `README.md` short, extend `just smoke`.
