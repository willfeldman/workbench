import { test } from "node:test";
import assert from "node:assert/strict";
import { zodTextFormat } from "openai/helpers/zod";
import { exampleSpec } from "../src/lib/example";
import { SpecSchema, validateSpec, SceneNodeSchema } from "../src/lib/project";

test("generated guide schema rejects zero physical dimensions before publication", () => {
  for (const value of [0, -1, 100001]) {
    const spec = exampleSpec();
    spec.dimensionsMm[2] = value;
    assert.equal(SpecSchema.safeParse(spec).success, false);
    const part = exampleSpec();
    part.parts[0].dimensionsMm[2] = value;
    assert.equal(SpecSchema.safeParse(part).success, false);
  }
});

test("fractional paper thickness remains valid for flat crafts", () => {
  const spec = exampleSpec();
  spec.scene = null;
  spec.dimensionsMm = [50, 150, 0.2];
  spec.parts[0].dimensionsMm = [50, 150, 0.2];
  assert.equal(validateSpec(spec).dimensionsMm[2], 0.2);
});

test("image geometry size constraints preserve zero and negative positions", () => {
  const node = exampleSpec().scene!.nodes[0];
  node.position = [-10, 0, 0];
  node.rotation = [0, 0, 0];
  assert.equal(SceneNodeSchema.safeParse(node).success, true);
  node.size[0] = 0;
  assert.equal(SceneNodeSchema.safeParse(node).success, false);
});

test("OpenAI receives positive dimension constraints instead of unconstrained vectors", () => {
  const format = zodTextFormat(SpecSchema.omit({ scene: true, sceneError: true }), "guide");
  const schema = format.schema as { properties: { dimensionsMm: { items: { exclusiveMinimum: number; maximum: number } } } };
  assert.equal(schema.properties.dimensionsMm.items.exclusiveMinimum, 0);
  assert.equal(schema.properties.dimensionsMm.items.maximum, 100000);
});
