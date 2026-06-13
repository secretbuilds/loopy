import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  approveAction,
  bundleDirFor,
  daemonPlistPath,
  dismissAction,
  pauseAction,
  readCompanionState,
  resumeAction,
  scanAction,
  snoozeAction,
  uninstallAction,
  type CliDeps
} from "../cli.js";
import { getProposal, loadConfig, loopyHome, readJson } from "../state.js";
import { readEvents } from "../events.js";
import { readBundleManifest, readTrigger } from "../installers/shared.js";
import {
  reduce,
  type DashboardData,
  type DashboardState,
  type Effect,
  type Focus,
  type LoopRow
} from "./state.js";
import { renderDashboard } from "./render.js";

// Assemble the live DashboardData from disk + launchctl. Pure read: performs
// no mutations.
export async function assembleData(deps: CliDeps): Promise<DashboardData> {
  const { proposals, sessions } = readCompanionState(deps);

  const plist = daemonPlistPath(deps);
  let daemon: DashboardData["daemon"];
  if (!existsSync(plist)) {
    daemon = "not-installed";
  } else {
    const { code } = await deps.exec("launchctl", ["list", "com.loopy.daemon"]);
    daemon = code === 0 ? "running" : "paused";
  }

  const spend = readJson<Record<string, number>>(join(loopyHome(), "log", "spend.json")) ?? {};
  const spendToday = spend[deps.now().slice(0, 10)] ?? 0;
  const spendCap = loadConfig().dailyTokenCap;

  const installed = readJson<string[]>(join(loopyHome(), "registry", "installed.json")) ?? [];
  const loops: LoopRow[] = installed.map((id) => {
    const dir = bundleDirFor(getProposal(id), id);
    try {
      const manifest = readBundleManifest(dir);
      return { id: manifest.loopId, kind: readTrigger(dir).kind, tool: manifest.tool };
    } catch {
      return { id, kind: "?", tool: "?" };
    }
  });

  const events = readEvents(50).map((e) => ({ t: e.t, kind: e.kind, msg: e.msg }));

  return { sessions, daemon, spendToday, spendCap, proposals, loops, events };
}

// Execute one reducer Effect against the real CLI actions and return the flash
// string to show afterward.
export async function dispatchEffect(deps: CliDeps, effect: Effect): Promise<string> {
  switch (effect.type) {
    case "approve": {
      const p = getProposal(effect.id);
      if (p === undefined) return `bundle "${effect.id}" not found`;
      await approveAction(deps, p);
      return `🌱 "${effect.id}" installed — it's off your plate now`;
    }

    case "dismiss": {
      const p = getProposal(effect.id);
      if (p === undefined) return `"${effect.id}" not found`;
      await dismissAction(deps, p);
      return `dismissed "${effect.id}"`;
    }

    case "snooze": {
      const p = getProposal(effect.id);
      if (p === undefined) return `"${effect.id}" not found`;
      await snoozeAction(deps, p);
      return `snoozed "${effect.id}" for 7 days`;
    }

    case "uninstall": {
      await uninstallAction(deps, { id: effect.id });
      return `uninstalled "${effect.id}"`;
    }

    case "scan": {
      const captured: string[] = [];
      await scanAction({ ...deps, out: (line) => captured.push(line) });
      return captured.length > 0 ? captured[captured.length - 1] : "scan complete";
    }

    case "toggle-pause": {
      const data = await assembleData(deps);
      if (data.daemon === "running") {
        await pauseAction(deps);
        return "daemon paused";
      }
      await resumeAction(deps);
      return "daemon resumed";
    }
  }
}

// The interactive shell: raw-mode stdin, render loop, resize, clean exit.
// Resolves when the user quits.
export function runDashboard(deps: CliDeps, startFocus?: Focus): Promise<void> {
  return new Promise<void>((resolve) => {
    void (async () => {
      const data = await assembleData(deps);
      let state: DashboardState = {
        data,
        focus: startFocus ?? "inbox",
        inboxIndex: 0,
        loopsIndex: 0,
        activityScroll: 0,
        moodFrame: 0,
        spinnerFrame: 0
      };

      const isTty = process.stdin.isTTY === true;
      let busy = false;

      const render = (): void => {
        const cols = process.stdout.columns ?? 80;
        const rows = process.stdout.rows ?? 24;
        process.stdout.write("\x1b[2J\x1b[H" + renderDashboard(state, cols, rows) + "\n");
      };

      const tick = setInterval(() => {
        const next = reduce(state, { kind: "tick" });
        state = next.state;
        render();
      }, 333);
      tick.unref();

      const onResize = (): void => render();

      const cleanup = (): void => {
        clearInterval(tick);
        process.stdout.removeListener("resize", onResize);
        process.stdin.removeListener("data", onData);
        if (isTty) {
          process.stdin.setRawMode(false);
        }
        process.stdin.pause();
        process.stdout.write("\n");
      };

      const apply = (action: Parameters<typeof reduce>[1]): void => {
        const next = reduce(state, action);
        state = next.state;
      };

      const runEffect = async (effect: Effect): Promise<void> => {
        busy = true;
        apply({ kind: "busy", label: effect.type === "scan" ? "scanning" : "working" });
        render();
        try {
          const flash = await dispatchEffect(deps, effect);
          apply({ kind: "done", flash });
        } catch (err) {
          apply({
            kind: "done",
            flash: `error: ${err instanceof Error ? err.message : String(err)}`
          });
        } finally {
          try {
            const fresh = await assembleData(deps);
            apply({ kind: "data", data: fresh });
          } catch {
            // A failing refresh must not re-freeze the UI — keep the last data.
          }
          busy = false;
          render();
        }
      };

      const onData = (chunk: Buffer): void => {
        const key = normalizeKey(chunk.toString());
        if (key === "\x03") {
          cleanup();
          resolve();
          return;
        }
        if (key === null) return;
        if (busy) return;

        const next = reduce(state, { kind: "key", key });
        state = next.state;

        if (state.quit) {
          cleanup();
          resolve();
          return;
        }

        if (next.effect) {
          void runEffect(next.effect);
          return;
        }

        render();
      };

      if (isTty) {
        process.stdin.setRawMode(true);
      }
      process.stdin.resume();
      process.stdin.on("data", onData);
      process.stdout.on("resize", onResize);
      render();
    })();
  });
}

function normalizeKey(seq: string): string | null {
  switch (seq) {
    case "\x1b[A":
      return "up";
    case "\x1b[B":
      return "down";
    case "\x1b[C":
      return "right";
    case "\x1b[D":
      return "left";
    case "\x1b":
      return "esc";
    case "\r":
    case "\n":
      return "enter";
    case "\t":
      return "tab";
    case "\x03":
      return "\x03";
  }
  if (seq.length === 1 && seq >= "a" && seq <= "z") return seq;
  return null;
}
