import { test } from "node:test";
import assert from "node:assert/strict";
import { copyExample, publicExampleArtwork } from "../src/lib/example-copies";
import { additionalExampleProjects } from "../src/lib/additional-examples";
import { validateSpec } from "../src/lib/project";

test("examples become independent owned projects with usable revision images", () => {
  for (const id of ["example-planter", ...additionalExampleProjects().map(p => p.id)]) {
    const a = copyExample("owner-a", id)!;
    const b = copyExample("owner-b", id)!;
    assert.match(a.id, /^[0-9a-f-]{36}$/);
    assert.notEqual(a.id, b.id);
    assert.equal(a.ownerId, "owner-a");
    assert.equal(b.ownerId, "owner-b");
    assert.equal(a.sourceExampleId, id);
    assert.deepEqual(a.jobs, []);
    assert.ok(validateSpec(a.spec));
    assert.equal(a.revisions[0].id, a.currentRevisionId);
    for (const image of a.stepImages ?? []) {
      assert.equal(image.revisionId, a.currentRevisionId);
      assert.equal(publicExampleArtwork(image.url), image.url);
    }
    a.progress.completed[a.spec!.steps[0].id] = "done";
    a.spec!.title = "My edited project";
    assert.deepEqual(b.progress.completed, {});
    assert.notEqual(b.spec!.title, a.spec!.title);
  }
  assert.equal(copyExample("owner", "not-an-example"), undefined);
});

test("only bundled public example artwork bypasses storage signing", () => {
  assert.equal(publicExampleArtwork("/guide/prepare.png"), "/guide/prepare.png");
  for (const url of [undefined, "https://untrusted.test/image.png", "/guide/../private.png", "/api/projects/another-owner/photos/private", "/guide/unknown.png"]) {
    assert.equal(publicExampleArtwork(url), undefined);
  }
});
