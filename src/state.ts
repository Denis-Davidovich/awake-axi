import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { PowerSource } from "./power.js";

export type SessionStatus = "starting" | "running" | "stopped" | "expired" | "stale" | "error";

export interface SessionState {
  sessionId: string;
  state: SessionStatus;
  powerSource: PowerSource;
  batteryPercent: number | null;
  sleepPrevented: boolean;
  minBatteryPercent: number;
  pollSeconds: number;
  startedAt: string;
  expiresAt: string;
  checkedAt?: string;
  stoppedAt?: string;
  monitorPid: number | null;
  inhibitorPid: number | null;
  lastError?: string;
}

export function stateDirectory(): string {
  return process.env.AWAKE_AXI_STATE_DIR
    ?? join(homedir(), "Library", "Caches", "awake-axi");
}

export function validateSessionId(sessionId: string): void {
  if (!/^[a-f0-9]{12}$/.test(sessionId)) {
    throw new Error(`invalid session id: ${sessionId}`);
  }
}

export function sessionPath(sessionId: string): string {
  validateSessionId(sessionId);
  return join(stateDirectory(), `${sessionId}.json`);
}

export async function readState(sessionId: string): Promise<SessionState> {
  return JSON.parse(await readFile(sessionPath(sessionId), "utf8")) as SessionState;
}

export async function writeState(state: SessionState): Promise<void> {
  const directory = stateDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const destination = sessionPath(state.sessionId);
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, destination);
}
