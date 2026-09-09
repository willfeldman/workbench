import { test } from "node:test";
import assert from "node:assert/strict";
import { exampleProject } from "../src/lib/example";
import { type Job, activeJob, publishRevision } from "../src/lib/project";
import { assertJobCurrent } from "../src/lib/illustration-jobs";
import { switchToFast, queueEnrichment, applyEnrichment } from "../src/lib/fast-mode";

function running() {
  const p = exampleProject();
  p.jobs = [];
  const job: Job = { id: "original", requestId: "paid-request", mode: "message", state: "running", stage: "Working out the build", startedAt: "2026-09-08", finishedAt: null, error: null, activities: [], baseRevisionId: p.currentRevisionId, usage: { input: 100, output: 200 }, intent: { action: "revise", title: p.title, reply: "", questions: [], assumptions: [] } };
  p.jobs.push(job);
  return { p, job };
}

test("switching reuses the paid request and validated draft without changing messages or progress", () => {
  const { p, job } = running();
  job.draft = structuredClone(p.spec!);
  p.progress.completed.prepare = "completed";
  p.progress.materials.cedar = "owned";
  const messages = structuredClone(p.messages);
  const progress = structuredClone(p.progress);
  const id = switchToFast(p, job.id, "first-dispatch");
  assert.equal(id, "original-fast");
  assert.equal(job.state, "cancelled");
  assert.equal(p.jobs.at(-1)!.requestId, "paid-request");
  assert.deepEqual(p.jobs.at(-1)!.draft, job.draft);
  assert.equal(p.jobs.at(-1)!.speed, "fast");
  assert.deepEqual(p.progress, progress);
  assert.deepEqual(p.messages, messages);
  assert.throws(() => assertJobCurrent(p, job.id));
});

test("double clicks and repeated fast requests preserve the single dispatch claim", () => {
  const { p, job } = running();
  const id = switchToFast(p, job.id, "first");
  assert.equal(switchToFast(p, job.id, "second"), id);
  assert.equal(switchToFast(p, id, "third"), id);
  assert.equal(p.jobs.length, 2);
  assert.equal(p.jobs.at(-1)!.dispatchToken, "first");
});

test("finished or superseded jobs cannot be restarted by a fast switch", () => {
  for (const state of ["complete", "failed", "cancelled"] as const) {
    const { p, job } = running();
    job.state = state;
    assert.throws(() => switchToFast(p, job.id));
  }
  const { p, job } = running();
  p.currentRevisionId = "newer";
  assert.throws(() => switchToFast(p, job.id));
});

test("failed dispatch and orphaned queue retry under a fresh guarded job without another charge", () => {
  for (const state of ["failed", "queued"] as const) {
    const { p, job } = running();
    const firstId = switchToFast(p, job.id, "first");
    const first = p.jobs.find(job => job.id === firstId)!;
    first.state = state;
    first.startedAt = new Date(Date.now() - 65_000).toISOString();
    const retryId = switchToFast(p, job.id, "retry");
    assert.notEqual(retryId, firstId);
    assert.equal(first.state, "cancelled");
    assert.equal(p.jobs.at(-1)!.requestId, "paid-request");
    assert.equal(p.jobs.at(-1)!.dispatchToken, "retry");
    assert.equal(p.jobs.at(-1)!.supersedesJobId, firstId);
    assert.throws(() => assertJobCurrent(p, firstId));
    assert.equal(switchToFast(p, job.id, "double-click"), retryId);
    assert.equal(p.jobs.length, 3);
  }
});

test("enrichment stays in the background and cannot replace physical facts or progress", () => {
  const p = exampleProject();
  p.jobs = [];
  p.progress.completed.prepare = "completed";
  const before = structuredClone(p.spec!);
  assert.equal(queueEnrichment(p, "enrich"), "enrich");
  assert.equal(queueEnrichment(p, "duplicate"), "enrich");
  assert.equal(activeJob(p), undefined);
  const result = structuredClone(p.spec!);
  result.steps[0].instructions = "This must never replace the published instructions";
  result.materials[0].specification = "Unrelated physical change";
  result.materials[0].sources = [];
  applyEnrichment(p, "enrich", result, "sources");
  assert.equal(p.spec!.steps[0].instructions, before.steps[0].instructions);
  assert.equal(p.spec!.materials[0].specification, before.materials[0].specification);
  assert.equal(p.progress.completed.prepare, "completed");
  assert.deepEqual(p.revisions.find(r => r.id === p.currentRevisionId)!.spec, p.spec);
  publishRevision(p, { id: "next", spec: before, summary: "Changed", createdAt: "now", reworkStepIds: [] });
  assert.equal(p.jobs.at(-1)!.state, "cancelled");
  assert.throws(() => applyEnrichment(p, "enrich", result, "scene"));
});
