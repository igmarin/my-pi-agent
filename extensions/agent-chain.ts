/**
 * Agent Chain — run named, ordered agent pipelines (plan → build → review).
 *
 * ## Entry point
 *
 * This file exports `default function (pi: ExtensionAPI)` which registers the
 * `/chain` and `/chain-list` commands and the `run_chain` tool. Loaded via
 * `pi -e extensions/agent-chain.ts`. Not yet wired into `pi-life` mode dispatch
 * (mode `chain` still warns and uses the solo allowlist); the extension is
 * standalone so the primary session can drive a chain manually.
 *
 * ## Chain discovery
 *
 * Chains are YAML. One file per scope, `agent-chain.yaml`, containing named
 * chains under a `chains:` key. Precedence (first file that exists wins, so a
 * project can override the harness default without polluting the repo):
 *
 *   1. cwd `.pi/agents/agent-chain.yaml`      (project override)
 *   2. `profiles/<life>/agents/agent-chain.yaml`
 *   3. `profiles/agents/agent-chain.yaml`     (shared harness default)
 *
 * ## Schema
 *
 * ```yaml
 * chains:
 *   plan-build-review:
 *     description: Plan, build, then review.
 *     steps:
 *       - agent: planner
 *         task: "Plan: {task}"              # {task} = the original request,
 *       - agent: builder                    # {previous} = prior step output
 *         task: "Implement. {previous}"
 *       - agent: reviewer
 *         task: "Review. {previous}"
 * ```
 *
 * Every step needs an `agent`. `task` is a template; `{task}` and
 * `{previous}` are substituted before the step runs. A step without `task`
 * receives the original request verbatim.
 *
 * ## Execution
 *
 * Each step spawns a child `pi` via `subagentHelpers.runSingleAgent` (INV-skills
 * enforced by `buildChildArgv`). Steps run sequentially, fail-fast on the first
 * non-zero exit. Agents come from the same discovery as the subagent tool.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { parse as yamlParse } from "yaml";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { collectAgents, type AgentDef } from "./agentScan.ts";
import {
	type SingleResult,
	getFinalOutput,
	isFailedResult,
	resultOutput,
	resolveHarnessRoot,
	runSingleAgent,
} from "./subagentHelpers.ts";

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in agent-chain.test.ts)
// ---------------------------------------------------------------------------

export interface ChainStepDef {
	agent: string;
	task?: string;
}

export interface ChainDef {
	name: string;
	description: string;
	steps: ChainStepDef[];
}

export interface ChainFile {
	chains: Record<string, { description?: string; steps: unknown }>;
}

export class ChainError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ChainError";
	}
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return v != null && typeof v === "object" && !Array.isArray(v);
}

function strList(v: unknown): string {
	return typeof v === "string" ? v : "";
}

/** Parse the YAML text of an `agent-chain.yaml` into a map of chain defs. */
export function parseChainFile(text: string): Map<string, ChainDef> {
	let doc: unknown;
	try {
		doc = yamlParse(text);
	} catch (e) {
		throw new ChainError(`agent-chain: invalid YAML: ${e instanceof Error ? e.message : String(e)}`);
	}
	if (!isRecord(doc)) throw new ChainError("agent-chain: expected a mapping with a chains key");
	const raw = doc.chains;
	if (!isRecord(raw)) throw new ChainError("agent-chain: expected a mapping under 'chains'");
	const out = new Map<string, ChainDef>();
	for (const [name, body] of Object.entries(raw)) {
		if (!name) continue;
		if (!isRecord(body) || !Array.isArray(body.steps)) {
			throw new ChainError(`agent-chain: chain '${name}' needs a steps list`);
		}
		const steps: ChainStepDef[] = [];
		for (const [i, step] of body.steps.entries()) {
			if (!isRecord(step)) throw new ChainError(`agent-chain: chain '${name}' step ${i + 1} must be a mapping`);
			const agent = strList(step.agent);
			if (!agent) throw new ChainError(`agent-chain: chain '${name}' step ${i + 1} needs an 'agent' name`);
			const task = typeof step.task === "string" ? step.task : undefined;
			steps.push({ agent, task });
		}
		if (steps.length === 0) throw new ChainError(`agent-chain: chain '${name}' has no steps`);
		out.set(name, {
			name,
			description: strList(body.description) || `${name}: ${steps.map((s) => s.agent).join(" -> ")}`,
			steps,
		});
	}
	if (out.size === 0) throw new ChainError("agent-chain: no chains defined");
	return out;
}

/** Canonicalize a life alias; `undefined` when unset or invalid. */
export function chainLife(raw: string | undefined): string | undefined {
	if (!raw) return undefined;
	const k = raw.toLowerCase();
	if (k === "phoenix") return "elixir";
	if (k === "rails") return "ruby";
	if (k === "rust" || k === "elixir" || k === "ruby" || k === "python") return k;
	return undefined;
}

function harnessChainPath(extFileUrl: string, lifeRaw: string | null): { source: string; path: string }[] {
	const root = process.env.MY_PI_AGENT_HOME || join(dirname(fileURLToPath(extFileUrl)), "..");
	const life = chainLife(lifeRaw || undefined);
	const out: { source: string; path: string }[] = [];
	if (life) out.push({ source: `profiles/${life}/agents`, path: join(root, "profiles", life, "agents", "agent-chain.yaml") });
	out.push({ source: "profiles/agents", path: join(root, "profiles", "agents", "agent-chain.yaml") });
	return out;
}

/**
 * Resolve the chain file for the cwd. Project `.pi/agents` wins over the
 * harness so a repo can override the default; a repo without the file still
 * gets the harness default (no pollution requirement, issue #6).
 */
export function resolveChainFile(
	cwd: string,
	extFileUrl: string,
	life: string | undefined,
): { source: string; path: string } | null {
	const candidates: { source: string; path: string }[] = [
		{ source: ".pi/agents", path: join(cwd, ".pi", "agents", "agent-chain.yaml") },
		...harnessChainPath(extFileUrl, life || null),
	];
	for (const p of candidates) {
		if (existsSync(p.path)) return p;
	}
	return null;
}

/** Sub `{task}` and `{previous}` in a step's task template. */
export function renderStepTask(template: string | undefined, task: string, previous: string): string {
	if (!template) return task;
	return template.replace(/\{task\}/g, task).replace(/\{previous\}/g, previous);
}

export async function runChainSteps(
	chain: ChainDef,
	task: string,
	opts: {
		agents: AgentDef[];
		harnessRoot: string;
		cwd: string;
		signal?: AbortSignal;
		dispatchModel?: string;
		dispatchThinkingLevel?: string;
	},
): Promise<{ results: SingleResult[]; output: string }> {
	const results: SingleResult[] = [];
	let previous = "";
	for (let i = 0; i < chain.steps.length; i++) {
		const step = chain.steps[i];
		const stepTask = renderStepTask(step.task, task, previous);
		const r = await runSingleAgent({
			agents: opts.agents,
			agentName: step.agent,
			task: stepTask,
			step: i + 1,
			signal: opts.signal,
			defaultCwd: opts.cwd,
			harnessRoot: opts.harnessRoot,
			dispatchModel: opts.dispatchModel,
			dispatchThinkingLevel: opts.dispatchThinkingLevel,
		});
		results.push(r);
		if (isFailedResult(r)) {
			throw new ChainError(`chain ${chain.name} stopped at step ${i + 1} (${step.agent}): ${resultOutput(r)}`);
		}
		previous = getFinalOutput(r.messages) || previous;
	}
	return { results, output: previous };
}

function loadedChains(cwd: string): { source: string; chains: Map<string, ChainDef> } {
	const file = resolveChainFile(cwd, import.meta.url, process.env.PI_LIFE);
	if (!file) throw new ChainError("No agent-chain.yaml found in .pi/agents or profiles/agents");
	return { source: file.source, chains: parseChainFile(readFileSync(file.path, "utf8")) };
}

function selectChain(chains: Map<string, ChainDef>, raw: string): { name: string; task: string } {
	const first = raw.split(/\s+/)[0];
	if (chains.has(first)) return { name: first, task: raw.slice(first.length).trim() };
	const name = chains.has("plan-build-review") ? "plan-build-review" : (chains.keys().next().value as string);
	return { name, task: raw.trim() };
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("chain-list", {
		description: "List available agent chains (YAML: .pi/agents, profiles/<life>/agents, profiles/agents)",
		handler: async (_args, ctx) => {
			try {
				const { source, chains } = loadedChains(ctx.cwd);
				const lines = [...chains.values()].map((c) => `${c.name} — ${c.description}`);
				if (ctx.hasUI) ctx.ui.notify(`Chains (${source}):\n${lines.join("\n")}`, "info");
				else console.log(`[${source}] ${lines.join("\n")}`);
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				if (ctx.hasUI) ctx.ui.notify(msg, "error");
				else console.error(msg);
			}
		},
	});

	pi.registerCommand("chain", {
		description: "Run a named chain. Usage: /chain [name] <task>. Default chain: plan-build-review",
		handler: async (args, ctx) => {
			if (!args || !args.trim()) {
				if (ctx.hasUI) ctx.ui.notify("Usage: /chain [chain-name] <task>", "warning");
				return;
			}
			let chain: ChainDef;
			let task: string;
			try {
				const { chains } = loadedChains(ctx.cwd);
				const picked = selectChain(chains, args);
				chain = chains.get(picked.name)!;
				task = picked.task;
				if (!task) throw new ChainError(`Usage: /chain ${picked.name} <task>`);
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				if (ctx.hasUI) ctx.ui.notify(msg, "error");
				else console.error(msg);
				return;
			}
			if (ctx.hasUI) ctx.ui.notify(`Running chain ${chain.name} (${chain.steps.map((s) => s.agent).join(" -> ")})`, "info");
			const agents = collectAgents(ctx.cwd, import.meta.url);
			const harnessRoot = resolveHarnessRoot();
			const dispatchModel = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
			try {
				const { output } = await runChainSteps(chain, task, {
					agents,
					harnessRoot,
					cwd: ctx.cwd,
					dispatchModel,
					dispatchThinkingLevel: ctx.thinkingLevel as string | undefined,
				});
				pi.sendUserMessage(output || "(chain finished with no output)");
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				if (ctx.hasUI) ctx.ui.notify(msg, "error");
				else console.error(msg);
			}
		},
	});

	pi.registerTool({
		name: "run_chain",
		label: "Run chain",
		description: "Run a named agent chain from agent-chain.yaml (e.g. plan-build-review). Fail-fast on step error.",
		parameters: {
			type: "object",
			properties: {
				chain: { type: "string", description: "Chain name from agent-chain.yaml (default plan-build-review)" },
				task: { type: "string", description: "The request to run through the chain" },
			},
			required: ["task"],
		},
		async execute(_id, params, signal, _onUpdate, ctx) {
			const task = typeof params.task === "string" ? params.task.trim() : "";
			if (!task) return { content: [{ type: "text", text: "run_chain requires a non-empty task." }], isError: true };
			let chain: ChainDef;
			try {
				const { chains } = loadedChains(ctx.cwd);
				const wanted = typeof params.chain === "string" && params.chain ? params.chain : "plan-build-review";
				chain = chains.get(wanted)!;
				if (!chain) throw new ChainError(`No chain '${wanted}'. Available: ${[...chains.keys()].join(", ")}.`);
			} catch (e) {
				return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true };
			}
			const agents = collectAgents(ctx.cwd, import.meta.url);
			const harnessRoot = resolveHarnessRoot();
			const dispatchModel = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
			try {
				const { output } = await runChainSteps(chain, task, {
					agents,
					harnessRoot,
					cwd: ctx.cwd,
					signal,
					dispatchModel,
					dispatchThinkingLevel: ctx.thinkingLevel as string | undefined,
				});
				return {
					content: [{ type: "text", text: output || "(chain finished with no output)" }],
					details: { chain: chain.name, steps: chain.steps.map((s) => s.agent) },
				};
			} catch (e) {
				return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true };
			}
		},
	});
}
