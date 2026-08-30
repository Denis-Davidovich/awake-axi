import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cli = resolve("dist/bin/awake-axi.js");
const temporaryDirectories: string[] = [];

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  throw new Error("condition was not met before timeout");
}

async function command(args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  const { stdout } = await execFileAsync(process.execPath, [cli, ...args], { env });
  return stdout;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("lease lifecycle", () => {
  it("toggles the inhibitor with battery level and leaves no monitor after stop", async () => {
    const directory = await mkdtemp(join(tmpdir(), "awake-axi-test-"));
    temporaryDirectories.push(directory);
    const batteryFile = join(directory, "battery.txt");
    const pmset = join(directory, "pmset");
    const caffeinate = join(directory, "caffeinate");
    await writeFile(batteryFile, "20\n");
    await writeFile(pmset, `#!/bin/sh\nPERCENT=$(cat "$AWAKE_AXI_FAKE_BATTERY_FILE")\nprintf "Now drawing from 'Battery Power'\\n -InternalBattery-0\\t%s%%; discharging;\\n" "$PERCENT"\n`, { mode: 0o755 });
    await writeFile(caffeinate, "#!/bin/sh\nwhile kill -0 \"$3\" 2>/dev/null; do sleep 0.05; done\n", { mode: 0o755 });
    const env = {
      ...process.env,
      AWAKE_AXI_STATE_DIR: join(directory, "state"),
      AWAKE_AXI_PMSET: pmset,
      AWAKE_AXI_CAFFEINATE: caffeinate,
      AWAKE_AXI_FAKE_BATTERY_FILE: batteryFile,
    };

    const started = JSON.parse(await command(["start", "--min-battery", "35", "--poll-seconds", "0.1", "--json"], env));
    expect(started.state).toBe("running");
    expect(started.sleep_prevented).toBe(false);

    await writeFile(batteryFile, "90\n");
    await waitFor(async () => JSON.parse(await command(["status", started.session_id, "--json"], env)).sleep_prevented === true);

    await writeFile(batteryFile, "10\n");
    await waitFor(async () => JSON.parse(await command(["status", started.session_id, "--json"], env)).sleep_prevented === false);

    const stopped = JSON.parse(await command(["stop", started.session_id, "--json"], env));
    expect(stopped.state).toBe("stopped");
    const ps = spawn("/bin/ps", ["-p", String(started.monitor_pid)]);
    const exitCode = await new Promise<number | null>((resolvePromise) => ps.on("close", resolvePromise));
    expect(exitCode).not.toBe(0);

    const state = JSON.parse(await readFile(join(env.AWAKE_AXI_STATE_DIR, `${started.session_id}.json`), "utf8"));
    expect(state.inhibitorPid).toBeNull();
    expect(state.sleepPrevented).toBe(false);
  });

  it("scopes a lease to a wrapped command", async () => {
    const directory = await mkdtemp(join(tmpdir(), "awake-axi-run-"));
    temporaryDirectories.push(directory);
    const pmset = join(directory, "pmset");
    const caffeinate = join(directory, "caffeinate");
    await writeFile(pmset, "#!/bin/sh\nprintf \"Now drawing from 'AC Power'\\n\"\n", { mode: 0o755 });
    await writeFile(caffeinate, "#!/bin/sh\nwhile kill -0 \"$3\" 2>/dev/null; do sleep 0.05; done\n", { mode: 0o755 });
    const env = {
      ...process.env,
      AWAKE_AXI_STATE_DIR: join(directory, "state"),
      AWAKE_AXI_PMSET: pmset,
      AWAKE_AXI_CAFFEINATE: caffeinate,
    };
    const result = await execFileAsync(process.execPath, [cli, "run", "--poll-seconds", "0.1", "--", "/usr/bin/true"], { env });
    expect(result.stderr).toContain("awake_session:");
    const [stateFile] = (await readdir(env.AWAKE_AXI_STATE_DIR)).filter((name) => name.endsWith(".json"));
    const state = JSON.parse(await readFile(join(env.AWAKE_AXI_STATE_DIR, stateFile), "utf8"));
    expect(state.state).toBe("stopped");
  });

  it("persists an error state instead of crashing when the monitor process cannot spawn", async () => {
    const directory = await mkdtemp(join(tmpdir(), "awake-axi-spawnfail-"));
    temporaryDirectories.push(directory);
    const pmset = join(directory, "pmset");
    await writeFile(pmset, "#!/bin/sh\nprintf \"Now drawing from 'AC Power'\\n\"\n", { mode: 0o755 });
    const env = {
      ...process.env,
      AWAKE_AXI_STATE_DIR: join(directory, "state"),
      AWAKE_AXI_PMSET: pmset,
      AWAKE_AXI_NODE_BIN: join(directory, "no-such-node-binary"),
    };

    await expect(execFileAsync(process.execPath, [cli, "start", "--json"], { env })).rejects.toMatchObject({ code: 1 });

    const [stateFile] = (await readdir(env.AWAKE_AXI_STATE_DIR)).filter((name) => name.endsWith(".json"));
    const state = JSON.parse(await readFile(join(env.AWAKE_AXI_STATE_DIR, stateFile), "utf8"));
    expect(state.state).toBe("error");
    expect(typeof state.lastError).toBe("string");
    expect(state.lastError.length).toBeGreaterThan(0);
  });
});
