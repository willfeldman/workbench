import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { newProject } from "../src/lib/project";
import {
  createProject,
  getProject,
  mutateProject,
} from "../src/lib/server/repository";
process.env.WORKSHOP_LOCAL_MODE = "true";
test("concurrent updates preserve progress and enforce owner isolation", async () => {
  const p = newProject("test-owner");
  try {
    await createProject(p);
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        mutateProject("test-owner", p.id, (d) => {
          d.progress.completed["step-" + i] = "done";
        }),
      ),
    );
    const result = await getProject("test-owner", p.id);
    assert.equal(Object.keys(result.progress.completed).length, 12);
    assert.equal(result.version, 12);
    await assert.rejects(getProject("another-owner", p.id));
  } finally {
    await fs.unlink(`.local/${p.id}.json`).catch(() => {});
  }
});
