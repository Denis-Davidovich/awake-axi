#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const path = new URL("../skill/awake-axi/SKILL.md", import.meta.url);
const source = await readFile(path, "utf8");
const frontmatter = source.match(/^---\n([\s\S]*?)\n---\n/)?.[1];

if (!frontmatter) throw new Error("SKILL.md must start with YAML frontmatter");
if (!/^name:\s*awake-axi\s*$/m.test(frontmatter)) throw new Error("skill name must be awake-axi");
if (!/^description:\s*\S.+$/m.test(frontmatter)) throw new Error("skill description is required");
if (/\bTODO\b|\[TODO/i.test(source)) throw new Error("SKILL.md contains a scaffold placeholder");

console.log("Skill is valid!");
