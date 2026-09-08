import {
  newProject,
  validateSpec,
  type Project,
  type Spec,
  type SceneNode,
} from "./project";
const board = (
  id: string,
  position: [number, number, number],
  size: [number, number, number],
  color = "#ba9265",
): SceneNode => ({
  id,
  partId: id,
  shape: "box",
  position,
  rotation: [0, 0, 0],
  size,
  color,
  roughness: 0.78,
  metalness: 0,
  points: [],
  vertices: [],
  indices: [],
});
const source = (
  url: string,
  title: string,
  price: number | null,
  packQuantity: number,
  evidence: string,
) => ({
  url,
  title,
  price,
  packQuantity,
  evidence,
  checkedAt: "2026-09-08T22:00:00.000Z",
  availability: "unknown" as const,
});
export function exampleSpec(): Spec {
  const nodes = [
    board("front", [0, 355, 159], [720, 230, 18]),
    board("back", [0, 355, -159], [720, 230, 18]),
    board("left", [-351, 355, 0], [18, 230, 300]),
    board("right", [351, 355, 0], [18, 230, 300]),
    board("base", [0, 231, 0], [684, 18, 300], "#ad8458"),
    board("leg-fl", [-324, 225, 132], [36, 450, 36], "#a77b50"),
    board("leg-fr", [324, 225, 132], [36, 450, 36], "#a77b50"),
    board("leg-bl", [-324, 225, -132], [36, 450, 36], "#a77b50"),
    board("leg-br", [324, 225, -132], [36, 450, 36], "#a77b50"),
  ];
  const base = nodes.find((n) => n.id === "base")!;
  base.shape = "mesh";
  const outline = [
    [-306, -150],
    [306, -150],
    [306, -114],
    [342, -114],
    [342, 114],
    [306, 114],
    [306, 150],
    [-306, 150],
    [-306, 114],
    [-342, 114],
    [-342, -114],
    [-306, -114],
  ];
  for (const y of [-9, 9]) {
    base.vertices.push(0, y, 0);
    for (const [x, z] of outline) base.vertices.push(x, y, z);
  }
  for (let i = 0; i < 12; i++) {
    const a = i + 1,
      b = ((i + 1) % 12) + 1;
    base.indices.push(
      0,
      a,
      b,
      13,
      b + 13,
      a + 13,
      a,
      a + 13,
      b,
      b,
      a + 13,
      b + 13,
    );
  }
  return validateSpec({
    title: "A home for your plants",
    summary:
      "A freestanding cedar planter for a sheltered balcony. A simple box, raised on four legs, with room for a few favorite plants in removable pots.",
    category: "Woodworking",
    difficulty: "Beginner",
    minutes: 180,
    dimensionsMm: [720, 470, 336],
    budget: 90,
    constraints: [
      "Sheltered balcony",
      "Basic hand tools",
      "Removable plant pots; no direct soil fill",
    ],
    assumptions: [
      "Dimensions are an example: 720 × 336 × 470 mm.",
      "Use actual measured board thickness, not nominal lumber dimensions.",
      "Wood needs a custom milling quote; the displayed subtotal excludes wood, shipping, tax and tools. Confirm the full cost against your budget before ordering.",
      "Place on a flat surface away from railings and children; this is not a seat.",
    ],
    openQuestions: [],
    prerequisites: [
      "Ask the timber supplier to cut the boards to size AND cut the four 36 × 36 mm corner notches in the base if you do not have a suitable saw.",
      "Work on a stable bench with clamps; wear eye protection when drilling.",
    ],
    professionalReview: false,
    materials: [
      {
        id: "cedar",
        name: "Cedar boards",
        specification:
          "18 mm thick; four wall panels and one base with four 36 × 36 mm corner notches, cut to the part dimensions",
        quantity: 1,
        unit: "cut set",
        estimatedUnitPrice: null,
        sources: [
          source(
            "https://www.globalwoodsource.com/cedar-western-red/",
            "Western red cedar — custom cut quote required",
            null,
            1,
            "Supplier lists Western red cedar lumber. Request a quote for all five panels, finished to 18 mm, including the four open base corner notches. Custom milling is offered at https://www.globalwoodsource.com/millwork-service/; confirm widths, milling, delivery and total cost before ordering. This is not a ready-cut kit.",
          ),
        ],
      },
      {
        id: "legs",
        name: "Cedar square stock",
        specification: "36 × 36 mm; four pieces, each 450 mm long",
        quantity: 4,
        unit: "pieces",
        estimatedUnitPrice: null,
        sources: [
          source(
            "https://www.globalwoodsource.com/millwork-service/",
            "Custom-milled cedar legs — quote required",
            null,
            4,
            "Ask the same supplier to quote four finished 36 × 36 × 450 mm Western red cedar legs. Millwork is advertised, but this exact cut set and its price require confirmation. Combine the wood order to avoid duplicate setup charges.",
          ),
        ],
      },
      {
        id: "screws",
        name: "Exterior wood screws",
        specification:
          "#8 × 1-5/8 in (about 41 mm) stainless wood screws; 38 required. Check pilot size and actual thickness before drilling.",
        quantity: 38,
        unit: "screws",
        estimatedUnitPrice: null,
        sources: [
          source(
            "https://www.homedepot.com/p/319949277",
            "DECKMATE #8 × 1-5/8 in stainless deck screws, 132-piece box",
            28.58,
            132,
            "Retailer lists model 867100, grade 316 stainless steel Torx flat-head wood screws, 132 pieces per box, at $28.58. One box covers 38 screws. Confirm the matching Torx driver bit.",
          ),
        ],
      },
      {
        id: "finish",
        name: "Exterior wood finish",
        specification:
          "Suitable for cedar; follow the manufacturer’s application and curing instructions",
        quantity: 1,
        unit: "quart",
        estimatedUnitPrice: null,
        sources: [
          source(
            "https://www.homedepot.com/p/301060424",
            "BEHR PREMIUM clear exterior wood finish, 1 quart",
            20.98,
            1,
            "Retailer lists clear transparent waterproofing exterior wood finish 50004, 1 quart, at $20.98. Follow its wood preparation, application and curing directions; it is not a soil liner.",
          ),
        ],
      },
    ],
    tools: [
      {
        id: "drill",
        name: "Drill / driver",
        specification:
          "Pilot bit matched to screws; countersink and driver bits",
        estimatedUnitPrice: null,
        sources: [],
      },
      {
        id: "clamps",
        name: "Clamps",
        specification: "Hold the box square during assembly",
        estimatedUnitPrice: null,
        sources: [],
      },
      {
        id: "measure",
        name: "Tape measure & square",
        specification: "Check actual stock dimensions and squareness",
        estimatedUnitPrice: null,
        sources: [],
      },
      {
        id: "sand",
        name: "Sanding block",
        specification: "120 and 180 grit abrasive",
        estimatedUnitPrice: 5,
        sources: [],
      },
    ],
    parts: nodes.map((n) => ({
      id: n.id,
      name: n.id.startsWith("leg")
        ? "Leg"
        : n.id[0].toUpperCase() + n.id.slice(1) + " panel",
      materialId: n.id.startsWith("leg") ? "legs" : "cedar",
      dimensionsMm: n.size,
      quantity: 1,
    })),
    steps: [
      {
        id: "prepare",
        title: "Prepare the pieces",
        instructions:
          "Lay out the nine precut pieces: two long walls, two short ends, one base, and four legs. Keep the matching pieces together.\n\nCheck the pieces against the parts list. The walls and base should be 18 mm thick; the legs should be 36 × 36 mm. If your wood differs, ask to adjust the plan before drilling.\n\nCheck that the base has a 36 × 36 mm notch cut out of each corner. These open corners leave room for the legs. Ask the supplier to cut them if they are missing.\n\nPut the pieces together without screws to check the fit—this is a dry fit. The short ends go between the long walls. The base fits inside the walls, and a leg fits into each notched corner.\n\nSand rough spots with a sanding block, moving along the wood grain. Lightly round any sharp edges. The pieces should feel smooth and fit without being forced.",
        expectedResult: "Nine smooth pieces that fit together without forcing.",
        minutes: 35,
        partIds: nodes.map((n) => n.id),
        materialIds: ["cedar", "legs"],
        toolIds: ["measure", "sand"],
        dependsOn: [],
        precautions: [
          "Clamp pieces before sanding or drilling. Wear eye protection and control dust.",
        ],
        check: "Are the lengths, thicknesses, and dry fit correct?",
        diagram: {
          kind: "measure",
          labels: ["Check lengths", "Check thickness", "Dry-fit"],
        },
        requiresMeasurement: false,
      },
      {
        id: "box",
        title: "Assemble the box",
        instructions:
          "Stand the two long walls on their lower edges. Put a short end between them at each side to make an open-bottomed rectangle.\n\nClamp the corners so the top edges line up. Check each corner with a carpenter’s square, or measure from corner to corner in both directions; equal diagonals mean the box is square.\n\nMark three screw positions down each end of the long walls. Center each mark on the 18 mm thickness of the short end behind it, and keep clear of the top and bottom edges.\n\nDrill a small pilot hole at each mark so the screw will not split the wood. Use a countersink bit to make a shallow recess for the screw head.\n\nDrive a 41 mm stainless exterior screw into each pilot hole. Stop when its head is flush with the wood. Remove the clamps and check that the corners stay tight and square.",
        expectedResult: "A square, open-bottomed box with flush corners.",
        minutes: 45,
        partIds: ["front", "back", "left", "right"],
        materialIds: ["cedar", "screws"],
        toolIds: ["clamps", "drill", "measure"],
        dependsOn: ["prepare"],
        precautions: ["Keep hands clear of the bit; stop if wood splits."],
        check: "Are both diagonals equal and all corners secure?",
        diagram: {
          kind: "assembly",
          labels: ["Clamp", "Pilot holes", "Fasten"],
        },
        requiresMeasurement: false,
      },
      {
        id: "bottom",
        title: "Fit the base",
        instructions:
          "Keep the wall box upright on the bench. Set the notched base inside it, with its underside level with the lower edges of the walls.\n\nUse scrap blocks to hold the base at this height, then clamp it. Leave the four corner notches open for the legs.\n\nMark three screw positions along each long wall and two along each short wall. Each mark must line up with the middle of the base’s thickness, away from the corner notches.\n\nDrill pilot holes and shallow countersinks through the walls into the base edges. Drive in 41 mm stainless exterior screws, stopping when their heads are flush.\n\nRemove the blocks and check that the base does not shift under gentle hand pressure. Check inside for sharp screw tips. This example is for lightweight removable pots, not a box filled with soil.",
        expectedResult:
          "The base sits flush and does not shift under gentle hand pressure.",
        minutes: 25,
        partIds: ["base", "front", "back", "left", "right"],
        materialIds: ["cedar", "screws"],
        toolIds: ["clamps", "drill"],
        dependsOn: ["box"],
        precautions: [
          "Do not rely on end-grain screws for heavy loads. No load rating has been established.",
        ],
        check: "Is the base supported securely with no protruding screws?",
        diagram: {
          kind: "assembly",
          labels: ["Support base", "Clamp flush", "Fasten"],
        },
        requiresMeasurement: false,
      },
      {
        id: "legs-step",
        title: "Attach the legs",
        instructions:
          "Slide one leg through each corner notch from below. Each leg sits inside the corner, touching both adjacent walls.\n\nMeasure from the top rim down to each leg’s top: leave a 20 mm gap. The feet should project 222 mm below the base’s underside. Clamp each leg at that position.\n\nHold a square against each leg and the box to check that the leg is straight. Adjust the clamp before drilling if it leans.\n\nMark two screw holes through each adjoining wall into the leg. Put the holes on one wall at different heights from those on the other wall so the screws cannot collide.\n\nDrill pilot holes and countersinks, then fix each leg with 41 mm stainless exterior screws. Keep every screw centered in the leg and check that no tip comes through.\n\nStand the empty planter on a level floor. All four feet should touch without rocking. Resolve any wobble before adding pots.",
        expectedResult:
          "Four square legs and a freestanding planter that sits level.",
        minutes: 40,
        partIds: ["leg-fl", "leg-fr", "leg-bl", "leg-br"],
        materialIds: ["legs", "screws"],
        toolIds: ["measure", "drill", "clamps"],
        dependsOn: ["bottom"],
        precautions: [
          "Keep the planter empty during assembly and stability checks.",
        ],
        check: "Do all four feet touch the floor without rocking?",
        diagram: {
          kind: "assembly",
          labels: ["Clamp square", "Offset screws", "Check level"],
        },
        requiresMeasurement: false,
      },
      {
        id: "finish-step",
        title: "Finish and make it yours",
        instructions:
          "Sand away any remaining rough spots and wipe off the dust. Put a drop cloth under the empty planter.\n\nApply a thin coat of cedar-compatible exterior finish along the wood grain. Use the applicator, ventilation, and number of coats specified on the tin.\n\nLeave the planter empty until the finish has fully cured. Dry to the touch is not always fully cured; check the label for the waiting time.\n\nAdd a few lightweight plant pots with saucers. Space them evenly across the base and check that the planter remains stable.\n\nWipe up standing water and check the joints periodically. Do not fill the box with loose soil, sit on it, or stand on it.",
        expectedResult:
          "A finished planter ready for lightweight potted plants.",
        minutes: 35,
        partIds: nodes.map((n) => n.id),
        materialIds: ["finish"],
        toolIds: ["sand"],
        dependsOn: ["legs-step"],
        precautions: [
          "Curing time is additional to the hands-on estimate. Follow finish-label guidance for applicator disposal.",
          "Never sit or stand on the planter; periodically inspect fasteners and joints.",
        ],
        check:
          "Is the finish cured and the planter stable with the intended pots?",
        diagram: {
          kind: "process",
          labels: ["Sand", "Finish", "Cure", "Add pots"],
        },
        requiresMeasurement: false,
      },
    ],
    scene: {
      nodes,
      camera: [1100, 900, 1100],
      target: [0, 235, 0],
      notes:
        "Concept preview. Confirm the supplied stock and joints before building.",
    },
    sceneError: null,
  });
}
export function exampleProject(owner = "preview"): Project {
  const p = newProject(owner),
    spec = exampleSpec();
  p.id = "example-planter";
  p.title = spec.title;
  p.spec = spec;
  p.currentRevisionId = "example-v1";
  p.revisions = [
    {
      id: "example-v1",
      spec,
      summary: "Initial example",
      createdAt: p.createdAt,
      reworkStepIds: [],
    },
  ];
  p.stepImages = spec.steps.map((step, i) => ({
    id: "example-image-" + step.id,
    stepId: step.id,
    revisionId: "example-v1",
    state: "ready",
    path: null,
    url: "/guide/" + ["prepare", "box", "bottom", "legs", "finish"][i] + ".png",
    alt: [
      "Checking the precut walls, notched base and four legs on a workbench.",
      "Checking the square corners of the clamped wall box.",
      "Fitting the base inside the walls with corner notches open for the legs.",
      "Holding the inside corner legs square before fixing them.",
      "Brushing finish along the grain of the assembled planter.",
    ][i],
    model: "imagegen",
    createdAt: p.createdAt,
  }));
  p.messages = [
    {
      id: "example-user",
      role: "user",
      text: "I want to make a simple wooden planter for my balcony. Something raised, with a natural finish.",
      photoIds: [],
      createdAt: p.createdAt,
    },
    {
      id: "example-assistant",
      role: "assistant",
      text: "A raised cedar planter would work well. I’ve put together a simple build using precut boards and four square legs.\n\nThe complete guide is ready beside this conversation. You can explore the shape, check the pieces, or make it your own.",
      photoIds: [],
      createdAt: p.createdAt,
    },
  ];
  return p;
}
