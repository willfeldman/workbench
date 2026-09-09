import { NextResponse, after } from "next/server";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { start, getRun } from "workflow/api";
import { projectWorkflow } from "@/workflows/project";
import {
  userId,
  adminClient,
  authClient,
  HttpError,
} from "@/lib/server/supabase";
import { localMode, fixtureAI, requireEnv } from "@/lib/server/config";
import {
  createProject,
  listProjects,
  getProject,
  mutateProject,
  reserveRun,
  recordEvent,
} from "@/lib/server/repository";
import { errorResponse, sameOrigin } from "@/lib/server/http";
import {
  newProject,
  activeJob,
  canComplete,
  publishRevision,
  changedCompletedSteps,
  type Project,
  type Job,
} from "@/lib/project";
import { queueDiagrams } from "@/lib/illustration-jobs";
import { copyExample, publicExampleArtwork } from "@/lib/example-copies";
import { queueEnrichment, switchToFast } from "@/lib/fast-mode";
import { runWorkflow } from "@/lib/server/workflow";
export const runtime = "nodejs";
export const maxDuration = 300;
async function present(p: Project) {
  const d = structuredClone(p);
  const assets = [...d.photos, ...(d.illustrations ?? []), ...(d.stepImages ?? [])];
  if (localMode()) {
    for (const asset of assets) {
      if (asset.path) asset.url = `/api/projects/${p.id}/photos/${asset.id}`;
    }
    return d;
  }
  // One request per poll, even when unchanged illustrations share a stored object
  // across revisions. Only this owned project's storage namespace may be signed.
  const prefix = `${p.ownerId}/${p.id}/`;
  const paths = [...new Set(assets.map(asset => asset.path).filter((value): value is string =>
    Boolean(value && value.startsWith(prefix) && !value.split("/").some(segment => segment === "." || segment === ".."))
  ))];
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data } = await adminClient().storage.from("project-photos").createSignedUrls(paths, 3600);
    const allowed = new Set(paths);
    for (const item of data ?? []) {
      if (item.path && allowed.has(item.path) && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
    }
  }
  for (const asset of assets) asset.url = asset.path ? urls.get(asset.path) : publicExampleArtwork(asset.url);
  return d;
}

async function route(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  try {
    if (req.method !== "GET") sameOrigin(req);
    const segments = (await ctx.params).path;
    if (segments[0] === "session" && req.method === "DELETE") {
      if (!localMode()) await (await authClient()).auth.signOut();
      return NextResponse.json({ ok: true });
    }
    const owner = await userId();
    if (segments[0] !== "projects") throw new HttpError(404, "Not found.");
    if (segments.length === 1) {
      if (req.method === "GET")
        return NextResponse.json({
          projects: (await listProjects(owner)).map((p) => ({
            id: p.id,
            title: p.title,
            updatedAt: p.updatedAt,
            complete: Boolean(p.progress.finishedAt),
          })),
        });
      if (req.method === "POST") {
        const body = z.object({ exampleId: z.string().max(80).optional() }).parse(await req.json());
        if (body.exampleId) {
          const copy = copyExample(owner, body.exampleId);
          if (!copy) throw new HttpError(404, "Example project not found.");
          // Reopen this person's saved copy, retaining any edits and progress.
          const existing = (await listProjects(owner)).find(p => p.sourceExampleId === body.exampleId);
          return NextResponse.json({ project: await present(existing ?? await createProject(copy)) });
        }
        return NextResponse.json({
          project: await createProject(newProject(owner)),
        });
      }
    }
    const projectId = z.string().uuid().parse(segments[1]);
    if (segments.length === 2 && req.method === "GET") {
      let p = await getProject(owner, projectId);
      for (const job of p.jobs.filter(j => ["queued", "running"].includes(j.state))) {
        if (Date.now() - Date.parse(job.heartbeatAt ?? job.startedAt) <= 20 * 60 * 1000) continue;
        // A quiet heartbeat alone is not evidence a durable job has stopped.
        if (!job.workflowRunId) continue;
        let status: string;
        try { status = await getRun(job.workflowRunId).status; } catch { continue; }
        if (!["failed", "cancelled", "completed"].includes(status)) continue;
        p = await mutateProject(owner, projectId, d => {
          const current = d.jobs.find(j => j.id === job.id)!;
          if (!["running", "queued"].includes(current.state)) return;
          current.state = status === "cancelled" ? "cancelled" : "failed";
          current.stage = "Interrupted";
          current.error = "This request was interrupted. Your saved guide and images are safe; please retry.";
          current.finishedAt = new Date().toISOString();
        });
      }
      return NextResponse.json({ project: await present(p) });
    }
    if (segments[2] === "messages" && req.method === "POST") {
      const body = z
        .object({
          text: z.string().max(12000),
          photoIds: z.array(z.string().uuid()).max(4).default([]),
          requestId: z.string().uuid(),
          mode: z
            .enum(["message", "preview", "illustration", "diagrams", "enrichment"])
            .default("message"),
          speed: z.enum(["standard", "fast"]).default("standard"),
        })
        .parse(await req.json());
      if (body.mode === "message" && !body.text.trim() && !body.photoIds.length)
        throw new HttpError(400, "Describe what you’d like to make.");
      const before = await getProject(owner, projectId);
      const old = before.jobs.find((j) => j.requestId === body.requestId);
      if (old) return NextResponse.json({ project: await present(before) });
      if (["diagrams", "enrichment"].includes(body.mode) && before.jobs.some(j => j.mode === body.mode && j.baseRevisionId === before.currentRevisionId && ["queued", "running"].includes(j.state)))
        return NextResponse.json({ project: await present(before) });
      if (activeJob(before))
        throw new HttpError(
          409,
          "Let this request finish, or stop it before sending another.",
        );
      if (!process.env.OPENAI_API_KEY && !fixtureAI())
        throw new HttpError(
          503,
          "AI is not connected yet. Your project is saved.",
        );
      await reserveRun(owner, body.requestId, projectId);
      const jobId = crypto.randomUUID();
      let p = await mutateProject(owner, projectId, (d) => {
        if (d.jobs.some((j) => j.requestId === body.requestId)) return;
        if (["diagrams", "enrichment"].includes(body.mode) && d.jobs.some(j => j.mode === body.mode && j.baseRevisionId === d.currentRevisionId && ["queued", "running"].includes(j.state))) return;
        if (activeJob(d))
          throw new HttpError(409, "A request is already running.");
        if (body.photoIds.some((id) => !d.photos.some((ph) => ph.id === id)))
          throw new HttpError(400, "Photo not found.");
        if (body.mode !== "message" && !d.spec)
          throw new HttpError(400, "Create a guide first.");
        if (body.mode === "message")
          d.messages.push({
            id: crypto.randomUUID(),
            role: "user",
            text: body.text,
            photoIds: body.photoIds,
            createdAt: new Date().toISOString(),
          });
        d.jobs.push({
          id: jobId,
          requestId: body.requestId,
          state: "queued",
          stage: "Starting",
          startedAt: new Date().toISOString(),
          finishedAt: null,
          error: null,
          activities: [],
          baseRevisionId: d.currentRevisionId,
          usage: { input: 0, output: 0 },
          mode: body.mode,
          speed: body.speed,
        });
      });
      if (!p.jobs.some((j) => j.id === jobId))
        return NextResponse.json({ project: await present(p) });
      if (localMode()) after(() => runWorkflow(owner, projectId, jobId));
      else {
        try {
          const handle = await start(projectWorkflow, [
            owner,
            projectId,
            jobId,
          ]);
          p = await mutateProject(owner, projectId, (d) => {
            d.jobs.find((j) => j.id === jobId)!.workflowRunId = handle.runId;
          });
        } catch {
          await mutateProject(owner, projectId, (d) => {
            const j = d.jobs.find((x) => x.id === jobId)!;
            j.state = "failed";
            j.error = "The worker could not start. Please retry.";
          });
          throw new HttpError(503, "The worker could not start. Please retry.");
        }
      }
      await recordEvent(owner, projectId, "generation_started", {
        jobId,
        mode: body.mode,
      });
      return NextResponse.json({ project: await present(p) }, { status: 202 });
    }
    if (segments[2] === "actions" && req.method === "POST") {
      const b = z
        .object({
          action: z.enum([
            "step",
            "material",
            "tool",
            "units",
            "accept",
            "reject",
            "undo",
            "restore",
            "finish",
            "cancel",
            "fast",
          ]),
          id: z.string().optional(),
          value: z.union([z.boolean(), z.string()]).optional(),
        })
        .parse(await req.json());
      if (b.action === "fast") {
        if (!b.id) throw new HttpError(400, "Choose the running request.");
        const token = crypto.randomUUID();
        let p = await mutateProject(owner, projectId, d => {
          try { switchToFast(d, b.id!, token); }
          catch { throw new HttpError(409, "This request has already finished or changed."); }
        });
        const job = p.jobs.find(j => j.dispatchToken === token);
        if (!job) return NextResponse.json({ project: await present(p) });
        // Invalidate the old writes before cancelling its durable execution. A late
        // provider response cannot replace the fast draft, even if cancellation fails.
        const old = p.jobs.find(j => j.id === job.supersedesJobId);
        if (!localMode() && old?.workflowRunId) {
          try {
            await Promise.race([getRun(old.workflowRunId).cancel(), new Promise((_, reject) => setTimeout(() => reject(new Error("Cancellation timed out")), 3000))]);
          } catch {}
        }
        if (localMode()) after(() => runWorkflow(owner, projectId, job.id));
        else {
          try {
            const handle = await start(projectWorkflow, [owner, projectId, job.id]);
            p = await mutateProject(owner, projectId, d => {
              const current = d.jobs.find(j => j.id === job.id)!;
              if (current.dispatchToken === token && !["cancelled", "failed"].includes(current.state)) {
                current.workflowRunId = handle.runId;
                for (const child of d.jobs) {
                  if (child.id.startsWith(current.id + "-enrichment") && !child.workflowRunId) child.workflowRunId = handle.runId;
                }
              }
            });
            if (p.jobs.find(j => j.id === job.id)?.workflowRunId !== handle.runId) {
              try { await getRun(handle.runId).cancel(); } catch {}
            }
          } catch {
            p = await mutateProject(owner, projectId, d => {
              const current = d.jobs.find(j => j.id === job.id)!;
              if (current.dispatchToken !== token || !["queued", "running"].includes(current.state)) return;
              current.state = "failed";
              current.error = "Fast mode could not start. Your saved project is safe; please retry.";
              current.finishedAt = new Date().toISOString();
            });
          }
        }
        await recordEvent(owner, projectId, "generation_fast_mode", { jobId: job.id });
        return NextResponse.json({ project: await present(p) }, { status: 202 });
      }
      const diagramJobId = crypto.randomUUID();
      let p = await mutateProject(owner, projectId, (d) => {
        if (
          ["accept", "reject", "undo", "restore"].includes(b.action) &&
          activeJob(d)
        )
          throw new HttpError(
            409,
            "Stop the current request before changing revisions.",
          );
        if (b.action === "step") {
          const step = d.spec?.steps.find((s) => s.id === b.id);
          if (!step) throw new HttpError(404, "Step not found.");
          if (b.value === true) {
            if (!canComplete(d, step))
              throw new HttpError(
                400,
                "Confirm the required measurements and preceding steps first.",
              );
            d.progress.completed[step.id] = new Date().toISOString();
            d.progress.rework = d.progress.rework.filter((x) => x !== step.id);
          } else {
            delete d.progress.completed[step.id];
            const affected = new Set([step.id]);
            for (const s of d.spec!.steps)
              if (s.dependsOn.some((x) => affected.has(x))) {
                affected.add(s.id);
                if (d.progress.completed[s.id])
                  d.progress.rework = [
                    ...new Set([...d.progress.rework, s.id]),
                  ];
              }
          }
          d.progress.finishedAt = null;
        }
        if (b.action === "material" || b.action === "tool") {
          const items =
            b.action === "material" ? d.spec?.materials : d.spec?.tools;
          if (!items?.some((x) => x.id === b.id))
            throw new HttpError(404, "Item not found.");
          const states =
            b.action === "material" ? d.progress.materials : d.progress.tools;
          if (b.value === "owned" || b.value === "purchased")
            states[b.id!] = b.value;
          else delete states[b.id!];
        }
        if (b.action === "units")
          d.units = z.enum(["imperial", "metric"]).parse(b.value);
        if (b.action === "accept") {
          if (!d.proposal || d.proposal.id !== b.id)
            throw new HttpError(409, "This proposal has changed.");
          publishRevision(d, {
            ...d.proposal,
            reworkStepIds: changedCompletedSteps(d, d.proposal.spec),
          });
        }
        if (b.action === "reject") d.proposal = null;
        if (b.action === "undo" || b.action === "restore") {
          const target =
            b.action === "restore"
              ? d.revisions.find((r) => r.id === b.id)
              : d.revisions[d.revisions.length - 2];
          if (!target)
            throw new HttpError(400, "There is no earlier revision.");
          publishRevision(d, {
            ...structuredClone(target),
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            summary: `Restored: ${target.summary}`,
            reworkStepIds: changedCompletedSteps(d, target.spec),
          });
        }
        if (["accept", "undo", "restore"].includes(b.action)) {
          if (b.action === "accept" && !d.spec?.scene) queueEnrichment(d, diagramJobId);
          else queueDiagrams(d, diagramJobId);
        }
        if (b.action === "finish") {
          if (
            !d.spec ||
            d.spec.steps.some(
              (s) =>
                !d.progress.completed[s.id] || d.progress.rework.includes(s.id),
            )
          )
            throw new HttpError(400, "Complete the remaining steps first.");
          d.progress.finishedAt = new Date().toISOString();
        }
        if (b.action === "cancel") {
          const j = b.id ? d.jobs.find(j => j.id === b.id && ["running", "queued"].includes(j.state)) : activeJob(d) ?? d.jobs.findLast(j => j.mode === "diagrams" && ["running", "queued"].includes(j.state));
          if (j) {
            j.state = "cancelled";
            j.finishedAt = new Date().toISOString();
            j.stage = "Stopped";
          }
        }
      });
      if (b.action === "cancel") {
        const j = b.id ? p.jobs.find(j => j.id === b.id) : p.jobs.findLast(j => j.state === "cancelled");
        if (j?.state === "cancelled" && j.workflowRunId)
          try {
            await getRun(j.workflowRunId).cancel();
          } catch {}
      }
      if (p.jobs.some(j => j.id === diagramJobId)) {
        if (localMode()) after(() => runWorkflow(owner, projectId, diagramJobId));
        else {
          try {
            const handle = await start(projectWorkflow, [owner, projectId, diagramJobId]);
            p = await mutateProject(owner, projectId, d => { d.jobs.find(j => j.id === diagramJobId)!.workflowRunId = handle.runId; });
          } catch {
            p = await mutateProject(owner, projectId, d => {
              const job = d.jobs.find(j => j.id === diagramJobId)!;
              job.state = "failed";
              job.error = "Illustrations could not start. Your guide is ready; retry illustrations when you’re ready.";
            });
          }
        }
      }
      await recordEvent(
        owner,
        projectId,
        b.action === "finish"
          ? "project_completed"
          : b.action === "step"
            ? "build_progress"
            : `project_${b.action}`,
      );
      return NextResponse.json({ project: await present(p) });
    }
    if (segments[2] === "photos" && req.method === "POST") {
      const p = await getProject(owner, projectId);
      if (p.photos.length >= 100)
        throw new HttpError(400, "This project has reached its photo limit.");
      if (Number(req.headers.get("content-length") || 0) > 11 * 1024 * 1024)
        throw new HttpError(413, "Use an image smaller than 10 MB.");
      const form = await req.formData(),
        f = form.get("file"),
        stepId = form.get("stepId");
      if (!(f instanceof File) || f.size > 10 * 1024 * 1024 || !f.size)
        throw new HttpError(
          400,
          "Choose a JPEG, PNG, or WebP smaller than 10 MB.",
        );
      const data = Buffer.from(await f.arrayBuffer());
      const kind =
        data[0] === 0xff && data[1] === 0xd8
          ? "jpeg"
          : data
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            ? "png"
            : data.subarray(0, 4).toString() === "RIFF" &&
                data.subarray(8, 12).toString() === "WEBP"
              ? "webp"
              : null;
      if (!kind) throw new HttpError(400, "Choose a JPEG, PNG, or WebP image.");
      if (stepId && !p.spec?.steps.some((s) => s.id === stepId))
        throw new HttpError(400, "Step not found.");
      const photo = {
        id: crypto.randomUUID(),
        path: "",
        name: f.name.slice(0, 120),
        stepId: typeof stepId === "string" ? stepId : null,
        createdAt: new Date().toISOString(),
      };
      photo.path = `${owner}/${projectId}/${photo.id}.${kind}`;
      if (localMode()) {
        const location = path.join(process.cwd(), ".local", photo.path);
        await fs.mkdir(path.dirname(location), { recursive: true });
        await fs.writeFile(location, data, { mode: 0o600 });
      } else {
        const { error } = await adminClient()
          .storage.from("project-photos")
          .upload(photo.path, data, {
            contentType: `image/${kind}`,
            upsert: false,
          });
        if (error) throw error;
      }
      let next: Project;
      try {
        next = await mutateProject(owner, projectId, (d) => {
          if (d.photos.length >= 100) throw new HttpError(400, "This project has reached its photo limit.");
          if (photo.stepId && !d.spec?.steps.some(step => step.id === photo.stepId)) throw new HttpError(409, "The step changed. Please attach the photo again.");
          d.photos.push(photo);
        });
      } catch (error) {
        // A network error may hide a successful commit: verify absence before cleanup.
        const persisted = await getProject(owner, projectId).catch(() => null);
        if (persisted && !persisted.photos.some(item => item.id === photo.id)) {
          if (localMode()) await fs.unlink(path.join(process.cwd(), ".local", photo.path)).catch(() => {});
          else await adminClient().storage.from("project-photos").remove([photo.path]).catch(() => {});
        }
        throw error;
      }
      return NextResponse.json({
        project: await present(next),
        photoId: photo.id,
      });
    }
    if (
      segments[2] === "photos" &&
      segments[3] &&
      req.method === "GET" &&
      localMode()
    ) {
      const p = await getProject(owner, projectId),
        photo = [
          ...p.photos,
          ...(p.illustrations ?? []),
          ...(p.stepImages ?? []),
        ].find((x) => x.id === segments[3]);
      if (!photo?.path) throw new HttpError(404, "Photo not found.");
      return new Response(
        await fs.readFile(path.join(process.cwd(), ".local", photo.path)),
        {
          headers: {
            "Content-Type": `image/${photo.path.split(".").at(-1)}`,
            "Cache-Control": "private, max-age=300",
          },
        },
      );
    }
    throw new HttpError(404, "Not found.");
  } catch (e) {
    return errorResponse(e);
  }
}
export { route as GET, route as POST, route as DELETE };
