import { cp, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function bundledSkillDirectory(): string {
  const current = dirname(fileURLToPath(import.meta.url));
  return resolve(current, "../../skill/awake-axi");
}

export function defaultSkillDirectories(): string[] {
  return [
    join(homedir(), ".agents", "skills", "awake-axi"),
    join(homedir(), ".claude", "skills", "awake-axi"),
  ];
}

export async function printSkill(): Promise<void> {
  process.stdout.write(await readFile(join(bundledSkillDirectory(), "SKILL.md"), "utf8"));
}

export async function installSkill(target: string): Promise<string> {
  await mkdir(dirname(target), { recursive: true });
  await cp(bundledSkillDirectory(), target, { recursive: true, force: true });
  return target;
}

export async function installDefaultSkills(): Promise<string[]> {
  return Promise.all(defaultSkillDirectories().map(installSkill));
}
