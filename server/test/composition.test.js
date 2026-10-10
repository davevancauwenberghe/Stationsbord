import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  matchArtwork,
  renderComposition,
  selectArtworkVariant,
} from "../src/public/composition.js";
import { artwork } from "../src/public/assets/trains/catalog.js";
import { messages } from "../src/public/i18n.js";

const type = (parent_type, sub_type, orientation = "LEFT") => ({
  parent_type,
  sub_type,
  orientation,
});
const t = (key) => messages.en[key];

test("AM08 variants and AM96 voltage equipment use their own original drawings", () => {
  const dc = matchArtwork({
    materialSubTypeName: "AM08_b",
    materialNumber: "8071",
  });
  const ac = matchArtwork({
    materialSubTypeName: "AM08_b",
    materialNumber: "8512",
  });
  assert.notEqual(dc.src, ac.src);
  assert.equal(dc.key, "am08-dc-b");
  assert.equal(ac.key, "am08-ac-b");
  const mono = matchArtwork({
    materialSubTypeName: "AM96_b",
    materialNumber: "561",
  });
  const dual = matchArtwork({
    materialSubTypeName: "AM96_b",
    materialNumber: "450",
  });
  assert.equal(mono.key, "am96-dc-middle");
  assert.equal(dual.key, "am96-ac-middle");
});

test("cab classes and orientation follow supplied fields without reversing unit order", () => {
  const unit = {
    materialType: type("AM96", "c", "RIGHT"),
    seatsFirstClass: "56",
    seatsSecondClass: "0",
  };
  assert.equal(matchArtwork(unit).key, "am96-first");
  assert.match(matchArtwork(unit).file, /-r\.png$/);
  assert.equal(
    matchArtwork({ ...unit, seatsFirstClass: "0", seatsSecondClass: "80" }).key,
    "am96-second",
  );
  assert.equal(
    matchArtwork({ materialType: type("M7", "BMX") }).key,
    "m7-motor",
  );
  assert.equal(
    matchArtwork({ materialType: type("M7", "BDXH") }).key,
    "m7-cab",
  );
  assert.equal(
    matchArtwork({ materialType: type("M6", "BUH"), seatsSecondClass: "140" })
      .key,
    "m6-second",
  );
  assert.equal(
    matchArtwork({ materialType: type("M7", "BUH"), seatsSecondClass: "100" })
      .key,
    "m7-second",
  );
  assert.equal(matchArtwork({ materialType: type("HLE19", "") }).key, "hle18");
  assert.equal(
    matchArtwork({ materialType: type("M7", "BDH"), seatsSecondClass: "103" })
      .key,
    "m7-luggage",
  );
  assert.equal(
    matchArtwork({ materialType: type("I10", "BUH"), seatsSecondClass: "86" })
      .key,
    "i10-second",
  );
});

test("unknown and ambiguous types fall back instead of claiming a specific drawing", () => {
  for (const unit of [
    {},
    { materialSubTypeName: "FUTURE9000" },
    { materialType: type("M7", "UNKNOWN") },
    { materialType: type("AM96", "c") },
    { materialType: type("../../evil", "a") },
  ])
    assert.equal(matchArtwork(unit), null);
  assert.equal(matchArtwork({ materialSubTypeName: "M6_weird" }), null);
});

test("separate formations preserve order, seats and real amenities, and escape upstream text", () => {
  const data = {
    composition: {
      segments: {
        segment: [
          {
            origin: { name: "A <script>" },
            destination: { name: "B" },
            composition: {
              units: {
                unit: [
                  {
                    materialSubTypeName: "AM08_b",
                    materialNumber: "8071",
                    seatsSecondClass: "104",
                    hasBikeSection: "0",
                    hasAirco: "1",
                  },
                  {
                    materialSubTypeName: "AM08_a",
                    materialNumber: "8071",
                    seatsFirstClass: "16",
                    seatsCoupeFirstClass: "2",
                    seatsSecondClass: "68",
                    hasBikeSection: "1",
                    hasPrmSection: true,
                    hasToilets: "1",
                  },
                  {
                    materialSubTypeName: "<img onerror=evil>",
                    seatsSecondClass: "invalid",
                  },
                ],
              },
            },
          },
          {
            composition: {
              units: { unit: { materialType: type("HLE18", "") } },
            },
          },
        ],
      },
    },
  };
  const html = renderComposition(data, t);
  assert.equal((html.match(/class="composition-scroll"/g) || []).length, 2);
  assert.equal((html.match(/class="carriage-card"/g) || []).length, 4);
  assert.ok(html.indexOf("am08-dc-b") < html.indexOf("am08-a"));
  assert.match(html, /1st class: 18 seats/);
  assert.match(html, /2nd class: 172 seats/);
  assert.equal((html.match(/<span>Bike space<\/span>/g) || []).length, 1);
  assert.equal((html.match(/<span>Wheelchair area<\/span>/g) || []).length, 1);
  assert.match(html, /Toilet/);
  assert.match(html, /Drawing unavailable/);
  assert.match(html, /Seat count unknown/);
  assert.match(html, /Locomotive/);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img onerror=evil>"));
  assert.ok(!html.includes("NaN"));
  assert.match(html, /Marc Le Gad \/ MLGTraffic/);
  assert.match(html, /by-nc-sa\/3\.0/);
  assert.ok(html.includes(messages.en.scheduleDisclaimer));
  assert.equal((html.match(/schedule-disclaimer/g) || []).length, 1);
});

test("empty formations show the existing unavailable state without misleading credits or track", () => {
  for (const data of [
    null,
    {},
    {
      composition: {
        segments: { segment: { composition: { units: { unit: [] } } } },
      },
    },
  ]) {
    const html = renderComposition(data, t);
    assert.match(html, /temporarily unavailable/);
    assert.ok(!html.includes("composition-scroll"));
    assert.ok(html.includes(messages.en.scheduleDisclaimer));
    assert.equal((html.match(/schedule-disclaimer/g) || []).length, 1);
  }
});

test("composition keeps seats and amenities while hiding standing capacity, lengths and source-document UI", () => {
  const html = renderComposition(
    {
      composition: {
        segments: {
          segment: {
            composition: {
              units: {
                unit: {
                  materialSubTypeName: "AM08_b",
                  seatsSecondClass: 100,
                  standingPlacesFirstClass: "2",
                  standingPlacesSecondClass: "30",
                  lengthInMeter: "26.5",
                  hasPriorityPlaces: "1",
                  hasTables: true,
                  hasLuggageSection: "0",
                },
              },
            },
          },
        },
      },
    },
    t,
  );
  assert.match(html, /2nd class: 100 seats/);
  assert.match(html, /Priority seats/);
  assert.match(html, /Tables/);
  assert.doesNotMatch(
    html,
    /standing places|Train length|Length:|capacity-note|not the number of free places|ATTRIBUTION\.md|composition-scroll-hint/,
  );
  assert.match(html, /Marc Le Gad \/ MLGTraffic/);
  assert.match(html, /by-nc-sa\/3\.0/);
});

test("all committed PNGs retain their imported dimensions and provenance hashes", () => {
  const root = new URL("../src/public/assets/trains/", import.meta.url);
  const manifest = JSON.parse(
    readFileSync(new URL("sources.json", root), "utf8"),
  );
  assert.equal(Object.keys(artwork).length, 52);
  for (const [key, sides] of Object.entries(artwork)) {
    for (const side of ["L", "R"]) {
      const entry = sides[side],
        source = manifest.artwork[key][side];
      const png = readFileSync(new URL(entry.file, root));
      assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      assert.equal(png.readUInt32BE(16), entry.width);
      assert.equal(png.readUInt32BE(20), entry.height);
      assert.equal(
        createHash("sha256").update(png).digest("hex"),
        source.pngSha256,
      );
      assert.match(
        source.source,
        /^http:\/\/www\.mlgtraffic\.net\/images\/SNCB\/.+\.gif$/,
      );
      assert.equal(source.sourceSha256.length, 64);
      assert.equal(entry.cabFacing, source.cabFacing);
    }
  }
});

test("AM96 cab direction is independent of original drawing side names", () => {
  for (const [orientation, side] of [
    ["LEFT", "R"],
    ["RIGHT", "L"],
  ]) {
    const drawing = matchArtwork({
      materialType: type("AM96M", "a", orientation),
      seatsSecondClass: "79",
    });
    assert.equal(drawing.key, "am96-second");
    assert.equal(drawing.file, `am96-second-${side.toLowerCase()}.png`);
  }
  assert.equal(
    matchArtwork({
      materialType: type("AM96P", "c", "RIGHT"),
      seatsFirstClass: "45",
    }).file,
    "am96-first-r.png",
  );
});

test("combined API types recover unknown subtypes, including I11 and M7 cab cars", () => {
  for (const unit of [
    { materialType: type("I11BDXH", "unknown") },
    { materialSubTypeName: "I11BDXH unknown" },
    { materialType: type("I11", "unknown"), materialSubTypeName: "I11BDXH" },
  ]) {
    assert.equal(matchArtwork(unit).key, "i11-cab");
    const data = {
      composition: {
        segments: { segment: { composition: { units: { unit } } } },
      },
    };
    assert.doesNotMatch(renderComposition(data, t), /I11BDXH unknown/i);
  }
  assert.equal(matchArtwork({ materialType: type("M7", "BXH") }).key, "m7-cab");
  assert.equal(
    matchArtwork({ materialType: type("M7BXH", "unknown") }).key,
    "m7-cab",
  );
  assert.equal(
    matchArtwork({
      materialType: type("M7", "UNKNOWN"),
      materialSubTypeName: "M7_future",
    }),
    null,
  );
});

test("M5 uses its own first, second and cab drawings without relabelling M4", () => {
  for (const [name, key] of [
    ["M5A", "m5-first"],
    ["M5BUH", "m5-second"],
    ["M5BDX", "m5-cab"],
  ]) {
    assert.equal(matchArtwork({ materialSubTypeName: name }).key, key);
  }
  assert.equal(
    matchArtwork({ materialType: type("M5", "BDX", "RIGHT") }).file,
    "m5-cab-l.png",
  );
  assert.equal(
    matchArtwork({ materialType: type("M4", "B") }).key,
    "m4-second",
  );
});

test("Ouigo I11 livery is limited to OTC services, with a standard cab carriage", () => {
  const first = { materialType: type("I11", "A") },
    second = { materialType: type("I11", "B") };
  for (const trainId of ["OTC123", "BE.NMBS.OTC123"]) {
    assert.equal(matchArtwork(first, { trainId }).key, "i11-ouigo-first");
    assert.equal(matchArtwork(second, { trainId }).key, "i11-ouigo-second");
    assert.equal(
      matchArtwork({ materialType: type("I11BDXH", "unknown") }, { trainId })
        .key,
      "i11-cab",
    );
  }
  for (const trainId of ["IC123", "EC123", "NOTC123", "", "OTC123<script>"]) {
    assert.equal(matchArtwork(first, { trainId }).key, "i11-first");
    assert.equal(matchArtwork(second, { trainId }).key, "i11-second");
  }
  const data = {
    composition: {
      segments: {
        segment: {
          composition: {
            units: {
              unit: [
                first,
                second,
                { materialType: type("I11BDXH", "unknown") },
              ],
            },
          },
        },
      },
    },
  };
  const html = renderComposition(data, t, { trainId: "BE.NMBS.OTC123" });
  assert.match(html, /i11-ouigo-first-l\.png/);
  assert.match(html, /i11-ouigo-second-l\.png/);
  assert.match(html, /i11-cab-l\.png/);
  assert.doesNotMatch(html, /I11BDXH unknown/i);
  assert.ok(html.indexOf("i11-ouigo-first") < html.indexOf("i11-ouigo-second"));
});

test("all supported EMU and DMU cab drawings face the requested direction", () => {
  const cases = [
    ["AM08M", "a", {}, "am08-a", "L"],
    ["AM08M", "c", {}, "am08-dc-c", "L"],
    ["AM08P", "c", {}, "am08-ac-c", "L"],
    ["AM75", "a", { seatsFirstClass: 45 }, "am75-first", "L"],
    ["AM75M", "d", { seatsSecondClass: 80 }, "am75-second", "L"],
    ["AM80P", "c", { seatsFirstClass: 45 }, "am80-first", "L"],
    ["AM80M", "a", { seatsSecondClass: 80 }, "am80-second", "L"],
    ["AM86", "a", { seatsSecondClass: 80 }, "am86-motor", "L"],
    ["AM86M", "b", { seatsFirstClass: 45 }, "am86-trailer", "L"],
    ["AM96P", "c", { seatsFirstClass: 45 }, "am96-first", "L"],
    ["AM96M", "a", { seatsSecondClass: 80 }, "am96-second", "R"],
    ["AR41", "a", { seatsFirstClass: 45 }, "ar41-first", "L"],
    ["MW41", "b", { seatsSecondClass: 80 }, "ar41-second", "L"],
    ["M7", "BMXH", {}, "m7-motor", "L"],
  ];
  for (const [parent, sub, fields, key, sourceLCab] of cases) {
    for (const [orientation, direction] of [
      ["LEFT", "L"],
      ["RIGHT", "R"],
    ]) {
      const drawing = matchArtwork({
        materialType: type(parent, sub, orientation),
        ...fields,
      });
      assert.equal(drawing?.key, key, `${parent}/${sub}/${orientation}`);
      assert.equal(drawing.cabFacing, direction);
      const sourceSide = direction === sourceLCab ? "l" : "r";
      assert.equal(drawing.file, `${key}-${sourceSide}.png`);
    }
  }
});

test("multiple-unit artwork explicitly classifies cabs and intermediate vehicles", () => {
  for (const [key, variants] of Object.entries(artwork).filter(
    ([key]) => /^(?:am|ar)/.test(key) || key === "m7-motor",
  )) {
    for (const side of ["L", "R"]) {
      assert.ok(Object.hasOwn(variants[side], "cabFacing"), key);
      assert.ok(["L", "R", null].includes(variants[side].cabFacing), key);
    }
    if (variants.L.cabFacing !== null) {
      assert.notEqual(variants.L.cabFacing, variants.R.cabFacing, key);
    } else assert.equal(variants.R.cabFacing, null, key);
  }
  for (const [parent, sub] of [
    ["AM08M", "b"],
    ["AM08P", "b"],
    ["AM75M", "b"],
    ["AM75", "c"],
    ["AM80M", "b"],
    ["AM96M", "b"],
    ["AM96P", "b"],
  ]) {
    for (const [orientation, side] of [
      ["LEFT", "l"],
      ["RIGHT", "r"],
    ]) {
      const drawing = matchArtwork({
        materialType: type(parent, sub, orientation),
      });
      assert.equal(drawing.cabFacing, null);
      assert.ok(drawing.file.endsWith(`-${side}.png`));
    }
  }
});

test("cab metadata selects future drawings without family or filename exceptions", () => {
  const variants = {
    L: { file: "new-dmu-camera-left.png", cabFacing: "R" },
    R: { file: "new-dmu-camera-right.png", cabFacing: "L" },
  };
  assert.equal(selectArtworkVariant(variants, "L"), variants.R);
  assert.equal(selectArtworkVariant(variants, "R"), variants.L);
  const intermediate = { L: { cabFacing: null }, R: { cabFacing: null } };
  assert.equal(selectArtworkVariant(intermediate, "L"), intermediate.L);
  assert.equal(selectArtworkVariant(intermediate, "R"), intermediate.R);
  assert.equal(selectArtworkVariant(undefined, "L"), undefined);
});
