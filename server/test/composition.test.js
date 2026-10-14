import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  matchArtwork,
  renderComposition,
  selectArtworkVariant,
  formationDirections,
} from "../src/public/composition.js";
import { artwork } from "../src/public/assets/trains/catalog.js";
import { messages } from "../src/public/i18n.js";

const type = (parent_type, sub_type, orientation = "LEFT") => ({
  parent_type,
  sub_type,
  orientation,
});
const t = (key) => messages.en[key];

test("LIMAX maps a/b/c across API layouts and respects both cab directions", () => {
  for (const car of ["a", "b", "c"]) {
    for (const unit of [
      { materialType: type("AMFLIRTMC", car) },
      { materialType: type(`AMFLIRTMC${car}`, "unknown") },
      { materialSubTypeName: `AMFLIRTMC ${car}` },
      { materialSubTypeName: `FLIRT_550_LIMAX_${car}` },
    ]) {
      for (const [orientation, side] of [
        ["LEFT", "L"],
        ["RIGHT", "R"],
      ]) {
        const drawing = matchArtwork({
          ...unit,
          materialType: { ...unit.materialType, orientation },
        });
        assert.equal(drawing?.key, `limax-${car}`);
        assert.equal(drawing.creator, "Stationsbord");
        assert.equal(drawing.cabFacing, car === "b" ? null : side);
        assert.equal(drawing.file, `limax-${car}-${side.toLowerCase()}.png`);
      }
    }
  }
  for (const parent of ["AMFLIRT", "FLIRT3_450", "FLIRT_550", "FUTUREFLIRT"])
    assert.equal(matchArtwork({ materialType: type(parent, "a") }), null);
  assert.equal(
    matchArtwork({ materialType: type("AMFLIRTMC", "unknown") }),
    null,
  );
});

test("complete numbered LIMAX formations orient outward without reordering carriages", () => {
  const units = ["c", "b", "a"].map((car) => ({
    materialType: type("AMFLIRTMC", car, "RIGHT"),
    materialNumber: "551",
    materialSubTypeName: `AMFLIRTMC ${car}`,
    seatsSecondClass: 60,
    hasToilets: car === "b" ? "1" : "0",
  }));
  assert.deepEqual(formationDirections(units), ["L", null, "R"]);
  assert.deepEqual(
    formationDirections([
      ...units,
      ...units.map((unit) => ({
        ...unit,
        materialNumber: "552",
      })),
    ]),
    ["L", null, "R", "L", null, "R"],
  );
  assert.deepEqual(formationDirections(units.slice(0, 2)), [null, null]);
  assert.deepEqual(
    formationDirections(
      units.map((unit) => ({
        ...unit,
        materialNumber: "",
      })),
    ),
    [null, null, null],
  );
  const html = renderComposition(
    {
      composition: {
        segments: {
          segment: {
            composition: { units: { unit: units } },
          },
        },
      },
    },
    t,
  );
  assert.ok(html.indexOf("limax-c-l.png") < html.indexOf("limax-b-r.png"));
  assert.ok(html.indexOf("limax-b-r.png") < html.indexOf("limax-a-r.png"));
  assert.match(html, /Stationsbord \(LIMAX\)/);
  assert.match(html, /Marc Le Gad \/ MLGTraffic/);
  assert.match(html, /2nd class: 180 seats/);
  assert.match(html, /Toilet/);
  assert.doesNotMatch(html, /carriage-placeholder" >Drawing unavailable/);
});

test("local LIMAX artwork retains transparent masters and declared provenance", () => {
  const root = new URL("../src/public/assets/trains/", import.meta.url);
  const local = JSON.parse(readFileSync(new URL("local-artwork.json", root)));
  assert.equal(local.referenceCreator, "Marc Le Gad / MLGTraffic");
  assert.equal(
    local.license,
    "https://creativecommons.org/licenses/by-nc-sa/3.0/",
  );
  for (const [key, variants] of Object.entries(local.artwork)) {
    for (const side of ["L", "R"]) {
      const entry = variants[side];
      assert.equal(entry.creator, "Stationsbord");
      assert.match(entry.creation, /AI-assisted/);
      assert.equal(
        createHash("sha256")
          .update(readFileSync(new URL(entry.source, root)))
          .digest("hex"),
        entry.sourceSha256,
      );
      assert.equal(
        createHash("sha256")
          .update(readFileSync(new URL(entry.file, root)))
          .digest("hex"),
        entry.pngSha256,
      );
      assert.equal(entry.height, 58);
      assert.equal(artwork[key][side].width, entry.width);
      assert.equal(artwork[key][side].creator, "Stationsbord");
    }
  }
  assert.ok(artwork["limax-b"].L.width < artwork["limax-a"].L.width);
  assert.ok(artwork["limax-b"].L.width < artwork["limax-c"].L.width);
});

test("I11 AUH/BVUH aliases use service-specific liveries in every API type layout", () => {
  for (const [subtype, drawing] of [
    ["AUH", "first"],
    ["BVUH", "second"],
    ["BUH", "second"],
  ]) {
    for (const unit of [
      { materialType: type("I11", subtype) },
      { materialType: type(`I11${subtype}`, "unknown") },
      { materialSubTypeName: `I11${subtype} unknown` },
    ]) {
      for (const orientation of ["LEFT", "RIGHT"]) {
        const oriented = {
          ...unit,
          materialType: { ...unit.materialType, orientation },
        };
        for (const [trainId, prefix] of [
          ["BE.NMBS.OTC1000", "i11-ouigo-"],
          ["OTC1001", "i11-ouigo-"],
          ["BE.NMBS.IC515", "i11-"],
          ["515", "i11-"],
        ]) {
          const asset = matchArtwork(oriented, { trainId });
          assert.equal(asset.key, prefix + drawing);
          assert.match(
            asset.file,
            new RegExp(`-${orientation === "LEFT" ? "l" : "r"}\\.png$`),
          );
        }
      }
    }
  }
  assert.equal(
    matchArtwork({ materialType: type("I11", "BDXH") }, { trainId: "OTC1000" })
      .key,
    "i11-cab",
  );
  assert.equal(matchArtwork({ materialType: type("I11", "unreviewed") }), null);
});

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

test("M6 AUH uses first-class artwork in split and combined API type layouts", () => {
  for (const unit of [
    { materialType: type("M6", "AUH") },
    { materialType: type("M6AUH", "unknown") },
    { materialSubTypeName: "M6AUH unknown" },
  ]) {
    for (const [orientation, side] of [
      ["LEFT", "l"],
      ["RIGHT", "r"],
    ]) {
      const drawing = matchArtwork({
        ...unit,
        materialType: { ...unit.materialType, orientation },
      });
      assert.equal(drawing?.key, "m6-first");
      assert.equal(drawing.file, `m6-first-${side}.png`);
    }
  }
  assert.equal(
    matchArtwork({
      materialType: type("M6", "AUH"),
      seatsFirstClass: "0",
      seatsSecondClass: "0",
    }).key,
    "m6-first",
  );
  assert.equal(matchArtwork({ materialType: type("M6", "unreviewed") }), null);
});

test("M6 catalogue imports the revised original A/B/BD/Bx and keeps the supplied ABD", () => {
  const sources = JSON.parse(
    readFileSync(
      new URL("../src/public/assets/trains/sources.json", import.meta.url),
    ),
  );
  for (const [key, name] of [
    ["m6-first", "M6_RG_A"],
    ["m6-second", "M6_RG_B"],
    ["m6-luggage-second", "M6_RG_BD"],
    ["m6-cab", "M6_RG_Bx"],
    ["m6-luggage-mixed", "M6_ABD"],
  ]) {
    for (const side of ["L", "R"]) {
      assert.equal(
        sources.artwork[key][side].source,
        `http://www.mlgtraffic.net/images/SNCB/V/SNCB_${name}_${side}.gif`,
      );
      assert.equal(
        artwork[key][side].cabFacing,
        key === "m6-cab" ? side : null,
      );
    }
  }
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

test("all display PNGs match their declared dimensions and provenance hashes", () => {
  const root = new URL("../src/public/assets/trains/", import.meta.url);
  const manifest = JSON.parse(
    readFileSync(new URL("sources.json", root), "utf8"),
  );
  assert.equal(Object.keys(artwork).length, 55);
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
      if (source.creator === "Stationsbord") {
        assert.match(source.source, /^limax-originals\/limax-[abc]\.png$/);
      } else {
        assert.match(
          source.source,
          /^http:\/\/www\.mlgtraffic\.net\/images\/SNCB\/.+\.gif$/,
        );
      }
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

test("I10 VUH and BVUH aliases share the original second-class drawing", () => {
  for (const subtype of ["VUH", "BVUH"])
    for (const unit of [
      { materialType: type("I10", subtype) },
      { materialType: type("I10" + subtype, "unknown") },
      { materialSubTypeName: "I10" + subtype },
    ]) {
      assert.equal(matchArtwork(unit).key, "i10-second");
    }
});

test("complete numbered EMU/DMU sets correct contradictory cabs without reordering or changing middle cars", async () => {
  const { formationDirections } = await import("../src/public/composition.js");
  for (const [family, subtypes] of [
    ["AM08", ["A", "B", "C"]],
    ["AM96", ["A", "B", "C"]],
    ["AM80", ["A", "B", "C"]],
    ["AM75", ["A", "B", "C", "D"]],
    ["AM86", ["A", "B"]],
    ["AR41", ["A", "B"]],
    ["MW41", ["A", "B"]],
  ]) {
    const units = subtypes.map((subtype, index) => ({
      materialType: type(family, subtype, index === 0 ? "RIGHT" : "LEFT"),
      materialNumber: "450",
      seatsFirstClass: index === 0 ? 16 : 0,
      seatsSecondClass: 80,
    }));
    const directions = formationDirections(units);
    assert.deepEqual(
      directions,
      units.map((_, i) =>
        i === 0 ? "L" : i === units.length - 1 ? "R" : null,
      ),
      family,
    );
    const other = units.map((unit) => ({ ...unit, materialNumber: "451" }));
    assert.deepEqual(formationDirections([...units, ...other]), [
      ...directions,
      ...directions,
    ]);
    const oriented = units.map((unit, index) =>
      matchArtwork(unit, { orientation: directions[index] }),
    );
    assert.equal(oriented[0].cabFacing, "L");
    assert.equal(oriented.at(-1).cabFacing, "R");
    const html = renderComposition(
      {
        composition: {
          segments: { segment: { composition: { units: { unit: units } } } },
        },
      },
      t,
    );
    assert.equal(
      (html.match(/data-orientation-source="formation"/g) || []).length,
      2,
    );
    assert.equal(
      units[0].materialType.orientation,
      "RIGHT",
      "input is not mutated",
    );
  }
});

test("partial, unnumbered or ambiguous formations keep the supplied cab direction", async () => {
  const { formationDirections } = await import("../src/public/composition.js");
  const unit = {
    materialType: type("AM96", "A", "RIGHT"),
    seatsFirstClass: 16,
  };
  for (const units of [
    [unit],
    [
      unit,
      {
        ...unit,
        materialType: type("AM96", "C"),
        seatsFirstClass: 0,
        seatsSecondClass: 80,
      },
    ],
    [{ ...unit, materialNumber: "bad" }],
  ]) {
    assert.deepEqual(
      formationDirections(units),
      units.map(() => null),
    );
    assert.equal(matchArtwork(units[0]).cabFacing, "R");
  }
  assert.equal(
    matchArtwork({
      ...unit,
      materialType: { parent_type: "AM96", sub_type: "A" },
    }).orientationSource,
    "unknown",
  );
});
