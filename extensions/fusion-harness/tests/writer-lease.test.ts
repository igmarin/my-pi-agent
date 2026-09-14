import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { acquireWriterLease, writerLeasePath } from "../modules/writer-lease.ts";

const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

describe("CWD writer lease", () => {
  test("allows one writer and rejects a concurrent lease", () => {
    const cwd = mkdtempSync(join(tmpdir(), "fh-writer-lease-")); dirs.push(cwd);
    const first = acquireWriterLease(cwd, "first");
    expect(() => acquireWriterLease(cwd, "second")).toThrow("already allowed to mutate");
    first.release();
    const second = acquireWriterLease(cwd, "second");
    expect(second.owner).not.toBe(first.owner);
    second.release();
  });

  test("reclaims a stale lock from a dead pid", () => {
    const cwd = mkdtempSync(join(tmpdir(), "fh-writer-stale-")); dirs.push(cwd);
    const lockPath = writerLeasePath(cwd);
    mkdirSync(dirname(lockPath), { recursive: true });
    writeFileSync(lockPath, JSON.stringify({ owner: "dead", pid: 999999999, command: "dead", cwd, createdAt: 0 }));
    const lease = acquireWriterLease(cwd, "reclaimer");
    expect(lease.owner).toContain("reclaimer");
    lease.release();
  });
});
