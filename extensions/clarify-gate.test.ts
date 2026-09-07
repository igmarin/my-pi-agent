/**
 * Tests for the clarify gate extension.
 *
 * The gate is an ExtensionAPI consumer. We test the pure behavior by feeding
 * synthetic tool_call events and asserting the gate blocks write/edit before
 * /clarify and allows them after. The actual pi.on wiring is small enough to
 * read; we don't need to mock ExtensionAPI.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

type ToolCallEvent =
	| { toolName: "write"; input: { path: string; content: string } }
	| { toolName: "edit"; input: { path: string } }
	| { toolName: "read"; input: { path: string } }
	| { toolName: "bash"; input: { command: string } };

type Handler = (event: ToolCallEvent) => Promise<{ block: true; reason: string } | void> | { block: true; reason: string } | void;
type Notify = (msg: string, level: string) => void;
type CommandHandler = (args: string, ctx: { hasUI: boolean; ui: { notify: Notify } }) => Promise<void> | void;

interface CapturedCommands {
	[name: string]: { description: string; handler: CommandHandler };
}

type SessionStartHandler = (event: unknown, ctx: { hasUI: boolean; ui: { notify: Notify; setTheme: (n: string) => { success: boolean }; setTitle: (t: string) => void } }) => Promise<void> | void;

interface Captured {
	sessionStart: SessionStartHandler | null;
	toolCall: Handler | null;
	commands: CapturedCommands;
}

function makePi() {
	const captured: Captured = { sessionStart: null, toolCall: null, commands: {} };
	const pi = {
		on(event: string, handler: unknown) {
			if (event === "session_start") captured.sessionStart = handler as Captured["sessionStart"];
			if (event === "tool_call") captured.toolCall = handler as Captured["toolCall"];
		},
		registerCommand(name: string, def: { description: string; handler: CommandHandler }) {
			captured.commands[name] = def;
		},
	};
	return { pi, captured };
}

function makeCtx(hasUI = true) {
	const seen: string[] = [];
	const ctx = {
		hasUI,
		ui: {
			notify: (m: string, _level?: string) => seen.push(m),
			setTheme: (_name: string) => ({ success: true }),
			setTitle: (_title: string) => {},
		},
	};
	return { ctx, seen };
}

async function importGate() {
	const mod = await import("./clarify-gate.ts");
	return mod.default as (pi: ReturnType<typeof makePi>["pi"]) => void;
}

let gate: (pi: ReturnType<typeof makePi>["pi"]) => void;
let captured: Captured;

beforeEach(async () => {
	gate = await importGate();
	const m = makePi();
	captured = m.captured;
	gate(m.pi);
});

afterEach(() => {
	gate = captured = undefined as unknown as typeof gate;
});

const uiCtx = { hasUI: true, ui: { notify: (_msg: string, _level: string) => {}, setTheme: (_n: string) => ({ success: true }), setTitle: (_t: string) => {} } };

describe("clarify-gate wiring", () => {
	test("registers session_start, tool_call, and the /clarify command", () => {
		expect(captured.sessionStart).not.toBeNull();
		expect(captured.toolCall).not.toBeNull();
		expect(Object.keys(captured.commands)).toContain("clarify");
		expect(captured.commands.clarify.description).toMatch(/accept/i);
	});

	test("session_start in UI mode notifies the gate state (closed)", async () => {
		const { ctx, seen } = makeCtx(true);
		await captured.sessionStart!(undefined, ctx);
		expect(seen.some((m) => m.toLowerCase().includes("closed"))).toBe(true);
	});

	test("session_start in print/JSON mode is a no-op (no notify)", async () => {
		const { ctx, seen } = makeCtx(false);
		await captured.sessionStart!(undefined, ctx);
		expect(seen.length).toBe(0);
	});
});

describe("clarify-gate tool_call blocking", () => {
	const writeEvent: ToolCallEvent = { toolName: "write", input: { path: "foo.ts", content: "// x" } };
	const editEvent: ToolCallEvent = { toolName: "edit", input: { path: "foo.ts" } };
	const readEvent: ToolCallEvent = { toolName: "read", input: { path: "foo.ts" } };
	const bashEvent: ToolCallEvent = { toolName: "bash", input: { command: "ls -la" } };

	test("write is blocked before /clarify with a clear reason", async () => {
		const result = await captured.toolCall!(writeEvent);
		expect(result).toEqual({ block: true, reason: expect.stringMatching(/clarify/i) });
	});

	test("edit is blocked before /clarify", async () => {
		const result = await captured.toolCall!(editEvent);
		expect(result).toEqual({ block: true, reason: expect.stringMatching(/clarify/i) });
	});

	test("read is allowed before /clarify (read-only is not blocked)", async () => {
		const result = await captured.toolCall!(readEvent);
		expect(result).toBeUndefined();
	});

	test("bash is allowed before /clarify (damage-control handles bash separately)", async () => {
		const result = await captured.toolCall!(bashEvent);
		expect(result).toBeUndefined();
	});

	test("after /clarify, write and edit are allowed", async () => {
		await captured.commands.clarify.handler("", uiCtx);
		const writeResult = await captured.toolCall!(writeEvent);
		const editResult = await captured.toolCall!(editEvent);
		expect(writeResult).toBeUndefined();
		expect(editResult).toBeUndefined();
	});

	test("/clarify is a one-way open for the session (does not close again)", async () => {
		await captured.commands.clarify.handler("", uiCtx);
		const first = await captured.toolCall!(writeEvent);
		expect(first).toBeUndefined();
		const second = await captured.toolCall!(writeEvent);
		expect(second).toBeUndefined();
	});
});
