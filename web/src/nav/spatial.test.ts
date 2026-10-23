import { describe, expect, it } from "vitest";
import { pickNext, type Box } from "./spatial";

const box = (left: number, top: number, width = 100, height = 40): Box => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

describe("pickNext", () => {
  // A vertical list of rows, like the games list.
  const list = [box(0, 0), box(0, 50), box(0, 100)];

  it("moves down and up a list", () => {
    expect(pickNext(list[0], list, "down")).toBe(1);
    expect(pickNext(list[1], list, "down")).toBe(2);
    expect(pickNext(list[1], list, "up")).toBe(0);
  });

  it("returns -1 at the ends", () => {
    expect(pickNext(list[2], list, "down")).toBe(-1);
    expect(pickNext(list[0], list, "up")).toBe(-1);
    expect(pickNext(list[0], list, "left")).toBe(-1);
  });

  it("moves along a row of buttons", () => {
    const row = [box(0, 0, 60), box(70, 0, 60), box(140, 0, 60)];
    expect(pickNext(row[0], row, "right")).toBe(1);
    expect(pickNext(row[2], row, "left")).toBe(1);
  });

  it("prefers the aligned item below over a nearer one off to the side", () => {
    const from = box(0, 0);
    const candidates = [box(400, 45), box(0, 120)];
    expect(pickNext(from, candidates, "down")).toBe(1);
  });

  it("moves from a wide row to the toolbar control above it", () => {
    // Toolbar with a search box on the left and a sort select on the right,
    // above a full-width game row.
    const search = box(400, 0, 200, 36);
    const sort = box(800, 0, 160, 36);
    const row = box(0, 60, 1000, 80);
    expect([0, 1]).toContain(pickNext(row, [search, sort], "up"));
  });

  it("ignores candidates overlapping the current box in the move direction", () => {
    const from = box(0, 0, 100, 100);
    const sideBySide = box(120, 10, 100, 40);
    expect(pickNext(from, [sideBySide], "down")).toBe(-1);
    expect(pickNext(from, [sideBySide], "right")).toBe(0);
  });
});
