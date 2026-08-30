import { closeSync, openSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { basename, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { isPowerSufficient, readPowerStatus } from "./power.js";
import {
  readState,
  sessionPath,
  stateDirectory,
  type SessionState,
  writeState,
} from "./state.js";

export const DEFAULT_MIN_BATTERY = 35;
export const DEFAULT_MAX_HOURS = 8;
export const DEFAULT_POLL_SECONDS = 30;

export interface StartOptions {
  minBatteryPercent: number;
  maxHours: number;
  pollSeconds: number;
}

function requireMacOS(): void {
  if (process.platform !== "darwin" && process.env.AWAKE_AXI_ALLOW_NON_DARWIN !== "1") {
    throw new Error("awake-axi supports macOS only");
  }
}

function isoNow(): string {
  return new Date().toISOString();
}

async function commandForPid(pid: number): Promise<string> {
  return await new Promise((resolve) => {
    const child = spawn("/bin/ps", ["-p", String(pid), "-o", "command="], { stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.on("error", () => resolve(""));
    child.on("close", (code) => resolve(code === 0 ? output.trim() : ""));
  });
}

export async function isMonitorProcess(pid: number | null, sessionId: string): Promise<boolean> {
  if (pid === null || pid <= 1) return false;
  const command = await commandForPid(pid);
  return command.includes("awake-axi") && command.includes("_monitor") && command.includes(sessionId);
}

export async function refreshLiveness(state: SessionState): Promise<SessionState> {
  if (state.state === "running" && !(await isMonitorProcess(state.monitorPid, state.sessionId))) {
    return { ...state, state: "stale", sleepPrevented: false, inhibitorPid: null };
  }
  return state;
}

export async function startSession(options: StartOptions, cliPath: string): Promise<SessionState> {
  requireMacOS();
  const power = await readPowerStatus();
  const sessionId = randomBytes(6).toString("hex");
  const startedAt = new Date();
  const state: SessionState = {
    sessionId,
    state: "starting",
    powerSource: power.source,
    batteryPercent: power.batteryPercent,
    sleepPrevented: false,
    minBatteryPercent: options.minBatteryPercent,
    pollSeconds: options.pollSeconds,
    startedAt: startedAt.toISOString(),
    expiresAt: new Date(startedAt.getTime() + options.maxHours * 3_600_000).toISOString(),
    monitorPid: null,
    inhibitorPid: null,
  };
  await writeState(state);

  const logPath = join(stateDirectory(), `${sessionId}.log`);
  const logFd = openSync(logPath, "a", 0o600);
  const monitor = spawn(process.execPath, [cliPath, "_monitor", sessionId], {
    detached: true,
    env: process.env,
    stdio: ["ignore", logFd, logFd],
  });
  closeSync(logFd);
  monitor.unref();

  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    await delay(50);
    const current = await readState(sessionId);
    if (current.monitorPid === monitor.pid || current.state === "error") return current;
  }
  return { ...state, state: "error", lastError: "monitor failed to start" };
}

function stopChild(child: ChildProcess | null): void {
  if (child !== null && child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
}

export async function monitorSession(sessionId: string): Promise<void> {
  requireMacOS();
  let state = await readState(sessionId);
  const expiresAt = new Date(state.expiresAt).getTime();
  let stopRequested = false;
  let inhibitor: ChildProcess | null = null;
  const requestStop = () => { stopRequested = true; };
  process.on("SIGTERM", requestStop);
  process.on("SIGINT", requestStop);

  state = { ...state, state: "running", monitorPid: process.pid };
  await writeState(state);

  try {
    while (!stopRequested && Date.now() < expiresAt) {
      try {
        const power = await readPowerStatus();
        const sufficient = isPowerSufficient(power, state.minBatteryPercent);
        const inhibitorAlive = inhibitor !== null && inhibitor.exitCode === null && inhibitor.signalCode === null;
        if (sufficient && !inhibitorAlive) {
          const caffeinate = process.env.AWAKE_AXI_CAFFEINATE ?? "/usr/bin/caffeinate";
          inhibitor = spawn(caffeinate, ["-i", "-w", String(process.pid)], {
            stdio: "ignore",
          });
        } else if (!sufficient && inhibitorAlive) {
          stopChild(inhibitor);
          inhibitor = null;
        }
        const active = inhibitor !== null && inhibitor.exitCode === null && inhibitor.signalCode === null;
        state = {
          ...state,
          state: "running",
          powerSource: power.source,
          batteryPercent: power.batteryPercent,
          sleepPrevented: active,
          inhibitorPid: active ? (inhibitor?.pid ?? null) : null,
          checkedAt: isoNow(),
          lastError: undefined,
        };
      } catch (error) {
        stopChild(inhibitor);
        inhibitor = null;
        state = {
          ...state,
          sleepPrevented: false,
          inhibitorPid: null,
          checkedAt: isoNow(),
          lastError: error instanceof Error ? error.message : String(error),
        };
      }
      await writeState(state);

      const until = Date.now() + state.pollSeconds * 1_000;
      while (!stopRequested && Date.now() < until) await delay(Math.min(250, until - Date.now()));
    }
  } finally {
    stopChild(inhibitor);
    state = {
      ...state,
      state: stopRequested ? "stopped" : "expired",
      sleepPrevented: false,
      inhibitorPid: null,
      stoppedAt: isoNow(),
    };
    await writeState(state);
  }
}

export async function stopSession(sessionId: string): Promise<SessionState> {
  let state = await refreshLiveness(await readState(sessionId));
  if (state.state !== "running") return state;
  if (!(await isMonitorProcess(state.monitorPid, sessionId))) {
    state = { ...state, state: "stale", sleepPrevented: false, inhibitorPid: null };
    await writeState(state);
    return state;
  }
  process.kill(state.monitorPid as number, "SIGTERM");
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    await delay(50);
    state = await readState(sessionId);
    if (state.state !== "running") return state;
  }
  throw new Error(`session did not stop: ${sessionId}`);
}

export async function listSessions(): Promise<SessionState[]> {
  let names: string[];
  try {
    names = await readdir(stateDirectory());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const states: SessionState[] = [];
  for (const name of names.filter((entry) => /^[a-f0-9]{12}\.json$/.test(entry)).sort()) {
    try {
      const raw = await readFile(join(stateDirectory(), name), "utf8");
      states.push(await refreshLiveness(JSON.parse(raw) as SessionState));
    } catch {
      // Ignore an incomplete or concurrently replaced state file.
    }
  }
  return states;
}

export function commandName(cliPath: string): string {
  return basename(cliPath).replace(/\.js$/, "");
}
