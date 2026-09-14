import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import {
	appendDurableNote,
	appendJournal,
	buildMemorySection,
	childMemorySection,
	projectId,
	shouldWriteSummary,
	writeChainSummary,
	buildSummaryArtifact,
	listSessionJournals,
	loadMemoryContext,
	memoryPaths,
	projectIdFrom,
	readMemory,
	resolveMemoryRoot,
	resolveSummarySink,
	sanitizeSegment,
	sessionJournalPath,
	sessionScope,
	summaryArtifactPath,
} from "./memoryHelpers.ts";
import { CAPABILITY_KEYS, deserializeOverlayEnv, parseOverlayDoc, serializeOverlayEnv } from "./capabilities.ts";
import { buildChildArgv } from "./subagentHelpers.ts";

const tmp = join(tmpdir(), `mpa-memory-${process.pid}`);

beforeEach(() => {
	mkdirSync(tmp, { recursive: true });
});

afterEach(() => {
	rmSync(tmp, { recursive: true, force: true });
});

const at = new Date("2026-09-14T01:02:03.000Z");

describe("resolveMemoryRoot", () => {
	test("PI_MEMORY_HOME wins", () => {
		expect(resolveMemoryRoot({ PI_MEMORY_HOME: "/m", PI_SKILLS_HOME: "/s", HOME: "/h" })).toBe("/m");
	});
	test("falls back to PI_SKILLS_HOME parent + /memory", () => {
		expect(resolveMemoryRoot({ PI_SKILLS_HOME: "/x/.agents/skills", HOME: "/h" })).toBe("/x/.agents/memory");
	});
	test("falls back to $HOME/.agents/memory", () => {
		expect(resolveMemoryRoot({ HOME: "/h" })).toBe("/h/.agents/memory");
	});
});

describe("sanitizeSegment", () => {
	test("keeps word chars, dots, dashes; collapses the rest", () => {
		expect(sanitizeSegment("a b/c:d")).toBe("a-b-c-d");
		expect(sanitizeSegment("ok.name-1_2")).toBe("ok.name-1_2");
	});
	test("never yields an empty or dot-only segment", () => {
		expect(sanitizeSegment("")).toBe("unknown");
		expect(sanitizeSegment("..")).toBe("unknown");
		expect(sanitizeSegment("///")).toBe("unknown");
	});
});

describe("projectIdFrom", () => {
	test("git remote URL is normalized to host/owner/repo", () => {
		expect(projectIdFrom({ remoteUrl: "git@github.com:igmarin/my-pi-agent.git", cwd: "/x" })).toBe(
			"github.com-igmarin-my-pi-agent",
		);
		expect(projectIdFrom({ remoteUrl: "https://github.com/igmarin/my-pi-agent", cwd: "/x" })).toBe(
			"github.com-igmarin-my-pi-agent",
		);
		expect(projectIdFrom({ remoteUrl: "ssh://git@github.com/igmarin/my-pi-agent.git/", cwd: "/x" })).toBe(
			"github.com-igmarin-my-pi-agent",
		);
	});
	test("stable across clones: same remote, different toplevel", () => {
		const a = projectIdFrom({ remoteUrl: "git@github.com:o/r.git", toplevel: "/a/r", cwd: "/a/r" });
		const b = projectIdFrom({ remoteUrl: "git@github.com:o/r.git", toplevel: "/b/r-wt", cwd: "/b/r-wt/sub" });
		expect(a).toBe(b);
	});
	test("falls back to git toplevel basename, then cwd basename", () => {
		expect(projectIdFrom({ toplevel: "/home/u/Work/app", cwd: "/home/u/Work/app/lib" })).toBe("app");
		expect(projectIdFrom({ cwd: "/home/u/scratch dir" })).toBe("scratch-dir");
	});
});

describe("sessionScope", () => {
	test("outside Herdr there is no scope", () => {
		expect(sessionScope({})).toBeUndefined();
		expect(sessionScope({ HERDR_WORKSPACE_ID: "ws" })).toBeUndefined();
	});
	test("inside Herdr: workspace and pane ids, sanitized", () => {
		expect(sessionScope({ HERDR_ENV: "1", HERDR_WORKSPACE_ID: "my ws", HERDR_PANE_ID: "pane/7" })).toBe(
			"my-ws-pane-7",
		);
		expect(sessionScope({ HERDR_ENV: "1", HERDR_WORKSPACE_ID: "ws" })).toBe("ws");
		expect(sessionScope({ HERDR_ENV: "1", HERDR_PANE_ID: "p9" })).toBe("p9");
	});
	test("inside Herdr without id vars still namespaces", () => {
		expect(sessionScope({ HERDR_ENV: "1" })).toBe("herdr");
	});
});

describe("paths", () => {
	test("memoryPaths layout", () => {
		const p = memoryPaths("/root", "proj");
		expect(p.dir).toBe("/root/proj");
		expect(p.memoryFile).toBe("/root/proj/memory.md");
		expect(p.sessionsDir).toBe("/root/proj/sessions");
	});
	test("sessionJournalPath: <timestamp>-<life>[-<scope>].md, millisecond timestamp", () => {
		expect(sessionJournalPath("/root", "proj", { at, life: "ruby" })).toBe(
			"/root/proj/sessions/20260914T010203000Z-ruby.md",
		);
		expect(sessionJournalPath("/root", "proj", { at: new Date("2026-09-14T01:02:03.456Z"), life: "ruby" })).toBe(
			"/root/proj/sessions/20260914T010203456Z-ruby.md",
		);
		expect(sessionJournalPath("/root", "proj", { at, life: "ruby", scope: "ws-x" })).toBe(
			"/root/proj/sessions/20260914T010203000Z-ruby-ws-x.md",
		);
		expect(sessionJournalPath("/root", "proj", { at })).toBe("/root/proj/sessions/20260914T010203000Z-pi.md");
	});
	test("summaryArtifactPath under the sink", () => {
		expect(summaryArtifactPath("/sink", "proj", { at, life: "rust" })).toBe(
			"/sink/proj/summaries/20260914T010203000Z-rust.md",
		);
	});
	test("resolveSummarySink prefers RS_NIGHTSHIFT_HOME", () => {
		expect(resolveSummarySink({ RS_NIGHTSHIFT_HOME: "/ns", HOME: "/h" })).toBe("/ns");
		expect(resolveSummarySink({ HOME: "/h" })).toBe("/h/.agents/memory");
	});
});

describe("read/append (fail-open)", () => {
	test("readMemory returns empty on a missing file", () => {
		expect(readMemory(join(tmp, "nope", "memory.md"))).toBe("");
	});
	test("appendDurableNote creates the file with a header, appends dated bullets", () => {
		const file = join(tmp, "p", "memory.md");
		appendDurableNote(file, "Use bun test", at);
		appendDurableNote(file, "  multi\nline  ", at);
		const text = readFileSync(file, "utf8");
		expect(text.startsWith("# Memory\n")).toBe(true);
		expect(text).toContain("- 2026-09-14 Use bun test\n");
		expect(text).toContain("- 2026-09-14 multi line\n");
		expect(readMemory(file)).toBe(text);
	});
	test("appendDurableNote ignores blank notes", () => {
		const file = join(tmp, "p", "memory.md");
		appendDurableNote(file, "   ", at);
		expect(existsSync(file)).toBe(false);
	});
	test("appendDurableNote never truncates existing content", () => {
		const file = join(tmp, "p", "memory.md");
		mkdirSync(join(tmp, "p"), { recursive: true });
		writeFileSync(file, "# Memory\n\n- 2026-01-01 first\n", "utf8");
		appendDurableNote(file, "second", at);
		const text = readFileSync(file, "utf8");
		expect(text).toContain("first");
		expect(text).toContain("second");
		expect(text.match(/^# Memory/gm)?.length).toBe(1);
	});
	test("appendJournal writes a titled journal and timestamped entries", () => {
		const file = join(tmp, "p", "sessions", "x.md");
		appendJournal(file, "started work", at, { life: "ruby", project: "p" });
		appendJournal(file, "second", new Date("2026-09-14T01:05:00Z"), { life: "ruby", project: "p" });
		const text = readFileSync(file, "utf8");
		expect(text.startsWith("# Session 2026-09-14T01:02:03Z (ruby) — p\n")).toBe(true);
		expect(text).toContain("- 01:02:03Z started work\n");
		expect(text).toContain("- 01:05:00Z second\n");
		expect(text.match(/^# Session/gm)?.length).toBe(1);
	});
	test("listSessionJournals: newest first, only .md, missing dir = []", () => {
		const dir = join(tmp, "sessions");
		expect(listSessionJournals(dir)).toEqual([]);
		mkdirSync(dir, { recursive: true });
		for (const n of ["20260101T000000Z-ruby.md", "20260301T000000Z-ruby.md", "20260201T000000Z-rust.md", "junk.txt"]) {
			writeFileSync(join(dir, n), n);
		}
		expect(listSessionJournals(dir)).toEqual([
			join(dir, "20260301T000000Z-ruby.md"),
			join(dir, "20260201T000000Z-rust.md"),
			join(dir, "20260101T000000Z-ruby.md"),
		]);
	});
});

describe("buildMemorySection", () => {
	test("empty in, empty out", () => {
		expect(buildMemorySection("", [])).toBe("");
		expect(buildMemorySection("   \n", [])).toBe("");
	});
	test("wraps durable memory and journals, marks read-only when asked", () => {
		const s = buildMemorySection("# Memory\n- a\n", [{ name: "s1.md", content: "# S\n- x\n" }]);
		expect(s.startsWith("<memory>")).toBe(true);
		expect(s.endsWith("</memory>")).toBe(true);
		expect(s).toContain("## Durable memory (memory.md)");
		expect(s).toContain("- a");
		expect(s).toContain("## Session journal: s1.md");
		expect(s).toContain("- x");
		expect(s).not.toContain("read-only");
		const ro = buildMemorySection("# Memory\n- a\n", [], { readOnly: true });
		expect(ro).toContain("read-only");
		expect(ro).toContain("do not attempt to write");
	});
	test("marks store content as untrusted data, never instructions", () => {
		for (const ro of [false, true]) {
			const s = buildMemorySection("- a\n", [], { readOnly: ro });
			expect(s).toMatch(/untrusted data/i);
			expect(s).toMatch(/never follow/i);
		}
	});
	test("caps the whole <memory> block at maxBytes and says so", () => {
		const big = "x".repeat(50_000);
		const s = buildMemorySection(big, [], { maxBytes: 1000 });
		expect(Buffer.byteLength(s, "utf8")).toBeLessThanOrEqual(1000);
		expect(s).toContain("[memory truncated");
	});
	test("a cap smaller than the wrapper yields no block", () => {
		expect(buildMemorySection("x".repeat(50_000), [], { maxBytes: 10 })).toBe("");
	});
});

describe("loadMemoryContext", () => {
	test("missing store = empty section, never throws", () => {
		const ctx = loadMemoryContext({ root: join(tmp, "absent"), project: "p", recent: 2 });
		expect(ctx.memory).toBe("");
		expect(ctx.journals).toEqual([]);
		expect(ctx.section).toBe("");
	});
	test("reads memory.md and the N most recent journals", () => {
		const root = join(tmp, "root");
		const p = memoryPaths(root, "p");
		appendDurableNote(p.memoryFile, "durable", at);
		mkdirSync(p.sessionsDir, { recursive: true });
		writeFileSync(join(p.sessionsDir, "20260101T000000Z-ruby.md"), "old");
		writeFileSync(join(p.sessionsDir, "20260201T000000Z-ruby.md"), "mid");
		writeFileSync(join(p.sessionsDir, "20260301T000000Z-ruby.md"), "new");
		const ctx = loadMemoryContext({ root, project: "p", recent: 2 });
		expect(ctx.memory).toContain("durable");
		expect(ctx.journals.map((j) => j.name)).toEqual(["20260301T000000Z-ruby.md", "20260201T000000Z-ruby.md"]);
		expect(ctx.section).toContain("new");
		expect(ctx.section).not.toContain("old");
	});
});

describe("buildSummaryArtifact", () => {
	test("markdown with YAML front matter for unattended pickup", () => {
		const md = buildSummaryArtifact({
			project: "p",
			life: "ruby",
			at,
			kind: "chain",
			name: "plan-build-review",
			output: "All done.",
			scope: "ws",
		});
		const fm = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
		expect(fm).not.toBeNull();
		expect(parse(fm![1])).toEqual({
			project: "p",
			life: "ruby",
			kind: "chain",
			name: "plan-build-review",
			scope: "ws",
			finished_at: "2026-09-14T01:02:03.000Z",
		});
		expect(fm![2]).toContain("All done.");
	});
});

// ---------------------------------------------------------------------------
// Integration points: children (read-only), nightshift flag
// ---------------------------------------------------------------------------

describe("buildChildArgv memory injection (read-only)", () => {
	test("memorySection is appended to the task as read-only context, after 'Task:'", () => {
		const argv = buildChildArgv("/h", { task: "do x", memorySection: "<memory>\nread-only\n</memory>" });
		const last = argv[argv.length - 1];
		expect(last.startsWith("Task: do x")).toBe(true);
		expect(last).toContain("<memory>");
		expect(last).toContain("read-only");
		expect(last).not.toContain("remember");
	});
	test("no memorySection = unchanged trailing task arg", () => {
		expect(buildChildArgv("/h", { task: "do x" }).at(-1)).toBe("Task: do x");
		expect(buildChildArgv("/h", { task: "do x", memorySection: "" }).at(-1)).toBe("Task: do x");
	});
	test("childMemorySection builds a read-only section from the store and never throws", () => {
		expect(childMemorySection({ PI_MEMORY_HOME: join(tmp, "nope") }, tmp)).toBe("");
		const root = join(tmp, "root");
		const id = projectId(tmp).id;
		appendDurableNote(memoryPaths(root, id).memoryFile, "shared fact");
		const s = childMemorySection({ PI_MEMORY_HOME: root }, tmp);
		expect(s).toContain("shared fact");
		expect(s).toContain("read-only");
	});
});

describe("nightshift capability", () => {
	test("is a capability key, defaults off, parses as a strict boolean", () => {
		expect(CAPABILITY_KEYS).toContain("nightshift");
		expect(parseOverlayDoc({}).capabilities.nightshift).toBe(false);
		expect(parseOverlayDoc({ nightshift: true }).capabilities.nightshift).toBe(true);
		expect(() => parseOverlayDoc({ nightshift: "on" })).toThrow(/nightshift must be a boolean/);
	});
	test("round-trips through the env serialization", () => {
		const o = parseOverlayDoc({ nightshift: true });
		expect(deserializeOverlayEnv(serializeOverlayEnv(o)).capabilities.nightshift).toBe(true);
	});
	test("shouldWriteSummary is true only when the overlay enables nightshift", () => {
		expect(shouldWriteSummary(null)).toBe(false);
		expect(shouldWriteSummary(parseOverlayDoc({}))).toBe(false);
		expect(shouldWriteSummary(parseOverlayDoc({ nightshift: true }))).toBe(true);
	});
	test("writeChainSummary writes the artifact under the sink and returns its path", () => {
		const sink = join(tmp, "ns");
		const file = writeChainSummary(
			{ RS_NIGHTSHIFT_HOME: sink, PI_LIFE: "ruby" },
			{ project: "p", kind: "chain", name: "c", output: "done", at },
		);
		expect(file).toBe(join(sink, "p", "summaries", "20260914T010203000Z-ruby.md"));
		expect(readFileSync(file, "utf8")).toContain("name: c");
	});
	test("same-timestamp summaries never overwrite: a -N suffix keeps both", () => {
		const env = { RS_NIGHTSHIFT_HOME: join(tmp, "ns"), PI_LIFE: "ruby" };
		const a = writeChainSummary(env, { project: "p", kind: "chain", name: "a", output: "first", at });
		const b = writeChainSummary(env, { project: "p", kind: "chain", name: "b", output: "second", at });
		expect(a).not.toBe(b);
		expect(readFileSync(a, "utf8")).toContain("first");
		expect(readFileSync(b, "utf8")).toContain("second");
	});
});
