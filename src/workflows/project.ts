import {
  intentStep,
  guideStep,
  sourcingStep,
  sceneStep,
  publishStep,
  illustrationStep,
  failStep,
} from "../lib/server/workflow";
export async function projectWorkflow(
  owner: string,
  id: string,
  jobId: string,
) {
  "use workflow";
  try {
    const mode = await intentStep(owner, id, jobId);
    if (mode === "done") return;
    if (mode === "illustration") {
      await illustrationStep(owner, id, jobId);
      return;
    }
    if (mode === "message") {
      await guideStep(owner, id, jobId);
      await sourcingStep(owner, id, jobId);
    }
    await sceneStep(owner, id, jobId);
    await publishStep(owner, id, jobId);
  } catch {
    await failStep(owner, id, jobId);
  }
}
