/**
 * Memory helpers — pure path/format logic plus tiny file I/O for the shared
 * memory store. Kept separate from `memory.ts` so `bun test` can exercise the
 * store without booting the `pi` host (same split as subagentHelpers.ts).
 *
 * Store layout (plain files, readable by any CLI):
 *   <root>/<project-id>/memory.md                       durable notes
 *   <root>/<project-id>/sessions/<ts>-<life>[-<scope>].md  append-only journals
 *   <root>/<project-id>/summaries/<ts>-<life>.md         chain/session summaries
 *   <root>/<project-id>/index.yaml                      machine index (YAML)
 *
 * Human-facing files are markdown; the only config/index file is YAML.
 * Reads fail open (missing = empty). Never shells out to Herdr: scope comes
 * from Herdr's exported env vars only.
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parse, stringify } from "yaml";
import type { Overlay } from "./capabilities.ts";

export type Env = Record<string, string | undefined>;

export const DEFAULT_RECENT_JOURNALS = 3;
export const DEFAULT_MAX_SECTION_BYTES = 24 * 1024;

export function resolveMemoryRoot(env: Env = process.env): string {
	if (env.PI_MEMORY_HOME) return env.PI_MEMORY_HOME;
	if (env.PI_SKILLS_HOME) return join(dirname(env.PI_SKILLS_HOME), "memory");
	return join(env.HOME ?? "", ".agents", "memory");
}

/** rs-nightshift artifact sink: RS_NIGHTSHIFT_HOME when set, else the memory root. */
export function resolveSummarySink(env: Env = process.env): string {
	return env.RS_NIGHTSHIFT_HOME || resolveMemoryRoot(env);
}

export function sanitizeSegment(raw: string): string {
	const s = raw.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
	return !s || /^\.+$/.test(s) ? "unknown" : s;
}

export interface ProjectIdInput {
	remoteUrl?: string;
	toplevel?: string;
	cwd: string;
}

function normalizeRemote(url: string): string | undefined {
	let s = url.trim();
	if (!s) return undefined;
	s = s.replace(/\.git\/?$/, "").replace(/\/+$/, "");
	const scp = s.match(/^(?:[\w.-]+@)?([\w.-]+):(.+)$/);
	if (scp && !s.includes("://")) return `${scp[1]}/${scp[2]}`;
	const full = s.match(/^[a-z+]+:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/i);
	if (full) return `${full[1]}/${full[2]}`;
	return s;
}

/** Stable project id: remote URL → git toplevel basename → cwd basename. Pure. */
export function projectIdFrom(input: ProjectIdInput): string {
	const remote = input.remoteUrl ? normalizeRemote(input.remoteUrl) : undefined;
	if (remote) return sanitizeSegment(remote);
	if (input.toplevel) return sanitizeSegment(basename(input.toplevel));
	return sanitizeSegment(basename(input.cwd));
}

function git(cwd: string, args: string[]): string | undefined {
	try {
		return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined;
	} catch {
		return undefined;
	}
}

export interface ProjectInfo {
	id: string;
	remoteUrl?: string;
	toplevel?: string;
}

export function projectId(cwd: string): ProjectInfo {
	const remoteUrl = git(cwd, ["remote", "get-url", "origin"]);
	const toplevel = git(cwd, ["rev-parse", "--show-toplevel"]);
	return { id: projectIdFrom({ remoteUrl, toplevel, cwd }), remoteUrl, toplevel };
}

/**
 * Herdr scope from Herdr's env only (issue #19: never shell out to `herdr`).
 * Outside Herdr (HERDR_ENV != 1) the scope is just the project → undefined.
 */
export function sessionScope(env: Env = process.env): string | undefined {
	if (env.HERDR_ENV !== "1") return undefined;
	const parts = [env.HERDR_WORKSPACE, env.HERDR_WORKTREE ? basename(env.HERDR_WORKTREE) : undefined]
		.filter((p): p is string => Boolean(p && p.trim()))
		.map(sanitizeSegment);
	return parts.length ? parts.join("-") : "herdr";
}

export interface MemoryPaths {
	dir: string;
	memoryFile: string;
	sessionsDir: string;
	summariesDir: string;
	indexFile: string;
}

export function memoryPaths(root: string, project: string): MemoryPaths {
	const dir = join(root, project);
	return {
		dir,
		memoryFile: join(dir, "memory.md"),
		sessionsDir: join(dir, "sessions"),
		summariesDir: join(dir, "summaries"),
		indexFile: join(dir, "index.yaml"),
	};
}

export function stamp(at: Date): string {
	return at.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export interface JournalNameOpts {
	at: Date;
	life?: string;
	scope?: string;
}

function journalName(opts: JournalNameOpts): string {
	const life = sanitizeSegment(opts.life || "pi");
	const scope = opts.scope ? `-${sanitizeSegment(opts.scope)}` : "";
	return `${stamp(opts.at)}-${life}${scope}.md`;
}

export function sessionJournalPath(root: string, project: string, opts: JournalNameOpts): string {
	return join(memoryPaths(root, project).sessionsDir, journalName(opts));
}

export function summaryArtifactPath(sink: string, project: string, opts: JournalNameOpts): string {
	return join(memoryPaths(sink, project).summariesDir, journalName(opts));
}

export function readMemory(file: string): string {
	try {
		return readFileSync(file, "utf8");
	} catch {
		return "";
	}
}

function oneLine(note: string): string {
	return note.replace(/\s+/g, " ").trim();
}

function appendWithHeader(file: string, header: string, line: string): void {
	mkdirSync(dirname(file), { recursive: true });
	if (!existsSync(file)) writeFileSync(file, `${header}\n\n`, "utf8");
	appendFileSync(file, `${line}\n`, "utf8");
}

/** Append `- YYYY-MM-DD note` to memory.md, creating it with a `# Memory` header. */
export function appendDurableNote(file: string, note: string, at = new Date()): void {
	const text = oneLine(note);
	if (!text) return;
	appendWithHeader(file, "# Memory", `- ${at.toISOString().slice(0, 10)} ${text}`);
}

export interface JournalMeta {
	life?: string;
	project: string;
}

/** Append `- HH:MM:SSZ note` to a session journal, creating its title on first write. */
export function appendJournal(file: string, note: string, at: Date, meta: JournalMeta): void {
	const text = oneLine(note);
	if (!text) return;
	const iso = at.toISOString();
	const title = `# Session ${iso.replace(/\.\d{3}Z$/, "Z")} (${meta.life || "pi"}) — ${meta.project}`;
	appendWithHeader(file, title, `- ${iso.slice(11, 19)}Z ${text}`);
}

/** Journals newest first (names sort lexically by timestamp prefix). */
export function listSessionJournals(dir: string): string[] {
	try {
		return readdirSync(dir)
			.filter((f) => f.endsWith(".md"))
			.sort()
			.reverse()
			.map((f) => join(dir, f));
	} catch {
		return [];
	}
}

export type MemoryIndex = Record<string, unknown>;

export function readIndex(file: string): MemoryIndex {
	try {
		const doc = parse(readFileSync(file, "utf8"));
		return doc != null && typeof doc === "object" && !Array.isArray(doc) ? (doc as MemoryIndex) : {};
	} catch {
		return {};
	}
}

export function writeIndex(file: string, doc: MemoryIndex): void {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, stringify(doc), "utf8");
}

export interface JournalText {
	name: string;
	content: string;
}

export interface SectionOpts {
	readOnly?: boolean;
	maxBytes?: number;
}

function truncateBytes(s: string, cap: number): string {
	if (Buffer.byteLength(s, "utf8") <= cap) return s;
	let out = s.slice(0, cap);
	while (Buffer.byteLength(out, "utf8") > cap) out = out.slice(0, -1);
	return out;
}

/** `<memory>` prompt block. Empty when there is nothing to show. */
export function buildMemorySection(memory: string, journals: JournalText[], opts: SectionOpts = {}): string {
	const body: string[] = [];
	if (memory.trim()) body.push("## Durable memory (memory.md)", memory.trim());
	for (const j of journals) {
		if (j.content.trim()) body.push(`## Session journal: ${j.name}`, j.content.trim());
	}
	if (body.length === 0) return "";
	const cap = opts.maxBytes ?? DEFAULT_MAX_SECTION_BYTES;
	let text = body.join("\n\n");
	if (Buffer.byteLength(text, "utf8") > cap) {
		text = `${truncateBytes(text, cap)}\n\n[memory truncated to ${cap} bytes; read the store files for the rest]`;
	}
	const lines = [
		"<memory>",
		"Shared memory for this project (plain files; other CLIs read and write the same store).",
	];
	if (opts.readOnly) {
		lines.push("This copy is read-only for you: do not attempt to write memory; only the primary session records notes.");
	} else {
		lines.push("Use the `remember` tool (or /remember) for durable facts and /session-note for this session's journal.");
	}
	lines.push("", text, "</memory>");
	return lines.join("\n");
}

export interface LoadOpts {
	root: string;
	project: string;
	recent?: number;
	readOnly?: boolean;
}

export interface MemoryContext {
	paths: MemoryPaths;
	memory: string;
	journals: JournalText[];
	section: string;
}

/** Fail-open read of memory.md + the N most recent journals. */
export function loadMemoryContext(opts: LoadOpts): MemoryContext {
	const paths = memoryPaths(opts.root, opts.project);
	const memory = readMemory(paths.memoryFile);
	const journals = listSessionJournals(paths.sessionsDir)
		.slice(0, opts.recent ?? DEFAULT_RECENT_JOURNALS)
		.map((f) => ({ name: basename(f), content: readMemory(f) }));
	return { paths, memory, journals, section: buildMemorySection(memory, journals, { readOnly: opts.readOnly }) };
}

/** Read-only memory block for chain/team/subagent children. Fail-open: "" on any error. */
export function childMemorySection(env: Env, cwd: string): string {
	try {
		return loadMemoryContext({ root: resolveMemoryRoot(env), project: projectId(cwd).id, readOnly: true }).section;
	} catch {
		return "";
	}
}

export interface SummaryInput {
	project: string;
	life?: string;
	at: Date;
	kind: "chain" | "session";
	name?: string;
	output: string;
	scope?: string;
}

/** Markdown summary with YAML front matter (rs-nightshift / overnight pickup). */
export function buildSummaryArtifact(input: SummaryInput): string {
	const fm: Record<string, unknown> = {
		project: input.project,
		life: input.life ?? "pi",
		kind: input.kind,
	};
	if (input.name) fm.name = input.name;
	if (input.scope) fm.scope = input.scope;
	fm.finished_at = input.at.toISOString();
	return `---\n${stringify(fm).trimEnd()}\n---\n\n# ${input.kind} summary\n\n${input.output.trim() || "(no output)"}\n`;
}

export function writeSummaryArtifact(file: string, content: string): void {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, content, "utf8");
}

/** Summary artifacts are opt-in via the `nightshift` overlay capability. */
export function shouldWriteSummary(overlay: Overlay | null | undefined): boolean {
	return overlay?.capabilities.nightshift === true;
}

/** Write a chain/session summary into RS_NIGHTSHIFT_HOME (or the memory root). Returns the path. */
export function writeChainSummary(env: Env, input: Omit<SummaryInput, "life" | "scope">): string {
	const life = env.PI_LIFE;
	const scope = sessionScope(env);
	const file = summaryArtifactPath(resolveSummarySink(env), input.project, { at: input.at, life, scope });
	writeSummaryArtifact(file, buildSummaryArtifact({ ...input, life, scope }));
	return file;
}
