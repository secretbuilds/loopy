# Task 01: Project scaffold + core types + state layer

You are implementing one atomic task. You have NO context beyond this brief.
Everything you need is below. Do not improvise beyond it.

## Objective
Scaffold "loopy" — a TypeScript CLI tool (a meta-agent that watches coding-agent
sessions and proposes automation loops). This task creates the project skeleton,
the core domain types, and the on-disk state layer everything else builds on.

## Files you may touch (exclusive list — create all)
- `package.json`
- `tsconfig.json`
- `vitest.config.ts`
- `.gitignore`
- `src/types.ts`
- `src/state.ts`
- `src/index.ts`
- `tests/state.test.ts`

## Context & requirements

**package.json**: name `loopy`, version `0.1.0`, `"type": "module"`, bin `loopy`
→ `dist/index.js`, engines node >=20. Dependencies: `commander` only.
DevDependencies: `typescript`, `vitest`, `tsx`, `@types/node`. Scripts:
`build` = `tsc`, `typecheck` = `tsc --noEmit`, `test` = `vitest run`, `dev` = `tsx src/index.ts`.

**tsconfig.json**: strict true, module NodeNext, moduleResolution NodeNext,
target ES2022, outDir dist, rootDir src, declaration true, include src.

**.gitignore**: node_modules, dist, *.log, .DS_Store

**src/types.ts** — export these (exact shapes):
```ts
export type ToolName = "claude-code" | "codex";

export interface SessionEvent {
  t: string;                       // ISO timestamp
  kind: "user_msg" | "command" | "tool_call" | "error";
  text?: string;                   // user_msg only
  name?: string;                   // command/tool_call only
  summary?: string;                // tool_call/error only
}

export interface SessionRecord {
  tool: ToolName;
  sessionId: string;
  startedAt: string;
  endedAt: string;
  cwd: string;
  repo?: string;
  branch?: string;
  events: SessionEvent[];
}

export type CandidateType = "recurring_task" | "babysitting" | "post_event"
  | "retry_storm" | "hygiene" | "cross_tool";

export interface Evidence { sessionId: string; events: number[]; }

export interface Candidate {
  id: string;                      // stable hash of pattern
  type: CandidateType;
  summary: string;
  evidence: Evidence[];
  occurrences: number;
  confidence: number;              // 0..1
  suggestedTool: ToolName;
  impactEstimate: string;          // e.g. "saves ~30 min/week"
}

export type ProposalStatus = "pending" | "approved" | "dismissed" | "snoozed";

export interface Proposal {
  candidate: Candidate;
  status: ProposalStatus;
  createdAt: string;
  snoozedUntil?: string;
  bundleDir?: string;              // set once generated
}

export interface BundleManifest {
  loopId: string;
  generatedAt: string;
  evidence: Evidence[];
  tool: ToolName;
  installedPaths: string[];        // every path written at install time
  uninstallNotes: string[];
}

export interface LoopyConfig {
  companion: "auto" | "manual" | "off";
  dailyTokenCap: number;           // default 100000
  pollIntervalMin: number;         // default 15
}
```

**src/state.ts** — the state layer. Requirements:
- `loopyHome(): string` — `process.env.LOOPY_HOME` or `~/.loopy`.
- `ensureDirs()` — creates `digests/`, `proposals/`, `bundles/`, `registry/`, `log/` under home.
- `readJson<T>(path): T | undefined` (undefined when missing; throws on parse error with file path in message) and `writeJsonAtomic(path, value)` (write to `path + ".tmp"` then rename — atomicity).
- Proposal store: `listProposals(): Proposal[]`, `getProposal(id)`, `saveProposal(p)` (file per proposal: `proposals/<candidate.id>.json`), `setProposalStatus(id, status)`.
- Registries: `registry/installed.json` and `registry/dismissed.json`, each a string[] of candidate ids; `addToRegistry(name, id)`, `inRegistry(name, id)`.
- Config: `loadConfig(): LoopyConfig` from `config.json` with defaults applied for missing fields.

**src/index.ts**: minimal entry — print `loopy 0.1.0` and exit 0 (real CLI comes later; keep it one line of logic).

**tests/state.test.ts** (vitest): use a temp dir via `LOOPY_HOME` (mkdtemp in beforeEach, rm in afterEach). Cover: ensureDirs creates all five dirs; writeJsonAtomic+readJson round-trip; readJson missing → undefined; proposal save/list/get/setStatus round-trip; registry add/check; loadConfig defaults when config.json absent.

## Acceptance criteria
1. `npm install` then `npm run typecheck`, `npm test`, `npm run build` all exit 0.
2. All exported types/functions above exist with the stated signatures.
3. State tests pass against a temp LOOPY_HOME (no writes outside it).

## Verification
```bash
npm install && npm run typecheck && npm test && npm run build
```

## Rules
- Touch ONLY the files listed. Do not create documentation files, README, or LICENSE.
- No placeholder/TODO code. Complete the task or escalate.
- ESCALATION: if this brief is ambiguous, contradictory, or requires touching
  unlisted files — STOP. Write your questions to
  `specs/loopy-v1/tasks/01-scaffold.questions.md` and end your turn. Do not guess.
