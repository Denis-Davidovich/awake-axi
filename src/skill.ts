import { cp, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function bundledSkillDirectory(): string {
  const current = dirname(fileURLToPath(import.meta.url));
  return resolve(current, "../../skill/awake-axi");
}

export function defaultSkillDirectory(): string {
  return join(homedir(), ".agents", "skills", "awake-axi");
}

export async function printSkill(): Promise<void> {
  process.stdout.write(await readFile(join(bundledSkillDirectory(), "SKILL.md"), "utf8"));
}

export async function installSkill(target = defaultSkillDirectory()): Promise<string> {
  await mkdir(dirname(target), { recursive: true });
  await cp(bundledSkillDirectory(), target, { recursive: true, force: true });
  return target;
}
