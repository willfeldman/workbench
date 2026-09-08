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
        estimatedUnitPrice: 38,
        sources: [],
      },
      {
        id: "legs",
        name: "Cedar square stock",
        specification: "36 × 36 mm; four pieces, each 450 mm long",
        quantity: 4,
        unit: "pieces",
        estimatedUnitPrice: 3,
        sources: [],
      },
      {
        id: "screws",
        name: "Exterior wood screws",
        specification:
          "4 × 35 mm for box joints; 4 × 45 mm for fixing legs. Check against actual thickness.",
        quantity: 1,
        unit: "mixed pack",
        estimatedUnitPrice: 9,
        sources: [],
      },
      {
        id: "finish",
        name: "Exterior wood finish",
        specification:
          "Suitable for cedar; follow the manufacturer’s application and curing instructions",
        quantity: 1,
        unit: "small tin",
        estimatedUnitPrice: 14,
        sources: [],
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
          "Lay out the precut boards and four legs. Check every length and the actual thickness against the parts list. The end panels sit between the front and back, with a 684 × 300 mm base inside the walls. The base needs a 36 × 36 mm square notch at each corner to clear the legs. Have these notches precut or cut them with a suitable saw before assembly. Dry-fit all four legs through the notches before drilling. Sand rough faces and ease sharp edges.",
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
          "Clamp the front, back, and two ends into a square box. Position the end panels between the long panels. Check both diagonals are equal. Predrill and countersink through the long panels into the ends, keeping holes centered in the receiving material. Use three appropriately spaced 35 mm screws per corner; confirm they will not protrude.",
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
          "Place the notched base between the walls with its underside flush to the bottom of the box. Support it on scrap blocks while clamping. Predrill centered into the base edges, then secure with 35 mm screws: three along each long edge and two along each short edge, all clear of the notches. Confirm the screw length suits the actual stock. This base holds removable pots, not loose soil.",
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
          "Place the four legs inside the corners so the feet are 222 mm below the underside of the base and the tops sit 20 mm below the rim. Clamp each leg and check it is square. Predrill two offset holes through each adjacent wall into the leg, then fasten with 45 mm screws. Keep the screws on the two faces at different heights to prevent collisions. Set the planter upright on a level surface and check for wobble.",
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
          "Sand any remaining rough edges and remove dust. Apply a cedar-compatible exterior finish following its label, including ventilation and full curing time. Once cured, add a few lightweight removable plant pots with saucers. Distribute them evenly and check stability again. Keep standing water off the wood.",
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
