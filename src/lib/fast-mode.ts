import { type Project, type Spec, validateSpec } from "./project";
import { assertJobCurrent } from "./illustration-jobs";

/** A switch replaces one already paid-for request, without adding a message or quota reservation. */
export function switchToFast(p: Project, jobId: string, dispatchToken?: string) {
  const old = p.jobs.find(job => job.id === jobId);
  if (!old) throw new Error("Request not found");
  const nextId = `${jobId}-fast`;
  if (p.jobs.some(job => job.id === nextId)) return switchToFast(p, nextId, dispatchToken);
  const retry = old.speed === "fast" && (old.state === "failed" || (old.state === "queued" && !old.workflowRunId && Date.now() - Date.parse(old.startedAt) > 60_000));
  if (old.speed === "fast" && !retry) return old.id;
  if (!retry) assertJobCurrent(p, jobId);
  else if (old.baseRevisionId !== p.currentRevisionId) throw new Error("Request superseded");
  if (old.mode !== "message") throw new Error("Fast mode applies to guide generation");
  const draft = old.draft ? validateSpec(old.draft) : undefined;
  old.state = "cancelled";
  old.stage = "Switched to fast mode";
  old.finishedAt = new Date().toISOString();
  p.jobs.push({
    id: nextId, requestId: old.requestId, state: "queued", mode: "message", speed: "fast", dispatchToken, supersedesJobId: old.id,
    stage: "Starting fast mode", startedAt: new Date().toISOString(), finishedAt: null,
    error: null, activities: [], baseRevisionId: old.baseRevisionId,
    usage: { input: 0, output: 0 }, intent: old.intent ? structuredClone(old.intent) : undefined,
    draft: draft ? structuredClone(draft) : undefined,
  });
  return nextId;
}

export function queueEnrichment(p: Project, id: string, workflowRunId?: string) {
  if (!p.spec || !p.currentRevisionId) return null;
  const existing = p.jobs.find(job => job.mode === "enrichment" && job.baseRevisionId === p.currentRevisionId && ["queued", "running"].includes(job.state));
  if (existing) return existing.id;
  if (p.jobs.some(job => job.id === id)) return null;
  p.jobs.push({ id, requestId: id, mode: "enrichment", speed: "fast", state: "queued",
    stage: "Adding sources and preview", startedAt: new Date().toISOString(), finishedAt: null,
    error: null, activities: [], baseRevisionId: p.currentRevisionId,
    usage: { input: 0, output: 0 }, workflowRunId });
  return id;
}

/** Only derived fields are merged; concurrent progress and the physical guide stay intact. */
export function applyEnrichment(p: Project, jobId: string, result: Spec, kind: "sources" | "scene") {
  const job = assertJobCurrent(p, jobId);
  if (!p.spec || job.mode !== "enrichment") throw new Error("Missing enrichment guide");
  const spec = structuredClone(p.spec);
  if (kind === "scene") {
    spec.scene = result.scene;
    spec.sceneError = result.sceneError;
  } else {
    for (const key of ["materials", "tools"] as const) {
      for (const item of spec[key]) {
        const sourced = result[key].find(next => next.id === item.id);
        if (sourced) item.sources = sourced.sources;
      }
    }
  }
  p.spec = validateSpec(spec);
  const revision = p.revisions.find(revision => revision.id === p.currentRevisionId);
  if (revision) revision.spec = structuredClone(p.spec);
}
