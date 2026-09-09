import {
  generateStepImage,
  imageModel,
  IllustrationReviewError,
  IllustrationGenerationError,
} from "./image-generation";
import { getProject, mutateProject, recordEvent } from "./repository";
import { adminClient } from "./supabase";
import { localMode, fixtureAI, requireEnv } from "./config";
import { interpret, generateGuide, generateScene, sourceItems } from "./ai";
import {
  validateSpec,
  validateScene,
  changedCompletedSteps,
  publishRevision,
  type Project,
  type Revision,
} from "../project";
import { promises as fs } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { FatalError } from "workflow";
import { ZodError } from "zod";
import { assertJobCurrent, queueDiagrams, diagramProgress } from "../illustration-jobs";
import { queueEnrichment, applyEnrichment } from "../fast-mode";
async function state(owner: string, id: string, jobId: string, label: string) {
  return mutateProject(owner, id, (p) => {
    const j = assertJobCurrent(p, jobId);
    j.state = "running";
    j.heartbeatAt = new Date().toISOString();
    j.error = null;
    j.stage = label;
    if (j.activities.at(-1)?.label !== label)
      j.activities.push({
        id: crypto.randomUUID(),
        label,
        at: new Date().toISOString(),
      });
  });
}
const usage =
  (owner: string, id: string, jobId: string) =>
  async (input: number, output: number) => {
    await mutateProject(owner, id, (p) => {
      const j = p.jobs.find((x) => x.id === jobId)!;
      j.usage.input += input;
      j.usage.output += output;
    });
  };
async function images(p: Project) {
  const last = p.messages.filter((m) => m.role === "user").at(-1),
    result: string[] = [];
  for (const photo of p.photos.filter((ph) => last?.photoIds.includes(ph.id))) {
    if (localMode()) {
      const data = await fs.readFile(
        path.join(process.cwd(), ".local", photo.path),
      );
      const mime = photo.path.endsWith(".png")
        ? "image/png"
        : photo.path.endsWith(".webp")
          ? "image/webp"
          : "image/jpeg";
      result.push(`data:${mime};base64,${data.toString("base64")}`);
    } else {
      const { data, error } = await adminClient()
        .storage.from("project-photos")
        .createSignedUrl(photo.path, 1800);
      if (error) throw error;
      result.push(data.signedUrl);
    }
  }
  return result;
}
export async function intentStep(owner: string, id: string, jobId: string) {
  "use step";
  const before = await getProject(owner, id),
    existing = before.jobs.find((j) => j.id === jobId);
  if (!existing || ["complete", "cancelled"].includes(existing.state))
    return "done";
  if (existing.intent)
    return ["clarify", "answer"].includes(existing.intent.action)
      ? "done"
      : existing.speed === "fast" && existing.mode === "message" ? "fast" : existing.mode;
  const p = await state(owner, id, jobId, "Understanding your project");
  const intent =
    existing.mode !== "message"
      ? {
          action: "revise" as const,
          reply: "",
          questions: [],
          title: p.title,
          assumptions: [],
        }
      : await interpret(p, usage(owner, id, jobId), await images(p), existing.speed === "fast");
  const done = ["clarify", "answer"].includes(intent.action);
  await mutateProject(owner, id, (d) => {
    const j = d.jobs.find((x) => x.id === jobId)!;
    if (!["queued", "running"].includes(j.state) || j.baseRevisionId !== d.currentRevisionId) return;
    j.intent = intent;
    if (done) {
      if (!d.spec) d.title = intent.title;
      if (!d.messages.some((m) => m.id === jobId + "-reply"))
        d.messages.push({
          id: jobId + "-reply",
          role: "assistant",
          text: intent.reply,
          questions: intent.questions,
          photoIds: [],
          createdAt: new Date().toISOString(),
        });
      j.state = "complete";
      j.error = null;
      j.stage = "Ready";
      j.finishedAt = new Date().toISOString();
    }
  });
  return done ? "done" : existing.speed === "fast" && existing.mode === "message" ? "fast" : existing.mode;
}
export async function guideStep(owner: string, id: string, jobId: string) {
  "use step";
  const p = await state(owner, id, jobId, "Working out the build");
  const j = p.jobs.find((x) => x.id === jobId)!;
  if (j.draft) return;
  let generated;
  try {
    generated = await generateGuide(p, usage(owner, id, jobId), await images(p), j.speed === "fast");
  } catch (error) {
    if (error instanceof ZodError) throw new FatalError("The generated guide did not meet the project format requirements.");
    throw error;
  }
  let draft;
  try {
    draft = validateSpec(generated);
  } catch {
    // A deterministic invalid draft must not spend four complete AI calls on
    // the same request without any corrective context. Transient provider and
    // persistence failures still retain the durable worker's retry behavior.
    throw new FatalError("The generated guide failed its consistency checks.");
  }
  await mutateProject(owner, id, (d) => {
    assertJobCurrent(d, jobId).draft = draft;
  });
}
export async function sourcingStep(owner: string, id: string, jobId: string) {
  "use step";
  const p = await state(owner, id, jobId, "Checking materials and tools"),
    j = p.jobs.find((x) => x.id === jobId)!;
  if (!j.draft) throw new Error("Missing draft");
  let draft = j.draft;
  try {
    draft = await sourceItems(draft, usage(owner, id, jobId));
  } catch {
    draft.assumptions.push(
      "Live sourcing was unavailable. Prices remain estimates; ask to find materials again.",
    );
  }
  await mutateProject(owner, id, (d) => {
    assertJobCurrent(d, jobId).draft = validateSpec(draft);
  });
}
export async function sceneStep(owner: string, id: string, jobId: string) {
  "use step";
  const p = await state(owner, id, jobId, "Building the 3D preview"),
    j = p.jobs.find((x) => x.id === jobId)!;
  let draft = structuredClone(j.draft ?? p.spec);
  if (!draft) throw new Error("Missing guide");
  try {
    draft.scene = validateScene(
      await generateScene(draft, usage(owner, id, jobId)),
      draft,
    );
    draft.sceneError = null;
  } catch {
    draft.scene = null;
    draft.sceneError =
      "The preview could not be generated. Your guide is ready; retry the preview when you’re ready.";
  }
  await mutateProject(owner, id, (d) => {
    assertJobCurrent(d, jobId).draft = validateSpec(draft);
  });
}
export async function diagramPlanStep(owner: string, id: string, jobId: string) {
  "use step";
  const p = await state(owner, id, jobId, "Preparing step illustrations");
  if (!p.spec) return [];
  return p.spec.steps.filter((step) => !p.stepImages?.some((image) =>
    image.revisionId === p.currentRevisionId && image.stepId === step.id && image.state === "ready"
  )).map((step) => step.id);
}
export async function diagramStep(
  owner: string,
  id: string,
  jobId: string,
  stepId: string,
  correction?: string,
) {
  "use step";
  const before = await getProject(owner, id);
  const p = await state(owner, id, jobId, diagramProgress(before, jobId));
  const j = p.jobs.find((j) => j.id === jobId)!;
  const spec = p.spec;
  const step = spec?.steps.find((step) => step.id === stepId);
  if (!spec || !step) throw new Error("Missing step");
  const revisionId = j.baseRevisionId!;
  if (
    p.stepImages?.some(
      (image) =>
        image.revisionId === revisionId &&
        image.stepId === stepId &&
        image.state === "ready",
    )
  )
    return;
  const imageId = jobId + "-" + stepId;
  await mutateProject(owner, id, (d) => {
    assertJobCurrent(d, jobId);
    d.stepImages ??= [];
    d.stepImages = d.stepImages.filter((image) => image.id !== imageId);
    d.stepImages.push({
      id: imageId,
      stepId,
      revisionId,
      state: "pending",
      path: null,
      alt: step.title,
      model: null,
      createdAt: new Date().toISOString(),
    });
  });
  try {
    if (fixtureAI()) throw new Error("No image provider in fixture mode");
    const result = await generateStepImage(spec, step, correction);
    const imagePath = `${owner}/${id}/${imageId}.webp`;
    if (localMode()) {
      const full = path.join(process.cwd(), ".local", imagePath);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, result.buffer, { mode: 0o600 });
    } else {
      const { error } = await adminClient()
        .storage.from("project-photos")
        .upload(imagePath, result.buffer, {
          contentType: "image/webp",
          upsert: true,
        });
      if (error) throw error;
    }
    await mutateProject(owner, id, (d) => {
      assertJobCurrent(d, jobId);
      const image = d.stepImages?.find((image) => image.id === imageId);
      if (image)
        Object.assign(image, {
          state: "ready",
          path: imagePath,
          alt: result.alt,
          model: result.model,
        });
    });
    await mutateProject(owner, id, d => {
      const job = assertJobCurrent(d, jobId);
      job.stage = diagramProgress(d, jobId);
      job.heartbeatAt = new Date().toISOString();
    });
    await recordEvent(owner, id, "step_image_generated", {
      stepId,
      model: result.model,
    });
  } catch (error) {
    console.error(
      "Step illustration failed",
      error instanceof OpenAI.APIError
        ? { status: error.status, code: error.code, param: error.param }
        : error instanceof Error
          ? error.message
          : "Unknown error",
    );
    await mutateProject(owner, id, (d) => {
      const image = d.stepImages?.find((image) => image.id === imageId);
      const job = d.jobs.find((j) => j.id === jobId);
      if (!job || !["queued", "running"].includes(job.state) || job.baseRevisionId !== d.currentRevisionId) return;
      if (image) image.state = "failed";
      job.stage = diagramProgress(d, jobId);
      job.heartbeatAt = new Date().toISOString();
    });
    await recordEvent(owner, id, "step_image_failed", { stepId, stage: error instanceof IllustrationGenerationError ? error.stage : "storage", code: error instanceof IllustrationGenerationError ? error.code : "unavailable", corrected: Boolean(correction) });
    if (error instanceof IllustrationReviewError && !error.retryExhausted) return error.message;
  }
}
export async function finishDiagramsStep(
  owner: string,
  id: string,
  jobId: string,
) {
  "use step";
  await mutateProject(owner, id, (d) => {
    const j = d.jobs.find((j) => j.id === jobId)!;
    if (!["queued", "running"].includes(j.state) || j.baseRevisionId !== d.currentRevisionId)
      return;
    j.state = "complete";
    const failed = d.spec?.steps.filter(step => !d.stepImages?.some(image => image.revisionId === j.baseRevisionId && image.stepId === step.id && image.state === "ready")).length ?? 0;
    j.stage = failed ? `Illustrations finished · ${failed} unavailable` : "Illustrations ready";
    j.error = null;
    j.finishedAt = new Date().toISOString();
  });
}
export async function publishStep(owner: string, id: string, jobId: string) {
  "use step";
  const current = await getProject(owner, id);
  if (current.jobs.find((x) => x.id === jobId)?.state === "complete")
    return current.jobs.find(j => [jobId + "-diagrams", jobId + "-enrichment"].includes(j.id) && ["queued", "running"].includes(j.state) && j.baseRevisionId === current.currentRevisionId)?.id ?? null;
  await state(owner, id, jobId, "Checking the pieces fit together");
  const published = await mutateProject(owner, id, (d) => {
    const j = assertJobCurrent(d, jobId);
    if (!j.draft) throw new Error("Missing draft");
    const spec = validateSpec(j.draft);
    const r: Revision = {
      id: jobId + "-revision",
      spec,
      summary:
        j.mode === "preview"
          ? "Preview refreshed"
          : d.spec
            ? "Project updated"
            : "Initial project",
      createdAt: new Date().toISOString(),
      reworkStepIds: changedCompletedSteps(d, spec),
    };
    const inferred = j.intent?.action === "propose";
    if (inferred) d.proposal = r;
    else {
      publishRevision(d, r);
      if (j.speed === "fast") queueEnrichment(d, jobId + "-enrichment", j.workflowRunId);
      else queueDiagrams(d, jobId + "-diagrams", j.workflowRunId);
    }
    if (!d.messages.some((m) => m.id === jobId + "-reply"))
      d.messages.push({
        id: jobId + "-reply",
        role: "assistant",
        text: inferred
          ? "The photo suggests a few changes. Review the proposed update before applying it."
          : spec.openQuestions.length
            ? "The full draft is ready. A few measurements still need confirming before the affected steps."
            : spec.professionalReview
              ? "The preparation guide is ready. This project needs qualified professional input before execution."
              : d.revisions.length > 1
                ? "I’ve updated the project. You can review the changes or undo this revision."
                : j.speed === "fast"
                  ? "Your guide is ready. Sources, the preview, and illustrations will appear as they finish."
                  : "Your project is ready. The complete guide, materials, and preview are beside this conversation.",
        photoIds: [],
        createdAt: new Date().toISOString(),
      });
    j.state = "complete";
    j.error = null;
    j.stage = "Ready";
    j.finishedAt = new Date().toISOString();
    delete j.draft;
  });
  await recordEvent(owner, id, "generation_complete", { jobId });
  return published.jobs.find(j => [jobId + "-diagrams", jobId + "-enrichment"].includes(j.id))?.id ?? null;
}
export async function enrichmentStep(owner: string, id: string, jobId: string, kind: "sources" | "scene") {
  "use step";
  const p = await state(owner, id, jobId, "Adding sources and preview");
  if (!p.spec) throw new Error("Missing guide");
  const spec = structuredClone(p.spec);
  if (kind === "sources") {
    try {
      const sourced = await sourceItems(spec, usage(owner, id, jobId));
      await mutateProject(owner, id, d => applyEnrichment(d, jobId, sourced, kind));
    } catch {
      // Sourcing is optional enrichment; the checked physical guide remains usable.
      await state(owner, id, jobId, "Guide ready · some retailer sources unavailable");
    }
  } else {
    try {
      spec.scene = validateScene(await generateScene(spec, usage(owner, id, jobId)), spec);
      spec.sceneError = null;
    } catch {
      spec.scene = null;
      spec.sceneError = "The preview could not finish. Your guide is ready; you can retry the preview.";
    }
    await mutateProject(owner, id, d => applyEnrichment(d, jobId, spec, kind));
  }
}
export async function finishEnrichmentStep(owner: string, id: string, jobId: string) {
  "use step";
  const p = await mutateProject(owner, id, d => {
    const job = assertJobCurrent(d, jobId);
    queueDiagrams(d, jobId + "-diagrams", job.workflowRunId);
    job.state = "complete";
    job.stage = "Guide ready";
    job.finishedAt = new Date().toISOString();
  });
  return p.jobs.find(job => job.id === jobId + "-diagrams")?.id ?? null;
}
export async function illustrationStep(
  owner: string,
  id: string,
  jobId: string,
) {
  "use step";
  const p = await state(owner, id, jobId, "Illustrating the finished project");
  if (!p.spec) throw new Error("Missing guide");
  if (fixtureAI())
    throw new Error("Illustration is not simulated by the test fixture");
  const result = await new OpenAI({
    apiKey: requireEnv("OPENAI_API_KEY"),
    timeout: 240000,
    maxRetries: 0,
  }).images.generate({
    model: await imageModel(),
    quality: "high",
    size: "1536x1024",
    output_format: "webp",
    prompt: `Create a refined studio product visualization of this finished DIY project on a warm off-white background. Preserve the exact design, materials, real part count, relative dimensions, proportions and joinery. No invented accessories or decoration. Soft daylight, natural material detail, restrained styling. No text, numbers, watermarks, cutaway claims, or technical certification. This is a concept illustration; dimension labels are rendered by the app. Project specification: ${JSON.stringify(p.spec)}`,
  });
  const image = result.data?.[0]?.b64_json;
  if (!image) throw new Error("No image returned");
  const imagePath = `${owner}/${id}/${jobId}.webp`,
    buffer = Buffer.from(image, "base64");
  if (localMode()) {
    const full = path.join(process.cwd(), ".local", imagePath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buffer, { mode: 0o600 });
  } else {
    const { error } = await adminClient()
      .storage.from("project-photos")
      .upload(imagePath, buffer, { contentType: "image/webp", upsert: true });
    if (error) throw error;
  }
  await mutateProject(owner, id, (d) => {
    const j = assertJobCurrent(d, jobId);
    d.illustrations ??= [];
    if (!d.illustrations.some((x) => x.id === jobId))
      d.illustrations.push({
        id: jobId,
        path: imagePath,
        revisionId: d.currentRevisionId!,
        createdAt: new Date().toISOString(),
      });
    j.state = "complete";
    j.error = null;
    j.stage = "Ready";
    j.finishedAt = new Date().toISOString();
  });
}
export async function failStep(owner: string, id: string, jobId: string) {
  "use step";
  await mutateProject(owner, id, (p) => {
    const j = p.jobs.find((x) => x.id === jobId);
    if (j && j.state !== "cancelled" && j.state !== "complete") {
      j.state = "failed";
      j.error =
        j.mode === "illustration"
          ? "Image generation could not finish. Check model access in the OpenAI account, then retry. Your guide and 3D preview are safe."
          : "The request could not finish. Your saved project is safe. Please try again.";
      j.stage = "Couldn’t finish";
      j.finishedAt = new Date().toISOString();
    }
  });
  await recordEvent(owner, id, "generation_failed", { jobId });
}
// Local execution mirrors the hosted workflow; published guides remain available during images.
export async function runWorkflow(owner: string, id: string, jobId: string) {
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
  } catch (e) {
    console.error("Generation failed", e instanceof Error ? e.message : "Unknown");
    await failStep(owner, id, activeId);
  }
}
