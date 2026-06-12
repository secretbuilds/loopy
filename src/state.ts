import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { LoopyConfig, Proposal, ProposalStatus } from "./types.js";

const STATE_DIRS = ["digests", "proposals", "bundles", "registry", "log"] as const;
const DEFAULT_CONFIG: LoopyConfig = {
  companion: "auto",
  dailyTokenCap: 100000,
  pollIntervalMin: 15
};

export function loopyHome(): string {
  return process.env.LOOPY_HOME ?? join(homedir(), ".loopy");
}

export function ensureDirs(): void {
  for (const dir of STATE_DIRS) {
    mkdirSync(join(loopyHome(), dir), { recursive: true });
  }
}

export function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) {
    return undefined;
  }

  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse JSON at ${path}: ${error.message}`);
    }

    throw error;
  }
}

export function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(tmpPath, path);
}

export function listProposals(): Proposal[] {
  ensureDirs();
  const proposalsDir = join(loopyHome(), "proposals");
  const proposals = readdirSync(proposalsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => readJson<Proposal>(join(proposalsDir, entry.name)));

  return proposals.filter((proposal): proposal is Proposal => proposal !== undefined);
}

export function getProposal(id: string): Proposal | undefined {
  return readJson<Proposal>(proposalPath(id));
}

export function saveProposal(proposal: Proposal): void {
  ensureDirs();
  writeJsonAtomic(proposalPath(proposal.candidate.id), proposal);
}

export function setProposalStatus(id: string, status: ProposalStatus): void {
  const proposal = getProposal(id);
  if (proposal === undefined) {
    return;
  }

  saveProposal({ ...proposal, status });
}

export function addToRegistry(name: string, id: string): void {
  ensureDirs();
  const path = registryPath(name);
  const ids = readJson<string[]>(path) ?? [];

  if (!ids.includes(id)) {
    ids.push(id);
    writeJsonAtomic(path, ids);
  }
}

export function inRegistry(name: string, id: string): boolean {
  const ids = readJson<string[]>(registryPath(name)) ?? [];
  return ids.includes(id);
}

export function loadConfig(): LoopyConfig {
  const config = readJson<Partial<LoopyConfig>>(join(loopyHome(), "config.json")) ?? {};
  return { ...DEFAULT_CONFIG, ...config };
}

function proposalPath(id: string): string {
  return join(loopyHome(), "proposals", `${id}.json`);
}

function registryPath(name: string): string {
  return join(loopyHome(), "registry", `${name}.json`);
}
