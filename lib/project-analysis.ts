export type AnalysisFeature = {
  id: string;
  title: string;
  phaseId: string;
  assignee: string;
  history: Array<{ type: "auto" | "comment"; message: string; timestamp: string }>;
};

export type AnalysisPhase = { id: string; name: string };
export type ProjectNudge = { id: string; title: string; message: string };
const DAY = 86_400_000;

/** Provider-neutral analysis entry point. Swap this body for an LLM adapter later. */
export async function analyzeProject(
  features: AnalysisFeature[], phases: AnalysisPhase[], now = new Date(),
): Promise<ProjectNudge[]> {
  const finalPhase = phases.at(-1);
  if (!finalPhase) return [];
  const open = features.filter((feature) => feature.phaseId !== finalPhase.id);
  const nudges: ProjectNudge[] = [];

  for (const phase of phases.slice(1, -1)) {
    const stuck = open.filter((feature) => {
      if (feature.phaseId !== phase.id) return false;
      const latestMove = [...feature.history].reverse().find((item) => item.type === "auto" && item.message.startsWith("Moved"));
      const since = latestMove?.timestamp ?? feature.history[0]?.timestamp;
      return since ? now.getTime() - new Date(since).getTime() >= 5 * DAY : false;
    });
    if (stuck.length) nudges.push({
      id: `stuck-${phase.id}`,
      title: `${phase.name} needs a look`,
      message: `${stuck.length} ${stuck.length === 1 ? "feature has" : "features have"} stayed here for 5+ days. Try checking ${stuck.slice(0, 2).map((item) => item.title).join(" and ")}.`,
    });
  }

  const workload = new Map<string, number>();
  open.forEach((feature) => { const name = feature.assignee.trim(); if (name) workload.set(name, (workload.get(name) ?? 0) + 1); });
  const busiest = [...workload.entries()].sort((a, b) => b[1] - a[1])[0];
  if (busiest && busiest[1] >= 4) nudges.push({
    id: `workload-${busiest[0]}`,
    title: "Workload check",
    message: `${busiest[0]} has ${busiest[1]} open features—the most on the board. Moving one task could keep work flowing.`,
  });
  if (!nudges.length) nudges.push({ id: "healthy", title: "Board looks healthy", message: "Nothing has been sitting unusually long and the current workload looks balanced." });
  return nudges;
}
