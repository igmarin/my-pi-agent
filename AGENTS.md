# my-pi-agent — Project Rules

This repository is the **pi-life** harness: a TypeScript/Bun launcher for the Pi agent. It owns profiles, agent chains/teams, overlays, and safety extensions so that `pi-life <life>` can run from any target project without polluting it.

## Domain glossary

- **life** — a named runtime profile (`rust`, `elixir`, `ruby`, `python`) that selects packs, mantras, and model policy. Aliases: `phoenix` → `elixir`, `rails` / `rails-python` → `ruby`. `ecto` is not a life. GraphQL/REST are API packs, not lives.
- **profile** — a YAML file in `profiles/<life>.yaml` declaring pack allowlists, mantra skills, provider class, tracker, and model policy. Same YAML as overlays and damage-control rules.
- **pack** — a directory of skills under `~/.agents/skills`. Packs are loaded with `--no-skills` then `--skill <pack>`, never flattened.
- **mantra** — skills always loaded: `clarify`, `requirements-clarifier`, `i-have-adhd`, `ponytail`, `deslop`, `tdd`.
- **overlay** — per-repo `.pi/capabilities.yaml` that gates tools/prompts. Missing overlay ≡ all capabilities off.
- **capability** — an on/off flag in the overlay: `graphify`, `codegraph`, `serena`, `rs-guard`, `obscura`, `playwright`, plus optional skill paths.
- **chain** — a sequential pipeline of agents. Default: `plan-build-review`. Optional: `research-plan-build-review`. Mutually exclusive with `team` and `tilldone`.
- **team** — a dispatcher with parallel specialists (`planner`, `builder`, `reviewer`, `researcher`). Primary agent only dispatches; does not write files. Mutually exclusive with `chain` and `tilldone`.
- **damage-control-continue** — an extension that blocks dangerous tool calls and returns feedback without aborting the turn.
- **doctor** — a command that checks required and optional pieces and reports warnings vs. hard fails.
- **purpose-gate** — an extension that blocks prompts until a purpose is set, then appends it to the system prompt.

## Conventions

- TypeScript ESM. `package.json` has `"type": "module"`.
- Use `bun` for runtime and `just` for harness tasks only. Never add a `justfile` to a target repo.
- Pi extensions export `export default function (pi) { ... }` and use the Pi ExtensionAPI contract.
- Path resolution is **harness first, project override**: `profiles/<life>/...` then target repo `.pi/...` then `.claude/...`/`.gemini/...`/`.codex/...`.
- Configuration files must be valid. Invalid YAML or missing required binaries fail closed.
- Save is explicit, not implicit (boot TUI, overlay).

## Best practices

- **Clarify before build**: `clarify` and `requirements-clarifier` are in the mantra. Write/edit tools are blocked until the task is accepted; read-only research is allowed during clarification.
- **Fail closed, not silent**:
  - `rs-guard` exit 2 fails the chain.
  - Missing `pi` or `bun` is a hard fail for `doctor`.
  - Invalid overlay YAML fails launch.
- **No secrets in repo**: API keys, tokens, `auth.json`, `.env` must stay in environment or `~/.config/rs-guard/env`. Never commit them or read them from target repos.
- **Gate tools/prompts with overlays**: capabilities default off. Prompts and tools must check the resolved overlay before enabling.
- **Child agents inherit safety**: spawned chains, teams, and `/sub` agents load `damage-control-continue`. No destructive git operations (`push`, `reset --hard`, `git clean -fd`) and no reads of `auth.json` or `.env`.
- **Profiles, not flattened packs**: each `pi-life <life>` loads its own packs. Missing pack is a warning, not a crash.
- **Researcher is fetch-first**: use `web_search` / `read` and cited markdown artifacts. Browser tools (`obscura`, `playwright`) only when the corresponding capability is on.
- **Herdr is a host, not a feature**: `pi-life` is launched via `herdr agent start <name> --kind pi -- pi-life <life>`. Do not build a Pi extension that wraps Herdr in 0.1.0.
- **Doctor reports, not guesses**: distinguish hard fails (required launcher pieces) from warnings (optional packs/binaries).
- **README and smoke for every feature**: keep README short (ADHD-friendly bullets). Add a smoke test or `just` recipe that proves the feature without requiring private endpoints.
- **Update `CONTEXT.md`**: new domain terms or changed invariants must be added to the glossary.

## Security

- No API keys or tokens in source files.
- No hardcoded local endpoints in production paths.
- `damage-control-continue` default rules block `git push`, `git reset --hard`, `git clean -fd`, writes outside cwd, and reads of `**/.env` and `~/.pi/agent/auth.json`.
- Children cannot opt out of damage-control.

## Testing

- `bun install` and `just --list` must work after a clean clone.
- Smoke tests cover: purpose-gate, skill allowlist, damage-control push block, chain with and without `rs-guard`.
- Do not require tokengate or mlx for smoke tests.
