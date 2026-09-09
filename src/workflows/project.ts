import {
  intentStep, guideStep, sourcingStep, sceneStep, publishStep,
  illustrationStep, failStep, diagramPlanStep, diagramStep, finishDiagramsStep, enrichmentStep, finishEnrichmentStep,
} from "../lib/server/workflow";

export async function projectWorkflow(owner: string, id: string, jobId: string) {
  "use workflow";
  let activeId = jobId;
  try {
    const mode = await intentStep(owner, id, jobId);
    if (mode === "done") return;
    if (mode === "illustration") { await illustrationStep(owner, id, jobId); return; }
    if (mode !== "diagrams" && mode !== "enrichment") {
      if (mode === "message" || mode === "fast") {
        await guideStep(owner, id, jobId);
        if (mode !== "fast") await sourcingStep(owner, id, jobId);
      }
      if (mode !== "fast") await sceneStep(owner, id, jobId);
      const next = await publishStep(owner, id, jobId);
      if (!next) return;
      activeId = next;
    }
    // Two independent durable lanes keep concurrency bounded without blocking a ready guide.
    if (mode === "fast" || mode === "enrichment") {
      await Promise.all([enrichmentStep(owner, id, activeId, "sources"), enrichmentStep(owner, id, activeId, "scene")]);
      const next = await finishEnrichmentStep(owner, id, activeId);
      if (!next) return;
      activeId = next;
    }
    const steps = await diagramPlanStep(owner, id, activeId);
    await Promise.all([0, 1].map(async lane => {
      for (let i = lane; i < steps.length; i += 2) {
        const correction = await diagramStep(owner, id, activeId, steps[i]);
        if (correction) await diagramStep(owner, id, activeId, steps[i], correction);
      }
    }));
    await finishDiagramsStep(owner, id, activeId);
  } catch {
    await failStep(owner, id, activeId);
  }
}
