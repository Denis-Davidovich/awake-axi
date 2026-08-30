import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cli = resolve("dist/bin/awake-axi.js");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("skill install", () => {
  it("installs into both the Codex and Claude personal skill directories by default", async () => {
    const home = await mkdtemp(join(tmpdir(), "awake-axi-home-"));
    temporaryDirectories.push(home);
    const env = { ...process.env, HOME: home };

    const { stdout } = await execFileAsync(process.execPath, [cli, "skill", "install"], { env });

    const codexPath = join(home, ".agents", "skills", "awake-axi");
    const claudePath = join(home, ".claude", "skills", "awake-axi");
    expect(stdout).toContain(`installed: ${codexPath}`);
    expect(stdout).toContain(`installed: ${claudePath}`);

    const bundled = await readFile(resolve("skill/awake-axi/SKILL.md"), "utf8");
    const codexSkill = await readFile(join(codexPath, "SKILL.md"), "utf8");
    const claudeSkill = await readFile(join(claudePath, "SKILL.md"), "utf8");
    expect(codexSkill).toBe(bundled);
    expect(claudeSkill).toBe(bundled);
  });
});
