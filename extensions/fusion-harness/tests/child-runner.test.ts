import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProc } from "../modules/child-runner.ts";

describe("runProc", () => {
  test("signal-killed subprocess is a failure, not exit 0", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "fh-runproc-"));
    try {
      const result = await runProc(
        process.execPath,
        ["-e", "process.kill(process.pid, 'SIGTERM'); setTimeout(() => {}, 1e9)"],
        cwd,
        5_000,
      );
      expect(result.code).not.toBe(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("caps gate output and keeps draining", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "fh-runproc-cap-"));
    try {
      const result = await runProc(
        process.execPath,
        ["-e", "process.stdout.write('x'.repeat(1_500_000))"],
        cwd,
        5_000,
      );
      expect(result.code).toBe(0);
      expect(result.output.includes("[output truncated]")).toBe(true);
      expect(Buffer.byteLength(result.output, "utf8")).toBeLessThan(1_100_000);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
