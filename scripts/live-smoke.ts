import { readFileSync, writeFileSync } from "node:fs";
import { newProject } from "../src/lib/project";
import {
  createProject,
  mutateProject,
  getProject,
} from "../src/lib/server/repository";
import { runWorkflow } from "../src/lib/server/workflow";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !process.env[line.slice(0, i)])
    process.env[line.slice(0, i)] = line.slice(i + 1);
}
async function main() {
  process.env.WORKSHOP_LOCAL_MODE = "true";
  const owner = "00000000-0000-0000-0000-000000000001";
  if (process.argv[2]) {
    const p = await getProject(owner, process.argv[2]);
    await runWorkflow(owner, p.id, p.jobs.at(-1)!.id);
    const result = await getProject(owner, p.id);
    console.log(
      JSON.stringify(
        {
          id: p.id,
          state: result.jobs.at(-1)!.state,
          steps: result.spec?.steps.length,
          nodes: result.spec?.scene?.nodes.length,
          sources: result.spec?.materials.reduce(
            (n, m) => n + m.sources.length,
            0,
          ),
          error: result.jobs.at(-1)!.error,
        },
        null,
        2,
      ),
    );
    return;
  }
  const p = newProject(owner),
    jobId = crypto.randomUUID();
  await createProject(p);
  await mutateProject(owner, p.id, (d) => {
    d.messages.push({
      id: crypto.randomUUID(),
      role: "user",
      text: "Make a simple freestanding folded cardstock place card for a dinner table. It should be 90 mm wide and 45 mm high when folded, from one sheet of 250 gsm cardstock. I have a ruler, pencil, blunt scoring tool, cutting mat and craft knife. Budget $5. Choose sensible defaults for anything else. Please generate the complete guide and 3D preview now; no more questions.",
      photoIds: [],
      createdAt: new Date().toISOString(),
    });
    d.jobs.push({
      id: jobId,
      requestId: crypto.randomUUID(),
      state: "queued",
      stage: "Starting",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
      activities: [],
      baseRevisionId: null,
      usage: { input: 0, output: 0 },
      mode: "message",
    });
  });
  console.log("Live project:", p.id);
  await runWorkflow(owner, p.id, jobId);
  const done = await getProject(owner, p.id);
  console.log(
    JSON.stringify(
      {
        id: done.id,
        title: done.title,
        state: done.jobs[0].state,
        stages: done.jobs[0].activities.map((x) => x.label),
        steps: done.spec?.steps.length,
        sceneNodes: done.spec?.scene?.nodes.length,
        sources: done.spec?.materials.reduce((n, m) => n + m.sources.length, 0),
        error: done.jobs[0].error,
        usage: done.jobs[0].usage,
      },
      null,
      2,
    ),
  );
  writeFileSync("../../work/live-smoke-id.txt", p.id);
}
main();
