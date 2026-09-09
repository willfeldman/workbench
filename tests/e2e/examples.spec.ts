import { expect, test } from "@playwright/test";

test("additional examples have independent saved progress and complete guides", async ({ page }, info) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "More examples", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Example projects", exact: true });
  await expect(picker).toBeVisible();
  await expect(picker.locator(".example-options > button")).toHaveCount(3);
  await picker.getByRole("button", { name: /A little order for your desk/ }).click();
  await expect(page.getByRole("tabpanel", { name: "Preview", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Guide", exact: true }).click();
  const step = page.locator(".guide-step").first();
  await expect(step).toContainText("Cut the two blanks");
  await expect(step.locator(".step-image-unavailable")).toHaveCount(0);
  await expect(step.getByRole("button", { name: "Illustrate steps" })).toHaveCount(0);
  expect(await step.locator(".step-layout").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(1);
  await step.getByRole("button", { name: "Mark complete", exact: true }).click();
  if (info.project.name === "mobile") await page.getByRole("button", { name: "Open sidebar", exact: true }).click();
  await page.locator(".project-list").getByRole("button", { name: "A hand-stitched felt pouch", exact: true }).click();
  await page.getByRole("tab", { name: "Progress", exact: true }).click();
  await expect(page.getByText("0 of 5 completed", { exact: true })).toBeVisible();
  await page.reload();
  if (info.project.name === "mobile") await page.getByRole("button", { name: "Open sidebar", exact: true }).click();
  await page.locator(".project-list").getByRole("button", { name: "A little order for your desk", exact: true }).click();
  await page.getByRole("tab", { name: "Progress", exact: true }).click();
  await expect(page.getByText("1 of 5 completed", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: `../../work/${info.project.name}-additional-examples.png`, fullPage: true });
});
