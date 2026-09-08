import { canComplete, type Material, type Project, type Step } from "./project";

/** Use the same listing for package counts, price, and the outgoing link. */
export function shoppingSource(item: Pick<Material, "sources">) {
  return item.sources.find((source) => source.price !== null) ?? item.sources[0];
}

export function stepStatus(project: Project, step: Step) {
  const completed = Boolean(project.progress.completed[step.id]);
  const review = project.progress.rework.includes(step.id);
  const blocked = !canComplete(project, step);
  const dependencies = step.dependsOn.filter((id) => !project.progress.completed[id] || project.progress.rework.includes(id));
  const reason = project.spec?.professionalReview
    ? "Qualified review is needed before continuing."
    : step.requiresMeasurement
      ? "Confirm this step’s measurements in chat before continuing."
      : dependencies.length
        ? `First complete or review ${dependencies.map((id) => project.spec?.steps.find((s) => s.id === id)?.title ?? "the earlier step").join(", ")}.`
        : undefined;
  return { completed, review, blocked, reason, label: review ? (completed ? "Completed · Needs review" : "Needs review") : completed ? "Completed" : blocked ? "Not ready yet" : "Ready" };
}

/** Keep hazard-specific notes inline; routine quality checks belong in instructions. */
export function essentialPrecautions(step: Step) {
  return step.precautions.filter((note) => /safe|danger|hazard|injur|protect|goggle|glove|mask|respirat|ventilat|dust|fume|toxic|flammab|fire|burn|heat|hot|electric|power|unplug|disconnect|voltage|battery|short.circuit|lead|asbestos|load|weight|structur|support|clamp|secure|blade|sharp|cutting|drill|screw|split|penetrat|children|pets|food|pressure|licensed|professional|do not|don't|never|avoid|keep.*away/i.test(note));
}
