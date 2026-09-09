import { expect, test } from "@playwright/test";
import { exampleProject } from "../../src/lib/example";

test("a running guide can switch to fast mode and keeps the control honest on failure", async ({ page }, info) => {
  const project = exampleProject("fast-mode-test");
  project.id = "fast-mode-test";
  project.spec = null;
  project.revisions = [];
  project.currentRevisionId = null;
  project.stepImages = [];
  project.jobs = [{ id: "standard-job", requestId: "request", mode: "message", state: "running", stage: "Planning the build", startedAt: new Date().toISOString(), finishedAt: null, error: null, activities: [], baseRevisionId: null, usage: { input: 0, output: 0 } }];
  let calls = 0;
  await page.route("**/api/projects**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/projects") return route.fulfill({ json: { projects: [{ id: project.id, title: project.title, updatedAt: project.updatedAt, complete: false }] } });
    if (path.endsWith("/actions")) {
      expect(request.postDataJSON()).toEqual({ action: "fast", id: project.jobs[0].id });
      calls++;
      if (calls === 1) return route.fulfill({ status: 503, json: { error: "Could not switch. Please try again." } });
      await new Promise((resolve) => setTimeout(resolve, 250));
      project.jobs[0].speed = "fast";
      project.jobs[0].id = "fast-job";
      project.jobs[0].stage = "Writing your guide";
      project.jobs[0].state = "running";
      project.version++;
    }
    return route.fulfill({ json: { project } });
  });
  await page.addInitScript((id) => localStorage.setItem("workshop:last-project", id), project.id);
  await page.goto("/");
  const button = page.getByRole("button", { name: "Use fast mode", exact: true });
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByText("Could not switch. Please try again.")).toBeVisible();
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByRole("button", { name: "Switching…", exact: true })).toBeDisabled();
  await expect(page.locator(".fast-mode-status")).toHaveText("Fast mode");
  await expect(button).toHaveCount(0);
  expect(calls).toBe(2);
  project.jobs[0].state = "failed";
  project.jobs[0].error = "Fast generation was interrupted.";
  project.version++;
  await page.reload();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".fast-mode-status")).toHaveText("Fast mode");
  expect(calls).toBe(3);
  project.jobs[0].state = "complete";
  project.jobs.push({ ...project.jobs[0], id: "enrichment", mode: "enrichment", state: "running", stage: "Finding materials" });
  project.spec = { ...exampleProject().spec!, scene: null };
  project.currentRevisionId = "fast-revision";
  project.version++;
  await expect(page.getByRole("tabpanel", { name: "Guide", exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".diagram-progress")).toContainText("Finding materials");
  if (info.project.name === "mobile") await page.getByLabel("Conversation", { exact: true }).click();
  await expect(page.getByLabel("Message Workbench", { exact: true })).toBeEnabled();
});
