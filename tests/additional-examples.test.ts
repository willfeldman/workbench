import test from "node:test";
import assert from "node:assert/strict";
import { additionalExampleProjects, deskOrganizerSpec, feltPouchSpec } from "../src/lib/additional-examples";
import { canComplete, validateSpec, type StepImage } from "../src/lib/project";
import { existsSync } from "node:fs";

test("both additional examples have valid specs and connected scene parts", () => {
  for (const spec of [deskOrganizerSpec(), feltPouchSpec()]) {
    assert.deepEqual(validateSpec(spec), spec);
    assert.equal(spec.minutes, spec.steps.reduce((sum, step) => sum + step.minutes, 0));
    assert.ok(spec.scene?.nodes.length);
    assert.equal(spec.professionalReview, false);
    assert.ok(spec.steps.every(step => step.instructions.includes("\n\n")));
    const shownParts = new Set(spec.scene!.nodes.map(node => node.partId));
    assert.ok(spec.parts.every(part => shownParts.has(part.id)));
  }
});

test("example records are distinct, owner-specific, and do not borrow planter illustrations", () => {
  const first = additionalExampleProjects("alice");
  const second = additionalExampleProjects("bob");
  assert.equal(new Set(first.map(project => project.id)).size, 2);
  for (let i = 0; i < first.length; i++) {
    const project = first[i];
    assert.equal(project.ownerId, "alice");
    assert.equal(second[i].ownerId, "bob");
    assert.equal(project.revisions[0].id, project.currentRevisionId);
    assert.deepEqual(project.revisions[0].spec, project.spec);
    assert.equal(project.stepImages?.length, project.spec!.steps.length);
    for (const step of project.spec!.steps) {
      const image: StepImage | undefined = project.stepImages!.find(entry => entry.stepId === step.id);
      assert.ok(image);
      assert.equal(image.state, "ready");
      assert.equal(image.revisionId, project.currentRevisionId);
      assert.ok(image.url?.startsWith(i === 0 ? "/guide/desk-" : "/guide/felt-"));
      assert.ok(existsSync(`public${image.url}`));
    }
    project.progress.materials[project.spec!.materials[0].id] = "owned";
    assert.deepEqual(second[i].progress.materials, {});
  }
});

test("examples have a completable dependency path and no made-up listing prices", () => {
  for (const project of additionalExampleProjects()) {
    for (const item of [...project.spec!.materials, ...project.spec!.tools]) {
      assert.equal(item.estimatedUnitPrice, null);
      assert.ok(item.sources.every(source => source.price === null && source.availability === "unknown"));
    }
    for (const step of project.spec!.steps) {
      assert.equal(canComplete(project, step), true);
      project.progress.completed[step.id] = new Date().toISOString();
    }
  }
});
