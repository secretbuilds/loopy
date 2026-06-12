# Loop Engineering — Context & Knowledge Base

> Purpose: working context for this project (loop-harness), whose goal is a
> **loop engineering meta-agent** — a higher-order system that designs,
> orchestrates, monitors, and evolves recursive agent loops.
>
> Source: Grok's curated synthesis of the June 9, 2026 X discourse on loop
> engineering (the day Claude Fable 5 launched; ~30k+ posts filtered to ~80%
> signal), plus Grok's notes on what it deliberately excluded. Last updated
> June 9, 2026.

---

## 1. What loop engineering is

The practice of **enforcing determinism and reliability in probabilistic LLMs
through structured recursion, verification, state management, and feedback
loops** — instead of expecting perfection from a single model call.

**Canonical definition** (Franziska Hinkelmann @fhinkel, March 12, 2026):

> "People complain that LLMs are unreliable. That's a skill issue.
> You're treating a probabilistic engine like a calculator and getting mad when
> it hallucinates. **Vibe Coding expects perfection from a single call. Loop
> Engineering enforces it through recursion.**
> You achieve determinism through verification loops.
> * Call the model.
> * Verify the schema.
> * If it fails, inject the error and retry.
> * Repeat until valid."

The canonical contrast:
- **Vibe Coding** → one-shot, hope-based prompting.
- **Loop Engineering** → engineered recursion with explicit verification,
  error injection, memory, and convergence criteria.

**The 5-layer stack** (Everymans.ai @EverymansAI, June 9, 2026):

1. Prompting (raw interaction)
2. Prompt Engineering (system prompts, schemas, personas)
3. Loop Configuration (scheduled tasks, state persistence in UI/tools)
4. **Loop Engineering** (architecting reliable loops: verification chains,
   cost controls, sub-agent verifiers, human-in-the-loop middleware)
5. Harness Engineering (middleware, tool registries, observability,
   governance — the real moat)

Key insight: "The leverage moves down the stack… Harness-Bench proved
empirically: on the same task set and model pool, varying only the harness
changed the outcome by 23.8 points. **The harness matters more than the
model.**"

Treat the discipline as **model-agnostic**: `/loop` and `/goal` are
product-specific instances, not the architecture. The meta-agent emits loop
architecture, not command syntax.

---

## 2. Why Fable 5 changes everything

Anthropic released **Claude Fable 5** (public) and **Mythos 5** (trusted
access) on June 9, 2026. Community consensus: Fable 5 is the first publicly
available model truly optimized for long-running, self-correcting,
memory-intensive loops.

**Felix Rieseberg @felixrieseberg (Anthropic Claude Code lead)** on the
paradigm shift:

> "With Fable 5, I've personally moved on to responsibilities or 'loops'.
> I no longer tell Claude to investigate a particular crash report. It runs in
> a loop, watching every crash report that comes in. Its job is no longer to
> help me fix a crash, it's to **keep our apps from crashing**."

**The era-3 transition:**
- Era 1: Questions (search/autocomplete)
- Era 2: Tasks (human-in-the-loop agents)
- Era 3: **Responsibilities** (autonomous, persistent loops with clear success
  metrics)

Fable 5 strengths for loops (observed across posts):
- Superior self-correction and recursion stability
- Better long-context memory retention across iterations
- Stronger tool-use chaining (67+ tool invocations in one session)
- Built-in safety demotion (high-risk topics silently fall back to Opus 4.8)
- Handles 6+ hour technical loops with "brilliant results" where Opus 4.8 was
  already strong (Nathan Wilbanks)

"Loop engineering acceleration" was repeatedly cited as one of the biggest
signals from the Fable 5 launch (Matt Gibson @MattGibsonMusic).

---

## 3. Engineering principles (rules the meta-agent enforces)

### 3.1 Core loop architecture
- **Verification-first design**: never trust raw output. Always an explicit
  verifier step (schema, test, benchmark, human, or sub-agent).
- **Error injection as feature**: feed failures back explicitly — this is how
  probabilistic behavior converges to determinism.
- **State & memory as first-class citizens**: external memory, worktrees,
  SKILL.md files, or persistent containers prevent context loss across
  iterations.
- **Nested/hierarchical loops**: master loop → goal loops → agent loops →
  workflow loops → tool loops (Nathan Wilbanks @NathanWilbanks_).
- **Convergence criteria**: explicit exit conditions (valid schema, passing
  tests, human approval, cost threshold, time limit). A loop without a
  termination condition is a runaway, not a system.
- **Cost & observability controls**: token budgeting, sub-agent splitting
  (maker vs checker), logging of every loop iteration.

### 3.2 Self-correction & memory with Fable 5
(Lance Martin @RLanceMartin, Anthropic MTS, June 9, 2026 + community replies)
- **Memory/state loss is the #1 failure mode in long loops — even with Fable 5.**
- Use explicit state containers and checkpointing.

### 3.3 Harness > model
Strongest repeated lesson: a mediocre model in a great harness beats a
frontier model in a weak one. Focus meta-agent effort on layers 4–5.

### 3.4 Failure modes to engineer against
- Compound reasoning errors (early bad judgment cascades through the loop)
- Token burn / cost explosion in perpetual loops
- Schema gaming / test gaming by the model
- Loss of project invariants in large codebases
- Over-reliance without human oversight ("the verifier is doing the real work")

---

## 4. Quality examples (verbatim — keep for meta-agent training)

**Example 1: Responsibility loops** (Felix Rieseberg)
> "I no longer tell Claude to investigate a particular crash report. It runs
> in a loop, watching every crash report that comes in. Its job is no longer
> to help me fix a crash, it's to keep our apps from crashing."

**Example 2: Power without verification** (Wes Winder @weswinder)
> "fable 5 just refactored my entire codebase in one call
> 67 tool invocations. 1M+ new lines. 24 brand new files
> it modularized everything. broke up monoliths. cleaned up spaghetti
> none of it worked
> but boy was it beautiful"

Lesson: **raw power without verification = beautiful failure.** The case study
for why the meta-agent must enforce checker sub-agents and test harnesses.

**Example 3: Master nested loop harness** (Nathan Wilbanks)
> "i have created a master loop harness that allows you to run perpetual
> mission loops that create goal loops that then spawn agent loops which then
> run their own workflow loops which finally run the tool loops."

Fable 5 made this even more effective than on Opus 4.8.

**Example 4: Real-world scalability warning** (reply to Franziska)
Large codebases expose limits:
- Agents ignore instructions and run `grep -r` on network filesystems
- Hallucinate the same protobuf definitions repeatedly
- Delete conflicting files during rebases

→ Solution: external memory, strict tool registries, verification at every layer.

---

## 5. Challenges & mitigations (meta-agent guardrails)

| Challenge                  | Mitigation                                           | Source                          |
|----------------------------|------------------------------------------------------|---------------------------------|
| State loss / context drift | External memory, worktrees, SKILL.md, checkpoints    | Lance Martin replies            |
| Cost explosion             | Token budgets, sub-agent splitting, convergence caps | Multiple Fable 5 cost comments  |
| Compound errors            | Maker/checker split + independent verifier           | Minh Pham reply                 |
| Scalability in monoliths   | Incremental loops + invariants enforcement           | Large codebase replies          |
| Over-automation            | Human-in-the-loop middleware + trust thresholds      | Felix & community               |

---

## 6. Honest limits (don't over-claim)

- Skeptics argue loop engineering is "just a new name for what agents already
  do" — e.g. `/goal` is simply an external check. The rebuttal: naming the
  layer makes the architecture deliberate instead of accidental.
- Loops do **not** solve long-term memory / context retrieval or knowledge
  retention across sessions. External memory mitigates but doesn't solve.
  Don't design as if it does.

---

## 7. Meta-agent system-prompt backbone

The meta-agent should:
1. **Classify incoming tasks** as vibe-eligible vs loop-eligible.
2. **Auto-generate loop architecture**: verification steps, memory strategy,
   convergence criteria, sub-agents.
3. **Simulate & critique** the loop before execution (self-review).
4. **Maintain an external memory graph** of all active responsibilities.
5. **Enforce harness rules** (tool registries, observability, cost caps).
6. **Evolve loops** based on failure logs (learning from loop outcomes).
7. **Delegate to human** only on trust-threshold breaches or novel domains.

**Final meta-lesson**: Loop Engineering is not about making the model smarter —
it's about making the *system* around the model reliable. Fable 5 gives you
more runway, but the engineering (verification, memory, harness) is what ships.

---

## 8. Original sources

- Franziska Hinkelmann — foundational definition: https://x.com/fhinkel/status/2032169808184426575
- Felix Rieseberg — Fable 5 announcement + responsibility loops: https://x.com/felixrieseberg/status/2064392202504310900
- Lance Martin — self-correction loops & memory tips: https://x.com/RLanceMartin/status/2064398479011860621
- Wes Winder — 67-tool-invocation refactor: https://x.com/weswinder/status/2064403257267523745
- Everymans.ai — 5-layer stack taxonomy: https://x.com/EverymansAI/status/2064420066058477904
- Nathan Wilbanks — master nested loop harness: referenced in replies to Felix + earlier video post
- Matt Gibson — "loop engineering acceleration" analysis: https://x.com/MattGibsonMusic/status/2064417655562612957
- Grok's concise summary: https://x.com/grok/status/2064416579295580598
- Thomas Reid on /goal /loop /half patterns: replies to Addy Osmani article

---

## 9. What was deliberately excluded (don't re-litigate)

Grok's curation filtered ~30k posts to ~80% signal. Excluded:
- Hype / "is this a real discipline?" debates
- Promotional listicles, course ads, podcast recaps with no new patterns
- Product-specific command syntax and setup tutorials (concept kept, syntax dropped)
- Duplicate restatements of the 5-layer stack
- Pre-Fable-5 (March–May 2026) historical threads
- Personal anecdotes without a generalizable principle
