import { newProject, validateSpec, type Project, type SceneNode, type Spec, type Step } from "./project";

const node = (id: string, partId: string, position: number[], size: number[], color: string): SceneNode => ({
  id, partId, position, size, color, shape: "box", rotation: [0, 0, 0],
  roughness: 0.95, metalness: 0, points: [], vertices: [], indices: [],
});
const listing = (url: string, title: string, packQuantity: number, evidence: string) => ({
  url, title, packQuantity, evidence, price: null,
  checkedAt: "2026-09-09T00:00:00.000Z", availability: "unknown" as const,
});
const tool = (id: string, name: string, specification: string) => ({
  id, name, specification, estimatedUnitPrice: null, sources: [],
});
const step = (input: Omit<Step, "diagram" | "requiresMeasurement" | "precautions"> & { precautions?: string[] }): Step => ({
  ...input, precautions: input.precautions ?? [], requiresMeasurement: false,
  diagram: { kind: "process", labels: [] },
});

export function deskOrganizerSpec(): Spec {
  return validateSpec({
    title: "A little order for your desk",
    summary: "Fold a two-compartment cardstock tray for paper clips, sticky notes, and other lightweight desk essentials.",
    category: "Paper craft", difficulty: "Beginner", minutes: 30,
    dimensionsMm: [181, 31, 101], budget: null,
    constraints: ["Hand tools only", "Lightweight, dry desk items"],
    assumptions: [
      "Use the millimeter dimensions on a ruler for the folding pattern; rounded inch conversions are for reference.",
      "One US Letter or A4 sheet fits both cut pieces. Cardstock thickness varies; the preview uses 0.5 mm.",
      "Materials may already be at home. No retailer prices have been verified for this example.",
    ],
    openQuestions: [], prerequisites: ["Clear a flat table and protect it with scrap paper."], professionalReview: false,
    materials: [
      { id: "card", name: "Heavy cardstock", specification: "One US Letter or A4 sheet, approximately 250–300 gsm; cut a 240 × 160 mm tray blank and a 130 × 30 mm divider", quantity: 1, unit: "sheet", estimatedUnitPrice: null, sources: [listing("https://www.michaels.com/product/cardstock-85-x-11-paper-pack---110-lb-card-stock-for-crafts-cardmaking-scrapbooks---50-heavyweight-double-sided-sheets---solid-core-300-gsm-kraft-428482986460184576", "Michaels — 300 gsm letter cardstock, 50 sheets", 50, "Retailer listing specifies 8.5 × 11 inch, 300 gsm kraft cardstock and 50 sheets. One sheet is needed. Price and local availability are unverified. The preview uses kraft-colored card.")] },
      { id: "tape", name: "Double-sided craft tape", specification: "6–10 mm wide; about 400 mm total for four corner tabs and two divider tabs", quantity: 1, unit: "roll", estimatedUnitPrice: null, sources: [] },
    ],
    tools: [tool("scissors", "Scissors", "Comfortable scissors suitable for cardstock"), tool("ruler", "Ruler", "At least 240 mm long, with millimeter markings"), tool("pencil", "Pencil", "Light marks on the inside face"), tool("score", "Empty ballpoint pen", "A clean pen that no longer writes, for gently scoring folds")],
    parts: [
      { id: "tray", name: "Tray blank", materialId: "card", dimensionsMm: [240, 160, 0.5], quantity: 1 },
      { id: "divider", name: "Divider blank", materialId: "card", dimensionsMm: [130, 30, 0.5], quantity: 1 },
    ],
    steps: [
      step({ id: "cut", title: "Cut the two blanks", minutes: 5, partIds: ["tray", "divider"], materialIds: ["card"], toolIds: ["ruler", "pencil", "scissors"], dependsOn: [], instructions: "Lay the sheet landscape, with its longer edge left to right. Lightly draw a 240 × 160 mm rectangle for the tray.\n\nIn the strip left above or below it, draw a 130 × 30 mm rectangle for the divider. Check both rectangles fit before cutting.\n\nCut around the two rectangles with scissors. Keep the offcuts for testing your scoring tool.", expectedResult: "One large tray blank and one narrow divider blank.", check: "Do both blanks match the marked dimensions?" }),
      step({ id: "score-folds", title: "Mark and score the folds", minutes: 6, partIds: ["tray", "divider"], materialIds: ["card"], toolIds: ["ruler", "pencil", "score"], dependsOn: ["cut"], instructions: "Place the tray blank with the 240 mm edge horizontal. On its inside face, draw a line 30 mm in from each of the four edges. The rectangle in the middle should measure 180 × 100 mm.\n\nHold the ruler on each line and run the empty ballpoint pen gently along it. Test first on scrap: make a crease, not a cut.\n\nOn the divider, mark and score a line 15 mm in from each short end. This leaves a 100 mm center section with two 15 mm tabs.", expectedResult: "A tray pattern with four 30 mm walls and a divider with two end tabs.", check: "Is the central tray rectangle 180 × 100 mm, with four uncut scored lines?" }),
      step({ id: "fold-tray", title: "Fold and tape the tray", minutes: 9, partIds: ["tray"], materialIds: ["card", "tape"], toolIds: ["scissors"], dependsOn: ["score-folds"], instructions: "Keep the long edge horizontal. At each long edge, cut inward along the two vertical score lines. Stop at the first horizontal score line, exactly 30 mm from that edge. Make four short cuts in total. Do not cut out the corner squares; these are your tabs.\n\nFold all four walls upward along their score lines. Fold each corner tab inward so it lies against the inside of the neighboring long wall.\n\nApply two short strips of double-sided tape to the outside face of each tab, remove the backing, and press the tab against the long wall. Align the top edges before pressing firmly. Repeat at all four corners.", expectedResult: "A shallow rectangular tray with four neatly taped inside corners.", check: "Do the walls stay upright and the corners hold when lightly pressed?" }),
      step({ id: "fit-divider", title: "Add the divider", minutes: 6, partIds: ["tray", "divider"], materialIds: ["card", "tape"], toolIds: ["ruler", "scissors"], dependsOn: ["fold-tray"], instructions: "Fold the divider’s two 15 mm tabs in opposite directions to make a Z shape when viewed from above.\n\nStand the divider across the 100 mm depth of the tray, halfway along its 180 mm length. The bottom edge should rest on the tray floor, with each tab flat against an inside long wall.\n\nTest the fit before taping. If the divider bows, trim a sliver from one end and re-score that tab so the divider fits without pushing the walls outward.\n\nTape the outside face of both end tabs to the long walls. Press firmly to make two approximately equal compartments.", expectedResult: "Two open compartments separated by a straight, upright divider.", check: "Does the divider reach the floor without bowing the walls?" }),
      step({ id: "fill", title: "Give small things a home", minutes: 4, partIds: ["tray", "divider"], materialIds: [], toolIds: [], dependsOn: ["fit-divider"], instructions: "Press each taped joint once more. Place the tray flat on your desk.\n\nAdd a few lightweight items, such as paper clips in one side and sticky notes in the other. Keep it dry and lift it from underneath.\n\nIf a corner starts to open, empty the tray and replace the tape before using it again.", expectedResult: "A simple desk tray ready for lightweight supplies.", check: "Does the tray stay flat and hold its shape with your chosen items?" }),
    ],
    scene: {
      nodes: [
        node("tray-floor", "tray", [0, 0.25, 0], [180, 0.5, 100], "#b69368"),
        node("tray-front", "tray", [0, 15.5, 50.25], [181, 30, 0.5], "#b69368"),
        node("tray-back", "tray", [0, 15.5, -50.25], [181, 30, 0.5], "#b69368"),
        node("tray-left", "tray", [-90.25, 15.5, 0], [0.5, 30, 100], "#b69368"),
        node("tray-right", "tray", [90.25, 15.5, 0], [0.5, 30, 100], "#b69368"),
        node("divider-center", "divider", [0, 15.5, 0], [0.5, 30, 100], "#a78459"),
        node("divider-tab-front", "divider", [7.5, 15.5, 49.5], [15, 30, 0.5], "#a78459"),
        node("divider-tab-back", "divider", [-7.5, 15.5, -49.5], [15, 30, 0.5], "#a78459"),
      ], camera: [230, 210, 240], target: [0, 12, 0], notes: "Folded cardstock preview; tape and corner tabs are simplified.",
    }, sceneError: null,
  });
}

export function feltPouchSpec(): Spec {
  const nodes = [node("pouch-front", "front", [0, 60, 0.5], [180, 120, 1], "#3c5268"), node("pouch-back", "back", [0, 60, -0.5], [180, 120, 1], "#3c5268")];
  for (let y = 7; y < 116; y += 10) {
    for (const x of [-85, 85]) nodes.push(node(`side-${x < 0 ? "left" : "right"}-${y}`, "seam", [x, y, 0], [1.2, 5, 2.4], "#eee1c9"));
  }
  for (let x = -80; x <= 80; x += 10) nodes.push(node(`bottom-${x + 80}`, "seam", [x, 5, 0], [5, 1.2, 2.4], "#eee1c9"));
  return validateSpec({
    title: "A hand-stitched felt pouch",
    summary: "Make a soft, open-top pouch for a charging cable, glasses case, or other small essentials, using a simple running stitch.",
    category: "Sewing", difficulty: "Beginner", minutes: 45, dimensionsMm: [180, 120, 2.4], budget: null,
    constraints: ["Hand sewing", "Open top; no fastener", "Small, lightweight items"],
    assumptions: ["Finished outer size is approximately 180 × 120 mm when flat; usable space is about 170 × 115 mm before allowing for an item's thickness.", "Felt does not normally fray, so the edges can remain unfinished.", "No retailer prices have been verified for this example."],
    openQuestions: [], prerequisites: ["Check that your intended item fits within a 170 × 115 mm paper rectangle, allowing extra room for its thickness."], professionalReview: false,
    materials: [
      { id: "felt", name: "Craft felt", specification: "One sheet at least 240 × 180 mm, about 1 mm thick; cut two 180 × 120 mm rectangles", quantity: 1, unit: "sheet", estimatedUnitPrice: null, sources: [listing("https://www.benziedesign.com/products/midnight-wool-blend-felt", "Benzie Design — Midnight wool-blend felt, choose 9 × 12 in", 1, "Maker lists 9 × 12 inch sheets of approximately 1 mm wool-blend felt. Select the 9 × 12 felt sheet, rather than the thread option. One sheet fits both panels. Price and availability are unverified.")] },
      { id: "thread", name: "Embroidery floss", specification: "Six-strand cotton floss; about 2 m available. Use three strands together for sewing.", quantity: 1, unit: "skein", estimatedUnitPrice: null, sources: [] },
    ],
    tools: [tool("scissors", "Fabric scissors", "Scissors that cut felt cleanly"), tool("ruler", "Ruler", "Millimeter markings"), tool("marker", "Fabric marker or chalk", "Removable marks; test on an offcut first"), tool("needle", "Hand-sewing needle", "A sharp embroidery needle with an eye large enough for three strands of floss"), tool("clips", "Sewing clips", "Four small clips to keep the edges aligned")],
    parts: [
      { id: "front", name: "Front panel", materialId: "felt", dimensionsMm: [180, 120, 1], quantity: 1 },
      { id: "back", name: "Back panel", materialId: "felt", dimensionsMm: [180, 120, 1], quantity: 1 },
      { id: "seam", name: "Three-sided stitched seam", materialId: "thread", dimensionsMm: [170, 110, 0.8], quantity: 1 },
    ],
    steps: [
      step({ id: "cut-panels", title: "Cut two matching panels", minutes: 8, partIds: ["front", "back"], materialIds: ["felt"], toolIds: ["ruler", "marker", "scissors"], dependsOn: [], instructions: "Mark two 180 × 120 mm rectangles on the felt. Put the 120 mm edges next to each other to fit both on a 240 × 180 mm sheet.\n\nCut carefully around both rectangles. Stack them with their edges aligned and trim any small mismatch.\n\nChoose which faces will show on the outside. Keep these facing out; the pouch is sewn with the seam visible and is not turned inside out.", expectedResult: "Two matching felt rectangles with clean edges.", check: "Do the panel edges line up when stacked?" }),
      step({ id: "mark-seam", title: "Mark a three-sided seam", minutes: 6, partIds: ["front", "back", "seam"], materialIds: ["felt"], toolIds: ["ruler", "marker", "clips"], dependsOn: ["cut-panels"], instructions: "Set the stacked panels landscape, with the 180 mm edge across the top. Leave that entire top edge open.\n\nLightly mark a seam line 5 mm inside the left, bottom, and right edges of the front panel. Start and finish 5 mm below the top edge.\n\nAdd small dots about 5 mm apart along the three lines to help space your running stitches. Clip the layers together at their edges.", expectedResult: "A U-shaped stitch path, with the top edge left open.", check: "Are the layers aligned and the top free of any seam line?" }),
      step({ id: "thread-needle", title: "Thread the needle", minutes: 5, partIds: ["seam"], materialIds: ["thread"], toolIds: ["needle", "scissors"], dependsOn: ["mark-seam"], instructions: "Cut a 60 cm length of embroidery floss. Separate it into two groups of three strands; save one group for later.\n\nPass one group of three strands through the needle eye. Leave a short tail on one side and tie a small knot at the long end. Sew with the long end only, rather than doubling the thread.\n\nAt the upper left seam mark, pass the needle from between the two felt layers out through the front panel. This hides the starting knot inside the pouch.", expectedResult: "A threaded needle anchored at the start of the seam.", check: "Does the knot hold with a gentle tug?", precautions: ["Keep track of the needle and put it in a pincushion whenever you pause."] }),
      step({ id: "sew", title: "Sew around the three edges", minutes: 21, partIds: ["front", "back", "seam"], materialIds: ["felt", "thread"], toolIds: ["needle", "clips", "scissors"], dependsOn: ["thread-needle"], instructions: "At the next dot, push the needle from front to back through both felt layers. At the following dot, bring it back to the front through both layers. Continue this in-and-out running stitch down the left side.\n\nPull the thread just snug after each stitch. The felt should stay flat without puckering. Remove clips as you reach them.\n\nTurn the corner at the marked intersection, sew along the bottom, then turn and sew up the right side. Leave the top open.\n\nWhen about 10 cm of thread remains, tie it off: slip the needle under the previous stitch, pass it through the loop you have made, and tighten gently. Repeat once. Pass the tail between the layers for about 10 mm and trim it.\n\nThread another three-strand length and restart at the last completed stitch, hiding the new knot between the layers. Overlap one stitch so there is no gap. At the upper right end, tie off and hide the tail in the same way.", expectedResult: "An even U-shaped seam joining both layers, with secured thread ends.", check: "Do all three stitched edges hold together without gaps or puckering?" }),
      step({ id: "check-fit", title: "Check the fit", minutes: 5, partIds: ["front", "back", "seam"], materialIds: [], toolIds: ["marker"], dependsOn: ["sew"], instructions: "Check both faces for skipped stitches, loose loops, or a needle left in the work. Gently pull the panels apart along the seam to check it holds.\n\nRemove any visible marking according to the marker instructions. Do not soak the felt unless its care instructions allow it.\n\nSlide a small lightweight item into the top. If it strains the seam, use a smaller item rather than stretching the pouch. The open top is intended for storage inside a bag or drawer.", expectedResult: "A soft pouch with a secure seam and a freely opening top.", check: "Can your item slide in and out without straining the stitches?" }),
    ],
    scene: { nodes, camera: [240, 175, 260], target: [0, 60, 0], notes: "Flat felt pouch with a visible running stitch; the flexible opening and thread are simplified." }, sceneError: null,
  });
}

/** Fresh records keep local progress and owner data isolated between examples. */
export function additionalExampleProjects(owner = "preview"): Project[] {
  return [
    { id: "example-desk-organizer", spec: deskOrganizerSpec(), prompt: "I'd like to make a small organizer for my desk using cardstock.", reply: "A folded cardstock tray is a quick place to start. This one has two compartments and uses a single sheet, scissors, and craft tape." },
    { id: "example-felt-pouch", spec: feltPouchSpec(), prompt: "Help me hand-sew a simple felt pouch. I'm new to sewing.", reply: "Let's make an open-top felt pouch with a simple running stitch. You'll practice the same stitch around three edges, with no zipper or sewing machine needed." },
  ].map(({ id, spec, prompt, reply }) => {
    const project = newProject(owner);
    const revisionId = `${id}-v1`;
    return { ...project, id, title: spec.title, spec, currentRevisionId: revisionId, stepImages: [],
      revisions: [{ id: revisionId, spec, summary: "Initial example", createdAt: project.createdAt, reworkStepIds: [] }],
      messages: [
        { id: `${id}-user`, role: "user" as const, text: prompt, photoIds: [], createdAt: project.createdAt },
        { id: `${id}-assistant`, role: "assistant" as const, text: reply, photoIds: [], createdAt: project.createdAt },
      ],
    };
  });
}
