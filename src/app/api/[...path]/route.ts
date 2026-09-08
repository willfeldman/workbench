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
import { runWorkflow } from "@/lib/server/workflow";
export const runtime = "nodejs";
export const maxDuration = 300;
async function present(p: Project) {
  const d = structuredClone(p);
  for (const photo of [
    ...d.photos,
    ...(d.illustrations ?? []),
    ...(d.stepImages ?? []),
  ]) {
    if (!photo.path) continue;
    if (localMode()) photo.url = `/api/projects/${p.id}/photos/${photo.id}`;
    else {
      const { data } = await adminClient()
        .storage.from("project-photos")
        .createSignedUrl(photo.path, 3600);
      photo.url = data?.signedUrl;
    }
  }
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
      if (req.method === "POST")
        return NextResponse.json({
          project: await createProject(newProject(owner)),
        });
    }
    const projectId = z.string().uuid().parse(segments[1]);
    if (segments.length === 2 && req.method === "GET") {
      let p = await getProject(owner, projectId);
      const job = activeJob(p);
      if (
        job &&
        Date.now() - Date.parse(job.heartbeatAt ?? job.startedAt) >
          20 * 60 * 1000
      )
        p = await mutateProject(owner, projectId, (d) => {
          const j = d.jobs.find((x) => x.id === job.id)!;
          if (j.state === "running" || j.state === "queued") {
            j.state = "failed";
            j.stage = "Interrupted";
            j.error =
              "This request was interrupted. Your project is safe; please retry.";
          }
        });
      return NextResponse.json({ project: await present(p) });
    }
    if (segments[2] === "messages" && req.method === "POST") {
      const body = z
        .object({
          text: z.string().max(12000),
          photoIds: z.array(z.string().uuid()).max(4).default([]),
          requestId: z.string().uuid(),
          mode: z
            .enum(["message", "preview", "illustration", "diagrams"])
            .default("message"),
        })
        .parse(await req.json());
      if (body.mode === "message" && !body.text.trim() && !body.photoIds.length)
        throw new HttpError(400, "Describe what you’d like to make.");
      const before = await getProject(owner, projectId);
      const old = before.jobs.find((j) => j.requestId === body.requestId);
      if (old) return NextResponse.json({ project: await present(before) });
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
      await reserveRun(owner, body.requestId);
      const jobId = crypto.randomUUID();
      let p = await mutateProject(owner, projectId, (d) => {
        if (d.jobs.some((j) => j.requestId === body.requestId)) return;
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
          ]),
          id: z.string().optional(),
          value: z.union([z.boolean(), z.string()]).optional(),
        })
        .parse(await req.json());
      const p = await mutateProject(owner, projectId, (d) => {
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
          const j = activeJob(d);
          if (j) {
            j.state = "cancelled";
            j.finishedAt = new Date().toISOString();
            j.stage = "Stopped";
          }
        }
      });
      if (b.action === "cancel") {
        const j = p.jobs.at(-1);
        if (j?.workflowRunId)
          try {
            await getRun(j.workflowRunId).cancel();
          } catch {}
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
      const next = await mutateProject(owner, projectId, (d) => {
        d.photos.push(photo);
      });
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
