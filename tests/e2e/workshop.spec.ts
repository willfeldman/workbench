import { test, expect } from "@playwright/test";
test("example workspace, guide, materials, progress and persistence", async ({
  page,
}, testInfo) => {
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "What would you like to make?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Explore an example", exact: true })
    .click();
  await expect(page.getByRole("tabpanel", { name: "Preview" })).toBeVisible();
  await expect(page.locator("canvas")).toHaveAttribute("data-rendered", "true");
  await page.getByRole("tab", { name: "Guide", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "The build", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mark complete", exact: true })
    .click();
  await page.getByRole("tab", { name: "Materials", exact: true }).click();
  await page.getByLabel("Status for Cedar boards", { exact: true }).click();
  await page.getByRole("option", { name: "Already have", exact: true }).click();
  await expect(
    page.getByLabel("Status for Cedar boards", { exact: true }),
  ).toHaveText("Already have");
  await page.getByRole("tab", { name: "Progress", exact: true }).click();
  await expect(page.getByText("1 of 5", { exact: true })).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Explore an example", exact: true })
    .click();
  await page.getByRole("tab", { name: "Progress", exact: true }).click();
  await expect(page.getByText("1 of 5", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-rendered", "true");
  await page.screenshot({
    path: `../../work/${testInfo.project.name}-preview.png`,
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});
test("a question keeps its draft and example mode does not pretend to run AI", async ({
  page,
}, testInfo) => {
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "Explore an example", exact: true })
    .click();
  if (testInfo.project.name === "mobile")
    await page.getByLabel("Conversation", { exact: true }).click();
  await page.getByLabel("Message Workbench").fill("Make it wider");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("example project");
  await expect(page.getByLabel("Message Workbench")).toHaveValue(
    "Make it wider",
  );
});

test("divider resizing persists and reduced motion keeps the guide usable", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "The mobile workspace uses one pane at a time.",
  );
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "Explore an example", exact: true })
    .click();
  const pane = page.getByRole("region", { name: "Project conversation" });
  const divider = page.getByRole("separator", { name: "Resize conversation" });
  const initial = (await pane.boundingBox())!.width;
  const bounds = (await divider.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 100);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 104, bounds.y + 100, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await pane.boundingBox())!.width)
    .toBeGreaterThan(initial + 80);
  const dragged = (await pane.boundingBox())!.width;
  await divider.press("ArrowLeft");
  await expect
    .poll(async () => (await pane.boundingBox())!.width)
    .toBeLessThan(dragged - 10);
  const saved = (await pane.boundingBox())!.width;
  await page.reload();
  await page
    .getByRole("button", { name: "Explore an example", exact: true })
    .click();
  await expect
    .poll(async () => Math.abs((await pane.boundingBox())!.width - saved))
    .toBeLessThan(2);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("tab", { name: "Guide", exact: true }).click();
  const step = page.getByRole("button", { name: /1 Prepare the pieces/ });
  await step.click();
  await expect(step).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("button", { name: "Mark complete", exact: true }),
  ).toHaveCount(0);
  await step.click();
  await expect(
    page.getByRole("button", { name: "Mark complete", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("tabpanel")).toHaveCSS("animation-name", "none");
  await divider.press("Enter");
  await expect
    .poll(async () => Math.abs((await pane.boundingBox())!.width - initial))
    .toBeLessThan(2);
});
