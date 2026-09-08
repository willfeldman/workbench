import { z } from "zod";

const id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9_-]+$/);
const text = z.string().max(12000);
const vec = z.array(z.number().finite()).length(3);
export const SourceSchema = z.object({
  url: z.string(),
  title: z.string(),
  checkedAt: z.string(),
  price: z.number().nonnegative().nullable(),
  packQuantity: z.number().positive(),
  evidence: z.string(),
  availability: z.enum(["listed", "unknown"]),
});
export const MaterialSchema = z.object({
  id,
  name: z.string(),
  specification: z.string(),
  quantity: z.number().positive(),
  unit: z.string(),
  estimatedUnitPrice: z.number().nonnegative().nullable(),
  sources: z.array(SourceSchema).max(4),
});
export const PartSchema = z.object({
  id,
  name: z.string(),
  materialId: id,
  dimensionsMm: vec,
  quantity: z.number().int().positive(),
});
export const StepSchema = z.object({
  id,
  title: z.string(),
  instructions: text,
  expectedResult: text,
  minutes: z.number().nonnegative(),
  partIds: z.array(id),
  materialIds: z.array(id),
  toolIds: z.array(id),
  dependsOn: z.array(id),
  precautions: z.array(z.string()),
  check: z.string(),
  diagram: z.object({
    kind: z.enum(["assembly", "measure", "process"]),
    labels: z.array(z.string()).max(8),
  }),
  requiresMeasurement: z.boolean(),
});
export const SceneNodeSchema = z.object({
  id,
  partId: id,
  shape: z.enum(["box", "cylinder", "sphere", "extrusion", "mesh"]),
  position: vec,
  rotation: vec,
  size: vec,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  roughness: z.number().min(0).max(1),
  metalness: z.number().min(0).max(1),
  points: z.array(z.array(z.number()).length(2)).max(128),
  vertices: z.array(z.number().finite()).max(18000),
  indices: z.array(z.number().int().nonnegative()).max(18000),
});
export const SceneSchema = z.object({
  nodes: z.array(SceneNodeSchema).max(150),
  camera: vec,
  target: vec,
  notes: z.string(),
});
export const SpecSchema = z.object({
  title: z.string().max(120),
  summary: text,
  category: z.string(),
  difficulty: z.enum(["Beginner", "Intermediate", "Advanced"]),
  minutes: z.number().nonnegative(),
  dimensionsMm: vec,
  budget: z.number().nonnegative().nullable(),
  constraints: z.array(z.string()),
  assumptions: z.array(z.string()),
  openQuestions: z.array(z.string()),
  prerequisites: z.array(z.string()),
  professionalReview: z.boolean(),
  materials: z.array(MaterialSchema).max(80),
  tools: z
    .array(
      z.object({
        id,
        name: z.string(),
        specification: z.string(),
        estimatedUnitPrice: z.number().nonnegative().nullable(),
        sources: z.array(SourceSchema).max(4),
      }),
    )
    .max(30),
  parts: z.array(PartSchema).max(150),
  steps: z.array(StepSchema).min(1).max(60),
  scene: SceneSchema.nullable(),
  sceneError: z.string().nullable(),
});
export type Spec = z.infer<typeof SpecSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type SceneNode = z.infer<typeof SceneNodeSchema>;
export type Material = z.infer<typeof MaterialSchema>;
export type Step = z.infer<typeof StepSchema>;
export const IntakeSchema = z.object({
  title: z.string(),
  reply: z.string(),
  action: z.enum(["clarify", "generate", "answer", "revise", "propose"]),
  questions: z
    .array(
      z.object({
        id,
        question: z.string(),
        options: z.array(z.string()).max(4),
      }),
    )
    .max(3),
  assumptions: z.array(z.string()),
});
export type Intake = z.infer<typeof IntakeSchema>;
export type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  photoIds: string[];
  createdAt: string;
  questions?: Intake["questions"];
};
export type Photo = {
  id: string;
  path: string;
  name: string;
  stepId: string | null;
  createdAt: string;
  url?: string;
};
export type Revision = {
  id: string;
  spec: Spec;
  summary: string;
  createdAt: string;
  reworkStepIds: string[];
};
export type Activity = { id: string; label: string; at: string };
export type Job = {
  id: string;
  requestId: string;
  state: "queued" | "running" | "complete" | "failed" | "cancelled";
  stage: string;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  activities: Activity[];
  baseRevisionId: string | null;
  usage: { input: number; output: number };
  mode: "message" | "preview" | "illustration";
  workflowRunId?: string;
  intent?: Intake;
  draft?: Spec;
};
export type Project = {
  id: string;
  ownerId: string;
  version: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  spec: Spec | null;
  revisions: Revision[];
  currentRevisionId: string | null;
  proposal: Revision | null;
  photos: Photo[];
  illustrations?: {
    id: string;
    path: string;
    revisionId: string;
    createdAt: string;
    url?: string;
  }[];
  jobs: Job[];
  progress: {
    completed: Record<string, string>;
    materials: Record<string, "owned" | "purchased">;
    tools: Record<string, "owned" | "purchased">;
    rework: string[];
    finishedAt: string | null;
  };
  units: "imperial" | "metric";
};
export function newProject(ownerId: string): Project {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    ownerId,
    version: 0,
    title: "New project",
    createdAt: now,
    updatedAt: now,
    messages: [],
    spec: null,
    revisions: [],
    currentRevisionId: null,
    proposal: null,
    photos: [],
    jobs: [],
    progress: {
      completed: {},
      materials: {},
      tools: {},
      rework: [],
      finishedAt: null,
    },
    units: "imperial",
  };
}
export function formatLength(mm: number, units: "imperial" | "metric") {
  return units === "metric"
    ? `${Math.round(mm)} mm`
    : `${Number((mm / 25.4).toFixed(2))}″`;
}
export function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}
export function materialCost(m: Material) {
  const s = m.sources.find((x) => x.price !== null);
  return s
    ? Math.ceil(m.quantity / s.packQuantity) * s.price!
    : m.estimatedUnitPrice === null
      ? null
      : m.quantity * m.estimatedUnitPrice;
}
export function totals(
  spec: Spec,
  owned: Project["progress"]["materials"] = {},
) {
  return spec.materials.reduce(
    (a, m) => {
      const cost = materialCost(m);
      return {
        total: a.total + (owned[m.id] ? 0 : (cost ?? 0)),
        unknown: a.unknown + (cost === null && !owned[m.id] ? 1 : 0),
      };
    },
    { total: 0, unknown: 0 },
  );
}
export function activeJob(p: Project) {
  return p.jobs.findLast((j) => j.state === "queued" || j.state === "running");
}
export function safePublicUrl(raw: string) {
  try {
    const u = new URL(raw);
    const h = u.hostname.toLowerCase();
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      !h.endsWith(".local") &&
      !h.endsWith(".internal") &&
      h !== "localhost" &&
      !/^\d+\.\d+\.\d+\.\d+$/.test(h) &&
      !h.includes(":") &&
      h.includes(".")
    );
  } catch {
    return false;
  }
}
export function validateSpec(input: unknown): Spec {
  const spec = SpecSchema.parse(input);
  for (const [name, items] of [
    ["parts", spec.parts],
    ["materials", spec.materials],
    ["tools", spec.tools],
    ["steps", spec.steps],
  ] as const)
    if (new Set(items.map((x) => x.id)).size !== items.length)
      throw new Error(`Duplicate ${name} identifiers`);
  const parts = new Set(spec.parts.map((p) => p.id)),
    materials = new Set(spec.materials.map((m) => m.id)),
    tools = new Set(spec.tools.map((t) => t.id)),
    prior = new Set<string>();
  if (spec.dimensionsMm.some((x) => x <= 0 || x > 100000))
    throw new Error("Invalid project dimensions");
  for (const p of spec.parts)
    if (!materials.has(p.materialId) || p.dimensionsMm.some((x) => x <= 0))
      throw new Error("Invalid part dimensions or material reference");
  for (const s of spec.steps) {
    if (
      s.partIds.some((x) => !parts.has(x)) ||
      s.materialIds.some((x) => !materials.has(x)) ||
      s.toolIds.some((x) => !tools.has(x)) ||
      s.dependsOn.some((x) => !prior.has(x))
    )
      throw new Error("Invalid step reference or dependency order");
    prior.add(s.id);
  }
  for (const m of [...spec.materials, ...spec.tools])
    for (const s of m.sources)
      if (!safePublicUrl(s.url)) throw new Error("Invalid source URL");
  if (spec.scene) validateScene(spec.scene, spec);
  return spec;
}
export function validateScene(input: unknown, spec: Spec): Scene {
  const scene = SceneSchema.parse(input),
    parts = new Set(spec.parts.map((p) => p.id));
  if (!scene.nodes.length) throw new Error("The preview is empty");
  if (new Set(scene.nodes.map((n) => n.id)).size !== scene.nodes.length)
    throw new Error("Duplicate scene identifiers");
  for (const n of scene.nodes) {
    if (
      !parts.has(n.partId) ||
      n.size.some((x) => x <= 0 || x > 100000) ||
      n.position.some((x) => Math.abs(x) > 100000)
    )
      throw new Error("Invalid scene part or bounds");
    if (n.shape === "extrusion" && n.points.length < 3)
      throw new Error("Extrusions need at least three points");
    if (
      n.shape === "mesh" &&
      (n.vertices.length < 9 ||
        n.vertices.length % 3 ||
        n.indices.length < 3 ||
        n.indices.length % 3 ||
        n.indices.some((x) => x >= n.vertices.length / 3))
    )
      throw new Error("Invalid mesh topology");
  }
  return scene;
}
export function changedCompletedSteps(p: Project, next: Spec) {
  return Object.keys(p.progress.completed).filter((id) => {
    const before = p.spec?.steps.find((s) => s.id === id),
      after = next.steps.find((s) => s.id === id);
    if (JSON.stringify(before) !== JSON.stringify(after)) return true;
    return (
      before?.partIds.some(
        (pid) =>
          JSON.stringify(p.spec?.parts.find((x) => x.id === pid)) !==
          JSON.stringify(next.parts.find((x) => x.id === pid)),
      ) ?? false
    );
  });
}
export function publishRevision(p: Project, r: Revision) {
  p.spec = r.spec;
  p.title = r.spec.title;
  p.currentRevisionId = r.id;
  p.revisions.push(r);
  p.proposal = null;
  p.progress.rework = [...new Set([...p.progress.rework, ...r.reworkStepIds])];
  p.progress.finishedAt = null;
}
export function canComplete(p: Project, step: Step) {
  return (
    !step.requiresMeasurement &&
    !p.spec?.professionalReview &&
    step.dependsOn.every(
      (id) =>
        Boolean(p.progress.completed[id]) && !p.progress.rework.includes(id),
    )
  );
}
