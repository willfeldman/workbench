import { test, expect, type Page } from "@playwright/test";
import { newProject, type Project } from "../../src/lib/project";
import { exampleProject } from "../../src/lib/example";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
  "base64",
);

async function imageTransfer(page: Page, names = ["reference.png"]) {
  return page.evaluateHandle(
    ({ bytes, names }) => {
      const transfer = new DataTransfer();
      for (const name of names)
        transfer.items.add(new File([new Uint8Array(bytes)], name, { type: "image/png" }));
      return transfer;
    },
    { bytes: [...png], names },
  );
}

async function mockProjects(page: Page, initial?: Project) {
  let project = initial ?? newProject("image-drop-test-owner");
  let creates = 0;
  const uploads: { name: string; bytes: Buffer; stepId: FormDataEntryValue | null }[] = [];
  await page.route("**/api/projects**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/projects") {
      if (request.method() === "POST") {
        creates++;
        return route.fulfill({ json: { project } });
      }
      return route.fulfill({ json: { projects: initial ? [{
        id: project.id, title: project.title, updatedAt: project.updatedAt, complete: false,
      }] : [] } });
    }
    if (pathname === `/api/projects/${project.id}/photos` && request.method() === "POST") {
      const form = await new Response(new Uint8Array(request.postDataBuffer()!), {
        headers: { "content-type": request.headers()["content-type"] },
      }).formData();
      const file = form.get("file") as File;
      uploads.push({ name: file.name, bytes: Buffer.from(await file.arrayBuffer()), stepId: form.get("stepId") });
      const photoId = `dropped-photo-${uploads.length}`;
      project = { ...project, version: project.version + 1, photos: [...project.photos, {
        id: photoId, name: file.name, path: photoId, createdAt: project.createdAt,
        stepId: null, url: `data:image/png;base64,${png.toString("base64")}`,
      }] };
      return route.fulfill({ json: { project, photoId } });
    }
    if (pathname === `/api/projects/${project.id}` && request.method() === "GET")
      return route.fulfill({ json: { project } });
    return route.fulfill({ status: 500, json: { error: `Unexpected request: ${request.method()} ${pathname}` } });
  });
  if (initial)
    await page.addInitScript((id) => localStorage.setItem("workshop:last-project", id), initial.id);
  return { uploads, creates: () => creates };
}

test("dropping an image on a new project uploads it without opening the picker", async ({ page }, testInfo) => {
  const api = await mockProjects(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What would you like to make?" })).toBeVisible();
  const transfer = await imageTransfer(page);
  const conversation = page.locator(".conversation");
  await conversation.dispatchEvent("dragenter", { dataTransfer: transfer });
  await expect(page.locator(".composer")).toHaveClass(/is-dragging/);
  await expect(page.getByText("Drop images here", { exact: true })).toBeVisible();
  await page.screenshot({ path: `../../work/${testInfo.project.name}-image-drop-hover.png` });
  await conversation.dispatchEvent("dragover", { dataTransfer: transfer });
  await conversation.dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.locator(".attachments img")).toHaveAttribute("alt", "reference.png");
  await expect(page.locator(".composer")).not.toHaveClass(/is-dragging/);
  expect(api.creates()).toBe(1);
  expect(api.uploads).toHaveLength(1);
  expect(api.uploads[0]).toEqual({ name: "reference.png", bytes: png, stepId: null });
  await expect(page.getByLabel("Message Workbench")).toBeFocused();
  await page.getByRole("button", { name: "Remove attachment" }).click();
  await expect(page.locator(".attachments img")).toHaveCount(0);
  await transfer.dispose();
});

test("invalid dropped files are rejected before creating a project", async ({ page }) => {
  const api = await mockProjects(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What would you like to make?" })).toBeVisible();
  const transfer = await page.evaluateHandle(() => {
    const files = new DataTransfer();
    files.items.add(new File(["not an image"], "notes.txt", { type: "text/plain" }));
    return files;
  });
  await page.locator(".conversation").dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.getByRole("status")).toContainText("Choose JPG, PNG, or WebP images.");
  expect(api.creates()).toBe(0);
  expect(api.uploads).toHaveLength(0);
  await expect(page.locator(".attachments img")).toHaveCount(0);
  await transfer.dispose();
});

test("project conversation accepts multiple dropped images and honors the attachment limit", async ({ page }, testInfo) => {
  const api = await mockProjects(page, exampleProject("image-drop-test-owner"));
  await page.goto("/");
  await expect(page.getByRole("tabpanel", { name: "Preview" })).toBeVisible();
  if (testInfo.project.name === "mobile")
    await page.getByLabel("Conversation", { exact: true }).click();
  const excess = await imageTransfer(page, ["front.png", "side.png", "top.png", "detail.png", "extra.png"]);
  await page.locator(".conversation").dispatchEvent("drop", { dataTransfer: excess });
  await expect(page.getByRole("status")).toContainText("You can attach up to 4 images per message.");
  expect(api.uploads).toHaveLength(0);
  await excess.dispose();
  const transfer = await imageTransfer(page, ["front.png", "side.png", "top.png", "detail.png"]);
  await page.locator(".conversation").dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.locator(".attachments img")).toHaveCount(4);
  expect(api.creates()).toBe(0);
  expect(api.uploads.map((file) => file.name)).toEqual(["front.png", "side.png", "top.png", "detail.png"]);
  expect(api.uploads.every((file) => file.bytes.equals(png) && file.stepId === null)).toBe(true);
  const extra = await imageTransfer(page, ["extra.png"]);
  await page.locator(".conversation").dispatchEvent("drop", { dataTransfer: extra });
  await expect(page.getByRole("status")).toContainText(/4|four/i);
  expect(api.uploads).toHaveLength(4);
  await extra.dispose();
  await transfer.dispose();
});

test("demo image drops remain honest and never navigate away", async ({ page }) => {
  let apiRequests = 0;
  await page.route("**/api/projects**", async (route) => {
    apiRequests++;
    await route.fulfill({ status: 500, json: { error: "Demo must not upload" } });
  });
  await page.goto("/demo");
  const transfer = await imageTransfer(page);
  await page.locator(".conversation").dispatchEvent("dragenter", { dataTransfer: transfer });
  await expect(page.locator(".composer")).toHaveClass(/is-dragging/);
  await page.locator(".conversation").dispatchEvent("dragleave", { dataTransfer: transfer });
  await expect(page.locator(".composer")).not.toHaveClass(/is-dragging/);
  await page.locator(".conversation").dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.getByRole("status")).toContainText("available in your own projects");
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.locator(".attachments img")).toHaveCount(0);
  expect(apiRequests).toBe(0);
  await transfer.dispose();
});
