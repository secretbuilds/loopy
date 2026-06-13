import { realDeps } from "../src/cli.js";
import { assembleData } from "../src/dashboard/shell.js";
import { renderDashboard } from "../src/dashboard/render.js";
import type { DashboardState } from "../src/dashboard/state.js";

function parseDim(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

async function main(): Promise<void> {
  const cols = parseDim(process.argv[2], 100);
  const rows = parseDim(process.argv[3], 30);

  const deps = realDeps();
  const data = await assembleData(deps);
  const state: DashboardState = {
    data,
    focus: "inbox",
    inboxIndex: 0,
    loopsIndex: 0,
    activityScroll: 0,
    moodFrame: 0,
    spinnerFrame: 0
  };

  process.stdout.write(renderDashboard(state, cols, rows) + "\n");
}

main();
