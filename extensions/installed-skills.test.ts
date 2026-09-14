import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installedPackPaths } from "./installed-skills";

test("manifest expands only the requested pack, validates missing and unsafe entries", () => {
  const root = mkdtempSync(join(tmpdir(), "installed-skills-"));
  try {
    expect(installedPackPaths(root, "ruby-core-skills")).toEqual([]);
    mkdirSync(join(root, "build"));
    writeFileSync(join(root, "build/SKILL.md"), "# Build");
    const manifest = { schema_version: 1, skills: {
      "ruby-core-skills:build": { path: "build", source: "owner/ruby-core-skills" },
      "other-pack:review": { path: "missing", source: "owner/other-pack" },
    } };
    const save = () => writeFileSync(join(root, ".dotskills-manifest.json"), JSON.stringify(manifest));
    save();
    expect(installedPackPaths(root, "ruby-core-skills")).toEqual([join(root, "build")]);
    expect(() => installedPackPaths(root, "other-pack")).toThrow("missing installed skill");
    manifest.skills["ruby-core-skills:build"].path = "../outside";
    save();
    expect(() => installedPackPaths(root, "ruby-core-skills")).toThrow("invalid installed skill path");
    manifest.skills["ruby-core-skills:build"].path = "build";
    manifest.skills["ruby-core-skills:lint"] = { path: "build", source: "owner/ruby-core-skills" };
    save();
    expect(() => installedPackPaths(root, "ruby-core-skills")).toThrow("duplicate installed skill path");
    manifest.schema_version = 2;
    save();
    expect(() => installedPackPaths(root, "ruby-core-skills")).toThrow("invalid skill identity manifest");
    writeFileSync(join(root, ".dotskills-manifest.json"), "not json{");
    expect(() => installedPackPaths(root, "ruby-core-skills")).toThrow();
  } finally { rmSync(root, { recursive: true }); }
});

test("multiple installed skills resolve sorted by path", () => {
  const root = mkdtempSync(join(tmpdir(), "installed-skills-"));
  try {
    for (const name of ["zebra", "alpha"]) {
      mkdirSync(join(root, name));
      writeFileSync(join(root, name, "SKILL.md"), `# ${name}`);
    }
    writeFileSync(join(root, ".dotskills-manifest.json"), JSON.stringify({
      schema_version: 1,
      skills: {
        "pack:zebra": { path: "zebra", source: "o/p" },
        "pack:alpha": { path: "alpha", source: "o/p" },
      },
    }));
    expect(installedPackPaths(root, "pack")).toEqual([join(root, "alpha"), join(root, "zebra")]);
  } finally { rmSync(root, { recursive: true }); }
});
