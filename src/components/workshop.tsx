"use client";
import { PaneDivider } from "./pane-divider";
import { Select } from "./ui/select";
import { WorkbenchLogo } from "./workbench-logo";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowUp,
  Clock3,
  Gauge,
  Zap,
  Wallet,
  Plus,
  SquarePen,
  PanelLeftClose,
  PanelLeft,
  Search,
  Settings2,
  X,
  Paperclip,
  ChevronDown,
  ChevronRight,
  Check,
  Circle,
  Square,
  Box,
  BookOpen,
  ShoppingBag,
  ListChecks,
  Undo2,
  History,
  Download,
  ExternalLink,
  RefreshCw,
  Camera,
  Leaf,
  Hammer,
  Lamp,
  Scissors,
  MessageSquare,
  Image as ImageIcon,
  Loader2,
  LogOut,
  Expand,
  AlertCircle,
} from "lucide-react";
import { Button } from "./ui/button";
import { shoppingSource, stepStatus, essentialPrecautions } from "@/lib/build-display";
import { exampleProject } from "@/lib/example";
import { additionalExampleProjects } from "@/lib/additional-examples";
import {
  activeJob,
  canComplete,
  formatLength,
  materialCost,
  money,
  totals,
  type Project,
  type Step,
  type Spec,
  type Material,
} from "@/lib/project";
const SceneView = dynamic(() => import("./scene-view"), {
  ssr: false,
  loading: () => (
    <div className="scene-loading">
      <span className="thinking-dot" />
    </div>
  ),
});
type Tab = "Preview" | "Guide" | "Materials" | "Progress";
type Summary = {
  id: string;
  title: string;
  updatedAt: string;
  complete: boolean;
};
const tabs: { name: Tab; icon: typeof Box }[] = [
  { name: "Preview", icon: Box },
  { name: "Guide", icon: BookOpen },
  { name: "Materials", icon: ShoppingBag },
  { name: "Progress", icon: ListChecks },
];
async function api(url: string, options?: RequestInit) {
  const res = await fetch(url, options),
    data = await res.json();
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function post(url: string, body: unknown) {
  return api(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
export default function Workbench({
  preview = false,
  local = false,
}: {
  preview?: boolean;
  local?: boolean;
}) {
  const [examples] = useState(() => [exampleProject(), ...additionalExampleProjects()]);
  const [examplePicker, setExamplePicker] = useState(false);
  const [project, setProject] = useState<Project | null>(null),
    [projects, setProjects] = useState<Summary[]>([]),
    [tab, setTab] = useState<Tab>("Preview"),
    [sidebar, setSidebar] = useState(true),
    [input, setInput] = useState(""),
    [sending, setSending] = useState(false),
    [switchingFast, setSwitchingFast] = useState<string | null>(null),
    [draggingPhotos, setDraggingPhotos] = useState(false),
    [pendingPhotos, setPendingPhotos] = useState<string[]>([]),
    [toast, setToast] = useState(""),
    [settings, setSettings] = useState(false),
    [history, setHistory] = useState(false),
    [filter, setFilter] = useState<string | null>(null),
    [mobilePane, setMobilePane] = useState<"chat" | "workspace">("workspace"),
    [stepId, setStepId] = useState<string | null>(null),
    [illustrated, setIllustrated] = useState(false),
    [loading, setLoading] = useState(!preview),
    [alternative, setAlternative] = useState<{ name: string; kind: "material" | "tool" } | null>(null),
    [alternativeText, setAlternativeText] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    bottom = useRef<HTMLDivElement>(null),
    uploadStep = useRef<string | null>(null),
    uploadBusy = useRef(false),
    fastBusy = useRef(false),
    dragDepth = useRef(0),
    selectedId = useRef<string | null>(null);
  useEffect(() => {
    if (window.matchMedia("(max-width:900px)").matches) setSidebar(false);
  }, []);
  const notify = useCallback((text: string) => setToast(text), []);
  useEffect(() => {
    const reset = () => {
      dragDepth.current = 0;
      setDraggingPhotos(false);
    };
    window.addEventListener("drop", reset);
    window.addEventListener("dragend", reset);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("drop", reset);
      window.removeEventListener("dragend", reset);
      window.removeEventListener("blur", reset);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  const adopt = useCallback(
    (p: Project) => {
      selectedId.current = p.id;
      setProject((prev) =>
        prev?.id === p.id && prev.version > p.version ? prev : p,
      );
      if (!preview) {
        localStorage.setItem("workshop:last-project", p.id);
        setProjects((old) => [
          {
            id: p.id,
            title: p.title,
            updatedAt: p.updatedAt,
            complete: Boolean(p.progress.finishedAt),
          },
          ...old.filter((x) => x.id !== p.id),
        ]);
      } else {
        localStorage.setItem(`workshop:example:${p.id}`, JSON.stringify(p));
        setProjects((old) => old.map((item) => item.id === p.id ? { ...item, complete: Boolean(p.progress.finishedAt) } : item));
      }
    },
    [preview],
  );
  const openProject = useCallback(
    async (id: string) => {
      setLoading(true);
      selectedId.current = id;
      try {
        const { project: p } = await api(`/api/projects/${id}`);
        if (selectedId.current === id) {
          adopt(p);
          setTab("Preview");
          setStepId(null);
          setPendingPhotos([]);
        }
      } catch (e) {
        notify((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [adopt, notify],
  );
  useEffect(() => {
    if (preview) {
      setProjects(examples.map((p) => ({ id: p.id, title: p.title, updatedAt: p.updatedAt, complete: false })));
      const requested = new URLSearchParams(window.location.search).get("example");
      const sample = examples.find((p) => p.id === requested);
      if (sample) adopt(savedExample(sample));
      setLoading(false);
      return;
    }
    let alive = true;
    api("/api/projects")
      .then(({ projects: list }) => {
        if (!alive) return;
        setProjects(list);
        const saved = localStorage.getItem("workshop:last-project");
        if (saved && list.some((p: Summary) => p.id === saved))
          openProject(saved);
        else setLoading(false);
      })
      .catch((e) => {
        notify(e.message);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [preview, openProject, notify, examples, adopt]);
  const job = project ? activeJob(project) : undefined;
  const pollingJob = project?.jobs.findLast((j) => j.state === "queued" || j.state === "running");
  const diagramJob = project?.jobs.findLast((j) => (j.mode === "diagrams" || j.mode === "enrichment") && (j.state === "queued" || j.state === "running"));
  useEffect(() => {
    if (project?.spec && !project.spec.scene && project.jobs.some((item) => item.mode === "message" && item.speed === "fast" && item.state === "complete")) {
      setTab("Guide");
      setMobilePane("workspace");
    }
    // Open the newly published guide once; background enrichment must not change tabs.
  }, [project?.id, project?.currentRevisionId]);
  useEffect(() => {
    if (!project || preview || !pollingJob) return;
    const id = project.id;
    const controller = new AbortController();
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!alive || selectedId.current !== id) return;
      try {
        const data = await api(`/api/projects/${id}`, { signal: controller.signal });
        if (alive && selectedId.current === id) adopt(data.project);
      } catch (e) {
        if (alive && selectedId.current === id) notify((e as Error).message);
      } finally {
        // Wait for the response before scheduling again, even on slow networks.
        if (alive && selectedId.current === id) timer = setTimeout(poll, 1800);
      }
    };
    timer = setTimeout(poll, 1800);
    return () => {
      alive = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [project?.id, pollingJob?.id, preview, adopt, notify]);
  useEffect(() => {
    if (!project || preview || !(project.photos.length || project.stepImages?.length || project.illustrations?.length)) return;
    const id = project.id;
    let alive = true, refreshing = false;
    const refresh = async () => {
      if (document.hidden || refreshing || selectedId.current !== id) return;
      refreshing = true;
      try {
        const data = await api(`/api/projects/${id}`);
        if (alive && selectedId.current === id) adopt(data.project);
      } catch { /* Keep the saved guide usable during a temporary disconnect. */ }
      finally { refreshing = false; }
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(refresh, 50 * 60 * 1000);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [project?.id, Boolean(project?.photos.length || project?.stepImages?.length || project?.illustrations?.length), preview, adopt]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [project?.messages.length, job?.stage]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSettings(false);
        setHistory(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSidebar(true);
        setFilter("");
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  async function ensureProject() {
    if (project) return project;
    const { project: p } = await post("/api/projects", {});
    adopt(p);
    return p as Project;
  }
  function newChat() {
    dragDepth.current = 0;
    setDraggingPhotos(false);
    selectedId.current = null;
    setProject(null);
    setInput("");
    setPendingPhotos([]);
    setHistory(false);
    setStepId(null);
    setTab("Preview");
    localStorage.removeItem("workshop:last-project");
    textarea.current?.focus();
  }
  function example(id = "example-planter") {
    const sample = examples.find((p) => p.id === id) ?? examples[0];
    if (preview) {
      adopt(savedExample(sample));
      setTab("Preview");
      setStepId(null);
      setIllustrated(false);
      setPendingPhotos([]);
      setInput("");
      setMobilePane("workspace");
      if (window.matchMedia("(max-width:900px)").matches) setSidebar(false);
    } else window.open(`/demo?example=${encodeURIComponent(sample.id)}`, "_blank", "noopener");
    setExamplePicker(false);
  }
  async function send(
    text = input,
    mode: "message" | "preview" | "illustration" | "diagrams" | "enrichment" = "message",
  ) {
    if (preview) {
      notify(
        "This is an example project. Sign in to create and revise your own.",
      );
      return;
    }
    if (
      sending ||
      job ||
      (!text.trim() && !pendingPhotos.length && mode === "message")
    )
      return;
    setSending(true);
    const oldInput = input,
      photos = [...pendingPhotos];
    setInput("");
    setPendingPhotos([]);
    try {
      const p = await ensureProject();
      const { project: next } = await post(`/api/projects/${p.id}/messages`, {
        text,
        mode,
        photoIds: photos,
        requestId: crypto.randomUUID(),
      });
      adopt(next);
      setMobilePane("chat");
    } catch (e) {
      setInput(mode === "message" ? text : oldInput);
      setPendingPhotos(photos);
      notify((e as Error).message);
    } finally {
      setSending(false);
    }
  }
  async function act(action: string, id?: string, value?: string | boolean) {
    if (!project) return;
    if (preview) {
      const p = structuredClone(project);
      if (action === "step") {
        if (value) {
          p.progress.completed[id!] = new Date().toISOString();
          p.progress.rework = p.progress.rework.filter((step) => step !== id);
        } else delete p.progress.completed[id!];
      } else if (action === "material" || action === "tool") {
        const list =
          action === "material" ? p.progress.materials : p.progress.tools;
        if (value === "owned" || value === "purchased") list[id!] = value;
        else delete list[id!];
      } else if (action === "units") p.units = value as Project["units"];
      else if (action === "finish")
        p.progress.finishedAt = new Date().toISOString();
      else {
        notify("Revisions are available in your own projects.");
        return;
      }
      p.version++;
      adopt(p);
      return;
    }
    try {
      const { project: p } = await post(`/api/projects/${project.id}/actions`, {
        action,
        id,
        value,
      });
      adopt(p);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function useFastMode(target = job) {
    if (!project || !target || target.mode !== "message" || fastBusy.current) return;
    const projectId = project.id;
    fastBusy.current = true;
    setSwitchingFast(target.id);
    try {
      const { project: next } = await post(`/api/projects/${projectId}/actions`, { action: "fast", id: target.id });
      if (selectedId.current === projectId) adopt(next);
    } catch (error) {
      if (selectedId.current === projectId) notify((error as Error).message);
    } finally {
      fastBusy.current = false;
      setSwitchingFast(null);
    }
  }
  async function upload(files: FileList | File[] | null) {
    if (!files?.length) return;
    if (preview) {
      notify("Photo check-ins are available in your own projects.");
      return;
    }
    if (sending || uploadBusy.current) {
      notify("Please wait for the current upload or message to finish.");
      return;
    }
    const selected = Array.from(files);
    if (selected.length > 4 - pendingPhotos.length) {
      notify("You can attach up to 4 images per message.");
      return;
    }
    if (
      selected.some(
        (file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type),
      )
    ) {
      notify("Choose JPG, PNG, or WebP images.");
      return;
    }
    if (selected.some((file) => !file.size || file.size > 10 * 1024 * 1024)) {
      notify("Choose images up to 10 MB each. Empty files cannot be uploaded.");
      return;
    }
    uploadBusy.current = true;
    const photoStep = uploadStep.current;
    setSending(true);
    try {
      const p = await ensureProject();
      for (const f of selected) {
        const form = new FormData();
        form.append("file", f);
        if (photoStep) form.append("stepId", photoStep);
        const result = await api(`/api/projects/${p.id}/photos`, {
          method: "POST",
          body: form,
        });
        adopt(result.project);
        // Keep successful attachments if a later file in the batch fails.
        setPendingPhotos((old) => [...old, result.photoId]);
      }
      setMobilePane("chat");
      textarea.current?.focus();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      uploadStep.current = null;
      uploadBusy.current = false;
      setSending(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  function ask(text: string) {
    setInput(text);
    setMobilePane("chat");
    textarea.current?.focus();
  }
  const spec = project?.spec,
    hasWorkspace = Boolean(spec),
    home = !project?.messages.length && !spec,
    units = project?.units ?? "imperial";
  const cost = spec ? totals(spec, project?.progress.materials) : null;
  const shoppingCost = spec ? totals({ ...spec, materials: [...spec.materials, ...spec.tools.map((tool) => ({ ...tool, quantity: 1, unit: "tool" }))] }, { ...project?.progress.materials, ...project?.progress.tools }) : null;
  const
    completed =
      spec?.steps.filter(
        (s) =>
          project?.progress.completed[s.id] &&
          !project?.progress.rework.includes(s.id),
      ).length ?? 0;
  const reviewCount = spec?.steps.filter((s) => project?.progress.rework.includes(s.id)).length ?? 0;
  const nextStep = spec?.steps.find((s) => project && (!project.progress.completed[s.id] || project.progress.rework.includes(s.id)) && !stepStatus(project, s).blocked) ?? spec?.steps.find((s) => !project?.progress.completed[s.id] || project?.progress.rework.includes(s.id));
  const selectedStep =
    stepId === "none"
      ? undefined
      : (spec?.steps.find((s) => s.id === stepId) ??
        nextStep ??
        spec?.steps[0]);
  useEffect(() => {
    if (preview && project?.id === "example-planter")
      setProject((previous) =>
        previous
          ? {
              ...previous,
              spec: exampleProject().spec,
              stepImages: exampleProject().stepImages,
            }
          : previous,
      );
  }, [preview, project?.id]);
  const currentIllustration = project?.illustrations?.findLast(
    (x) => x.revisionId === project.currentRevisionId,
  );
  return (
    <div className={`app-shell ${sidebar ? "" : "sidebar-hidden"}`}>
      <aside className="sidebar" inert={!sidebar}>
        <div className="sidebar-top">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              newChat();
            }}
            className="wordmark"
            aria-label="Workbench — new project"
          >
            <WorkbenchLogo compact />
          </a>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close sidebar"
            title="Close sidebar"
            onClick={() => setSidebar(false)}
          >
            <PanelLeftClose size={18} />
          </Button>
        </div>
        <nav className="sidebar-actions">
          <button onClick={newChat}>
            <SquarePen size={18} />
            New project
          </button>
          <button onClick={() => setFilter(filter === null ? "" : null)}>
            <Search size={17} />
            Search projects
          </button>
        </nav>
        {filter !== null && (
          <input
            autoFocus
            className="project-search"
            placeholder="Search…"
            aria-label="Search projects"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        )}
        <div className="project-list">
          <span className="section-label">Projects</span>
          {projects
            .filter(
              (p) =>
                !filter || p.title.toLowerCase().includes(filter.toLowerCase()),
            )
            .map((p) => (
              <button
                key={p.id}
                className={project?.id === p.id ? "selected" : ""}
                onClick={() => (preview ? example(p.id) : openProject(p.id))}
              >
                <span>{p.title}</span>
                {p.complete && <Check size={14} />}
              </button>
            ))}
          {!projects.length && (
            <span className="empty-projects">
              Your projects will appear here
            </span>
          )}
        </div>
        <div className="sidebar-bottom">
          <button onClick={() => setSettings(true)}>
            <span className="avatar">W</span>
            <span>
              {preview
                ? "Example workspace"
                : local
                  ? "Local workspace"
                  : "My workspace"}
              <small>{preview ? "Explore Workbench" : "Personal workspace"}</small>
            </span>
            <Settings2 size={16} />
          </button>
        </div>
      </aside>
      {sidebar && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebar(false)}
        />
      )}
      <main className={`main ${hasWorkspace ? "has-workspace" : ""}`}>
        <header className="app-header">
          <div className="header-title">
            {!sidebar && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open sidebar"
                onClick={() => setSidebar(true)}
              >
                <PanelLeft size={18} />
              </Button>
            )}
            <span>{home ? "Workbench" : project?.title || "Workbench"}</span>
            {job && <span className="header-working" aria-label="Working" />}
          </div>
          <div className="header-actions">
            {preview && (
              <Button asChild size="sm" className="sign-in-button">
                <a href="/login">Sign in</a>
              </Button>
            )}
            {hasWorkspace && (
              <div className="mobile-switch">
                <button
                  className={mobilePane === "chat" ? "active" : ""}
                  onClick={() => setMobilePane("chat")}
                  aria-label="Conversation"
                >
                  <MessageSquare size={17} />
                </button>
                <button
                  className={mobilePane === "workspace" ? "active" : ""}
                  onClick={() => setMobilePane("workspace")}
                  aria-label="Project workspace"
                >
                  <Box size={17} />
                </button>
              </div>
            )}
          </div>
        </header>
        <div
          className={`content-layout ${mobilePane === "chat" ? "show-chat" : "show-workspace"}`}
        >
          <section
            className={`conversation ${home ? "conversation-home" : ""}`}
            aria-label="Project conversation"
            onDragEnter={(event) => {
              if (!event.dataTransfer.types.includes("Files")) return;
              event.preventDefault();
              dragDepth.current++;
              setDraggingPhotos(true);
            }}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes("Files")) return;
              event.preventDefault();
              event.dataTransfer.dropEffect =
                sending || pendingPhotos.length >= 4 ? "none" : "copy";
            }}
            onDragLeave={() => {
              dragDepth.current = Math.max(0, dragDepth.current - 1);
              if (!dragDepth.current) setDraggingPhotos(false);
            }}
            onDrop={(event) => {
              if (!event.dataTransfer.types.includes("Files")) return;
              event.preventDefault();
              dragDepth.current = 0;
              setDraggingPhotos(false);
              uploadStep.current = null;
              void upload(Array.from(event.dataTransfer.files));
            }}
          >
            {home ? (
              <div className="home-intro">
                <h1>What would you like to make?</h1>
              </div>
            ) : (
              <div className="messages">
                {project?.messages.map((m) => (
                  <div key={m.id} className={`message ${m.role}`}>
                    <div className="message-content">
                      {m.photoIds.length > 0 && (
                        <div className="message-photos">
                          {m.photoIds.map((id) => {
                            const ph = project.photos.find((p) => p.id === id);
                            return ph?.url ? (
                              <img key={id} src={ph.url} alt={ph.name} />
                            ) : null;
                          })}
                        </div>
                      )}
                      {m.text.split("\n\n").map((paragraph, i) => (
                        <p key={i}>{paragraph}</p>
                      ))}
                      {m.questions?.map((q) => (
                        <div className="question" key={q.id}>
                          <p>{q.question}</p>
                          <div className="question-options">
                            {q.options.map((option) => (
                              <button
                                key={option}
                                disabled={Boolean(job) || sending}
                                onClick={() =>
                                  ask(
                                    (input ? input + "\n" : "") +
                                      q.question +
                                      " " +
                                      option,
                                  )
                                }
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {project?.proposal && (
                  <div className="proposal">
                    <span className="proposal-label">
                      <RefreshCw size={14} />
                      Proposed update
                    </span>
                    <h3>{project.proposal.spec.title}</h3>
                    <p>{project.proposal.summary}</p>
                    <div className="proposal-diff">
                      <span>Materials</span>
                      <span>
                        {project.spec?.materials.length ?? 0} to{" "}
                        {project.proposal.spec.materials.length}
                      </span>
                      <span>Estimated total</span>
                      <span>
                        {money(totals(project.spec!).total)} to{" "}
                        {money(totals(project.proposal.spec).total)}
                      </span>
                      <span>Dimensions</span>
                      <span>
                        {project.proposal.spec.dimensionsMm
                          .map((x) => formatLength(x, units))
                          .join(" × ")}
                      </span>
                    </div>
                    {project.proposal.reworkStepIds.length > 0 && (
                      <p>
                        {project.proposal.reworkStepIds.length} completed
                        step(s) need review.
                      </p>
                    )}
                    <details>
                      <summary>Review the proposed guide</summary>
                      {project.proposal.spec.steps.map((s) => (
                        <div key={s.id}>
                          <h4>{s.title}</h4>
                          <p>{s.instructions}</p>
                        </div>
                      ))}
                    </details>
                    <div className="inline-actions">
                      <Button
                        size="sm"
                        onClick={() => act("accept", project.proposal!.id)}
                      >
                        Apply update
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => act("reject")}
                      >
                        Keep current
                      </Button>
                    </div>
                  </div>
                )}
                {(job || sending) && (
                  <div className="activity" role="status" aria-live="polite">
                    <details>
                      <summary>
                        <span className="thinking-dot" />
                        <span className="shimmer-text">
                          {job?.stage || "Starting"}
                        </span>
                        <ChevronDown size={13} />
                      </summary>
                      {job?.activities.map((a) => (
                        <div className="activity-item" key={a.id}>
                          <Check size={12} />
                          {a.label}
                        </div>
                      ))}
                    </details>
                    {job?.mode === "message" && (
                      job.speed === "fast" && !(job.state === "queued" && !job.workflowRunId && Date.now() - Date.parse(job.startedAt) > 60_000) ? <span className="fast-mode-status"><Zap size={13} aria-hidden="true" />Fast mode</span> :
                      <Button variant="outline" size="sm" className="fast-mode-button" onClick={() => useFastMode()} disabled={switchingFast === job.id} title="Get the guide sooner. Sourcing and illustrations continue in the background.">
                        {switchingFast === job.id ? <Loader2 size={13} className="spin" aria-hidden="true" /> : <Zap size={13} aria-hidden="true" />}
                        {switchingFast === job.id ? "Switching…" : job.speed === "fast" ? "Retry fast mode" : "Use fast mode"}
                      </Button>
                    )}
                  </div>
                )}
                {!job && project?.jobs.at(-1)?.state === "failed" && (
                  <div className="inline-error">
                    <p>{project.jobs.at(-1)?.error}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={Boolean(switchingFast)}
                      onClick={() =>
                        project.jobs.at(-1)?.speed === "fast" && project.jobs.at(-1)?.mode === "message" ? useFastMode(project.jobs.at(-1)) : send(
                          project.messages
                            .filter((m) => m.role === "user")
                            .at(-1)?.text ?? "",
                          project.jobs.at(-1)?.mode,
                        )
                      }
                    >
                      Try again
                    </Button>
                  </div>
                )}
                <div ref={bottom} />
              </div>
            )}
            <div className="composer-area">
              <div className={`composer${draggingPhotos ? " is-dragging" : ""}`}>
                {draggingPhotos && (
                  <div className="composer-drop-hint" role="status">
                    {sending
                      ? "Please wait…"
                      : pendingPhotos.length >= 4
                        ? "4 images attached"
                        : "Drop images here"}
                  </div>
                )}
                {pendingPhotos.length > 0 && (
                  <div className="attachments">
                    {pendingPhotos.map((id) => {
                      const ph = project?.photos.find((p) => p.id === id);
                      return (
                        <div key={id}>
                          {ph?.url && <img src={ph.url} alt={ph.name} />}
                          <button
                            aria-label="Remove attachment"
                            onClick={() =>
                              setPendingPhotos((old) =>
                                old.filter((x) => x !== id),
                              )
                            }
                          >
                            <X size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <textarea
                  ref={textarea}
                  value={input}
                  rows={home ? 2 : 2}
                  placeholder={
                    home
                      ? "Describe your idea…"
                      : "Ask anything, or change something…"
                  }
                  aria-label="Message Workbench"
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <div className="composer-toolbar">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Attach photos"
                    title="Attach photos"
                    disabled={sending || pendingPhotos.length >= 4}
                    onClick={() => {
                      uploadStep.current = null;
                      fileInput.current?.click();
                    }}
                  >
                    <Plus size={21} />
                  </Button>
                  <span className="composer-spacer" aria-hidden="true" />
                  {job ? (
                    <Button
                      size="icon"
                      aria-label="Stop generating"
                      title="Stop"
                      onClick={() => act("cancel")}
                    >
                      <Square size={13} fill="currentColor" />
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      className="send-button"
                      aria-label="Send message"
                      disabled={
                        sending || (!input.trim() && !pendingPhotos.length)
                      }
                      onClick={() => send()}
                    >
                      {sending ? (
                        <Loader2 size={17} className="spin" />
                      ) : (
                        <ArrowUp size={20} />
                      )}
                    </Button>
                  )}
                </div>
              </div>
              {home ? (
                <>
                  <div className="suggestions">
                    {[
                      { icon: Leaf, text: "A planter for my balcony" },
                      { icon: Hammer, text: "Something for my space" },
                      { icon: Scissors, text: "A handmade gift" },
                    ].map((s) => (
                      <button
                        key={s.text}
                        onClick={() => {
                          setInput(s.text);
                          textarea.current?.focus();
                        }}
                      >
                        <s.icon size={15} />
                        {s.text}
                      </button>
                    ))}
                  </div>
                  <div className="example-links">
                    <button className="explore-example" onClick={() => example()}>Explore an example</button>
                    <button className="explore-example" onClick={() => setExamplePicker(true)}>More examples</button>
                  </div>
                </>
              ) : (
                <div className="composer-note">
                  {preview
                    ? "Example project · Changes stay in this browser"
                    : "Check measurements before you build."}
                </div>
              )}
            </div>
            {hasWorkspace && <PaneDivider />}
          </section>
          {hasWorkspace && spec && project && (
            <section className="workspace" aria-label="Project workspace">
              <div className="workspace-toolbar">
                <div
                  role="tablist"
                  aria-label="Project views"
                  className="workspace-tabs"
                >
                  {tabs.map((t) => (
                    <button
                      key={t.name}
                      role="tab"
                      aria-label={t.name}
                      title={t.name}
                      aria-selected={tab === t.name}
                      onClick={() => {
                        setTab(t.name);
                        setHistory(false);
                      }}
                    >
                      <t.icon size={15} aria-hidden="true" />
                      {tab === t.name && t.name}
                    </button>
                  ))}
                </div>
                <div className="workspace-tools">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Revision history"
                    title="Revision history"
                    onClick={() => setHistory(!history)}
                  >
                    <History size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Print guide"
                    title="Print guide"
                    onClick={() => window.print()}
                  >
                    <Download size={16} />
                  </Button>
                </div>
              </div>
              {history && (
                <div className="history-panel">
                  <div className="history-title">
                    Revisions
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Close history"
                      onClick={() => setHistory(false)}
                    >
                      <X size={15} />
                    </Button>
                  </div>
                  {[...project.revisions].reverse().map((r, i) => (
                    <div key={r.id}>
                      <span>
                        <strong>{r.summary}</strong>
                        <small>{new Date(r.createdAt).toLocaleString()}</small>
                      </span>
                      {i === 0 ? (
                        <Check size={15} />
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={Boolean(job)}
                          onClick={() => act("restore", r.id)}
                        >
                          Restore
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div
                key={`${project.id}-${tab}`}
                className="workspace-body"
                role="tabpanel"
                aria-label={tab}
              >
                {tab === "Preview" && (
                  <>
                    <div className="preview-heading">
                      <div>
                        <h2>{spec.title}</h2>
                      </div>
                    </div>
                    {illustrated && currentIllustration?.url ? (
                      <div className="concept-image">
                        <img
                          src={currentIllustration.url}
                          alt={`Concept illustration of ${spec.title}`}
                        />
                      </div>
                    ) : (
                      <SceneView
                        spec={
                          spec.scene
                            ? spec
                            : (project.revisions.findLast((r) => r.spec.scene)
                                ?.spec ?? spec)
                        }
                        units={units}
                        onUnitsChange={(value) => act("units", undefined, value)}
                      />
                    )}
                    {spec.sceneError && (
                      <div className="preview-warning">
                        {spec.sceneError}
                        <button onClick={() => send("", "preview")}>
                          Retry
                        </button>
                        {!spec.scene &&
                          project.revisions.some((r) => r.spec.scene) && (
                            <small>Showing a previous revision.</small>
                          )}
                      </div>
                    )}
                    <div className="preview-summary">
                      <p>{spec.summary}</p>
                      <div className="project-facts">
                        <span>
                          <Gauge size={14} aria-hidden="true" />
                          {spec.difficulty}
                        </span>
                        <span>
                          <Clock3 size={14} aria-hidden="true" />
                          {spec.minutes < 60
                            ? `${spec.minutes} min`
                            : `${Number((spec.minutes / 60).toFixed(1))} hours`}
                        </span>
                        <span
                          title={
                            cost?.unknown
                              ? "Materials subtotal; some items still need a price"
                              : "Estimated materials cost"
                          }
                        >
                          <Wallet size={14} aria-hidden="true" />
                          {cost?.unknown && !cost.total ? "Price varies" : `${cost?.unknown ? "From " : ""}${money(cost?.total ?? 0)} est.`}
                        </span>
                      </div>
                    </div>
                    <div className="preview-footer">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={Boolean(job)}
                        onClick={() =>
                          currentIllustration
                            ? setIllustrated(!illustrated)
                            : send("", "illustration")
                        }
                      >
                        <ImageIcon size={15} />
                        {currentIllustration
                          ? illustrated
                            ? "Show 3D"
                            : "Show illustration"
                          : "Illustrate"}
                      </Button>
                      <Button size="sm" onClick={() => setTab("Guide")}>
                        View guide
                      </Button>
                    </div>
                  </>
                )}
                {tab === "Guide" && (
                  <div className="guide document-view">
                    <div className="document-heading">
                      <h2>The build</h2>
                      <span>
                        {spec.steps.length} steps ·{" "}
                        {Math.round((spec.minutes / 60) * 10) / 10} hours
                      </span>
                    </div>
                    {spec.openQuestions.length > 0 && (
                      <div className="notice">
                        <strong>Before you start</strong>
                        {spec.openQuestions.map((q, i) => (
                          <p key={i}>{q}</p>
                        ))}
                        <button
                          onClick={() =>
                            ask("I’d like to confirm the missing measurements.")
                          }
                        >
                          Confirm in chat
                        </button>
                      </div>
                    )}
                    {spec.professionalReview && (
                      <div className="notice">
                        This project needs qualified professional review. These
                        steps cover preparation.
                      </div>
                    )}
                    <details className="prep">
                      <summary>
                        Before you begin
                        <ChevronDown size={14} />
                      </summary>
                      {[...spec.prerequisites, ...spec.assumptions].map(
                        (x, i) => (
                          <p key={i}>{x}</p>
                        ),
                      )}
                    </details>
                    {diagramJob && <div className="diagram-progress" role="status"><Loader2 size={14} className="spin" />{diagramJob.stage || "Preparing step illustrations…"}</div>}
                    {spec.steps.map((s, i) => (
                      <article
                        key={s.id}
                        className={`guide-step ${selectedStep?.id === s.id ? "expanded" : ""}`}
                      >
                        <button
                          className="step-heading"
                          aria-expanded={selectedStep?.id === s.id}
                          aria-controls={`step-content-${s.id}`}
                          onClick={() =>
                            setStepId(selectedStep?.id === s.id ? "none" : s.id)
                          }
                        >
                          <span
                            className={`step-number ${project.progress.completed[s.id] ? "done" : ""}`}
                          >
                            {project.progress.completed[s.id] ? (
                              <Check size={15} />
                            ) : (
                              i + 1
                            )}
                          </span>
                          <span>
                            {s.title}
                            <small>{s.minutes} min{stepStatus(project, s).completed || stepStatus(project, s).review ? ` · ${stepStatus(project, s).label}` : ""}</small>
                          </span>
                          <ChevronDown size={15} />
                        </button>
                        <div
                          className="step-reveal"
                          inert={selectedStep?.id !== s.id}
                          id={`step-content-${s.id}`}
                        >
                          <div className="step-reveal-inner">
                            <div className="step-content">
                              <div className="step-layout">
                                <StepDiagram step={s} project={project} onRetry={() => send("", "diagrams")} busy={Boolean(diagramJob)} hideMissing={preview} />
                                <div className="step-detail">
                                  <StepResources step={s} spec={spec} onOpen={() => setTab("Materials")} />
                                  <StepInstructions step={s} />
                                  {essentialPrecautions(s).map((note, index) => <p className="essential-note" key={index}><AlertCircle size={14} aria-hidden="true" />{note}</p>)}
                                  {stepStatus(project, s).reason && (!stepStatus(project, s).completed || stepStatus(project, s).review) && <p className="step-blocked">{stepStatus(project, s).reason}</p>}
                                </div>
                              </div>
                              <div className="inline-actions">
                                <Button
                                  size="sm"
                                  variant={
                                    project.progress.completed[s.id]
                                      ? "outline"
                                      : "default"
                                  }
                                  disabled={
                                    (!project.progress.completed[s.id] || project.progress.rework.includes(s.id)) &&
                                    !canComplete(project, s)
                                  }
                                  onClick={() =>
                                    act(
                                      "step",
                                      s.id,
                                      !project.progress.completed[s.id] || project.progress.rework.includes(s.id),
                                    )
                                  }
                                >
                                  {project.progress.rework.includes(s.id) ? "Confirm reviewed" : project.progress.completed[s.id] ? (
                                    <>
                                      <Check size={14} />
                                      Done
                                    </>
                                  ) : (
                                    "Mark complete"
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    ask(
                                      `Help me with step ${i + 1}: ${s.title}.`,
                                    )
                                  }
                                >
                                  Ask about this
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                {tab === "Materials" && (
                  <div className="materials document-view">
                    <div className="document-heading">
                      <h2>Everything you need</h2>
                      <span>
                        Remaining {money(shoppingCost?.total ?? 0)}
                        {shoppingCost?.unknown ? " + unpriced items" : ""}
                      </span>
                    </div>
                    <div className="list-section">
                      <h3>Materials</h3>
                      {spec.materials.map((m) => (
                        <ShoppingItem
                          key={m.id}
                          item={m}
                          state={project.progress.materials[m.id]}
                          onChange={(value) => act("material", m.id, value)}
                          onAlternative={() =>
                            setAlternative({ name: m.name, kind: "material" })
                          }
                        />
                      ))}
                    </div>
                    <div className="list-section">
                      <h3>Tools</h3>
                      {spec.tools.map((t) => (
                        <ShoppingItem
                          key={t.id}
                          item={{ ...t, quantity: 1, unit: "tool" }}
                          state={project.progress.tools[t.id]}
                          onChange={(value) => act("tool", t.id, value)}
                          onAlternative={() =>
                            setAlternative({ name: t.name, kind: "tool" })
                          }
                        />
                      ))}
                    </div>
                    <p className="materials-note">
                      Estimates in USD, before tax and shipping. Listing prices
                      can change. Owned and purchased materials and tools are excluded
                      from the remaining total.
                    </p>

                  </div>
                )}
                {tab === "Progress" && (
                  <div className="progress-view document-view">
                    <div className="document-heading">
                      <h2>
                        {project.progress.finishedAt
                          ? "You made it."
                          : "One step at a time"}
                      </h2>
                      <span>
                        {spec.steps.filter((s) => project.progress.completed[s.id]).length} of {spec.steps.length} completed{reviewCount ? ` · ${reviewCount} to review` : ""}
                      </span>
                    </div>
                    <div className="progress-track">
                      <span
                        style={{
                          width: `${(completed / spec.steps.length) * 100}%`,
                        }}
                      />
                    </div>
                    {nextStep && !project.progress.finishedAt && (
                      <div className="next-step-card">
                        <span>{stepStatus(project, nextStep).review ? "Review your work" : "Up next"}</span>
                        <h3>{nextStep.title}</h3>
                        {stepStatus(project, nextStep).reason && <p>{stepStatus(project, nextStep).reason}</p>}
                        <Button size="sm" onClick={() => { setStepId(nextStep.id); setTab("Guide"); }}>Continue building</Button>
                      </div>
                    )}
                    {spec.steps.map((s, i) => (
                      <div
                        key={s.id}
                        className={`progress-step ${project.progress.rework.includes(s.id) ? "needs-review" : ""}`}
                      >
                        <button
                          className="progress-check"
                          aria-label={`${project.progress.rework.includes(s.id) ? "Confirm reviewed" : project.progress.completed[s.id] ? "Uncomplete" : "Complete"} ${s.title}`}
                          disabled={
                            (!project.progress.completed[s.id] || project.progress.rework.includes(s.id)) &&
                            !canComplete(project, s)
                          }
                          onClick={() =>
                            act(
                              "step",
                              s.id,
                              !project.progress.completed[s.id] ||
                                project.progress.rework.includes(s.id),
                            )
                          }
                        >
                          {project.progress.completed[s.id] ? (
                            <Check size={17} />
                          ) : (
                            <Circle size={18} />
                          )}
                        </button>
                        <button
                          className="progress-step-name"
                          onClick={() => {
                            setStepId(s.id);
                            setTab("Guide");
                          }}
                        >
                          <span>{s.title}</span>
                          <small>
                            {stepStatus(project, s).completed || stepStatus(project, s).review
                              ? stepStatus(project, s).label
                              : stepStatus(project, s).reason ?? `Step ${i + 1} · ${s.minutes} min`}
                          </small>
                        </button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Add photo for ${s.title}`}
                          onClick={() => {
                            uploadStep.current = s.id;
                            fileInput.current?.click();
                          }}
                        >
                          <Camera size={17} />
                        </Button>
                      </div>
                    ))}
                    <div className="progress-finish">
                      <Button
                        disabled={
                          completed !== spec.steps.length ||
                          Boolean(project.progress.finishedAt)
                        }
                        onClick={() => act("finish")}
                      >
                        {project.progress.finishedAt ? (
                          <>
                            <Check size={15} />
                            Project complete
                          </>
                        ) : (
                          "Finish project"
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          uploadStep.current = null;
                          fileInput.current?.click();
                        }}
                      >
                        <Camera size={15} />
                        {project.progress.finishedAt
                          ? "Add final photo"
                          : "Add a photo"}
                      </Button>
                    </div>
                    {project.photos.length > 0 && (
                      <div className="photo-gallery">
                        {project.photos.map((ph) => (
                          <figure key={ph.id}>
                            {ph.url && <img src={ph.url} alt={ph.name} />}
                            <figcaption>
                              {ph.stepId
                                ? spec.steps.find((s) => s.id === ph.stepId)
                                    ?.title
                                : "Project photo"}
                            </figcaption>
                          </figure>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {project.revisions.length > 1 && (
                <div className="revision-footer">
                  <span>{project.revisions.at(-1)?.summary}</span>
                  <button disabled={Boolean(job)} onClick={() => act("undo")}>
                    <Undo2 size={13} />
                    Undo
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      </main>
      <input
        ref={fileInput}
        className="sr-only"
        tabIndex={-1}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(e) => upload(e.target.files)}
      />
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {alternative && <AlternativeDialog name={alternative.name} value={alternativeText} onChange={setAlternativeText} onClose={() => { setAlternative(null); setAlternativeText(""); }} onSubmit={() => {
        const request = `Please adapt the project’s ${alternative.kind} choice: ${alternative.name}. ${alternativeText.trim()} Update the plan, affected instructions, quantities, sourcing, and preview as needed. Preserve completed work and owned or purchased items, and flag any work that needs review.`;
        setAlternative(null); setAlternativeText(""); send(request);
      }} busy={sending || Boolean(job)} />}
      {examplePicker && <ExamplePicker examples={examples} onSelect={example} onClose={() => setExamplePicker(false)} />}
      {settings && (
        <div className="modal-scrim" onClick={() => setSettings(false)}>
          <section
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Workspace settings"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <h2>Workspace</h2>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close settings"
                onClick={() => setSettings(false)}
              >
                <X size={18} />
              </Button>
            </div>
            <p>
              {preview
                ? "Explore an example project. Your changes are saved only in this browser."
                : local
                  ? "Your projects are saved on this computer. AI requests use the configured server key."
                  : "Your projects and photos are private to your account."}
            </p>
            {project && (
              <label className="setting-row">
                Measurements
                <Select
                  label="Measurements"
                  value={units}
                  onValueChange={(value) => act("units", undefined, value)}
                  options={[
                    { value: "imperial", label: "Inches" },
                    { value: "metric", label: "Millimeters" },
                  ]}
                />
              </label>
            )}
            <a href="/demo" className="setting-row">
              Example project
            </a>
            {!preview && !local && (
              <Button
                variant="outline"
                onClick={async () => {
                  await api("/api/session", { method: "DELETE" });
                  location.href = "/login";
                }}
              >
                <LogOut size={15} />
                Sign out
              </Button>
            )}
            {preview && (
              <a href="/login" className="sign-in-link">
                Sign in to start your own
              </a>
            )}
          </section>
        </div>
      )}
      {spec && project && (
        <PrintGuide spec={spec} units={units} project={project} />
      )}
    </div>
  );
}

function StepResources({ step, spec, onOpen }: { step: Step; spec: Spec; onOpen: () => void }) {
  const materialIds = new Set([...step.materialIds, ...spec.parts.filter((part) => step.partIds.includes(part.id)).map((part) => part.materialId)]);
  const resources = [...spec.materials.filter((item) => materialIds.has(item.id)).map((item) => ({ ...item, Icon: Box })), ...spec.tools.filter((tool) => step.toolIds.includes(tool.id)).map((tool) => ({ ...tool, Icon: Hammer }))];
  if (!resources.length) return null;
  return <div className="step-resources" aria-label="For this step">{resources.map(({ id, name, specification, Icon }) => <button key={id} onClick={onOpen} title={specification}><Icon size={15} aria-hidden="true" /><span>{name}</span></button>)}</div>;
}

function savedExample(sample: Project): Project {
  const project = structuredClone(sample);
  try {
    const saved = localStorage.getItem(`workshop:example:${sample.id}`) ?? (sample.id === "example-planter" ? localStorage.getItem("workshop:example") : null);
    if (saved) {
      const previous = JSON.parse(saved);
      if (previous.id === sample.id) {
        project.progress = previous.progress ?? project.progress;
        project.units = previous.units === "metric" ? "metric" : "imperial";
        project.version = previous.version ?? project.version;
      }
    }
  } catch { /* A fresh example remains available if browser storage is unavailable. */ }
  return project;
}

function ExamplePicker({ examples, onSelect, onClose }: { examples: Project[]; onSelect: (id: string) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const close = () => { dialog.current?.close(); onClose(); };
  return <dialog ref={dialog} className="change-dialog example-picker" aria-label="Example projects" onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div className="modal-heading"><h2>Example projects</h2><Button variant="ghost" size="icon" aria-label="Close examples" onClick={close}><X size={18} /></Button></div>
    <div className="example-options">{examples.map((sample, index) => {
      const Icon = index === 0 ? Leaf : index === 1 ? Box : Scissors;
      return <button key={sample.id} onClick={() => { dialog.current?.close(); onSelect(sample.id); }}><Icon size={21} aria-hidden="true" /><span><strong>{sample.title}</strong><small>{sample.spec!.category} · {sample.spec!.minutes < 60 ? `${sample.spec!.minutes} min` : `${Number((sample.spec!.minutes / 60).toFixed(1))} hours`}</small></span></button>;
    })}</div>
  </dialog>;
}

function AlternativeDialog({ name, value, onChange, onClose, onSubmit, busy }: { name: string; value: string; onChange: (value: string) => void; onClose: () => void; onSubmit: () => void; busy: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const close = () => { dialog.current?.close(); onClose(); };
  return <dialog ref={dialog} className="change-dialog" aria-label={`Change ${name}`} onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <form onSubmit={(event) => { event.preventDefault(); if (value.trim() && !busy) onSubmit(); }}>
      <div className="modal-heading"><h2>Change {name}</h2><Button variant="ghost" size="icon" aria-label="Close change request" onClick={close} type="button"><X size={18} /></Button></div>
      <label htmlFor="alternative-reason">What would work better for you?</label>
      <textarea id="alternative-reason" autoFocus value={value} onChange={(event) => onChange(event.target.value)} placeholder="I don’t have this, or I’d like to use…" rows={3} />
      <Button type="submit" size="sm" disabled={!value.trim() || busy}>Update plan</Button>
    </form>
  </dialog>;
}

function IllustrationDialog({ url, alt, onClose }: { url: string; alt: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const close = () => { dialog.current?.close(); onClose(); };
  return <dialog ref={dialog} className="illustration-dialog" aria-label="Step illustration" onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === event.currentTarget) close(); }}><Button size="icon" variant="ghost" aria-label="Close illustration" onClick={close}><X size={20} /></Button><img src={url} alt={alt} /></dialog>;
}

function StepInstructions({ step }: { step: Step }) {
  const actions = step.instructions.split(/\n\s*\n/).filter(Boolean);
  return (
    <div className="step-instructions">
      {actions.map((action, i) => (
        <p key={i}>{(() => { const match = action.match(/^(.{8,90}?[.!?])(?:\s+)([\s\S]+)$/); return match ? <><strong>{match[1]}</strong> {match[2]}</> : action; })()}</p>
      ))}
    </div>
  );
}
function StepDiagram({
  step,
  project,
  onRetry,
  busy = false,
  hideMissing = false,
}: {
  step: Step;
  project: Project;
  onRetry?: () => void;
  busy?: boolean;
  hideMissing?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const imageButton = useRef<HTMLButtonElement>(null);
  const illustration = project.stepImages?.findLast(
    (image) =>
      image.stepId === step.id &&
      image.revisionId === project.currentRevisionId,
  );
  if (illustration?.url && illustration.state === "ready")
    return (
      <figure className="step-illustration">
        {onRetry ? <button ref={imageButton} className="step-image-open" aria-label={`Enlarge illustration for ${step.title}`} onClick={() => setExpanded(true)}><img src={illustration.url} alt={illustration.alt} loading="lazy" /><Expand size={15} aria-hidden="true" /></button> : <img src={illustration.url} alt={illustration.alt} loading="lazy" />}
        {expanded && <IllustrationDialog url={illustration.url} alt={illustration.alt} onClose={() => { setExpanded(false); imageButton.current?.focus(); }} />}
      </figure>
    );
  if (!onRetry || hideMissing) return null;
  return (
    <div className="step-image-unavailable">
      {busy ? (
        <>
          <Loader2 size={16} className="spin" />
          <span>{illustration?.state === "failed" ? "Illustration unavailable" : "Illustration on its way…"}</span>
        </>
      ) : (
        <button onClick={onRetry}>
          <ImageIcon size={16} />
          {illustration?.state === "failed"
            ? "Retry illustrations"
            : "Illustrate steps"}
        </button>
      )}
    </div>
  );
}
function ShoppingItem({
  item,
  state,
  onChange,
  onAlternative,
}: {
  item: Material;
  state?: string;
  onChange: (value: string) => void;
  onAlternative: () => void;
}) {
  const cost = materialCost(item),
    source = shoppingSource(item);
  return (
    <article className={`shopping-item ${state ? "is-owned" : ""}`}>
      <div className="shopping-item-main">
        <button
          className="shopping-check"
          aria-label={`${state ? "Clear status for" : "Mark owned"} ${item.name}`}
          onClick={() => onChange(state ? "needed" : "owned")}
        >
          {state ? <Check size={14} /> : null}
        </button>
        <div>
          <h4>{item.name}</h4>
          <p>{item.specification}</p>
          <span className="quantity">
            Need {item.quantity} {item.unit}
            {source
              ? source.price === null
                ? " · Confirm with supplier"
                : ` · Buy ${Math.ceil(item.quantity / source.packQuantity)} ${Math.ceil(item.quantity / source.packQuantity) === 1 ? "pack" : "packs"} of ${source.packQuantity}`
              : ""}
          </span>
        </div>
        <span className="item-price">{cost === null ? "Price unavailable" : `${money(cost)}${source?.price == null ? " est." : ""}`}</span>
      </div>
      <div className="shopping-item-actions">
        <Select
          label={`Status for ${item.name}`}
          value={state || "needed"}
          onValueChange={onChange}
          options={[
            { value: "needed", label: "Need to get" },
            { value: "owned", label: "Already have" },
            { value: "purchased", label: "Purchased" },
          ]}
        />
        {source ? (
          <a href={source.url} target="_blank" rel="noopener noreferrer">
            {new URL(source.url).hostname.replace("www.", "")}
            <ExternalLink size={12} />
          </a>
        ) : (
          <span className="no-source">Not sourced yet</span>
        )}
        <button onClick={onAlternative}>Alternatives</button>
      </div>
      {source && (
        <details className="source-evidence">
          <summary>Listing details</summary>
          <p>{source.title}</p>
          <p>{source.evidence}</p>
          <small>
            Retrieved {new Date(source.checkedAt).toLocaleDateString()};
            availability may change.
          </small>
        </details>
      )}
    </article>
  );
}
function PrintGuide({
  spec,
  units,
  project,
}: {
  spec: Spec;
  units: Project["units"];
  project: Project;
}) {
  return (
    <div className="print-guide">
      <h1>{spec.title}</h1>
      <p>{spec.summary}</p>
      <p>
        {spec.dimensionsMm.map((x) => formatLength(x, units)).join(" × ")} ·{" "}
        {spec.minutes} minutes hands-on
      </p>
      <h2>Before you begin</h2>
      {[...spec.prerequisites, ...spec.assumptions, ...spec.openQuestions].map(
        (x, i) => (
          <p key={i}>{x}</p>
        ),
      )}
      <h2>Shopping list</h2>
      {[
        ...spec.materials,
        ...spec.tools.map((t) => ({ ...t, quantity: 1, unit: "tool" })),
      ].map((m) => (
        <p key={m.id}>
          <strong>
            {m.quantity} {m.unit} — {m.name}
          </strong>
          <br />
          {m.specification}
          {shoppingSource(m) && (
            <>
              <br />
              {shoppingSource(m)?.url}
            </>
          )}
        </p>
      ))}
      <h2>Parts</h2>
      {spec.parts.map((p) => (
        <p key={p.id}>
          {p.quantity} × {p.name}:{" "}
          {p.dimensionsMm.map((x) => formatLength(x, units)).join(" × ")}
        </p>
      ))}
      {spec.steps.map((s, i) => (
        <section key={s.id}>
          <h2>
            {i + 1}. {s.title}
          </h2>
          <StepDiagram step={s} project={project} />
          <StepInstructions step={s} />
          <p>
            <strong>Check:</strong> {s.check}
          </p>
          {s.precautions.map((x, j) => (
            <p key={j}>{x}</p>
          ))}
        </section>
      ))}
      <footer>
        Workbench · {new Date().toLocaleDateString()} · Prices and availability
        may change.
      </footer>
    </div>
  );
}
