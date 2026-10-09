import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { matchArtwork, renderComposition } from "../src/public/composition.js";
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
  assert.match(html, /Toilet access/);
  assert.match(html, /Drawing unavailable/);
  assert.match(html, /Seat count unknown/);
  assert.match(html, /Locomotive/);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img onerror=evil>"));
  assert.ok(!html.includes("NaN"));
  assert.match(html, /Marc Le Gad \/ MLGTraffic/);
  assert.match(html, /by-nc-sa\/3\.0/);
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
  }
});

test("standing capacity and length are separate from seats, complete per formation and tolerate missing fields", () => {
  const unit = {
    materialSubTypeName: "AM08_b",
    seatsSecondClass: 100,
    standingPlacesFirstClass: "2",
    standingPlacesSecondClass: "30",
    lengthInMeter: "26.5",
    hasPriorityPlaces: "1",
    hasTables: true,
    hasLuggageSection: "0",
  };
  const wrap = (units) => ({ composition: { units: { unit: units } } });
  let html = renderComposition(
    {
      composition: {
        segments: { segment: [wrap([unit, unit]), wrap([unit])] },
      },
    },
    t,
  );
  assert.match(html, /2nd class: 200 seats/);
  assert.match(html, /64 standing places/);
  assert.match(html, /Train length: ≈ 53 m/);
  assert.match(html, /32 standing places/);
  assert.match(html, /Train length: ≈ 27 m/);
  assert.match(html, /Priority seats/);
  assert.match(html, /Tables/);
  assert.ok(!html.includes("<span>Luggage area</span>"));
  assert.match(html, /not the number of free places/);
  html = renderComposition(
    {
      composition: {
        segments: {
          segment: wrap([
            unit,
            { lengthInMeter: "invalid", standingPlacesSecondClass: "30" },
          ]),
        },
      },
    },
    t,
  );
  assert.ok(
    !html.includes("Train length:"),
    "A partial length must not be presented as the full train",
  );
  assert.ok(!html.includes("64 standing places"));
  assert.match(html, /Length: ≈ 26.5 m/);
  assert.ok(!html.includes("NaN"));
});

test("all committed PNGs retain their imported dimensions and provenance hashes", () => {
  const root = new URL("../src/public/assets/trains/", import.meta.url);
  const manifest = JSON.parse(
    readFileSync(new URL("sources.json", root), "utf8"),
  );
  assert.equal(Object.keys(artwork).length, 47);
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
    }
  }
});
