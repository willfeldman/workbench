import { test } from "node:test";
import assert from "node:assert/strict";
import { exampleSpec, exampleProject } from "../src/lib/example";
import {
  validateSpec,
  validateScene,
  safePublicUrl,
  materialCost,
  totals,
  changedCompletedSteps,
  publishRevision,
  canComplete,
  formatLength,
} from "../src/lib/project";
test("guide and scene have valid stable cross references", () => {
  assert.equal(validateSpec(exampleSpec()).steps.length, 5);
});
test("invalid mesh and untrusted source protocols are rejected", () => {
  const s = exampleSpec();
  s.scene!.nodes[0] = {
    ...s.scene!.nodes[0],
    shape: "mesh",
    vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    indices: [0, 1, 8],
  };
  assert.throws(() => validateScene(s.scene, s));
  assert.equal(safePublicUrl("https://127.0.0.1/admin"), false);
  assert.equal(safePublicUrl("https://[::1]/"), false);
  assert.equal(safePublicUrl("javascript:alert(1)"), false);
  assert.equal(safePublicUrl("https://example.com/product/1"), true);
});
test("quantities round to whole packs and unknown prices stay unknown", () => {
  const m = exampleSpec().materials[0];
  m.quantity = 7;
  m.sources = [
    {
      url: "https://example.com/boards",
      title: "Boards",
      checkedAt: "2026-09-08",
      price: 10,
      packQuantity: 3,
      evidence: "$10 per pack of three",
      availability: "listed",
    },
  ];
  assert.equal(materialCost(m), 30);
  m.sources = [];
  m.estimatedUnitPrice = null;
  assert.equal(materialCost(m), null);
});
test("owned materials do not inflate remaining cost", () => {
  const s = exampleSpec();
  assert.equal(totals(s, { screws: "owned" }).total, 20.98);
  assert.equal(totals(s, { cedar: "owned" }).unknown, 1);
  assert.equal(formatLength(25.4, "imperial"), "1″");
});
test("dimensions trigger review of affected completed work without erasing it", () => {
  const p = exampleProject();
  p.progress.completed.prepare = "2026-09-08";
  p.progress.materials.cedar = "purchased";
  const next = structuredClone(p.spec!);
  next.parts[0].dimensionsMm[0] = 600;
  const affected = changedCompletedSteps(p, next);
  assert.deepEqual(affected, ["prepare"]);
  publishRevision(p, {
    id: "r2",
    spec: next,
    summary: "Narrower",
    createdAt: "2026-09-08",
    reworkStepIds: affected,
  });
  assert.equal(p.progress.completed.prepare, "2026-09-08");
  assert.equal(p.progress.materials.cedar, "purchased");
  assert.deepEqual(p.progress.rework, ["prepare"]);
});
test("critical measurements, prerequisites and rework gate completion", () => {
  const p = exampleProject();
  assert.equal(canComplete(p, p.spec!.steps[1]), false);
  p.progress.completed.prepare = "now";
  assert.equal(canComplete(p, p.spec!.steps[1]), true);
  p.progress.rework = ["prepare"];
  assert.equal(canComplete(p, p.spec!.steps[1]), false);
  assert.equal(
    canComplete(p, { ...p.spec!.steps[0], requiresMeasurement: true }),
    false,
  );
});
test("forward/cyclic step dependencies and duplicate IDs fail validation", () => {
  const s = exampleSpec();
  s.steps[0].dependsOn = [s.steps[1].id];
  assert.throws(() => validateSpec(s));
  const s2 = exampleSpec();
  s2.parts[1].id = s2.parts[0].id;
  assert.throws(() => validateSpec(s2));
});
