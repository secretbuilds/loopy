# Task 06: Bundle generator — maker/checker loop

You are implementing one atomic task. You have NO context beyond this brief.
Everything you need is below. Do not improvise beyond it.

## Objective
Turn an approved loop candidate into an installable "loop bundle" using a
maker LLM pass, deterministic structural validation, and an independent checker
LLM pass. No bundle without a real verification step — reject rather than ship junk.

## Files you may touch (exclusive list)
- `src/generator.ts` — create
- `tests/generator.test.ts` — create

## Context

From `./types.js` (NodeNext ESM — .js suffix): `Candidate`, `BundleManifest`,
`Evidence`, `ToolName`.

Define locally in generator.ts (do NOT import from engine):
```ts
export type LlmRunner = (prompt: string) => Promise<string>;
```

## Implementation requirements

```ts
export interface GenerateOptions {
  runner: LlmRunner;
  bundlesDir: string;   // bundles root; create <bundlesDir>/<candidate.id>/
  now: string;          // ISO timestamp injected for determinism
}
export type GenerateResult =
  | { ok: true; bundleDir: string }
  | { ok: false; reason: string };
export function generateBundle(c: Candidate, opts: GenerateOptions): Promise<GenerateResult>;
```

**MAKER prompt** (const): given the candidate (type, summary, evidence count,
impactEstimate, suggestedTool), produce a `loop.md` containing EXACTLY these
six `##` sections, in order: `## Responsibility`, `## Trigger & cadence`,
`## Procedure`, `## Verification`, `## Convergence`, `## Escalation` — followed
by one fenced ```json block:
`{"kind": "schedule"|"hook"|"manual", "schedule"?: string, "hookEvent"?: string, "tool": "claude-code"|"codex"}`.
Section content rules to state in the prompt: Responsibility is one
outcome-framed sentence; Verification must name a concrete check (a command,
a file assertion, a comparison) — "verify it works" is not acceptable;
Escalation must say when to stop and notify the human; Convergence must include
an iteration or time cap. Output ONLY the markdown.

**Pipeline:**
1. Maker call → response.
2. Deterministic structural validation (code, no LLM): all six `##` headings
   present in order; fenced json block parses; kind in enum; tool in enum;
   schedule present when kind=schedule; hookEvent present when kind=hook.
3. CHECKER call — a SEPARATE runner invocation with a critique-only prompt:
   given candidate + loop.md, return ONLY
   `{"verdict": "pass"|"fail", "problems": ["..."]}`. Judge: Verification names
   a concrete check; Procedure plausibly addresses the candidate's evidence;
   Escalation/Convergence are real (caps, stop conditions); no invented tools
   or APIs. Parse with the same first-balanced-JSON approach; one re-ask on
   unparseable checker output, then treat as fail.
4. Structural fail OR checker fail → ONE revision cycle: maker re-called with
   problems appended ("Revise. Problems: ..."), then re-validate + re-check.
5. Second failure → `{ok:false, reason}` (include problems). Never write a
   failed bundle to disk.
6. Success → write `<bundlesDir>/<id>/loop.md`, `trigger.json` (the parsed
   block), `manifest.json` (BundleManifest: loopId=c.id, generatedAt=opts.now,
   evidence=c.evidence, tool from trigger.tool, installedPaths: [],
   uninstallNotes: []), and empty dir `state/`.

Tests (vitest, scripted fake runners, temp bundlesDir):
1. Happy path: maker emits valid doc, checker passes → files exist with exact
   expected contents; manifest fields correct.
2. Maker omits `## Verification` → structural fail → revision prompt contains
   the problem → revised doc passes → ok.
3. Checker fails twice with problems → ok:false, reason includes problems,
   bundle dir NOT created.
4. Trigger json invalid (kind:"cron") → counts as structural fail → revision.
5. Checker returns garbage once then valid JSON → still works (re-ask path).

## Acceptance criteria
1. `npm run typecheck` && `npx vitest run tests/generator.test.ts` exit 0.
2. A bundle missing any of the six sections can never be written to disk.
3. Failed generations leave zero files behind.

## Verification
```bash
npm run typecheck && npx vitest run tests/generator.test.ts
```

## Rules
- Touch ONLY the files listed. Do not modify types.ts/state.ts/engine.ts/package.json.
- No placeholder/TODO code. Complete the task or escalate.
- ESCALATION: ambiguity/contradiction/unlisted files needed → STOP, write
  `specs/loopy-v1/tasks/06-generator.questions.md`, end turn. Do not guess.
