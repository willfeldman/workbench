import { test } from "node:test";
import assert from "node:assert/strict";
import { exampleProject } from "../src/lib/example";
import { activeJob, type Job } from "../src/lib/project";
import { assertJobCurrent, queueDiagrams, diagramProgress, recoverSavedDraft } from "../src/lib/illustration-jobs";

test("illustration jobs are revision-bound, deduplicated and do not block chat", () => {
  const p = exampleProject();
  p.stepImages = [];
  assert.equal(queueDiagrams(p, "images"), "images");
  assert.equal(queueDiagrams(p, "duplicate"), "images");
  assert.equal(activeJob(p), undefined);
  assert.equal(assertJobCurrent(p, "images").baseRevisionId, p.currentRevisionId);
  p.currentRevisionId = "updated";
  assert.throws(() => assertJobCurrent(p, "images"));
  queueDiagrams(p, "new-images");
  assert.equal(p.jobs.find(j => j.id === "images")!.state, "cancelled");
  assert.equal(p.jobs.at(-1)!.baseRevisionId, "updated");
});

test("terminal image jobs cannot be revived by late responses", () => {
  const p = exampleProject();
  p.stepImages = [];
  queueDiagrams(p, "images");
  for (const state of ["complete", "failed", "cancelled"] as const) {
    p.jobs.at(-1)!.state = state;
    assert.throws(() => assertJobCurrent(p, "images"));
  }
});

test("image progress counts completed and unavailable steps once", () => {
  const p = exampleProject();
  p.stepImages = [];
  queueDiagrams(p, "images");
  p.stepImages = ["ready", "failed", "pending"].map((state, i) => ({ id: String(i), stepId: p.spec!.steps[i].id, revisionId: p.currentRevisionId!, state: state as "ready" | "failed" | "pending", path: null, alt: "", model: null, createdAt: "2026-09-08" }));
  assert.equal(diagramProgress(p, "images"), "Illustrating steps · 2 of 5 finished · 1 unavailable");
});

function recoverableJob(p: ReturnType<typeof exampleProject>, action: "revise" | "propose" = "revise"): Job {
  return { id: "legacy", requestId: "legacy", state: "cancelled", stage: "Stopped", startedAt: "2026-09-08", finishedAt: null, error: null, activities: [], baseRevisionId: p.currentRevisionId, usage: { input: 0, output: 0 }, mode: "message", draft: structuredClone(p.spec!), intent: { action, reply: "", questions: [], title: p.title, assumptions: [] } };
}

test("legacy recovery publishes the saved guide and retains ready assets and progress", () => {
  const p = exampleProject();
  p.stepImages = [];
  p.jobs.push(recoverableJob(p));
  p.progress.completed.prepare = "2026-09-08";
  p.progress.materials.cedar = "purchased";
  p.stepImages = [{ id: "saved", stepId: "prepare", revisionId: "legacy-revision", state: "ready", path: "private/saved.webp", alt: "Saved", model: "test", createdAt: "2026-09-08" }];
  assert.equal(recoverSavedDraft(p, "legacy"), "legacy-recovered-diagrams");
  assert.equal(p.currentRevisionId, "legacy-revision");
  assert.equal(p.stepImages[0].path, "private/saved.webp");
  assert.equal(p.progress.materials.cedar, "purchased");
  assert.equal(p.progress.completed.prepare, "2026-09-08");
  assert.equal(activeJob(p), undefined);
});

test("recovery refuses a running or superseded draft and never applies a proposal", () => {
  const p = exampleProject();
  p.stepImages = [];
  const job = recoverableJob(p, "propose");
  p.jobs.push(job);
  job.state = "running";
  assert.throws(() => recoverSavedDraft(p, job.id));
  job.state = "cancelled";
  job.baseRevisionId = "stale";
  assert.throws(() => recoverSavedDraft(p, job.id));
  job.baseRevisionId = p.currentRevisionId;
  const previous = p.currentRevisionId;
  assert.equal(recoverSavedDraft(p, job.id), null);
  assert.equal(p.currentRevisionId, previous);
  assert.equal(p.proposal?.id, "legacy-revision");
  assert.equal(p.jobs.length, 1);
});
