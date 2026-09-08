import { test } from "node:test";
import assert from "node:assert/strict";
import { exampleProject } from "../src/lib/example";
import {
  assertIllustrationReview,
  IllustrationGenerationError,
  IllustrationReviewError,
  illustrationBudget,
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
});

test("leg illustrations retain the prerequisite walls that the legs attach to", () => {
  const spec = exampleProject().spec!;
  const brief = stepVisualBrief(spec, spec.steps.find((s) => s.id === "legs-step")!);
  assert.ok(brief.referenceParts.some((p) => p.id === "leg-fl"));
  assert.ok(brief.referenceParts.some((p) => p.id === "front"));
  assert.ok(brief.referenceParts.some((p) => p.id === "base"));
  assert.match(brief.contextOnly.fullInstructions, /20 mm/);
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
