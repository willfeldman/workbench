import { promises as fs } from "node:fs";
import path from "node:path";
import { adminClient, HttpError } from "./supabase";
import { localMode } from "./config";
import type { Project } from "../project";
const root = path.join(process.cwd(), ".local");
let gate: Promise<unknown> = Promise.resolve();
async function locked<T>(fn: () => Promise<T>): Promise<T> {
  const next = gate.then(fn, fn);
  gate = next.catch(() => {});
  return next;
}
const file = (id: string) => {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new HttpError(400, "Invalid project");
  return path.join(root, `${id}.json`);
};
export async function getProject(owner: string, id: string): Promise<Project> {
  if (localMode()) {
    try {
      const p = JSON.parse(await fs.readFile(file(id), "utf8")) as Project;
      if (p.ownerId !== owner) throw new Error();
      return p;
    } catch {
      throw new HttpError(404, "Project not found.");
    }
  }
  const { data, error } = await adminClient()
    .from("project_records")
    .select("data,version")
    .eq("id", id)
    .eq("owner_id", owner)
    .single();
  if (error || !data) throw new HttpError(404, "Project not found.");
  return { ...data.data, version: data.version } as Project;
}
export async function listProjects(owner: string): Promise<Project[]> {
  if (localMode()) {
    await fs.mkdir(root, { recursive: true });
    const names = await fs.readdir(root);
    const records = await Promise.all(
      names
        .filter((x) => x.endsWith(".json") && !x.startsWith("_"))
        .map(
          async (x) =>
            JSON.parse(
              await fs.readFile(path.join(root, x), "utf8"),
            ) as Project,
        ),
    );
    return records
      .filter((x) => x.ownerId === owner)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  const { data, error } = await adminClient()
    .from("project_records")
    .select("data,version")
    .eq("owner_id", owner)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((x) => ({ ...x.data, version: x.version }));
}
export async function createProject(p: Project) {
  if (localMode()) {
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(file(p.id), JSON.stringify(p), {
      flag: "wx",
      mode: 0o600,
    });
    return p;
  }
  const { error } = await adminClient()
    .from("project_records")
    .insert({ id: p.id, owner_id: p.ownerId, version: 0, data: p });
  if (error) throw error;
  return p;
}
async function cas(p: Project, version: number): Promise<boolean> {
  p.version = version + 1;
  p.updatedAt = new Date().toISOString();
  if (localMode()) {
    const current = JSON.parse(await fs.readFile(file(p.id), "utf8"));
    if (current.version !== version) return false;
    const temp = `${file(p.id)}.tmp`;
    await fs.writeFile(temp, JSON.stringify(p), { mode: 0o600 });
    await fs.rename(temp, file(p.id));
    return true;
  }
  const { data, error } = await adminClient().rpc("save_project", {
    p_id: p.id,
    p_owner: p.ownerId,
    p_version: version,
    p_data: p,
  });
  if (error) throw error;
  return data === true;
}
export async function mutateProject(
  owner: string,
  id: string,
  fn: (p: Project) => void,
): Promise<Project> {
  const run = async () => {
    for (let i = 0; i < 8; i++) {
      const p = await getProject(owner, id),
        version = p.version;
      fn(p);
      if (await cas(p, version)) return p;
    }
    throw new HttpError(409, "The project changed. Please try again.");
  };
  return localMode() ? locked(run) : run();
}
export async function reserveRun(owner: string, requestId: string) {
  const limit = Number(process.env.WORKSHOP_DAILY_RUN_LIMIT || 30);
  if (localMode())
    return locked(async () => {
      await fs.mkdir(root, { recursive: true });
      const location = path.join(root, "_usage.json");
      let entries: { id: string; owner: string; at: string }[] = [];
      try {
        entries = JSON.parse(await fs.readFile(location, "utf8"));
      } catch {}
      if (entries.some((x) => x.id === requestId && x.owner === owner)) return;
      const day = new Date().toISOString().slice(0, 10);
      if (
        entries.filter((x) => x.owner === owner && x.at.startsWith(day))
          .length >= limit
      )
        throw new HttpError(
          429,
          "Your daily generation limit has been reached. Your saved guides are still available.",
        );
      entries.push({ id: requestId, owner, at: new Date().toISOString() });
      await fs.writeFile(location, JSON.stringify(entries), { mode: 0o600 });
    });
  const { data, error } = await adminClient().rpc("reserve_run", {
    p_owner: owner,
    p_request: requestId,
    p_limit: limit,
  });
  if (error) throw error;
  if (!data)
    throw new HttpError(
      429,
      "Your daily generation limit has been reached. Your saved guides are still available.",
    );
}
export async function recordEvent(
  owner: string,
  project: string,
  event: string,
  details: Record<string, unknown> = {},
) {
  if (localMode()) return;
  const { error } = await adminClient()
    .from("events")
    .insert({ owner_id: owner, project_id: project, event, details });
  if (error) console.error("Event persistence failed", event, error.code);
}
