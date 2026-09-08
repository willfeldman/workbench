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
async function state(owner: string, id: string, jobId: string, label: string) {
  return mutateProject(owner, id, (p) => {
    const j = p.jobs.find((j) => j.id === jobId);
    if (
      !j ||
      j.state === "cancelled" ||
      p.currentRevisionId !== j.baseRevisionId
    )
      throw new Error("Request superseded");
    j.state = "running";
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
      : existing.mode;
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
      : await interpret(p, usage(owner, id, jobId), await images(p));
  const done = ["clarify", "answer"].includes(intent.action);
  await mutateProject(owner, id, (d) => {
    const j = d.jobs.find((x) => x.id === jobId)!;
    if (j.state === "cancelled") return;
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
  return done ? "done" : existing.mode;
}
export async function guideStep(owner: string, id: string, jobId: string) {
  "use step";
  const p = await state(owner, id, jobId, "Working out the build");
  const j = p.jobs.find((x) => x.id === jobId)!;
  if (j.draft) return;
  const draft = validateSpec(
    await generateGuide(p, usage(owner, id, jobId), await images(p)),
  );
  await mutateProject(owner, id, (d) => {
    d.jobs.find((x) => x.id === jobId)!.draft = draft;
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
    d.jobs.find((x) => x.id === jobId)!.draft = validateSpec(draft);
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
    d.jobs.find((x) => x.id === jobId)!.draft = validateSpec(draft);
  });
}
export async function publishStep(owner: string, id: string, jobId: string) {
  "use step";
  const current = await getProject(owner, id);
  if (current.jobs.find((x) => x.id === jobId)?.state === "complete") return;
  await state(owner, id, jobId, "Checking the pieces fit together");
  await mutateProject(owner, id, (d) => {
    const j = d.jobs.find((x) => x.id === jobId)!;
    if (j.state === "cancelled" || d.currentRevisionId !== j.baseRevisionId)
      throw new Error("Request superseded");
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
    else publishRevision(d, r);
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
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst",
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
    const j = d.jobs.find((x) => x.id === jobId)!;
    if (j.state === "cancelled" || d.currentRevisionId !== j.baseRevisionId)
      return;
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
// Local development invokes these same stages directly. Hosted execution checkpoints each stage through Vercel Workflow.
export async function runWorkflow(owner: string, id: string, jobId: string) {
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
  } catch (e) {
    console.error(
      "Generation failed",
      e instanceof Error ? e.message : "Unknown",
    );
    await failStep(owner, id, jobId);
  }
}
