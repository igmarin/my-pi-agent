/**
 * Tests for the capabilities overlay helpers.
 *
 * The overlay lives at `<cwd>/.pi/capabilities.yaml` and is parsed strictly:
 * missing file ≡ all off; malformed YAML or schema ⇒ OverlayParseError.
 *
 * bin/pi-life parses the overlay (one Bun invocation) and serializes it into
 * the PI_OVERLAY env var. The extension deserializes and rewrites the
 * system prompt. Tests cover both the parser and the serializer round-trip.
 */

import { describe, expect, test } from "bun:test";
import { parse } from "yaml";
import {
	buildCapabilitiesSection,
	CAPABILITY_KEYS,
	deserializeOverlayEnv,
	EMPTY_OVERLAY,
	OverlayParseError,
	parseOverlayDoc,
	serializeOverlayEnv,
} from "./capabilities.ts";

function parseY(text: string): unknown {
	return parse(text);
}

describe("parseOverlayDoc", () => {
	test("empty document returns EMPTY_OVERLAY", () => {
		expect(parseOverlayDoc(null)).toEqual(EMPTY_OVERLAY);
		expect(parseOverlayDoc(undefined)).toEqual(EMPTY_OVERLAY);
	});

	test("non-mapping top level throws", () => {
		expect(() => parseOverlayDoc("a string")).toThrow(OverlayParseError);
		expect(() => parseOverlayDoc([])).toThrow(OverlayParseError);
		expect(() => parseOverlayDoc(42)).toThrow(OverlayParseError);
	});

	test("unknown top-level key throws", () => {
		expect(() => parseOverlayDoc({ foo: true })).toThrow(/unknown key.*foo/);
	});

	test("models/thinking are accepted as optional role maps", () => {
		const o = parseOverlayDoc({
			graphify: true,
			models: {
				solo: "openrouter/z-ai/glm-5.3-flash",
				builder: "openrouter/other",
			},
			thinking: { solo: "medium" },
		});
		expect(o.models).toEqual({
			solo: "openrouter/z-ai/glm-5.3-flash",
			builder: "openrouter/other",
		});
		expect(o.thinking).toEqual({ solo: "medium" });
	});

	test("absent models/thinking stay undefined (not empty objects)", () => {
		const o = parseOverlayDoc({ graphify: true });
		expect(o.models).toBeUndefined();
		expect(o.thinking).toBeUndefined();
	});

	test("empty models/thinking mappings normalize to undefined", () => {
		const o = parseOverlayDoc({ models: {}, thinking: {} });
		expect(o.models).toBeUndefined();
		expect(o.thinking).toBeUndefined();
	});

	test("models/thinking must be mappings of non-empty strings", () => {
		expect(() => parseOverlayDoc({ models: "solo" })).toThrow(
			/models must be a mapping/,
		);
		expect(() => parseOverlayDoc({ models: { solo: 42 } })).toThrow(
			/models\.solo must be a non-empty string/,
		);
		expect(() => parseOverlayDoc({ thinking: { solo: "" } })).toThrow(
			/thinking\.solo must be a non-empty string/,
		);
	});

	test("unknown roles inside models/thinking are rejected (fail closed)", () => {
		expect(() =>
			parseOverlayDoc({ models: { intern: "openrouter/x" } }),
		).toThrow(/models\.intern is not a known role/);
		expect(() => parseOverlayDoc({ thinking: { sol: "medium" } })).toThrow(
			/thinking\.sol is not a known role/,
		);
	});

	test("thinking values must be valid pi thinking levels", () => {
		expect(() => parseOverlayDoc({ thinking: { solo: "highh" } })).toThrow(
			/thinking\.solo must be a thinking level/,
		);
		expect(parseOverlayDoc({ thinking: { solo: "xhigh" } }).thinking).toEqual({
			solo: "xhigh",
		});
	});

	test("non-boolean capability throws", () => {
		expect(() => parseOverlayDoc({ graphify: "yes" })).toThrow(
			/graphify must be a boolean/,
		);
		expect(() => parseOverlayDoc({ graphify: 1 })).toThrow(
			/graphify must be a boolean/,
		);
	});

	test("boolean capability is accepted and defaults the rest to false", () => {
		const o = parseOverlayDoc({ graphify: true });
		expect(o.capabilities.graphify).toBe(true);
		for (const k of CAPABILITY_KEYS) {
			if (k !== "graphify") expect(o.capabilities[k]).toBe(false);
		}
		expect(o.extraSkills).toEqual([]);
		expect(o.trackerSkill).toBeNull();
	});

	test("extra_skills must be a list of non-empty strings (no scalar coercion)", () => {
		expect(parseOverlayDoc({ extra_skills: ["a", "b"] }).extraSkills).toEqual([
			"a",
			"b",
		]);
		expect(() => parseOverlayDoc({ extra_skills: "single" })).toThrow(
			/must be a list/,
		);
		expect(() => parseOverlayDoc({ extra_skills: [""] })).toThrow(
			/non-empty strings/,
		);
		expect(() => parseOverlayDoc({ extra_skills: [42] })).toThrow(
			/non-empty strings/,
		);
	});

	test("tracker must be a mapping with a 'skill' key", () => {
		expect(() => parseOverlayDoc({ tracker: "github-issue" })).toThrow(
			/tracker must be a mapping/,
		);
		expect(() => parseOverlayDoc({ tracker: {} })).toThrow(
			/tracker requires a 'skill' key/,
		);
		expect(() => parseOverlayDoc({ tracker: { skill: "" } })).toThrow(
			/tracker.skill must be a non-empty string/,
		);
		expect(
			parseOverlayDoc({ tracker: { skill: "local/tracker" } }).trackerSkill,
		).toBe("local/tracker");
	});

	test("tracker rejects unknown keys (fail closed)", () => {
		expect(() =>
			parseOverlayDoc({ tracker: { skill: "x", retries: 3 } }),
		).toThrow(/tracker has unknown key.*retries/);
		expect(() =>
			parseOverlayDoc({ tracker: { skill: "x", project: "y" } }),
		).toThrow(/tracker has unknown key.*project/);
	});

	test("fast-path EMPTY_OVERLAY JSON matches serializeOverlayEnv(EMPTY_OVERLAY)", () => {
		// The bash read_overlay fast path inlines this JSON for the no-overlay
		// case. If the capability key list ever changes, this assertion will
		// fail, forcing the bash literal to be updated alongside.
		const expected =
			'{"capabilities":{"graphify":false,"codegraph":false,"serena":false,"rs-guard":false,"obscura":false,"playwright":false},"extraSkills":[],"trackerSkill":null}';
		expect(serializeOverlayEnv(EMPTY_OVERLAY)).toBe(expected);
	});

	test("full overlay round-trip from real YAML", () => {
		const yaml = `
graphify: true
codegraph: true
serena: false
"rs-guard": true
obscura: false
playwright: true
extra_skills:
  - .pi/local-skills/team-rule
  - .pi/local-skills/code-style
tracker:
  skill: .pi/local-tracker/work
`;
		const o = parseOverlayDoc(parseY(yaml));
		expect(o.capabilities).toEqual({
			graphify: true,
			codegraph: true,
			serena: false,
			"rs-guard": true,
			obscura: false,
			playwright: true,
		});
		expect(o.extraSkills).toEqual([
			".pi/local-skills/team-rule",
			".pi/local-skills/code-style",
		]);
		expect(o.trackerSkill).toBe(".pi/local-tracker/work");
	});
});

describe("buildCapabilitiesSection", () => {
	test("returns empty string when everything is off (prompt gating hides capabilities)", () => {
		expect(buildCapabilitiesSection(EMPTY_OVERLAY)).toBe("");
	});

	test("lists only the ON capabilities", () => {
		const o = parseOverlayDoc({ graphify: true, "rs-guard": true });
		const section = buildCapabilitiesSection(o);
		expect(section).toContain("- graphify: on");
		expect(section).toContain("- rs-guard: on");
		expect(section).not.toContain("codegraph");
		expect(section).not.toContain("playwright");
		expect(section).toMatch(/^<capabilities>/);
		expect(section).toMatch(/<\/capabilities>$/);
	});

	test("includes extra_skills and tracker.skill when set", () => {
		const o = parseOverlayDoc({
			graphify: true,
			extra_skills: ["a", "b"],
			tracker: { skill: "local/tracker" },
		});
		const section = buildCapabilitiesSection(o);
		expect(section).toContain("- extra skills: a, b");
		expect(section).toContain("- tracker skill: local/tracker");
	});
});

describe("serializeOverlayEnv / deserializeOverlayEnv", () => {
	test("empty env string deserializes to EMPTY_OVERLAY", () => {
		expect(deserializeOverlayEnv("")).toEqual(EMPTY_OVERLAY);
	});

	test("malformed JSON throws", () => {
		expect(() => deserializeOverlayEnv("{not json")).toThrow();
	});

	test("round-trip preserves the overlay", () => {
		const o = parseOverlayDoc({
			graphify: true,
			codegraph: false,
			"rs-guard": true,
			extra_skills: ["a"],
			tracker: { skill: "local/x" },
		});
		const payload = serializeOverlayEnv(o);
		expect(deserializeOverlayEnv(payload)).toEqual(o);
	});

	test("models/thinking round-trip through the env payload", () => {
		const o = parseOverlayDoc({
			models: { solo: "openrouter/z-ai/glm-5.3-flash" },
			thinking: { solo: "high" },
		});
		const payload = serializeOverlayEnv(o);
		expect(payload).toContain(
			'"models":{"solo":"openrouter/z-ai/glm-5.3-flash"}',
		);
		expect(payload).toContain('"thinking":{"solo":"high"}');
		expect(deserializeOverlayEnv(payload)).toEqual(o);
	});

	test("serializeOverlayEnv omits models/thinking when unset (fast-path JSON stays stable)", () => {
		const payload = serializeOverlayEnv(EMPTY_OVERLAY);
		expect(payload).not.toContain("models");
		expect(payload).not.toContain("thinking");
		expect(deserializeOverlayEnv(payload)).toEqual(EMPTY_OVERLAY);
	});

	test("PI_OVERLAY with malformed models throws", () => {
		const bad = JSON.stringify({ capabilities: {}, models: { solo: 7 } });
		expect(() => deserializeOverlayEnv(bad)).toThrow(
			/models\.solo must be a non-empty string/,
		);
	});

	test("PI_OVERLAY with wrong capability type throws", () => {
		const bad = JSON.stringify({ capabilities: { graphify: "yes" } });
		expect(() => deserializeOverlayEnv(bad)).toThrow(
			/capabilities.graphify must be a boolean/,
		);
	});
});
