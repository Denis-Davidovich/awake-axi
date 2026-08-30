import { describe, expect, it } from "vitest";

import { isPowerSufficient, parsePmsetBattery } from "../src/power.js";

describe("power status", () => {
  it("parses battery power and percentage", () => {
    expect(parsePmsetBattery("Now drawing from 'Battery Power'\n -InternalBattery-0\t42%; discharging;"))
      .toEqual({ source: "battery", batteryPercent: 42 });
  });

  it("treats AC as sufficient regardless of battery percentage", () => {
    expect(isPowerSufficient({ source: "ac", batteryPercent: 4 }, 35)).toBe(true);
  });

  it("enforces the inclusive battery threshold", () => {
    expect(isPowerSufficient({ source: "battery", batteryPercent: 35 }, 35)).toBe(true);
    expect(isPowerSufficient({ source: "battery", batteryPercent: 34 }, 35)).toBe(false);
    expect(isPowerSufficient({ source: "unknown", batteryPercent: 100 }, 35)).toBe(false);
  });
});
