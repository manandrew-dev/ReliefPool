import { describe, expect, it } from "vitest";
import { markerRadius, regionCorners } from "./map";

describe("regionCorners", () => {
  it("returns the south-west then north-east corner", () => {
    expect(
      regionCorners({ minLat: 30, maxLat: 46, minLon: 135, maxLon: 150 })
    ).toEqual([
      [30, 135],
      [46, 150],
    ]);
  });
});

describe("markerRadius", () => {
  it("grows with magnitude", () => {
    expect(markerRadius(5)).toBeLessThan(markerRadius(7));
    expect(markerRadius(7)).toBeLessThan(markerRadius(9));
  });

  it("keeps small quakes clickable", () => {
    expect(markerRadius(2)).toBe(4);
  });

  it("caps the largest quakes", () => {
    expect(markerRadius(10)).toBe(20);
  });
});
