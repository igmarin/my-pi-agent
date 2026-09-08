/**
 * Tests for the agent-chain pure helpers.
 *
 * The YAML parse, precedence resolution, task-template rendering, and life
 * canonicalization are all pure and unit-tested here. Chain step execution
 * (spawning `pi`) is NOT covered here or by `just smoke` as of this change —
 * it reuses subagentHelpers.runSingleAgent, whose spawn path is exercised by
 * the subagent suite. Mocking spawn would test the mock, so step execution is
 * left to manual/end-to-end runs until the harness wires mode `chain`.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type ChainDef,
	ChainError,
	chainLife,
	overlayRsGuardEnabled,
	parseAgentTeams,
	parseChainFile,
	pickTeam,
	planGuardStep,
	renderStepTask,
	resolveChainFile,
	type TeamDef,
} from "./agent-chain.ts";

const VALID = `
chains:
  plan-build-review:
    description: Plan, build, review.
    steps:
      - agent: planner
        task: "Plan {task}"
      - agent: builder
        task: "Implement {previous}"
      - agent: reviewer
`;

describe("parseChainFile", () => {
	test("parses a valid chain file", () => {
		const chains = parseChainFile(VALID);
		const pbr = chains.get("plan-build-review") as ChainDef;
		expect(pbr).toBeDefined();
		expect(pbr.description).toBe("Plan, build, review.");
		expect(pbr.steps.map((s) => s.agent)).toEqual([
			"planner",
			"builder",
			"reviewer",
		]);
		expect(pbr.steps[0].task).toBe("Plan {task}");
		expect(pbr.steps[1].task).toBe("Implement {previous}");
		expect(pbr.steps[2].task).toBeUndefined();
	});

	test("description defaults to agent arrow when absent", () => {
		const chains = parseChainFile(`
chains:
  quick:
    steps:
      - agent: builder
`);
		expect(chains.get("quick")?.description).toBe("quick: builder");
	});

	test("invalid YAML throws ChainError", () => {
		expect(() => parseChainFile(":\n  [")).toThrow(ChainError);
		expect(() => parseChainFile(":\n  [")).toThrow(/invalid YAML/);
	});

	test("non-mapping top level throws", () => {
		expect(() => parseChainFile("just a string")).toThrow(/chains/);
		expect(() => parseChainFile("[]")).toThrow(/chains/);
	});

	test("chain without steps throws", () => {
		expect(() => parseChainFile("chains:\n  foo:\n    description: x")).toThrow(
			/steps/,
		);
	});

	test("empty chain throws", () => {
		expect(() => parseChainFile("chains:\n  foo:\n    steps: []")).toThrow(
			/no steps/,
		);
	});

	test("step without agent throws, naming the step", () => {
		expect(() =>
			parseChainFile(`
chains:
  foo:
    steps:
      - task: "no agent"
`),
		).toThrow(/chain 'foo' step 1 needs an 'agent' name/);
	});

	test("rs_guard flag parses as boolean or undefined", () => {
		const chains = parseChainFile(`
chains:
  guarded:
    steps:
      - agent: builder
      - agent: reviewer
        rs_guard: true
  plain:
    steps:
      - agent: reviewer
        rs_guard: false
`);
		expect(chains.get("guarded")?.steps[1].rs_guard).toBe(true);
		expect(chains.get("plain")?.steps[0].rs_guard).toBe(false);
	});

	test("non-boolean rs_guard throws", () => {
		expect(() =>
			parseChainFile(`
chains:
  foo:
    steps:
      - agent: reviewer
        rs_guard: yes-please
`),
		).toThrow(/rs_guard must be a boolean/);
	});

	test("no chains throws", () => {
		expect(() => parseChainFile("chains: {}")).toThrow(/no chains defined/);
		expect(() => parseChainFile("other: 1")).toThrow(/chains/);
	});
});

describe("renderStepTask", () => {
	test("no template returns the original task verbatim", () => {
		expect(renderStepTask(undefined, "Fix the bug", "")).toBe("Fix the bug");
	});

	test("substitutes {task} and {previous}", () => {
		expect(renderStepTask("Plan: {task}", "Fix the bug", "old")).toBe(
			"Plan: Fix the bug",
		);
		expect(renderStepTask("Do {previous}", "ignored", "PRIOR OUT")).toBe(
			"Do PRIOR OUT",
		);
		expect(renderStepTask("A {task} B {previous} C", "T", "P")).toBe(
			"A T B P C",
		);
	});

	test("empty previous renders empty (first step)", () => {
		expect(renderStepTask("Start {previous} now", "T", "")).toBe("Start  now");
	});
});

describe("chainLife", () => {
	test("aliases phoenix→elixir and rails→ruby", () => {
		expect(chainLife("rails")).toBe("ruby");
		expect(chainLife("phoenix")).toBe("elixir");
	});
	test("passes lives through, rejects others", () => {
		expect(chainLife("rust")).toBe("rust");
		expect(chainLife("PYTHON")).toBe("python");
		expect(chainLife("rails-python")).toBeUndefined();
		expect(chainLife(undefined)).toBeUndefined();
	});
});

describe("overlayRsGuardEnabled", () => {
	test("missing or empty payload is off", () => {
		expect(overlayRsGuardEnabled(undefined)).toBe(false);
		expect(overlayRsGuardEnabled("")).toBe(false);
	});
	test("parses the PI_OVERLAY JSON payload", () => {
		expect(overlayRsGuardEnabled('{"capabilities":{"rs-guard":true}}')).toBe(
			true,
		);
		expect(overlayRsGuardEnabled('{"capabilities":{"rs-guard":false}}')).toBe(
			false,
		);
		expect(overlayRsGuardEnabled("{}")).toBe(false);
	});
	test("malformed payload is off (fail-open for the skip path, launcher never writes malformed)", () => {
		expect(overlayRsGuardEnabled("not json")).toBe(false);
	});
});

describe("planGuardStep", () => {
	test("overlay off skips regardless of binary or diff", () => {
		expect(
			planGuardStep({ overlayOn: false, hasBinary: false, hasDiff: false }),
		).toEqual({ action: "skip" });
		expect(
			planGuardStep({ overlayOn: false, hasBinary: true, hasDiff: true }),
		).toEqual({ action: "skip" });
	});
	test("overlay on + missing binary errors, never silent skip", () => {
		const plan = planGuardStep({
			overlayOn: true,
			hasBinary: false,
			hasDiff: true,
		});
		expect(plan.action).toBe("error");
		if (plan.action === "error") expect(plan.reason).toMatch(/not on PATH/);
	});
	test("overlay on + binary + empty diff skips (nothing to review)", () => {
		expect(
			planGuardStep({ overlayOn: true, hasBinary: true, hasDiff: false }),
		).toEqual({ action: "skip" });
	});
	test("overlay on + binary + diff runs", () => {
		expect(
			planGuardStep({ overlayOn: true, hasBinary: true, hasDiff: true }),
		).toEqual({ action: "run" });
	});
});

describe("resolveChainFile precedence", () => {
	const base = join(tmpdir(), `mpa-chain-${process.pid}`);
	const harness = join(base, "harness");
	const cwd = join(base, "cwd");
	const cwdProject = join(cwd, ".pi", "agents");
	const ext = join(harness, "extensions", "agent-chain.ts");
	const write = (
		p: string,
		content = "chains:\n  d:\n    steps:\n      - agent: builder\n",
	) => {
		mkdirSync(join(p, ".."), { recursive: true });
		writeFileSync(p, content);
	};

	afterEach(() => rmSync(base, { recursive: true, force: true }));

	test("project .pi/agents overrides harness profiles/agents", () => {
		write(
			join(harness, "profiles", "agents", "agent-chain.yaml"),
			"chains:\n  harness: {steps: [{agent: planner}]}\n",
		);
		write(
			join(cwdProject, "agent-chain.yaml"),
			"chains:\n  project: {steps: [{agent: builder}]}\n",
		);
		process.env.MY_PI_AGENT_HOME = harness;
		const file = resolveChainFile(cwd, ext, undefined);
		expect(file?.source).toBe(".pi/agents");
		expect(
			parseChainFile(readFileSync(file!.path, "utf8")).has("project"),
		).toBe(true);
	});

	test("repo without a chain file falls back to harness profiles/agents", () => {
		write(
			join(harness, "profiles", "agents", "agent-chain.yaml"),
			"chains:\n  d: {steps: [{agent: planner}]}\n",
		);
		process.env.MY_PI_AGENT_HOME = harness;
		const file = resolveChainFile(cwd, ext, undefined);
		expect(file?.source).toBe("profiles/agents");
	});

	test("life-specific harness dir wins over shared profiles/agents", () => {
		write(
			join(harness, "profiles", "agents", "agent-chain.yaml"),
			"chains:\n  shared: {steps: [{agent: planner}]}\n",
		);
		write(
			join(harness, "profiles", "ruby", "agents", "agent-chain.yaml"),
			"chains:\n  rubyone: {steps: [{agent: planner}]}\n",
		);
		process.env.MY_PI_AGENT_HOME = harness;
		const file = resolveChainFile(cwd, ext, "ruby");
		expect(file?.source).toBe("profiles/ruby/agents");
	});

	test("no chain file anywhere returns null", () => {
		process.env.MY_PI_AGENT_HOME = harness;
		expect(resolveChainFile(cwd, ext, undefined)).toBeNull();
	});
});

describe("parseAgentTeams", () => {
	test("parses the teams key", () => {
		const teams = parseAgentTeams(`
chains:
  x:
    steps: [{agent: builder}]
teams:
  default:
    description: The four roles.
    members: [planner, builder, reviewer, researcher]
`);
		expect(teams.size).toBe(1);
		const t = teams.get("default") as TeamDef;
		expect(t.members).toEqual(["planner", "builder", "reviewer", "researcher"]);
		expect(t.description).toBe("The four roles.");
	});

	test("file without teams yields an empty map (chains-only stays valid)", () => {
		expect(parseAgentTeams("chains:\n  x:\n    steps: [{agent: builder}]\n").size).toBe(0);
	});

	test("description defaults to a member list", () => {
		const teams = parseAgentTeams("teams:\n  duo:\n    members: [a, b]\n");
		expect(teams.get("duo")?.description).toBe("duo: a, b");
	});

	test("non-mapping teams throws", () => {
		expect(() => parseAgentTeams("teams: 3")).toThrow(/mapping under 'teams'/);
	});

	test("team without members throws", () => {
		expect(() => parseAgentTeams("teams:\n  t:\n    description: x")).toThrow(/members list/);
	});

	test("empty members throw", () => {
		expect(() => parseAgentTeams("teams:\n  t:\n    members: []")).toThrow(/no members/);
	});

	test("non-string or empty member throws", () => {
		expect(() => parseAgentTeams("teams:\n  t:\n    members: [1]")).toThrow(/non-empty strings/);
		expect(() => parseAgentTeams("teams:\n  t:\n    members: ['']")).toThrow(/non-empty strings/);
	});

	test("duplicate member throws", () => {
		expect(() => parseAgentTeams("teams:\n  t:\n    members: [a, a]")).toThrow(/duplicate member 'a'/);
	});
});

describe("pickTeam", () => {
	const teams = parseAgentTeams(`
teams:
  zeta:
    members: [a]
  default:
    members: [b, c]
`);
	test("requested team wins", () => {
		expect(pickTeam(teams, "zeta").name).toBe("zeta");
	});
	test("default team is the fallback", () => {
		expect(pickTeam(teams).name).toBe("default");
	});
	test("first team when no default exists", () => {
		const noDefault = parseAgentTeams("teams:\n  one:\n    members: [x]\n");
		expect(pickTeam(noDefault).name).toBe("one");
	});
	test("unknown team throws listing options", () => {
		expect(() => pickTeam(teams, "nope")).toThrow(/no team 'nope'/);
	});
	test("no teams at all throws", () => {
		expect(() => pickTeam(new Map())).toThrow(/no teams defined/);
	});
});
