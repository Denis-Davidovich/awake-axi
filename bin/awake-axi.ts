#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_MAX_HOURS,
  DEFAULT_MIN_BATTERY,
  DEFAULT_POLL_SECONDS,
  listSessions,
  monitorSession,
  refreshLiveness,
  startSession,
  stopSession,
} from "../src/session.js";
import { readState, type SessionState } from "../src/state.js";
import { installSkill, printSkill } from "../src/skill.js";

interface CommonOptions {
  minBatteryPercent: number;
  maxHours: number;
  pollSeconds: number;
  json: boolean;
}

const HELP = `usage: awake-axi <command> [options]

commands:
  start                 start a background battery-aware lease
  status [session-id]   show one session or all recorded sessions
  stop <session-id>     stop one lease
  run [options] -- cmd  hold a lease only while a command runs
  skill print           print the bundled Codex skill
  skill install [path]  install the skill (default ~/.agents/skills/awake-axi)

options for start/run:
  --min-battery <1-100> minimum charge on battery (default 35)
  --max-hours <hours>   hard lease expiry (default 8)
  --poll-seconds <sec>  power check interval (default 30)
  --json                JSON output (start/status/stop)
`;

function positiveNumber(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be greater than zero`);
  return parsed;
}

function parseCommon(args: string[]): { options: CommonOptions; rest: string[] } {
  const options: CommonOptions = {
    minBatteryPercent: DEFAULT_MIN_BATTERY,
    maxHours: DEFAULT_MAX_HOURS,
    pollSeconds: DEFAULT_POLL_SECONDS,
    json: false,
  };
  const rest: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      rest.push(...args.slice(index + 1));
      break;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (["--min-battery", "--max-hours", "--poll-seconds"].includes(arg)) {
      const value = args[index + 1];
      if (value === undefined) throw new Error(`${arg} requires a value`);
      index += 1;
      if (arg === "--min-battery") {
        const parsed = positiveNumber(value, arg);
        if (!Number.isInteger(parsed) || parsed > 100) throw new Error("--min-battery must be an integer from 1 to 100");
        options.minBatteryPercent = parsed;
      } else if (arg === "--max-hours") {
        options.maxHours = positiveNumber(value, arg);
      } else {
        options.pollSeconds = positiveNumber(value, arg);
      }
      continue;
    }
    rest.push(arg);
  }
  return { options, rest };
}

function publicState(state: SessionState): Record<string, unknown> {
  return {
    session_id: state.sessionId,
    state: state.state,
    power_source: state.powerSource,
    battery_percent: state.batteryPercent,
    sleep_prevented: state.sleepPrevented,
    min_battery_percent: state.minBatteryPercent,
    expires_at: state.expiresAt,
    monitor_pid: state.monitorPid,
    inhibitor_pid: state.inhibitorPid,
  };
}

function showState(state: SessionState, json: boolean): void {
  const shown = publicState(state);
  if (json) {
    console.log(JSON.stringify(shown));
    return;
  }
  for (const [key, value] of Object.entries(shown)) {
    if (value !== null && value !== undefined) console.log(`${key}: ${String(value)}`);
  }
}

async function runCommand(command: string[], options: CommonOptions, cliPath: string): Promise<number> {
  if (command.length === 0) throw new Error("run requires a command after --");
  const state = await startSession(options, cliPath);
  if (state.state !== "running") {
    showState(state, false);
    return 1;
  }
  console.error(`awake_session: ${state.sessionId}`);
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(command[0], command.slice(1), { stdio: "inherit" });
      child.on("error", reject);
      child.on("close", (code, signal) => resolve(signal === null ? (code ?? 1) : 128));
    });
  } finally {
    await stopSession(state.sessionId);
  }
}

async function main(): Promise<number> {
  const [command, ...args] = process.argv.slice(2);
  const cliPath = fileURLToPath(import.meta.url);
  if (command === undefined || command === "--help" || command === "-h") {
    console.log(HELP);
    return command === undefined ? 2 : 0;
  }
  if (command === "_monitor") {
    if (args.length !== 1) throw new Error("_monitor requires a session id");
    await monitorSession(args[0]);
    return 0;
  }
  if (command === "start") {
    const { options, rest } = parseCommon(args);
    if (rest.length > 0) throw new Error(`unexpected argument: ${rest[0]}`);
    const state = await startSession(options, cliPath);
    showState(state, options.json);
    return state.state === "running" ? 0 : 1;
  }
  if (command === "status") {
    const { options, rest } = parseCommon(args);
    if (rest.length > 1) throw new Error("status accepts at most one session id");
    if (rest.length === 1) {
      showState(await refreshLiveness(await readState(rest[0])), options.json);
    } else {
      const states = await listSessions();
      if (options.json) console.log(JSON.stringify(states.map(publicState)));
      else if (states.length === 0) console.log("sessions: 0");
      else states.forEach((state, index) => {
        if (index > 0) console.log();
        showState(state, false);
      });
    }
    return 0;
  }
  if (command === "stop") {
    const { options, rest } = parseCommon(args);
    if (rest.length !== 1) throw new Error("stop requires exactly one session id");
    showState(await stopSession(rest[0]), options.json);
    return 0;
  }
  if (command === "run") {
    const { options, rest } = parseCommon(args);
    return runCommand(rest, options, cliPath);
  }
  if (command === "skill") {
    const [action, target, ...extra] = args;
    if (extra.length > 0) throw new Error("too many skill arguments");
    if (action === "print" && target === undefined) {
      await printSkill();
      return 0;
    }
    if (action === "install") {
      console.log(`installed: ${await installSkill(target)}`);
      return 0;
    }
    throw new Error("skill requires print or install [path]");
  }
  throw new Error(`unknown command: ${command}`);
}

main().then(
  (code) => { process.exitCode = code; },
  (error: unknown) => {
    console.error(`awake-axi: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  },
);
