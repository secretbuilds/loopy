export const VOICE = {
  greeting: (sessions: number) =>
    sessions > 0 ? `hi! watching ${sessions} session${sessions === 1 ? "" : "s"} with you~` : `hi! i'll be right here while you code~`,
  proposalNudge: (n: number) =>
    n === 1 ? `✨ i spotted 1 loop idea for you` : `✨ i spotted ${n} loop ideas for you`,
  noProposals: () => `all quiet — your loops have it covered`,
  installCelebrate: (name: string) =>
    `🌱 "${name}" is yours no more — that's a responsibility you don't carry anymore~`,
  dismissGrace: () => `okay! i won't bring that one up again`,
  snoozed: () => `got it — i'll remind you later~`,
  milestoneFirst: () => `🌱 your very first loop!! so proud of you`,
  milestoneTenth: () => `✨ ten loops! you're really getting the hang of this`,
  reviewing: () => `take your time, i'll walk you through it`,
} as const;

export const TIPS: readonly string[] = [
  "loops with a real verify step survive 10x longer",
  "the best loop is the task you no longer remember doing",
  "a loop without an exit condition is a runaway, not a system",
  "evidence first: a loop should earn its place with receipts",
  "small loops that always work beat big loops that mostly work",
  "external memory beats perfect memory — write state to disk",
  "if you've checked it three times by hand, it wants to be a loop",
  "let the loop do the work; you do the judgment",
] as const;
