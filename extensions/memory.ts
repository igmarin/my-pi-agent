/**
 * Memory — glue for the shared plain-file memory store (see memoryHelpers.ts).
 *
 * before_agent_start: appends `<memory>` (memory.md + recent session journals)
 * to the system prompt. Fail-open: a missing store is empty memory, never a
 * launch failure. Store root: PI_MEMORY_HOME, else <PI_SKILLS_HOME>/../memory,
 * else ~/.agents/memory. Other CLIs read/write the same markdown files.
 *
 * `remember` tool + /remember  → append a durable note to memory.md
 * /recall                       → print memory.md and recent journals
 * /session-note                 → append to this session's journal
 *
 * Only the primary session writes; chain/team/subagent children receive the
 * store read-only via buildChildArgv (no concurrent writers under Herdr).
 *
 * Usage: pi -e extensions/memory.ts
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	appendDurableNote,
	appendJournal,
	loadMemoryContext,
	memoryPaths,
	projectId,
	resolveMemoryRoot,
	sessionJournalPath,
	sessionScope,
} from "./memoryHelpers.ts";

export default function (pi: ExtensionAPI) {
	const startedAt = new Date();
	let root = "";
	let project = "";
	let journalFile = "";

	function locate(cwd: string): void {
		if (project) return;
		root = resolveMemoryRoot(process.env);
		project = projectId(cwd).id;
		journalFile = sessionJournalPath(root, project, {
			at: startedAt,
			life: process.env.PI_LIFE,
			scope: sessionScope(process.env),
		});
	}

	function safe<T>(fn: () => T, fallback: T): T {
		try {
			return fn();
		} catch {
			return fallback;
		}
	}

	function memoryFile(): string {
		return memoryPaths(root, project).memoryFile;
	}

	pi.on("before_agent_start", async (event, ctx) => {
		const section = safe(() => {
			locate(ctx.cwd);
			return loadMemoryContext({ root, project }).section;
		}, "");
		if (!section) return;
		return { systemPrompt: `${event.systemPrompt}\n\n${section}` };
	});

	pi.registerTool({
		name: "remember",
		label: "Remember",
		description:
			"Append a durable note to the project's shared memory (memory.md). Use for facts that should survive this session and be visible to other CLIs.",
		parameters: {
			type: "object",
			properties: { note: { type: "string", description: "One-line fact to remember" } },
			required: ["note"],
		},
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const note = typeof params.note === "string" ? params.note.trim() : "";
			if (!note) return { content: [{ type: "text", text: "remember requires a non-empty note." }], isError: true };
			try {
				locate(ctx.cwd);
				appendDurableNote(memoryFile(), note);
				return { content: [{ type: "text", text: `Remembered in ${memoryFile()}` }] };
			} catch (e) {
				return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true };
			}
		},
	});

	pi.registerCommand("remember", {
		description: "Append a durable note to shared memory (memory.md)",
		handler: async (args, ctx) => {
			const note = args?.trim() ?? "";
			if (!ctx.hasUI) return;
			if (!note) return ctx.ui.notify("Usage: /remember <note>", "warning");
			try {
				locate(ctx.cwd);
				appendDurableNote(memoryFile(), note);
				ctx.ui.notify(`Remembered → ${memoryFile()}`, "success");
			} catch (e) {
				ctx.ui.notify(e instanceof Error ? e.message : String(e), "error");
			}
		},
	});

	pi.registerCommand("session-note", {
		description: "Append a note to this session's journal",
		handler: async (args, ctx) => {
			const note = args?.trim() ?? "";
			if (!ctx.hasUI) return;
			if (!note) return ctx.ui.notify("Usage: /session-note <note>", "warning");
			try {
				locate(ctx.cwd);
				appendJournal(journalFile, note, new Date(), { life: process.env.PI_LIFE, project });
				ctx.ui.notify(`Journaled → ${journalFile}`, "success");
			} catch (e) {
				ctx.ui.notify(e instanceof Error ? e.message : String(e), "error");
			}
		},
	});

	pi.registerCommand("recall", {
		description: "Show shared memory and recent session journals",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) return;
			const mem = safe(() => {
				locate(ctx.cwd);
				return loadMemoryContext({ root, project });
			}, null);
			if (!mem || !mem.section) return ctx.ui.notify(`No memory yet for ${project || "this project"} (${root})`, "info");
			const journals = mem.journals.map((j) => `## ${j.name}\n${j.content.trim()}`).join("\n\n");
			ctx.ui.notify([`# ${mem.paths.memoryFile}`, mem.memory.trim(), journals].filter(Boolean).join("\n\n"), "info");
		},
	});
}
