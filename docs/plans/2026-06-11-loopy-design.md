# Loopy — Design Spec (v1)

*A meta-agent that watches your agentic coding sessions, finds work that should
be a loop, and installs the loop for you.*

- Product name: **Loopy** · domain: **loopyagent.com**
- CLI: `loopy` · daemon managed via launchd/systemd
- Status: validated design, 2026-06-11
- Foundation: `docs/loop-engineering-context.md` (loop-engineering knowledge base)

---

## 1. Product thesis

Developers using agentic coding tools (Claude Code, Codex) repeat themselves
constantly — same prompts across sessions, manual polling of external state,
rituals after every commit. Loop engineering says these belong in
**responsibility loops** ("its job is no longer to help me fix a crash, it's to
keep our apps from crashing"). But discovering, designing, and installing a
good loop requires expertise most users don't have.

Loopy closes that gap: it **observes** sessions across tools, **detects**
recurring work, **generates** a complete, verification-first loop bundle, and
**installs** it into the user's tool with one approval.

Loopy practices the discipline it sells: external memory, deterministic
preprocessing before any model call, maker/checker splits, explicit convergence
criteria, human-in-the-loop trust threshold (the user approves every install).

## 2. Validated decisions

| Decision | Choice | Rationale |
|---|---|---|
| Audience | Shippable product | Design for other developers from day one |
| Observation | Transcript mining + no-LLM trigger hooks | Loop opportunities are longitudinal; mining is the only analysis engine; hooks only mark "fresh transcript ready" |
| Autonomy | Propose + one-click install | Trust threshold; no silent modification of user tools |
| v1 tools | Claude Code + Codex | Two biggest agentic CLIs; adapter architecture keeps others additive |
| Brain | User's own CLI entitlements (headless `claude -p`) | Zero backend, zero key onboarding, transcripts never leave the machine |
| Surface | CLI inbox (`loopy review`) + in-tool session-start nudge | Works identically across tools, no GUI to build |
| Lifecycle | Install-and-done (v1) | Smallest v1; health monitoring is the first v2 item — see §14 |
| Character | Noodle-loop critter, terminal-only (ASCII/ANSI) | Reads as "a loop" instantly; ships inside the CLI, no native app |
| Character habitat | Companion window auto-spawned on session start | True ambient presence without leaving the terminal — see §10 |
| Aliveness | Honest moods + real milestones, never guilt | Every animation maps to real state; guilt mechanics are uninstall fuel |

## 3. Architecture

Six components, one process boundary, all state in `~/.loopy/` as plain files.

```
 Claude Code sessions ──┐                          ┌─> claude-code installer
 Codex sessions ────────┤                          ├─> codex installer
                        v                          │
 [Watcher] ─> [Adapters.read] ─> [Digester] ─> [Pattern Engine] ─> [Generator] ─> [CLI inbox] ─> [Adapters.install]
  daemon       per-tool parse     zero-LLM        headless claude    maker+checker   loopy review     one-click
                                  extraction      batched analysis   LLM passes      approve/dismiss
```

1. **Watcher (daemon)** — lightweight background process (launchd on macOS,
   systemd on Linux). Wakes on marker-file touches from the optional Claude
   Code `SessionEnd` trigger hook, or polls (default 15 min) for Codex and
   hook-less setups. Never calls an LLM.

2. **Adapters (per-tool)** — `claude-code`, `codex`. Each implements:
   - `read`: locate + parse session transcripts (`~/.claude/projects/**/*.jsonl`,
     `~/.codex/sessions/...`) into a common `SessionRecord`.
   - `install`: write an approved loop bundle into that tool's native surfaces.
   - `uninstall`: reverse an install completely from the bundle manifest.
   All tool-specific knowledge lives here; everything downstream is tool-agnostic.

3. **Digester (deterministic, zero-LLM)** — reduces transcripts ~95%: user
   messages, slash/tool/command names, repo + branch context, error markers,
   timestamps, session duration. Runs a secret-redaction filter (see §10).
   Output: one digest file per session in `~/.loopy/digests/`.

4. **Pattern Engine (LLM, scheduled)** — one batched pass (nightly by default,
   or `loopy scan` on demand) via headless `claude -p` with structured JSON
   output. Inputs: new digests + `pattern-memory.md` (rolling candidate
   patterns, dismissed proposals, installed loops). Outputs: opportunity
   candidates with evidence citations and confidence. Detection only — it does
   not write loops.

5. **Generator + CLI** — for candidates over the confidence threshold, a
   **maker** pass drafts the full loop bundle, then an independent **checker**
   pass critiques it against the guardrail checklist (§7) before it may enter
   the inbox. `loopy review` shows pattern, evidence, and bundle;
   approve → adapter installs; dismiss → recorded in pattern memory so it is
   never re-proposed; snooze → resurfaces after N days.

6. **Companion TUI (zero-LLM)** — `loopy companion`, a small terminal window
   hosting Loopy-the-character and the review inbox. Auto-spawned on session
   start by the same trigger signals the watcher already uses. Renders only
   `~/.loopy/` state files; never calls an LLM. Full design: §10.

## 4. SessionRecord (common format)

```jsonc
{
  "tool": "claude-code | codex",
  "session_id": "...",
  "started_at": "...", "ended_at": "...",
  "cwd": "/path/to/repo", "repo": "github.com/x/y", "branch": "main",
  "events": [
    { "t": "...", "kind": "user_msg",  "text": "..." },
    { "t": "...", "kind": "command",   "name": "/review" },
    { "t": "...", "kind": "tool_call", "name": "Bash", "summary": "gh run watch" },
    { "t": "...", "kind": "error",     "summary": "tests failed: ..." }
  ]
}
```

Parsers fail soft: a transcript that doesn't parse is logged and skipped, never
fatal. Format drift in either tool degrades freshness, not correctness.

## 5. Opportunity taxonomy

What the Pattern Engine looks for. Each type maps to a loop archetype:

| Type | Signal | Loop archetype |
|---|---|---|
| **Recurring task** | Same/similar prompt in ≥3 sessions over ≥7 days ("update deps", "summarize new issues") | Scheduled loop (cron / Claude Code schedule) |
| **Babysitting / polling** | User manually checks external state repeatedly (CI status, deploy, crash reports) | Watch loop with convergence condition |
| **Post-event ritual** | Same action consistently after an event type (after every commit → same review prompt) | Hook-triggered loop |
| **Retry storm** | Within-session: ≥3 manual retries of the same operation with error feedback | Verification loop (call → verify → inject error → retry) |
| **Scheduled hygiene** | Time-clustered behavior (every Monday morning: same cleanup) | Calendar-scheduled loop |
| **Cross-tool duplication** | Same task appears in both Claude Code and Codex histories | Consolidated standing loop in one tool |

Every candidate must cite evidence: session IDs + the matching events. No
evidence, no proposal — this is enforced by the output schema, not by prompt
hope.

## 6. Pattern Engine contract

- Invocation: `claude -p` headless, JSON output mode, with a fixed system
  prompt derived from §5 and the loop-engineering knowledge base.
- Inputs per run: new digests since the last run (token-capped; oldest spill to
  the next run), `pattern-memory.md`, registry of installed + dismissed loops.
- Output schema (validated; on schema failure, error is injected and the call
  retried up to 3× — Loopy's own verification loop):

```jsonc
{
  "candidates": [{
    "id": "stable-hash-of-pattern",
    "type": "recurring_task | babysitting | post_event | retry_storm | hygiene | cross_tool",
    "summary": "Checks CI status manually in most sessions on repo X",
    "evidence": [{ "session_id": "...", "events": [3, 17] }],
    "occurrences": 9,
    "confidence": 0.86,
    "suggested_tool": "claude-code"
  }],
  "pattern_memory_updates": ["..."]
}
```

- Promotion threshold: confidence ≥ 0.75 AND occurrences ≥ 3 → Generator.
  Below threshold → held in pattern memory as a watch-item.
- Dedup is by stable pattern `id` against installed/dismissed registries.

## 7. Loop bundle anatomy

What the Generator produces and the user approves. Every bundle:

```
~/.loopy/bundles/<loop-id>/
  manifest.json     # provenance: evidence, generated date, installed paths, uninstall steps
  loop.md           # the loop prompt (see required sections below)
  trigger.*         # tool-specific trigger artifact (see §8)
  state/            # the loop's own external memory dir
```

`loop.md` required sections (checker rejects drafts missing any):

1. **Responsibility** — one sentence, outcome-framed ("keep CI green on repo X"),
   not task-framed.
2. **Trigger & cadence** — when it runs and why that cadence.
3. **Procedure** — steps, with external state reads/writes to `state/` explicit.
4. **Verification** — how the loop checks its own work before acting/reporting.
   No bundle ships without this section. Power without verification =
   beautiful failure.
5. **Convergence / exit criteria** — what "done this iteration" means; iteration
   and token caps.
6. **Escalation** — conditions under which it stops and notifies the human
   instead of acting.

Maker/checker: the maker drafts; an independent checker pass (separate
`claude -p` invocation, critique-only system prompt) validates against this
checklist and the evidence. Failed drafts get one revision cycle, then are
dropped with a log entry — a bad proposal costs user trust; no proposal costs
nothing.

## 8. Installation surfaces (per adapter)

### Claude Code
| Archetype | Surface |
|---|---|
| Scheduled / hygiene | Scheduled cloud agent (routine) when available; else launchd/cron + `claude -p "$(cat loop.md)"` |
| Post-event ritual | Hook in `settings.json` (e.g. PostToolUse/Stop) invoking the loop headlessly |
| Watch / babysitting | `/loop`-style recurring prompt or cron + headless with convergence check |
| Retry storm | Skill/command file the user invokes, wrapping the operation in a verify-retry loop |

Installer writes are additive and manifest-tracked: hooks are appended (never
replacing user entries), files are new, and every written path is recorded in
`manifest.json` for clean uninstall.

### Codex
No native loop primitives → all archetypes compile to: launchd/cron job +
`codex exec` with the loop prompt, plus `AGENTS.md` standing-instruction
snippets where appropriate. Same manifest tracking.

### Uninstall
`loopy uninstall <loop-id>` reverses every install from the manifest. Required
in v1 even though lifecycle is install-and-done: one-click in demands
one-command out.

## 9. CLI & UX

```
loopy setup        # detect tools, install daemon + optional trigger hook, initial history scan
loopy scan         # run the pattern engine now
loopy review       # opens the companion TUI in inbox mode (approve / dismiss / snooze)
loopy companion    # the Loopy window: ambient pet + inbox (§10); auto-spawned per config
loopy list         # installed loops + where they're installed
loopy uninstall <id>
loopy pause|resume # stop/start the daemon
loopy status       # daemon health, last scan, token spend estimate
```

- **In-tool nudge**: optional SessionStart hook adds one context line — "Loopy:
  2 loop proposals pending — `loopy review`". One line, never more; never
  interrupts mid-session.
- **First-run moment**: `loopy setup` mines existing history immediately, so
  the user sees real proposals within minutes of installing — the activation
  moment.

## 10. Loopy — the character & companion window

**The creature.** Loopy is a **noodle-loop critter**: a soft rounded loop with
its face in the curl. Pure ASCII/ANSI, ~6 rows tall, animated at 2–4 fps. The
body is the emotional instrument — it curls, bounces, and spins.

```
   idle            excited           celebrating        sleepy

    ╭──╮            ╭──╮ ✧           ✧ ╭──╮ ✧            ╭──╮
   ╭│◕ ◕│╮         ╭│✧ ✧│╮           ╭│✧◡✧│╮            ╭│− −│╮  z Z
    ╰◡◡╯            ╰◡◡╯ ✧           ╰╰─◡─╯╯             ╰‿‿╯
```

**The companion window.** `loopy companion` runs a small TUI (~44×14 chars).
Spawn triggers are the signals the architecture already has: the Claude Code
SessionStart trigger hook, and the watcher's detection of a new Codex session.
On trigger, Loopy opens a sized, corner-positioned window in the user's
terminal (macOS: AppleScript against Terminal.app/iTerm2; Linux/Windows: v2).
**Singleton** — a second session focuses the existing window, never spawns
another. Spawn behavior is config: `companion: auto | manual | off`, chosen
during `loopy setup`. The TUI reads only `~/.loopy/` state files: zero LLM
calls, zero token cost.

**Two modes, one window.**
- *Ambient*: Loopy idles with live status — sessions watched, loops installed,
  proposals waiting.
- *Inbox*: press `r` and the window expands into the full review inbox
  (evidence, bundle preview, approve/dismiss/snooze). `loopy review` from any
  terminal opens this same TUI. The inbox lives where Loopy lives.

**Honest moods (state map).** Every animation maps to real state:

| Real state | Loopy |
|---|---|
| All quiet, loops healthy | sleepy, slow blink, z Z |
| New proposals waiting | perky, occasional bounce |
| User reviewing | attentive, follows along |
| Loop installed | spin + confetti |
| A loop is failing (v2) | worried ◕⌓◕ |

Real milestones get celebrated (first loop installed, 10th loop, 30 days of
clean runs). **Never guilt** — this is a product principle, not art direction:
no droopy-because-you-ignored-it, dismissals met with grace, no streak-shaming.

**Voice.** Warm encourager: lowercase, brief, celebrates the *user's* growth
("that's a responsibility you don't carry anymore~"), teaches one
loop-engineering micro-lesson at a time. All user-facing strings live in a
single voice file so personality stays consistent and maintainable.

## 11. Privacy & security

- **Nothing leaves the machine** except the headless `claude -p` calls the
  user's own CLI already makes under their account. No Loopy backend, no
  telemetry in v1.
- Digester runs a redaction pass (high-entropy strings, key-shaped tokens,
  `.env`-style assignments) before digests are written; raw transcripts are
  read but never copied.
- Installer never edits existing user config entries — additive writes only,
  all manifest-tracked.
- Generated loop prompts inherit the guardrails of §7 (escalation rules, caps),
  and run under the user's existing tool permission model — Loopy grants
  nothing the user's tools don't already have.

## 12. Token budget (user's plan)

| Activity | Frequency | Est. tokens |
|---|---|---|
| Digestion | per session | 0 (deterministic) |
| Pattern engine pass | nightly | ~30–60k |
| Generation (maker + checker) | per promoted candidate | ~10–25k |
| **Typical heavy user** | per day | **~40–80k** |

Configurable daily cap (default 100k); engine skips a run rather than exceed
it, and `loopy status` reports spend.

## 13. Failure modes & handling

| Failure | Handling |
|---|---|
| Transcript format drift | Parser fails soft, logs, skips; adapter version pinned per tool release |
| `claude -p` schema violation | Error-injection retry ×3, then skip run (verification loop) |
| CLI not installed / not logged in | `loopy status` surfaces it; daemon idles, no crash |
| Hook install conflicts | Additive-only writes; on any ambiguity, fall back to polling and tell the user |
| Bad proposal approved | Uninstall is one command; manifest makes reversal total |
| Runaway generated loop | Every bundle carries iteration/token caps + escalation rules (checker-enforced) |
| Daemon dies | launchd/systemd restarts; watcher is stateless between wakes |

No silent failures: every skip/retry/drop lands in `~/.loopy/log/`.

## 14. v1 scope rationale & roadmap

**Why this is "only v1":** the single risky bet is **proposal quality** — do
mined patterns convert into loops users actually approve and keep? Everything
deferred either (a) depends on that bet paying off, or (b) adds surface area
without testing it. Health monitoring and evolution need a population of
installed, running loops to monitor; graduated autonomy needs an approval
track record; more adapters and GUIs multiply maintenance before the engine is
proven. v1 is the smallest product that tests the bet end-to-end on real users.

Roadmap, in order:
1. **v2 — Health monitoring**: track installed loop runs/failures, surface
   "failed 3× — fix or retire?" in the inbox. First priority because rotting
   loops erode the trust the product depends on.
2. **v2 — Loop evolution**: rewrite prompts from failure logs, tune cadences,
   merge overlapping loops (knowledge base §7, principle 6).
3. **v2/v3 — Graduated autonomy**: categories with repeated approvals earn
   auto-install + notification + rollback.
4. **v3 — More adapters**: OpenCode, Cursor CLI, etc. — additive by design.
5. **v3 — Hosted/team tier**: shared pattern libraries, org-level loops; brings
   the backend + security story when revenue justifies it.

## 15. Testing strategy

- **Adapters**: golden-file tests — real (sanitized) transcript fixtures per
  tool version → expected `SessionRecord`s. New tool releases add fixtures.
- **Digester**: property tests — no high-entropy/redacted content in output;
  size-reduction floor.
- **Pattern engine**: eval-harness with seeded digest sets containing planted
  patterns (and decoys); measure precision/recall per taxonomy type. Quality
  gate before any prompt change ships.
- **Generator/checker**: every bundle in the eval set must pass §7 checklist;
  adversarial cases (pattern with no safe loop) must be dropped, not shipped.
- **Installer**: end-to-end on a sandbox home dir — install, verify the loop
  actually fires (run the trigger), uninstall, assert zero residue.
- **Companion TUI**: render-to-string unit tests for every mood in the §10
  state map; singleton spawn test (two triggers → one window); inbox
  keybinding flows; voice-file review for guilt-free tone.

## 16. Open questions (not blocking build start)

- Distribution: Homebrew tap vs npm vs standalone binary (affects daemon install UX).
- Similarity matching in the digester: embed-and-cluster locally vs let the
  pattern engine judge similarity from raw digests (start with the latter; add
  clustering only if nightly token costs demand it).
- Whether `loopy review` proposals should include a dry-run ("run this loop
  once now, show me the output") before install — strong trust-builder,
  moderate complexity. Lean yes if v1 timeline allows.
- Windows support timing (no launchd/systemd; Task Scheduler adapter).
