import { test } from "node:test";
import assert from "node:assert/strict";
import { exampleProject } from "../src/lib/example";
import { publishRevision } from "../src/lib/project";
import { chooseImageModel } from "../src/lib/server/image-generation";

test("image model selection uses the newest supported model actually listed", () => {
  assert.equal(
    chooseImageModel(["gpt-image-1.5", "gpt-image-2"]),
    "gpt-image-2",
  );
  assert.equal(
    chooseImageModel(["gpt-image-2", "gpt-image-2.5-flare"]),
    "gpt-image-2.5-flare",
  );
  assert.equal(
    chooseImageModel(["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"]),
    "gpt-image-2.5-sunburst",
  );
  assert.equal(chooseImageModel(["gpt-image-1.5"]), undefined);
});
test("revisions reuse unchanged illustrations and withhold pictures of changed parts", () => {
  const p = exampleProject(),
    spec = structuredClone(p.spec!);
  spec.parts[0].dimensionsMm[0] = 600;
  publishRevision(p, {
    id: "changed-width",
    spec,
    summary: "Change width",
    createdAt: new Date().toISOString(),
    reworkStepIds: [],
  });
  assert.equal(
    p.stepImages?.some(
      (image) =>
        image.revisionId === "changed-width" && image.stepId === "prepare",
    ),
    false,
  );
  assert.equal(
    p.stepImages?.some(
      (image) =>
        image.revisionId === "changed-width" && image.stepId === "legs-step",
    ),
    false,
  );
  assert.equal(
    p.stepImages?.filter((image) => image.revisionId === "example-v1").length,
    5,
  );
  const unchanged = exampleProject();
  publishRevision(unchanged, {
    id: "refresh",
    spec: structuredClone(unchanged.spec!),
    summary: "Refresh preview",
    createdAt: new Date().toISOString(),
    reworkStepIds: [],
  });
  assert.equal(
    unchanged.stepImages?.filter((image) => image.revisionId === "refresh")
      .length,
    5,
  );
});

test("material appearance changes invalidate earlier illustrations", () => {
  const project=exampleProject();
  const next=structuredClone(project.spec!);
  next.scene!.nodes[0].color="#102030";
  publishRevision(project,{id:"new-finish",spec:next,summary:"Change finish",createdAt:new Date().toISOString(),reworkStepIds:[]});
  assert.equal(project.stepImages?.some(image=>image.revisionId==="new-finish"),false);
});
