import { test } from "node:test";
import assert from "node:assert/strict";
import { exampleProject } from "../src/lib/example";
import {
  assertIllustrationReview,
  IllustrationGenerationError,
  IllustrationReviewError,
  illustrationBudget,
  illustrateWithOneCorrection,
  ILLUSTRATION_TIMEOUTS,
  stepImagePrompt,
  stepVisualBrief,
  STEP_REVIEW_PROMPT,
  STEP_VISUAL_CONTRACT,
} from "../src/lib/server/image-generation";

test("the visual brief isolates an early action while retaining assembly constraints", () => {
  const spec = exampleProject().spec!;
  const step = spec.steps.find((s) => s.id === "bottom")!;
  const brief = stepVisualBrief(spec, step);
  assert.match(brief.focusInstruction, /Set the notched base inside/);
  assert.doesNotMatch(brief.focusInstruction, /Drill pilot holes/);
  assert.match(brief.contextOnly.fullInstructions, /Drill pilot holes/);
  assert.equal(brief.contextOnly.prerequisiteState[0].title, "Assemble the box");
  assert.ok(brief.referenceParts.some((p) => p.id === "base"));
  assert.ok(!brief.referenceParts.some((p) => p.id === "leg-fl"));
  assert.ok(!brief.tools.some((t) => t.id === "sand"));
  assert.ok(!brief.materials.some((m) => m.id === "finish"));
  const prompt = stepImagePrompt(brief);
  assert.ok(prompt.includes(STEP_VISUAL_CONTRACT));
  assert.ok(STEP_REVIEW_PROMPT.includes(STEP_VISUAL_CONTRACT));
  assert.match(STEP_REVIEW_PROMPT, /equivalent cutting direction\/order are not errors/);
  assert.match(STEP_VISUAL_CONTRACT, /Do not infer exact scale/);
});

test("leg illustrations retain the prerequisite walls that the legs attach to", () => {
  const spec = exampleProject().spec!;
  const brief = stepVisualBrief(spec, spec.steps.find((s) => s.id === "legs-step")!);
  assert.ok(brief.referenceParts.some((p) => p.id === "leg-fl"));
  assert.ok(brief.referenceParts.some((p) => p.id === "front"));
  assert.ok(brief.referenceParts.some((p) => p.id === "base"));
  assert.ok(brief.spatialEvidence?.find((part) => part.partId === "base")?.localVertices?.length, "The notched mesh is carried rather than replaced by a bounding box");
  assert.match(brief.composition, /interior-facing orthographic/);
  assert.match(brief.contextOnly.fullInstructions, /20 mm/);
  assert.equal(brief.tools.length, 0, "Insertion does not require clamps or drills used later");
  assert.ok(brief.contextOnly.preparedFeatures.some((f) => /36 × 36 mm notch/.test(f.feature)));
  assert.doesNotMatch(brief.focusInstruction, /Drill pilot holes/);
});

test("unknown steps never assume unrelated work has already been completed", () => {
  const spec = exampleProject().spec!;
  const brief = stepVisualBrief(spec, { ...spec.steps[0], id: "new-step", dependsOn: ["finish-step"] });
  assert.deepEqual(brief.contextOnly.prerequisiteState, []);
});

test("long paragraphs preserve decimal measurements when choosing the focused action", () => {
  const spec = exampleProject().spec!;
  const instructions = `Measure the board to 12.5 mm. Mark the edge. ${"Check the fit before cutting. ".repeat(30)}`;
  const brief = stepVisualBrief(spec, { ...spec.steps[0], instructions });
  assert.equal(brief.focusInstruction, "Measure the board to 12.5 mm. Mark the edge.");
});

test("physical errors remain rejected even if a review also claims the image matches", () => {
  for (const [category, visibleEvidence, correction] of [
    ["tool_use", "The ruler stops before the far edge.", "Place the zero at one end and span the full board."],
    ["connection", "The clamp grips only the bench, not the two boards.", "Put opposing clamp jaws on the actual boards."],
    ["tool_use", "The drill enters the wall where no receiving member is behind it.", "Align the drill with the member behind the wall."],
    ["connection", "The handle screw floats beside the mounting hole.", "Show the fastener through the handle into its supporting member."],
    ["safety", "A finger is in the path of the bit.", "Keep hands outside the drilling path."],
  ]) {
    assert.throws(() => assertIllustrationReview({
      matchesStep: true,
      description: "A person assembling a box.",
      issues: [{ category, visibleEvidence, correction }],
    }), (error: unknown) => {
      assert.ok(error instanceof IllustrationReviewError);
      assert.equal(error.stage, "review");
      assert.equal(error.code, "quality");
      assert.ok(error.message.includes(visibleEvidence));
      assert.ok(error.message.includes(correction));
      return true;
    });
  }
});

test("an absent, incomplete, or rejected review never publishes an image", () => {
  for (const value of [null, undefined, {}, { matchesStep: true, description: "", issues: [] }]) {
    assert.throws(() => assertIllustrationReview(value), IllustrationGenerationError);
  }
  assert.throws(() => assertIllustrationReview({ matchesStep: false, description: "A board.", issues: [] }), IllustrationReviewError);
  assert.equal(assertIllustrationReview({ matchesStep: true, description: "A close-up of a base aligned inside the box.", issues: [] }).matchesStep, true);
});

test("corrective attempts preserve the focused action and use the specific defect", () => {
  const spec = exampleProject().spec!;
  const brief = stepVisualBrief(spec, spec.steps[0]);
  const correction = "tool_use: The ruler stops short. Correction: Span the full board from the zero end.";
  const prompt = stepImagePrompt(brief, correction);
  assert.ok(prompt.includes(correction));
  assert.ok(prompt.includes(JSON.stringify(brief)));
  assert.ok(prompt.includes("this same action"));
});

test("discovery and image requests have short limits within one total deadline", () => {
  let now = 1000;
  const budget = illustrationBudget(() => now);
  assert.equal(budget("discovery"), 10_000);
  assert.equal(budget("generation"), 120_000);
  now += 150_000;
  assert.equal(budget("review"), 30_000);
  now += 29_000;
  assert.equal(budget("review"), 1000);
  now += 1000;
  assert.throws(() => budget("review"), (error: unknown) => {
    assert.ok(error instanceof IllustrationGenerationError);
    assert.equal(error.code, "timeout");
    assert.equal(error.stage, "review");
    return true;
  });
  assert.ok(ILLUSTRATION_TIMEOUTS.discovery < ILLUSTRATION_TIMEOUTS.generation);
});


test("focused tool selection does not carry drills into preparation or omit sanding", () => {
  const spec = exampleProject().spec!;
  const prepare = stepVisualBrief(spec, spec.steps[0]);
  assert.deepEqual(prepare.tools, []);
  const finish = stepVisualBrief(spec, spec.steps.find((s) => s.id === "finish-step")!);
  assert.ok(finish.tools.some((t) => t.id === "sand"));
});

test("one corrective edit receives the actual rejected image and is reviewed again", async () => {
  const original = { pixels: "rejected original" };
  const corrected = { pixels: "corrected original" };
  const calls: string[] = [];
  const result = await illustrateWithOneCorrection(
    async () => { calls.push("generate"); return original; },
    async (candidate) => {
      calls.push("review");
      if (candidate === original) throw new IllustrationReviewError("connection: remove the invented upper block");
      assert.equal(candidate, corrected);
      return { matchesStep: true, description: "One continuous leg.", issues: [] };
    },
    async (candidate, defects) => {
      calls.push("edit");
      assert.equal(candidate, original);
      assert.match(defects, /invented upper block/);
      return corrected;
    },
  );
  assert.deepEqual(calls, ["generate", "review", "edit", "review"]);
  assert.equal(result.attempts, 2);
  assert.equal(result.candidate, corrected);
});

test("a failed correction is terminal and never starts another fresh generation", async () => {
  let generations = 0, edits = 0;
  await assert.rejects(() => illustrateWithOneCorrection(
    async () => { generations++; return "pixels"; },
    async () => { throw new IllustrationReviewError("geometry: the notch is blocked"); },
    async () => { edits++; return "edited pixels"; },
  ), (error: unknown) => {
    assert.ok(error instanceof IllustrationReviewError);
    assert.equal(error.retryExhausted, true);
    return true;
  });
  assert.equal(generations, 1);
  assert.equal(edits, 1);
});

test("provider failures do not trigger a quality edit or extra model spend", async () => {
  let edits = 0;
  await assert.rejects(() => illustrateWithOneCorrection(
    async () => "pixels",
    async () => { throw new IllustrationGenerationError("review", "timeout", "Timed out"); },
    async () => { edits++; return "edited"; },
  ), IllustrationGenerationError);
  assert.equal(edits, 0);
});
