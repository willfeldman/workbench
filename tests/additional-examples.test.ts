import test from "node:test";
import assert from "node:assert/strict";
import { additionalExampleProjects, deskOrganizerSpec, feltPouchSpec } from "../src/lib/additional-examples";
import { canComplete, validateSpec } from "../src/lib/project";

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
    assert.deepEqual(project.stepImages, []);
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
