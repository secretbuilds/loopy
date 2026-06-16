// Central content store — every page section imports copy from here
// instead of hardcoding strings. All copy is verbatim from the spec.

export const INSTALL_CMD =
  "curl -fsSL https://raw.githubusercontent.com/secretbuilds/loopy/main/install.sh | bash";
export const REPO_URL = "https://github.com/secretbuilds/loopy";
export const README_URL = "https://github.com/secretbuilds/loopy#readme";
export const SUPPORT_URL =
  "https://pump.fun/coin/4XRCJkkqYZXhMLu2chJ2Sdw3wR6dYZTu9aTS222Kpump";
export const GITHUB_STARS_FALLBACK = 677;

export interface NavLink {
  label: string;
  href: string;
}

export const nav: NavLink[] = [
  { label: "how it works", href: "#how" },
  { label: "the shift", href: "#shift" },
  { label: "faq", href: "#faq" },
];

export interface HeroDemo {
  line1: string;
  line2: string;
  proposal: string;
}

export interface Hero {
  versionBadge: string;
  h1: string;
  subcopy: string;
  docsHref: string;
  demo: HeroDemo;
}

export const hero: Hero = {
  versionBadge: "v0.1.0 · early software",
  h1: "The era of prompting is over.",
  subcopy:
    "loopy is a terminal meta-agent that watches how you work, finds the patterns, and writes the loops so you don't have to.",
  docsHref: README_URL,
  demo: {
    line1: "watching 5 sessions · daemon ✓ · spend 0/10000",
    line2: "all quiet — your loops have it covered",
    proposal: "▶ new proposal: auto-lint-fix · confidence 0.9",
  },
};

export interface ShiftQuote {
  text: string;
  author: string;
  role: string;
}

export interface Shift {
  heading: string;
  quotes: ShiftQuote[];
  closing: string;
}

export const shift: Shift = {
  heading: "The best engineers stopped prompting.",
  quotes: [
    {
      text: "I don't prompt Claude anymore. I have loops running that prompt Claude and figure out what to do. My job is to write loops.",
      author: "Boris Cherny",
      role: "creator of Claude Code",
    },
    {
      text: "Stop prompting coding agents. Start designing the loops that prompt them.",
      author: "Peter Steinberger",
      role: "",
    },
  ],
  closing:
    "The shift to loop engineering is real — but finding your patterns takes observation, pattern recognition, and time you don't have. loopy does that work for you.",
};

export interface PipelineStep {
  n: string;
  title: string;
  desc: string;
  mockLines: string[];
}

export interface Pipeline {
  heading: string;
  sub: string;
  steps: PipelineStep[];
}

export const pipeline: Pipeline = {
  heading: "From session to installed loop. Automatically.",
  sub: 'loopy runs quietly in the background. Here\'s the path from "I keep doing this by hand" to a running loop.',
  steps: [
    {
      n: "01",
      title: "Watch",
      desc: "A launchd daemon notices every new Claude Code session transcript the moment it lands.",
      mockLines: ["[watcher] session claude-code started · 13:28"],
    },
    {
      n: "02",
      title: "Digest",
      desc: "Each session is compressed and redacted to a compact text digest — secrets stripped before anything leaves your disk.",
      mockLines: ["[digester] session → digest · 🔒 redacted: 4 secrets"],
    },
    {
      n: "03",
      title: "Propose",
      desc: "Your own claude -p reads the digests, spots work you keep doing by hand, and lands a ready-to-install loop in your inbox.",
      mockLines: ["▶ auto-lint-fix   impact: high · confidence 0.9"],
    },
    {
      n: "04",
      title: "Install",
      desc: "Approve the ones that make sense. loopy writes the loop.md, trigger, and manifest — wired into Claude Code or Codex.",
      mockLines: [
        "~/.loopy/loops/auto-lint-fix/",
        "├ loop.md",
        "├ trigger.json",
        "└ manifest.json",
      ],
    },
  ],
};

export interface ImpactBar {
  label: string;
  before: string;
  after: string;
}

export interface Impact {
  heading: string;
  headingAccent: string;
  bars: ImpactBar[];
  kicker: string;
  footnote: string;
}

export const impact: Impact = {
  heading: "Most Claude Code users leave 40–70% on the table.",
  headingAccent: "loopy finds it.",
  bars: [
    {
      label: "Repetitive overhead",
      before: "90 min/wk",
      after: "10 min/wk",
    },
    {
      label: "Token burn on repeated patterns",
      before: "baseline",
      after: "−20–35%",
    },
    {
      label: "Automatable patterns found / month",
      before: "~0",
      after: "3–5",
    },
  ],
  kicker:
    "A single well-chosen loop replaces 50–200 manual prompts per month.",
  footnote: "Early estimates from initial use — your mileage will vary.",
};

export interface DashboardBullet {
  name: string;
  desc: string;
}

export interface Dashboard {
  heading: string;
  command: string;
  bullets: DashboardBullet[];
  subline: string;
}

export const dashboard: Dashboard = {
  heading: "One command. Your whole loop operation.",
  command: "$ loopy",
  bullets: [
    {
      name: "inbox",
      desc: "pending proposals: impact, evidence count, confidence score",
    },
    { name: "loops", desc: "what's installed, trigger kind, target tool" },
    { name: "activity", desc: "everything loopy did in the background" },
  ],
  subline: "Review, approve, dismiss, or snooze — all from the terminal.",
};

export interface Privacy {
  heading: string;
  paragraph: string;
  redacted: string[];
  pills: string[];
}

export const privacy: Privacy = {
  heading: "It never phones home.",
  paragraph:
    "Transcripts stay on your machine. Always. The only LLM calls go through your own claude -p binary.",
  redacted: [
    "api keys, tokens, passwords, bearer tokens",
    "github tokens, aws keys, url credentials",
    "high-entropy strings that look like secrets",
  ],
  pills: ["your own Claude credits", "no separate service", "open source"],
};

export interface Fable {
  tag: string;
  h3: string;
  paragraph: string;
  example: string;
}

export const fable: Fable = {
  tag: "BONUS · /fable",
  h3: "Every session, upgraded.",
  paragraph:
    "The installer drops a /fable slash command into every Claude Code session — route any prompt through Claude Fable 5, inline, without switching models.",
  example: "/fable make this component prettier",
};

export const neverGuilt =
  "loopy may suggest, but it never nags. Ignore, snooze, or dismiss — a quiet tool beats a nagging one. Your inbox, your call.";

export interface FaqItem {
  q: string;
  a: string;
}

export const faq: FaqItem[] = [
  {
    q: "What is loopy?",
    a: "A local meta-agent that runs in your terminal alongside Claude Code. It watches your sessions, spots work you keep doing by hand, and proposes ready-to-install automation loops. You approve; the loop runs.",
  },
  {
    q: "Who is it for?",
    a: "Claude Code and Codex power users who want to graduate from manual prompting to loop engineering but don't know where to start — and anyone who wants to systematically cut the overhead of repetitive prompting.",
  },
  {
    q: "Does it send my code anywhere?",
    a: "No. Transcripts stay on your machine. Digests are redacted of secrets and sent only to your own claude -p process. loopy never contacts an external service.",
  },
  {
    q: "Do I need a subscription or API key?",
    a: "No subscription. loopy uses your existing Claude Code CLI and your own Claude credits. No separate service, no cloud component.",
  },
  {
    q: "What does an installed loop look like?",
    a: "A bundle at ~/.loopy/loops/<id>/: loop.md (instructions), trigger.json (schedule/hook/manual), manifest.json (evidence + every path installed), and a state/ dir. The manifest makes uninstall exact.",
  },
  {
    q: "Is it open source?",
    a: "Yes. loopy is free and open source. Clone it, read it, contribute on GitHub.",
  },
  {
    q: "What are the requirements?",
    a: "Node ≥ 20, git, the Claude Code CLI (claude) in your PATH, and macOS. Windows/Linux daemon support is on the roadmap.",
  },
];

export interface Cta {
  h2: string;
  sub: string;
  subCode: string;
}

export const cta: Cta = {
  h2: "Ready to write your first loop?",
  sub: "then ",
  subCode: "loopy setup",
};

export interface FooterLink {
  label: string;
  href: string;
}

export interface Footer {
  copyright: string;
  links: FooterLink[];
  tagline: string;
}

export const footer: Footer = {
  copyright: "© 2026 loopy · secretbuilds",
  links: [
    { label: "GitHub", href: REPO_URL },
    { label: "README", href: README_URL },
    { label: "/fable", href: "#fable" },
    { label: "support development", href: SUPPORT_URL },
  ],
  tagline:
    "Built for people tired of being told they're using Claude Code wrong every three weeks.",
};
