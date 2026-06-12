# loopy

loopy is a local meta-agent that watches your Claude Code and Codex sessions, spots work you keep doing by hand, and proposes installable automation loops with a cute terminal companion that stays out of the way.

## Install

```bash
npm i -g loopy
loopy setup
```

`loopy setup` creates local state, adds a Claude Code session-start trigger, and installs the background watcher unless you pass `--no-daemon`.

## Commands

| Command | What it does |
| --- | --- |
| `loopy setup` | Initialize config, trigger hook, and daemon. |
| `loopy setup --companion manual` | Keep the companion out of automatic nudges. |
| `loopy setup --no-daemon` | Configure loopy without installing the background daemon. |
| `loopy mark` | Drop a watcher marker; mainly used by the trigger hook. |
| `loopy daemon` | Run the background watcher in the foreground. |
| `loopy scan` | Analyze local digests and create pending proposals. |
| `loopy review` | Open the review inbox for pending proposals. |
| `loopy companion` | Run the ambient terminal companion. |
| `loopy list` | List installed loops. |
| `loopy uninstall <id>` | Remove an installed loop by id. |
| `loopy pause` | Pause the background daemon. |
| `loopy resume` | Resume the background daemon. |
| `loopy status` | Show daemon, spend, and proposal status. |

## How It Works

loopy is a small local pipeline:

1. The watcher notices new Claude Code and Codex session transcripts.
2. The digester reduces each session to a compact, redacted text digest.
3. The nightly engine asks your own `claude -p` CLI to look for recurring patterns.
4. Good candidates land in the review inbox.
5. Approved proposals become bundles with `loop.md`, `trigger.json`, `manifest.json`, and local state.
6. One-click install wires the loop into Claude Code or Codex.

Everything runs from local files. The only LLM calls are calls made through your own Claude CLI.

## Proposals And Loops

A proposal is not installed automatically. It must pass the engine quality bar, then you review it.

An installed loop contains:

- `loop.md`: the operating instructions.
- `trigger.json`: schedule, hook, or manual trigger metadata.
- `manifest.json`: evidence, target tool, and every path touched during install.
- `state/`: local loop state.

The manifest is what makes uninstall exact: loopy removes the paths it created for that loop and clears the recorded install metadata.

## Privacy

Transcripts stay on your machine.

Before any digest reaches an LLM call, loopy redacts common secrets such as API keys, tokens, passwords, bearer tokens, GitHub tokens, AWS keys, URL credentials, and high-entropy secret-looking strings.

The engine sends only compact redacted digests to your own `claude -p` process. loopy does not send transcripts to a service of its own.

Uninstall removes the loop files and integrations recorded in the loop manifest. To remove all loopy state, delete the local loopy home directory after uninstalling loops.

## Loopy

```text
   ╭──╮
  ╭│◕ ◕│╮
   ╰◡◡╯
```

The never-guilt principle: loopy may suggest useful automation, but it should never shame you for ignoring, snoozing, or dismissing a proposal. A quiet tool is better than a nagging one.

## Manual Live Eval

Run the live proposal-quality check with:

```bash
npx tsx scripts/live-eval.ts
```

It plants two recurring patterns and one decoy in synthetic digests, runs the real `claude -p` engine path, prints what was found, and exits non-zero only when the planted patterns are missed or the decoy is proposed.

CI can force the skip path:

```bash
LOOPY_CLAUDE_BIN=definitely-not-a-real-binary npx tsx scripts/live-eval.ts
```
