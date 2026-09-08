/**
 * Tests for the boot-config pure helpers (issue #15).
 *
 * The before_agent_start TUI flow needs a real ctx.ui and is covered by the
 * manual launch path; these tests cover the pure logic the TUI calls:
 * profile default extraction, model reference resolution, thinking-level
 * validation, and overlay doc construction.
 */

import { describe, expect, test } from "bun:test";
import { parse } from "yaml";
import {
	buildOverlayDoc,
	extractProfileModelDefaults,
	findModelByReference,
} from "./boot-config.ts";
import {
	isThinkingLevelName,
	parseOverlayDoc,
	serializeOverlayEnv,
} from "./capabilities.ts";

describe("extractProfileModelDefaults", () => {
	test("returns empty for absent keys", () => {
		expect(extractProfileModelDefaults({ life: "ruby" })).toEqual({});
		expect(extractProfileModelDefaults(null)).toEqual({});
	});

	test("extracts models and thinking maps", () => {
		const doc = parse(`
life: ruby
models:
  solo: openrouter/z-ai/glm-5.3-flash
  reviewer: openrouter/other
thinking:
  solo: medium
`);
		expect(extractProfileModelDefaults(doc)).toEqual({
			models: {
				solo: "openrouter/z-ai/glm-5.3-flash",
				reviewer: "openrouter/other",
			},
			thinking: { solo: "medium" },
		});
	});

	test("throws on malformed values", () => {
		expect(() => extractProfileModelDefaults({ models: "solo" })).toThrow(
			/models must be a mapping/,
		);
		expect(() => extractProfileModelDefaults({ models: { solo: 42 } })).toThrow(
			/models\.solo must be a non-empty string/,
		);
		expect(() =>
			extractProfileModelDefaults({ thinking: { solo: null } }),
		).toThrow(/thinking\.solo must be a non-empty string/);
		expect(() => extractProfileModelDefaults({ models: ["solo"] })).toThrow(
			/models must be a mapping/,
		);
	});

	test("rejects unknown roles and invalid thinking levels (shared contract)", () => {
		expect(() =>
			extractProfileModelDefaults({ models: { sol: "openrouter/x" } }),
		).toThrow(/models\.sol is not a known role/);
		expect(() =>
			extractProfileModelDefaults({ thinking: { solo: "highh" } }),
		).toThrow(/thinking\.solo must be a thinking level/);
	});

	test("ignores non-object doc shapes", () => {
		expect(extractProfileModelDefaults("nope")).toEqual({});
		expect(extractProfileModelDefaults([1])).toEqual({});
	});
});

describe("findModelByReference", () => {
	const models = [
		{ id: "glm-5.3-flash", provider: "openrouter" },
		{ id: "glm-5.3-flash", provider: "zai" },
		{ id: "claude-sonnet-4-5", provider: "anthropic" },
	];

	test("canonical provider/id match wins", () => {
		expect(findModelByReference("openrouter/glm-5.3-flash", models)).toEqual({
			id: "glm-5.3-flash",
			provider: "openrouter",
		});
		expect(findModelByReference("anthropic/claude-sonnet-4-5", models)).toEqual(
			{
				id: "claude-sonnet-4-5",
				provider: "anthropic",
			},
		);
	});

	test("bare id resolves only when unambiguous", () => {
		expect(findModelByReference("claude-sonnet-4-5", models)).toEqual({
			id: "claude-sonnet-4-5",
			provider: "anthropic",
		});
		expect(findModelByReference("glm-5.3-flash", models)).toBeUndefined();
	});

	test("no match and empty reference return undefined", () => {
		expect(findModelByReference("openrouter/nope", models)).toBeUndefined();
		expect(findModelByReference("", models)).toBeUndefined();
		expect(findModelByReference("  ", models)).toBeUndefined();
	});
});

describe("isThinkingLevelName", () => {
	test("accepts the seven pi levels and rejects anything else", () => {
		for (const level of [
			"off",
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh",
			"max",
		]) {
			expect(isThinkingLevelName(level)).toBe(true);
		}
		expect(isThinkingLevelName("medium-ish")).toBe(false);
		expect(isThinkingLevelName("")).toBe(false);
		expect(isThinkingLevelName("HIGH")).toBe(false);
	});
});

describe("buildOverlayDoc", () => {
	test("includes capabilities and omits empty models/thinking", () => {
		const doc = buildOverlayDoc({ graphify: true, "rs-guard": false });
		expect(doc).toEqual({ graphify: true, "rs-guard": false });
	});

	test("includes models/thinking when non-empty", () => {
		const doc = buildOverlayDoc(
			{ graphify: false },
			{ solo: "openrouter/z-ai/glm-5.3-flash" },
			{ solo: "medium" },
		);
		expect(doc).toEqual({
			graphify: false,
			models: { solo: "openrouter/z-ai/glm-5.3-flash" },
			thinking: { solo: "medium" },
		});
	});

	test("written doc re-parses to the same overlay via parseOverlayDoc", () => {
		const doc = buildOverlayDoc(
			{ graphify: true, codegraph: false },
			{ solo: "openrouter/z-ai/glm-5.3-flash" },
			{ solo: "high" },
		);
		const overlay = parseOverlayDoc(parse(JSON.stringify(doc)));
		expect(overlay.capabilities.graphify).toBe(true);
		expect(overlay.models).toEqual({ solo: "openrouter/z-ai/glm-5.3-flash" });
		expect(overlay.thinking).toEqual({ solo: "high" });
		const envPayload = serializeOverlayEnv(overlay);
		expect(envPayload).toContain(
			'"models":{"solo":"openrouter/z-ai/glm-5.3-flash"}',
		);
	});
});
