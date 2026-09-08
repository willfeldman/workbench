import { test, expect, type Page } from "@playwright/test";
import { exampleProject } from "../../src/lib/example";
import { canComplete, type Project } from "../../src/lib/project";

type Action = { action: string; id?: string; value?: string | boolean };
type Message = { text: string; mode: string; photoIds: string[]; requestId: string };

// Exercise the real client, with every project request intercepted. No model,
// storage, or authenticated production account is used by these tests.
async function projectApi(page: Page, initial = exampleProject("refinements-test")) {
  let project = structuredClone(initial);
  let reads = 0;
  const actions: Action[] = [];
  const messages: Message[] = [];
  const unexpected: string[] = [];
  await page.route("**/api/projects**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/projects" && request.method() === "GET")
      return route.fulfill({ json: { projects: [{
        id: project.id, title: project.title, updatedAt: project.updatedAt, complete: false,
      }] } });
    if (pathname === `/api/projects/${project.id}` && request.method() === "GET") {
      reads++;
      return route.fulfill({ json: { project } });
    }
    if (pathname === `/api/projects/${project.id}/actions` && request.method() === "POST") {
      const body = request.postDataJSON() as Action;
      actions.push(body);
      if (body.action === "step") {
        const step = project.spec!.steps.find((step) => step.id === body.id)!;
        if (body.value && !canComplete(project, step))
          return route.fulfill({ status: 400, json: { error: "Finish preceding steps first." } });
        if (body.value) {
          project.progress.completed[step.id] = new Date().toISOString();
          project.progress.rework = project.progress.rework.filter((id) => id !== step.id);
        } else delete project.progress.completed[step.id];
      } else if (body.action === "units") project.units = body.value as Project["units"];
      else {
        unexpected.push(`action ${body.action}`);
        return route.fulfill({ status: 500, json: { error: "Unexpected test action" } });
      }
      project.version++;
      return route.fulfill({ json: { project } });
    }
    if (pathname === `/api/projects/${project.id}/messages` && request.method() === "POST") {
      const body = request.postDataJSON() as Message;
      messages.push(body);
      project.messages.push({
        id: body.requestId, role: "user", text: body.text,
        photoIds: body.photoIds, createdAt: new Date().toISOString(),
      });
      project.version++;
      return route.fulfill({ json: { project } });
    }
    unexpected.push(`${request.method()} ${pathname}`);
    return route.fulfill({ status: 500, json: { error: "Unexpected test request" } });
  });
  await page.addInitScript((id) => localStorage.setItem("workshop:last-project", id), project.id);
  return {
    actions, messages, unexpected,
    reads: () => reads,
    current: () => structuredClone(project),
    update: (change: (value: Project) => void) => { change(project); project.version++; },
  };
}

async function openProject(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("tabpanel", { name: "Preview" })).toBeVisible();
}

test("preview measurements are opt-in and can be hidden again", async ({ page }) => {
  const api = await projectApi(page);
  await openProject(page);
  await expect(page.locator("canvas")).toHaveAttribute("data-rendered", "true");
  const ruler = page.getByRole("button", { name: "Show dimensions", exact: true });
  await expect(ruler).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".dimension-label")).toHaveCount(0);
  await expect(page.getByLabel("Project measurements", { exact: true })).toHaveCount(0);
  await expect(page.locator(".workspace-body")).not.toContainText("28.35");
  await ruler.click();
  await expect(page.locator(".dimension-label").first()).toBeVisible();
  await expect(page.getByLabel("Project measurements", { exact: true })).toBeVisible();
  await expect(ruler).toHaveAttribute("aria-pressed", "true");
  await ruler.click();
  await expect(page.locator(".dimension-label")).toHaveCount(0);
  expect(api.unexpected).toEqual([]);
});

test("guide presents compact expandable illustrations and step-specific supplies", async ({ page }, testInfo) => {
  const project = exampleProject("refinements-test");
  const api = await projectApi(page, project);
  await openProject(page);
  await page.getByRole("tab", { name: "Guide", exact: true }).click();
  const first = project.spec!.steps[0];
  const step = page.locator(".guide-step").first();
  const resources = step.getByLabel("For this step", { exact: true });
  for (const id of first.materialIds) {
    const material = project.spec!.materials.find((item) => item.id === id)!;
    await expect(resources.getByRole("button", { name: material.name, exact: true })).toBeVisible();
  }
  for (const id of first.toolIds) {
    const tool = project.spec!.tools.find((item) => item.id === id)!;
    await expect(resources.getByRole("button", { name: tool.name, exact: true })).toBeVisible();
  }
  await expect(step.locator(".expected")).toHaveCount(0);
  await expect(step.getByText("Things to keep in mind", { exact: true })).toHaveCount(0);
  const openImage = page.getByRole("button", { name: `Enlarge illustration for ${first.title}`, exact: true });
  if (testInfo.project.name === "desktop") {
    const imageBox = (await openImage.boundingBox())!;
    const instructionBox = (await step.locator(".step-detail").boundingBox())!;
    expect(imageBox.x + imageBox.width).toBeLessThanOrEqual(instructionBox.x);
    expect(imageBox.width).toBeLessThan(instructionBox.width);
  }
  await openImage.click();
  const dialog = page.getByRole("dialog", { name: "Step illustration", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("img")).toHaveAttribute("src", project.stepImages![0].url!);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(openImage).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(api.unexpected).toEqual([]);
});

test("completed work needing review has the same status in Guide and Progress", async ({ page }) => {
  const project = exampleProject("refinements-test");
  const first = project.spec!.steps[0];
  project.progress.completed[first.id] = "2026-09-08T12:00:00.000Z";
  project.progress.rework = [first.id];
  const api = await projectApi(page, project);
  await openProject(page);
  await page.getByRole("tab", { name: "Guide", exact: true }).click();
  const guideStep = page.locator(".guide-step").first();
  await expect(guideStep).toContainText("Completed · Needs review");
  await expect(guideStep.getByRole("button", { name: "Confirm reviewed", exact: true })).toBeEnabled();
  await page.getByRole("tab", { name: "Progress", exact: true }).click();
  await expect(page.locator(".progress-step").first()).toContainText("Completed · Needs review");
  await expect(page.locator(".next-step-card")).toContainText(first.title);
  await expect(page.locator(".next-step-card")).toContainText("Review your work");
  await page.getByRole("button", { name: "Continue building", exact: true }).click();
  await expect(page.getByRole("tabpanel", { name: "Guide", exact: true })).toBeVisible();
  await guideStep.getByRole("button", { name: "Confirm reviewed", exact: true }).click();
  await expect(guideStep.getByRole("button", { name: "Done", exact: true })).toBeVisible();
  expect(api.actions).toEqual([{ action: "step", id: first.id, value: true }]);
  expect(api.current().progress.completed[first.id]).toBeTruthy();
  expect(api.current().progress.rework).toEqual([]);
  await page.getByRole("tab", { name: "Progress", exact: true }).click();
  await expect(page.locator(".progress-step").first()).toContainText("Completed");
  await expect(page.locator(".progress-step").first()).not.toContainText("Needs review");
  await expect(page.locator(".next-step-card")).toContainText(project.spec!.steps[1].title);
  await page.reload();
  await page.getByRole("tab", { name: "Guide", exact: true }).click();
  await expect(guideStep).toContainText("Completed");
  await expect(guideStep).not.toContainText("Needs review");
  expect(api.unexpected).toEqual([]);
});

test("materials alternatives submit the user's constraint as a project change", async ({ page }) => {
  const api = await projectApi(page);
  await openProject(page);
  await page.getByRole("tab", { name: "Materials", exact: true }).click();
  await expect(page.getByRole("button", { name: "Find materials", exact: true })).toHaveCount(0);
  const item = page.locator(".shopping-item").filter({ has: page.getByRole("heading", { name: "Cedar boards", exact: true }) });
  await item.getByRole("button", { name: "Alternatives", exact: true }).click();
  const reason = page.getByLabel("What would work better for you?", { exact: true });
  await expect(reason).toBeVisible();
  await expect(page.getByRole("button", { name: "Update plan", exact: true })).toBeDisabled();
  await reason.fill("I already have pine boards and only a hand saw.");
  await page.getByRole("button", { name: "Update plan", exact: true }).click();
  await expect.poll(() => api.messages.length).toBe(1);
  expect(api.messages[0].text).toContain("Cedar boards");
  expect(api.messages[0].text).toContain("I already have pine boards and only a hand saw.");
  expect(api.messages[0].text).toMatch(/instructions.*quantities.*sourcing.*preview/);
  expect(api.messages[0].text).toContain("Preserve completed work");
  expect(api.messages[0].mode).toBe("message");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(api.unexpected).toEqual([]);
});

test("material price, package count, and retailer link use the same priced listing", async ({ page }) => {
  const project = exampleProject("refinements-test");
  const material = project.spec!.materials[0];
  material.quantity = 38;
  material.unit = "pieces";
  material.estimatedUnitPrice = 99;
  material.sources = [
    { url: "https://example.com/quote", title: "Quote only", checkedAt: project.createdAt, price: null, packQuantity: 1, evidence: "Requires a quote", availability: "unknown" },
    { url: "https://example.com/box-of-132", title: "132-piece box", checkedAt: project.createdAt, price: 28.58, packQuantity: 132, evidence: "Box contains 132", availability: "listed" },
  ];
  const api = await projectApi(page, project);
  await openProject(page);
  await page.getByRole("tab", { name: "Materials", exact: true }).click();
  const item = page.locator(".shopping-item").filter({ has: page.getByRole("heading", { name: material.name, exact: true }) });
  await expect(item).toContainText("Need 38 pieces · Buy 1 pack of 132");
  await expect(item.locator(".item-price")).toHaveText("$28.58");
  await expect(item.getByRole("link")).toHaveAttribute("href", "https://example.com/box-of-132");
  expect(api.unexpected).toEqual([]);
});

test("published guide stays usable and receives illustrations while a background job runs", async ({ page }, testInfo) => {
  const project = exampleProject("refinements-test");
  const firstImage = structuredClone(project.stepImages![0]);
  project.stepImages = [];
  project.jobs = [{
    id: "background-diagrams", requestId: "background-diagrams", mode: "diagrams",
    state: "running", stage: "Illustrating steps · 0 of 5 finished",
    baseRevisionId: project.currentRevisionId,
    startedAt: new Date().toISOString(), heartbeatAt: new Date().toISOString(),
    finishedAt: null, error: null, activities: [], usage: { input: 0, output: 0 },
  }];
  const api = await projectApi(page, project);
  await openProject(page);
  await page.getByRole("tab", { name: "Guide", exact: true }).click();
  await expect(page.getByRole("heading", { name: "The build", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark complete", exact: true })).toBeEnabled();
  await expect(page.locator(".step-instructions").first()).toContainText("Lay out");
  api.update((value) => {
    value.stepImages = [firstImage];
    value.jobs[0].stage = "Illustrating steps · 1 of 5 finished";
  });
  await expect(page.getByRole("img", { name: firstImage.alt })).toBeVisible({ timeout: 8000 });
  expect(api.reads()).toBeGreaterThan(1);
  if (testInfo.project.name === "mobile")
    await page.getByLabel("Conversation", { exact: true }).click();
  const composer = page.getByLabel("Message Workbench");
  await expect(composer).toBeEnabled();
  await composer.fill("Can I use the clamps I already own?");
  const send = page.getByRole("button", { name: "Send message", exact: true });
  await expect(send).toBeEnabled();
  await send.click();
  await expect.poll(() => api.messages.length).toBe(1);
  expect(api.messages[0]).toMatchObject({ mode: "message", text: "Can I use the clamps I already own?" });
  expect(api.current().jobs[0].state).toBe("running");
  expect(api.unexpected).toEqual([]);
});
