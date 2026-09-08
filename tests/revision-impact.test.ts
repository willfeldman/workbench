import { test } from "node:test";
import assert from "node:assert/strict";
import { exampleProject } from "../src/lib/example";
import { changedCompletedSteps, publishRevision } from "../src/lib/project";

function projectWithDependencyChain() {
  const project = exampleProject();
  const spec = project.spec!;
  const first = { ...spec.steps[0], id: "prepare", dependsOn: [] };
  first.materialIds = [];
  first.partIds = [spec.parts[0].id];
  first.toolIds = [spec.tools[0].id];
  spec.steps = [
    first,
    { ...first, id: "assemble", partIds: [], toolIds: [], dependsOn: ["prepare"] },
    { ...first, id: "finish", partIds: [], toolIds: [], dependsOn: ["assemble"] },
    { ...first, id: "independent", partIds: [], toolIds: [], dependsOn: [] },
  ];
  project.progress.completed = Object.fromEntries(spec.steps.map((step) => [step.id, "2026-09-08T12:00:00Z"]));
  return project;
}

test("material changes reached through parts flag completed dependent work", () => {
  const project = projectWithDependencyChain();
  const next = structuredClone(project.spec!);
  const material = next.materials.find((m) => m.id === next.parts[0].materialId)!;
  material.specification += " Use a different stock thickness.";
  assert.deepEqual(changedCompletedSteps(project, next), ["prepare", "assemble", "finish"]);
});

test("changed tool specifications flag the work using them", () => {
  const project = projectWithDependencyChain();
  const next = structuredClone(project.spec!);
  next.tools[0].specification += " A hand tool replaces the powered tool.";
  assert.deepEqual(changedCompletedSteps(project, next), ["prepare", "assemble", "finish"]);
});

test("retailer, price and lookup changes do not request rework", () => {
  const project = projectWithDependencyChain();
  const next = structuredClone(project.spec!);
  for (const item of [...next.materials, ...next.tools]) {
    item.estimatedUnitPrice = 123;
    item.sources = [{ url: "https://example.com/new-listing", title: "New listing", price: 123, packQuantity: 10, checkedAt: "2026-09-09", evidence: "Updated listing", availability: "listed" }];
  }
  assert.deepEqual(changedCompletedSteps(project, next), []);
});

test("changes to incomplete prerequisites still flag completed dependents", () => {
  const project = projectWithDependencyChain();
  delete project.progress.completed.prepare;
  const next = structuredClone(project.spec!);
  next.steps[0].instructions += " Measure again before assembly.";
  assert.deepEqual(changedCompletedSteps(project, next), ["assemble", "finish"]);
});

test("removed references and prerequisite steps cannot leave completed work unchecked", () => {
  const project = projectWithDependencyChain();
  const removedPart = structuredClone(project.spec!);
  removedPart.parts.shift();
  assert.deepEqual(changedCompletedSteps(project, removedPart), ["prepare", "assemble", "finish"]);
  const removedStep = structuredClone(project.spec!);
  removedStep.steps.shift();
  removedStep.steps[0].dependsOn = [];
  assert.deepEqual(changedCompletedSteps(project, removedStep), ["prepare", "assemble", "finish"]);
});

test("publishing an affected revision preserves completion timestamps and purchased items", () => {
  const project = projectWithDependencyChain();
  const completed = structuredClone(project.progress.completed);
  project.progress.materials.cedar = "purchased";
  const next = structuredClone(project.spec!);
  next.parts[0].dimensionsMm[0] += 20;
  publishRevision(project, {
    id: "updated-build",
    spec: next,
    summary: "Changed width",
    createdAt: "2026-09-09T12:00:00Z",
    reworkStepIds: changedCompletedSteps(project, next),
  });
  assert.deepEqual(project.progress.completed, completed);
  assert.equal(project.progress.materials.cedar, "purchased");
  assert.deepEqual(project.progress.rework, ["prepare", "assemble", "finish"]);
});
