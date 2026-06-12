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
