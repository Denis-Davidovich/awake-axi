import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type PowerSource = "ac" | "battery" | "unknown";

export interface PowerStatus {
  source: PowerSource;
  batteryPercent: number | null;
}

export function parsePmsetBattery(output: string): PowerStatus {
  const sourceText = output.match(/Now drawing from '([^']+)'/)?.[1]?.toLowerCase() ?? "";
  const percentText = output.match(/(\d+)%/)?.[1];
  const source: PowerSource = sourceText.includes("ac power")
    ? "ac"
    : sourceText.includes("battery power")
      ? "battery"
      : "unknown";

  return {
    source,
    batteryPercent: percentText === undefined ? null : Number.parseInt(percentText, 10),
  };
}

export function isPowerSufficient(power: PowerStatus, minBatteryPercent: number): boolean {
  if (power.source === "ac") return true;
  return power.source === "battery"
    && power.batteryPercent !== null
    && power.batteryPercent >= minBatteryPercent;
}

export async function readPowerStatus(): Promise<PowerStatus> {
  const pmset = process.env.AWAKE_AXI_PMSET ?? "/usr/bin/pmset";
  const { stdout } = await execFileAsync(pmset, ["-g", "batt"], { timeout: 5_000 });
  return parsePmsetBattery(stdout);
}
