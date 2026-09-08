import { type Project, validateSpec, changedCompletedSteps, publishRevision } from "./project";

/** Only running work for this exact revision may write derived assets. */
export function assertJobCurrent(p: Project, id: string) {
  const job = p.jobs.find(j => j.id === id);
  if (!job || !["queued", "running"].includes(job.state) || job.baseRevisionId !== p.currentRevisionId)
    throw new Error("Request superseded");
  return job;
}

export function queueDiagrams(p: Project, id: string, workflowRunId?: string) {
  if (!p.spec || !p.currentRevisionId) return null;
  for (const job of p.jobs) {
    if (job.mode === "diagrams" && ["queued", "running"].includes(job.state) && job.baseRevisionId !== p.currentRevisionId) {
      job.state = "cancelled";
      job.stage = "Project updated";
      job.finishedAt = new Date().toISOString();
    }
  }
  const existing = p.jobs.find(j => j.mode === "diagrams" && j.baseRevisionId === p.currentRevisionId && ["queued", "running"].includes(j.state));
  if (existing) return existing.id;
  if (p.jobs.some(j => j.id === id)) return null;
  if (p.spec.steps.every(step => p.stepImages?.some(image => image.stepId === step.id && image.revisionId === p.currentRevisionId && image.state === "ready"))) return null;
  p.jobs.push({
    id, requestId: id, mode: "diagrams", state: "queued", stage: "Preparing step illustrations",
    startedAt: new Date().toISOString(), finishedAt: null, error: null, activities: [],
    baseRevisionId: p.currentRevisionId, usage: { input: 0, output: 0 }, workflowRunId,
  });
  return id;
}

export function diagramProgress(p: Project, jobId: string) {
  const job = p.jobs.find(j => j.id === jobId);
  const steps = p.spec?.steps ?? [];
  let ready = 0, failed = 0;
  for (const step of steps) {
    const images = p.stepImages?.filter(image => image.revisionId === job?.baseRevisionId && image.stepId === step.id) ?? [];
    if (images.some(image => image.state === "ready")) ready++;
    else if (images.at(-1)?.state === "failed") failed++;
  }
  return `Illustrating steps · ${ready + failed} of ${steps.length} finished${failed ? ` · ${failed} unavailable` : ""}`;
}

/** Used only after the old durable run has been cancelled. No AI work is repeated. */
export function recoverSavedDraft(p: Project, jobId: string) {
  const job = p.jobs.find(job => job.id === jobId);
  if (!job?.draft || job.state !== "cancelled" || job.baseRevisionId !== p.currentRevisionId)
    throw new Error("Cancel the matching old run before recovering its saved draft");
  const spec = validateSpec(job.draft);
  const revision = {
    id: job.id + "-revision", spec, summary: "Recovered saved guide",
    createdAt: new Date().toISOString(), reworkStepIds: changedCompletedSteps(p, spec),
  };
  if (job.intent?.action === "propose") p.proposal = revision;
  else publishRevision(p, revision);
  const replyId = job.id + "-recovery-reply";
  if (!p.messages.some(message => message.id === replyId)) p.messages.push({
    id: replyId, role: "assistant", photoIds: [], createdAt: new Date().toISOString(),
    text: job.intent?.action === "propose" ? "Your proposed update is ready to review." : "Your saved guide is ready. Illustrations will continue separately; you can start building now.",
  });
  delete job.draft;
  return job.intent?.action === "propose" ? null : queueDiagrams(p, job.id + "-recovered-diagrams");
}
