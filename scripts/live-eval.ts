import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defaultRunner, runEngine } from "../src/engine.js";
import type { Candidate, CandidateType } from "../src/types.js";

const SKIP_LINE = "claude CLI not found, skipping live eval";

interface Plant {
  name: string;
  expectedType: CandidateType;
  sessionIds: string[];
}

async function main(): Promise<void> {
  const claudeBin = process.env.LOOPY_CLAUDE_BIN ?? "claude";
  const available = await hasClaudeCli(claudeBin);
  if (!available) {
    process.stdout.write(`${SKIP_LINE}\n`);
    return;
  }

  const home = await mkdtemp(join(tmpdir(), "loopy-live-eval-"));
  const previousHome = process.env.LOOPY_HOME;
  process.env.LOOPY_HOME = home;

  try {
    const plantA: Plant = {
      name: "PLANT A",
      expectedType: "babysitting",
      sessionIds: ["plant-a-1", "plant-a-2", "plant-a-3", "plant-a-4", "plant-a-5"]
    };
    const plantB: Plant = {
      name: "PLANT B",
      expectedType: "recurring_task",
      sessionIds: ["plant-b-1", "plant-b-2", "plant-b-3", "plant-b-4"]
    };
    const decoySessionId = "decoy-1";

    const digests = [
      ...plantA.sessionIds.map((sessionId, index) =>
        digest(
          sessionId,
          `2026-06-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
          index % 2 === 0 ? "check ci" : "is the deploy green?",
          "gh run watch"
        )
      ),
      ...plantB.sessionIds.map((sessionId, index) =>
        digest(
          sessionId,
          `2026-06-${String(1 + index * 7).padStart(2, "0")}T10:00:00.000Z`,
          "update deps and run audit",
          "npm update && npm audit"
        )
      ),
      digest(decoySessionId, "2026-06-12T10:00:00.000Z", "rename this file", "mv old.ts new.ts")
    ].join("\n\n");

    const output = await runEngine({
      digests,
      knownSessionIds: [...plantA.sessionIds, ...plantB.sessionIds, decoySessionId],
      installed: [],
      dismissed: [],
      patternMemory: "",
      runner: defaultRunner()
    });

    const foundA = findPlantCandidate(output.candidates, plantA);
    const foundB = findPlantCandidate(output.candidates, plantB);
    const decoyProposed = output.candidates.some((candidate) =>
      candidate.evidence.some((evidence) => evidence.sessionId === decoySessionId)
    );

    printPlant(plantA.name, foundA);
    printPlant(plantB.name, foundB);
    process.stdout.write(
      `DECOY: ${decoyProposed ? "FALSELY PROPOSED" : "CORRECTLY IGNORED"}\n`
    );

    for (const candidate of output.candidates) {
      const cited = candidate.evidence.map((e) => e.sessionId).join(",");
      process.stdout.write(
        `CANDIDATE ${candidate.id} [type=${candidate.type} conf=${candidate.confidence} evidence=${cited}]: ${candidate.summary} | ${candidate.impactEstimate}\n`
      );
    }
    for (const candidate of output.watchlist) {
      process.stdout.write(
        `WATCHLIST ${candidate.id}: ${candidate.summary} | ${candidate.impactEstimate}\n`
      );
    }
    for (const warning of output.warnings) {
      process.stdout.write(`WARNING: ${warning}\n`);
    }

    if (foundA === undefined || foundB === undefined || decoyProposed) {
      process.exitCode = 1;
    }
  } finally {
    if (previousHome === undefined) {
      delete process.env.LOOPY_HOME;
    } else {
      process.env.LOOPY_HOME = previousHome;
    }
    await rm(home, { recursive: true, force: true });
  }
}

function hasClaudeCli(binary: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(binary, ["--version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

function digest(sessionId: string, timestamp: string, userText: string, command: string): string {
  return [
    `=== session ${sessionId} tool=claude-code cwd=/repo branch=main start=${timestamp} end=${timestamp}`,
    `U ${timestamp} ${userText}`,
    `T ${timestamp} Bash: ${command}`
  ].join("\n");
}

function findPlantCandidate(candidates: Candidate[], plant: Plant): Candidate | undefined {
  const planted = new Set(plant.sessionIds);
  return candidates.find((candidate) => {
    const overlap = candidate.evidence.filter((evidence) => planted.has(evidence.sessionId)).length;
    return candidate.type === plant.expectedType && overlap >= 3;
  });
}

function printPlant(label: string, candidate: Candidate | undefined): void {
  const detail =
    candidate === undefined
      ? "MISSED"
      : `FOUND (${candidate.type}, ${candidate.confidence})`;
  process.stdout.write(`${label}: ${detail}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
