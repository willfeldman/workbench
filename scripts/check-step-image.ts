import { exampleProject } from "../src/lib/example";
import { createProject, getProject } from "../src/lib/server/repository";
import { diagramStep, finishDiagramsStep } from "../src/lib/server/workflow";

async function main() {
  if (process.env.WORKSHOP_LOCAL_MODE !== "true" || process.env.VERCEL)
    throw new Error("Run only in the local development workspace.");
  const p = exampleProject("00000000-0000-0000-0000-000000000001");
  p.id = crypto.randomUUID();
  p.title = "Step illustration verification";
  p.stepImages = [];
  const jobId = crypto.randomUUID();
  p.jobs.push({
    id: jobId,
    requestId: crypto.randomUUID(),
    state: "queued",
    mode: "diagrams",
    stage: "Starting",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    activities: [],
    baseRevisionId: p.currentRevisionId,
    usage: { input: 0, output: 0 },
  });
  await createProject(p);
  console.log("Live illustration project:", p.id);
  const correction = await diagramStep(p.ownerId, p.id, jobId, "prepare");
  if (correction)
    await diagramStep(p.ownerId, p.id, jobId, "prepare", correction);
  await finishDiagramsStep(p.ownerId, p.id, jobId);
  const result = (await getProject(p.ownerId, p.id)).stepImages?.[0];
  console.log({
    state: result?.state,
    model: result?.model,
    path: result?.path,
  });
  if (result?.state !== "ready") process.exitCode = 1;
}
main();
