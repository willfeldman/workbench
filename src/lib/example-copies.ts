import { exampleProject } from "./example";
import { additionalExampleProjects } from "./additional-examples";
import { newProject, type Project } from "./project";

// Only bundled public artwork may bypass private storage URL signing.
const publicArtwork = new Set([
  ...["prepare", "box", "bottom", "legs", "finish"].map(name => `/guide/${name}.png`),
  ...["desk-cut", "desk-score-folds", "desk-fold-tray", "desk-fit-divider", "desk-fill",
    "felt-cut-panels", "felt-mark-seam", "felt-thread-needle", "felt-sew", "felt-check-fit"].map(name => `/guide/${name}.webp`),
]);
export function publicExampleArtwork(url?: string) {
  return url && publicArtwork.has(url) ? url : undefined;
}

export function copyExample(ownerId: string, exampleId: string): Project | undefined {
  const sample = [exampleProject(), ...additionalExampleProjects()].find(p => p.id === exampleId);
  if (!sample) return undefined;
  const fresh = newProject(ownerId);
  const revisionId = crypto.randomUUID();
  return {
    ...sample,
    ...fresh,
    sourceExampleId: exampleId,
    title: sample.title,
    spec: sample.spec,
    currentRevisionId: revisionId,
    revisions: sample.revisions.map(revision => ({ ...revision, id: revisionId, createdAt: fresh.createdAt })),
    messages: sample.messages.map(message => ({ ...message, id: crypto.randomUUID(), createdAt: fresh.createdAt })),
    stepImages: sample.stepImages?.map(image => ({ ...image, id: crypto.randomUUID(), revisionId, createdAt: fresh.createdAt })),
  };
}
