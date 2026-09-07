/**
 * Subagent Tool — delegate tasks to specialized agents with isolated context.
 *
 * Modes: single (agent+task), parallel (tasks[]), chain (chain[] with {previous}).
 * Children spawn `pi` in JSON mode and ALWAYS inherit
 * `-e <harness>/extensions/damage-control-continue.ts` (INV-skills). The argv
 * builder in `subagentHelpers.ts` enforces this — no caller can spawn a child
 * without it.
 *
 * Discovery reuses the harness's agentScan order:
 * profiles/<life>/agents/ → profiles/agents/ → cwd .pi/agents/ (first-wins).
 * The upstream user-vs-project trust prompt is dropped: this harness has no
 * such split — the harness itself is the project.
 *
 * The pure helpers and child-process plumbing live in `subagentHelpers.ts` so
 * the JSON-line parser, argv builder, and concurrency limiter can be exercised
 * by `bun test extensions/subagent.test.ts` without booting the `pi` host.
 *
 * Usage: pi -e extensions/subagent.ts
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { collectAgents } from "./agentScan.ts";
import {
	MAX_PARALLEL_TASKS,
	MAX_CONCURRENCY,
	type SingleResult,
	type SubagentDetails,
	aggregateUsage,
	formatUsageStats,
	getFinalOutput,
	isFailedResult,
	mapWithConcurrencyLimit,
	resolveHarnessRoot,
	resultOutput,
	runSingleAgent,
	truncateParallelOutput,
} from "./subagentHelpers.ts";

const parameters = {
	type: "object",
	properties: {
		agent: { type: "string", description: "Name of the agent to invoke (single mode)" },
		task: { type: "string", description: "Task to delegate (single mode)" },
		tasks: {
			type: "array",
			description: "Parallel tasks: [{ agent, task, cwd? }]",
			items: {
				type: "object",
				properties: { agent: { type: "string" }, task: { type: "string" }, cwd: { type: "string" } },
				required: ["agent", "task"],
			},
		},
		chain: {
			type: "array",
			description: "Sequential chain: [{ agent, task, cwd? }]. {previous} → prior step output. Fail-fast.",
			items: {
				type: "object",
				properties: { agent: { type: "string" }, task: { type: "string" }, cwd: { type: "string" } },
				required: ["agent", "task"],
			},
		},
		cwd: { type: "string", description: "Working directory (single mode)" },
	},
} as const;

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "subagent",
		label: "Subagent",
		description: [
			"Delegate tasks to specialized subagents with isolated context.",
			"Modes: single (agent + task), parallel (tasks[]), chain (chain[] with {previous} placeholder).",
			"Discovery: profiles/<life>/agents/ → profiles/agents/ → cwd .pi/agents/ (first-wins).",
			"Children inherit -e damage-control-continue.ts so the safety gate is never bypassed.",
		].join(" "),
		parameters,

		async execute(_id, params, signal, _onUpdate, ctx) {
			const agents = collectAgents(ctx.cwd, import.meta.url);
			const harnessRoot = resolveHarnessRoot();
			const dispatchModel = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
			const dispatchThinkingLevel = ctx.thinkingLevel as string | undefined;

			const hasChain = (params.chain?.length ?? 0) > 0;
			const hasTasks = (params.tasks?.length ?? 0) > 0;
			const hasSingle = Boolean(params.agent && params.task);
			const modeCount = Number(hasChain) + Number(hasTasks) + Number(hasSingle);

			const makeDetails = (
				mode: "single" | "parallel" | "chain",
				results: SingleResult[],
			): SubagentDetails => ({ mode, results });

			if (modeCount !== 1) {
				const available = agents.map((a) => a.name).join(", ") || "none";
				return {
					content: [
						{ type: "text", text: `Invalid parameters. Provide exactly one mode. Available agents: ${available}` },
					],
					details: makeDetails("single", []),
				};
			}

			// Defensive: keep this so a future caller can ask "did the child argv
			// get the right harness root?" without re-deriving it. The argv
			// builder is the single source of truth — see buildChildArgv tests.
			void buildChildArgv;

			// The argv builder in subagentHelpers.ts is the single source of truth
			// for the child spawn surface — see buildChildArgv tests.

			const run = (name: string, task: string, cwd: string | undefined, step?: number) =>
				runSingleAgent({
					agents,
					agentName: name,
					task,
					cwd,
					step,
					signal,
					defaultCwd: ctx.cwd,
					harnessRoot,
					dispatchModel,
					dispatchThinkingLevel,
				});

			// chain
			if (params.chain && params.chain.length > 0) {
				const results: SingleResult[] = [];
				let previousOutput = "";
				for (let i = 0; i < params.chain.length; i++) {
					const step = params.chain[i];
					const task = step.task.replace(/\{previous\}/g, previousOutput);
					const r = await run(step.agent, task, step.cwd, i + 1);
					results.push(r);
					if (isFailedResult(r)) {
						return {
							content: [
								{
									type: "text",
									text: `Chain stopped at step ${i + 1} (${step.agent}): ${resultOutput(r)}`,
								},
							],
							details: makeDetails("chain", results),
							isError: true,
						};
					}
					previousOutput = getFinalOutput(r.messages);
				}
				const last = results[results.length - 1];
				return {
					content: [{ type: "text", text: getFinalOutput(last.messages) || "(no output)" }],
					details: makeDetails("chain", results),
				};
			}

			// parallel
			if (params.tasks && params.tasks.length > 0) {
				if (params.tasks.length > MAX_PARALLEL_TASKS) {
					return {
						content: [
							{
								type: "text",
								text: `Too many parallel tasks (${params.tasks.length}). Max is ${MAX_PARALLEL_TASKS}.`,
							},
						],
						details: makeDetails("parallel", []),
					};
				}
				const results = await mapWithConcurrencyLimit(params.tasks, MAX_CONCURRENCY, (t) =>
					run(t.agent, t.task, t.cwd),
				);
				const success = results.filter((r) => !isFailedResult(r)).length;
				const summaries = results.map((r) => {
					const status = isFailedResult(r)
						? `failed${r.stopReason && r.stopReason !== "end" ? ` (${r.stopReason})` : ""}`
						: "completed";
					return `### [${r.agent}] ${status}\n\n${truncateParallelOutput(resultOutput(r))}`;
				});
				const totalUsage = formatUsageStats(aggregateUsage(results));
				const tail = totalUsage ? `\n\nTotal: ${totalUsage}` : "";
				return {
					content: [
						{
							type: "text",
							text: `Parallel: ${success}/${results.length} succeeded\n\n${summaries.join("\n\n---\n\n")}${tail}`,
						},
					],
					details: makeDetails("parallel", results),
				};
			}

			// single
			if (params.agent && params.task) {
				const r = await run(params.agent, params.task, params.cwd);
				if (isFailedResult(r)) {
					return {
						content: [{ type: "text", text: `Agent ${r.stopReason || "failed"}: ${resultOutput(r)}` }],
						details: makeDetails("single", [r]),
						isError: true,
					};
				}
				return {
					content: [{ type: "text", text: getFinalOutput(r.messages) || "(no output)" }],
					details: makeDetails("single", [r]),
				};
			}

			return {
				content: [{ type: "text", text: "Invalid parameters." }],
				details: makeDetails("single", []),
			};
		},
	});
}
