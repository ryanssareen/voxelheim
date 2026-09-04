import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BLOCK_ID, BLOCK_DEFINITIONS, woodBlockIds, type WoodSpecies, type WoodPart } from "@data/blocks";
import { WOOD_PALETTE } from "@data/woodPalette";
import { ItemIcon } from "@ui/ItemIcon";
import { blockCategory } from "@ui/MinimapUI";

/**
 * Byte-exact snapshot of the oak LOG/LEAVES/PLANKS icon markup, captured
 * from git HEAD (src/ui/ItemIcon.tsx) via renderToStaticMarkup BEFORE
 * cubeFaces was changed to branch on BlockDefinition.wood. Refactoring
 * cubeFaces/barkFace/endGrainFace/leavesFace/planksFace to take their base
 * colors as parameters (fed from WOOD_PALETTE.oak) must not change oak's
 * rendered output by a single character.
 */
const OAK_BASELINE: Record<"LOG" | "LEAVES" | "PLANKS", string> = {
  LOG: "<svg width=\"36.08\" height=\"36.08\" viewBox=\"0 0 32 32\"><defs><clipPath id=\"vhcf5\"><rect x=\"0\" y=\"0\" width=\"16\" height=\"16\"></rect></clipPath></defs><g transform=\"matrix(0.8125,-0.46875,0.8125,0.46875,3,10.5)\"><g clip-path=\"url(#vhcf5)\"><rect x=\"0\" y=\"0\" width=\"16\" height=\"16\" fill=\"#D7CCC8\"></rect><circle cx=\"8\" cy=\"8\" r=\"6.4\" fill=\"none\" stroke=\"#8e8784\" stroke-width=\"0.7\" opacity=\"0.8\"></circle><circle cx=\"8\" cy=\"8\" r=\"4.7\" fill=\"none\" stroke=\"#8e8784\" stroke-width=\"0.5\" opacity=\"0.8\"></circle><circle cx=\"8\" cy=\"8\" r=\"3.1\" fill=\"none\" stroke=\"#8e8784\" stroke-width=\"0.7\" opacity=\"0.8\"></circle><circle cx=\"8\" cy=\"8\" r=\"1.7\" fill=\"none\" stroke=\"#8e8784\" stroke-width=\"0.5\" opacity=\"0.8\"></circle><circle cx=\"8\" cy=\"8\" r=\"0.9\" fill=\"#6c6664\"></circle><rect x=\"13.40\" y=\"6.37\" width=\"0.83\" height=\"0.85\" rx=\"0.25\" fill=\"#9f9794\" opacity=\"0.35\"></rect><rect x=\"5.29\" y=\"0.06\" width=\"0.74\" height=\"0.64\" rx=\"0.25\" fill=\"#e1d9d6\" opacity=\"0.35\"></rect><rect x=\"12.22\" y=\"2.27\" width=\"0.94\" height=\"0.54\" rx=\"0.25\" fill=\"#9f9794\" opacity=\"0.35\"></rect><rect x=\"4.77\" y=\"5.34\" width=\"1.01\" height=\"0.97\" rx=\"0.25\" fill=\"#e1d9d6\" opacity=\"0.35\"></rect><rect x=\"2.96\" y=\"3.02\" width=\"0.82\" height=\"0.98\" rx=\"0.25\" fill=\"#9f9794\" opacity=\"0.35\"></rect><rect x=\"0\" y=\"0\" width=\"16\" height=\"16\" fill=\"#ffffff\" opacity=\"0.1\"></rect></g></g><g transform=\"matrix(0.8125,0.46875,0,0.75,3,10.5)\"><g clip-path=\"url(#vhcf5)\"><rect x=\"0\" y=\"0\" width=\"16\" height=\"16\" fill=\"#5D4037\"></rect><rect x=\"0.6\" y=\"0\" width=\"1.1\" height=\"16\" fill=\"#362520\"></rect><rect x=\"3.6\" y=\"0\" width=\"1.1\" height=\"16\" fill=\"#362520\"></rect><rect x=\"6.6\" y=\"0\" width=\"1.1\" height=\"16\" fill=\"#362520\"></rect><rect x=\"9.8\" y=\"0\" width=\"1.1\" height=\"16\" fill=\"#362520\"></rect><rect x=\"13\" y=\"0\" width=\"1.1\" height=\"16\" fill=\"#362520\"></rect><rect x=\"2.2\" y=\"0\" width=\"0.8\" height=\"16\" fill=\"#7d665f\" opacity=\"0.55\"></rect><rect x=\"5.2\" y=\"0\" width=\"0.8\" height=\"16\" fill=\"#7d665f\" opacity=\"0.55\"></rect><rect x=\"8.3\" y=\"0\" width=\"0.8\" height=\"16\" fill=\"#7d665f\" opacity=\"0.55\"></rect><rect x=\"11.4\" y=\"0\" width=\"0.8\" height=\"16\" fill=\"#7d665f\" opacity=\"0.55\"></rect><rect x=\"14.6\" y=\"0\" width=\"0.8\" height=\"16\" fill=\"#7d665f\" opacity=\"0.55\"></rect><rect x=\"13.63\" y=\"9.04\" width=\"1.21\" height=\"1.40\" rx=\"0.25\" fill=\"#452f29\" opacity=\"0.4\"></rect><rect x=\"11.37\" y=\"1.96\" width=\"0.91\" height=\"0.98\" rx=\"0.25\" fill=\"#87726b\" opacity=\"0.4\"></rect><rect x=\"13.11\" y=\"7.90\" width=\"1.11\" height=\"1.23\" rx=\"0.25\" fill=\"#452f29\" opacity=\"0.4\"></rect><rect x=\"2.90\" y=\"9.76\" width=\"1.04\" height=\"1.25\" rx=\"0.25\" fill=\"#87726b\" opacity=\"0.4\"></rect><rect x=\"4.17\" y=\"3.54\" width=\"1.17\" height=\"0.80\" rx=\"0.25\" fill=\"#452f29\" opacity=\"0.4\"></rect><rect x=\"1.80\" y=\"1.69\" width=\"1.06\" height=\"1.02\" rx=\"0.25\" fill=\"#87726b\" opacity=\"0.4\"></rect><rect x=\"0\" y=\"0\" width=\"16\" height=\"16\" fill=\"#000000\" opacity=\"0.14\"></rect></g></g><g transform=\"matrix(0.8125,-0.46875,0,0.75,16,18)\"><g clip-path=\"url(#vhcf5)\"><rect x=\"0\" y=\"0\" width=\"16\" height=\"16\" fill=\"#5D4037\"></rect><rect x=\"0.6\" y=\"0\" width=\"1.1\" height=\"16\" fill=\"#362520\"></rect><rect x=\"3.6\" y=\"0\" width=\"1.1\" height=\"16\" fill=\"#362520\"></rect><rect x=\"6.6\" y=\"0\" width=\"1.1\" height=\"16\" fill=\"#362520\"></rect><rect x=\"9.8\" y=\"0\" width=\"1.1\" height=\"16\" fill=\"#362520\"></rect><rect x=\"13\" y=\"0\" width=\"1.1\" height=\"16\" fill=\"#362520\"></rect><rect x=\"2.2\" y=\"0\" width=\"0.8\" height=\"16\" fill=\"#7d665f\" opacity=\"0.55\"></rect><rect x=\"5.2\" y=\"0\" width=\"0.8\" height=\"16\" fill=\"#7d665f\" opacity=\"0.55\"></rect><rect x=\"8.3\" y=\"0\" width=\"0.8\" height=\"16\" fill=\"#7d665f\" opacity=\"0.55\"></rect><rect x=\"11.4\" y=\"0\" width=\"0.8\" height=\"16\" fill=\"#7d665f\" opacity=\"0.55\"></rect><rect x=\"14.6\" y=\"0\" width=\"0.8\" height=\"16\" fill=\"#7d665f\" opacity=\"0.55\"></rect><rect x=\"13.63\" y=\"9.04\" width=\"1.21\" height=\"1.40\" rx=\"0.25\" fill=\"#452f29\" opacity=\"0.4\"></rect><rect x=\"11.37\" y=\"1.96\" width=\"0.91\" height=\"0.98\" rx=\"0.25\" fill=\"#87726b\" opacity=\"0.4\"></rect><rect x=\"13.11\" y=\"7.90\" width=\"1.11\" height=\"1.23\" rx=\"0.25\" fill=\"#452f29\" opacity=\"0.4\"></rect><rect x=\"2.90\" y=\"9.76\" width=\"1.04\" height=\"1.25\" rx=\"0.25\" fill=\"#87726b\" opacity=\"0.4\"></rect><rect x=\"4.17\" y=\"3.54\" width=\"1.17\" height=\"0.80\" rx=\"0.25\" fill=\"#452f29\" opacity=\"0.4\"></rect><rect x=\"1.80\" y=\"1.69\" width=\"1.06\" height=\"1.02\" rx=\"0.25\" fill=\"#87726b\" opacity=\"0.4\"></rect><rect x=\"0\" y=\"0\" width=\"16\" height=\"16\" fill=\"#000000\" opacity=\"0.34\"></rect></g></g><path d=\"M16 3 L29 10.5 L29 22.5 L16 30 L3 22.5 L3 10.5 Z\" fill=\"none\" stroke=\"#000000\" stroke-opacity=\"0.5\" stroke-width=\"0.8\" stroke-linejoin=\"round\"></path><path d=\"M3 10.5 L16 18 L29 10.5 M16 18 L16 30\" fill=\"none\" stroke=\"#000000\" stroke-opacity=\"0.28\" stroke-width=\"0.6\"></path></svg>",
  LEAVES: "<svg width=\"36.08\" height=\"36.08\" viewBox=\"0 0 32 32\"><defs><clipPath id=\"vhcf6\"><rect x=\"0\" y=\"0\" width=\"16\" height=\"16\"></rect></clipPath></defs><g transform=\"matrix(0.8125,-0.46875,0.8125,0.46875,3,10.5)\"><g clip-path=\"url(#vhcf6)\"><rect x=\"0\" y=\"0\" width=\"16\" height=\"16\" fill=\"#113013\"></rect><circle cx=\"8.50\" cy=\"4.05\" r=\"2.53\" fill=\"#2E7D32\"></circle><circle cx=\"3.73\" cy=\"14.49\" r=\"2.63\" fill=\"#609c63\"></circle><circle cx=\"2.13\" cy=\"13.65\" r=\"2.72\" fill=\"#27692a\"></circle><circle cx=\"4.01\" cy=\"9.57\" r=\"1.75\" fill=\"#478d4b\"></circle><circle cx=\"8.04\" cy=\"2.27\" r=\"1.95\" fill=\"#2E7D32\"></circle><circle cx=\"11.26\" cy=\"3.81\" r=\"2.11\" fill=\"#609c63\"></circle><circle cx=\"5.88\" cy=\"9.16\" r=\"2.61\" fill=\"#27692a\"></circle><circle cx=\"2.63\" cy=\"1.88\" r=\"1.70\" fill=\"#478d4b\"></circle><circle cx=\"9.46\" cy=\"13.09\" r=\"1.61\" fill=\"#2E7D32\"></circle><circle cx=\"1.44\" cy=\"11.33\" r=\"2.75\" fill=\"#609c63\"></circle><circle cx=\"14.04\" cy=\"12.16\" r=\"1.82\" fill=\"#27692a\"></circle><circle cx=\"12.04\" cy=\"4.54\" r=\"2.52\" fill=\"#478d4b\"></circle><circle cx=\"12.00\" cy=\"8.01\" r=\"2.30\" fill=\"#2E7D32\"></circle><circle cx=\"3.86\" cy=\"7.92\" r=\"2.51\" fill=\"#609c63\"></circle><circle cx=\"1.89\" cy=\"2.09\" r=\"2.69\" fill=\"#27692a\"></circle><circle cx=\"11.64\" cy=\"3.26\" r=\"2.75\" fill=\"#478d4b\"></circle><rect x=\"0\" y=\"0\" width=\"16\" height=\"16\" fill=\"#ffffff\" opacity=\"0.1\"></rect></g></g><g transform=\"matrix(0.8125,0.46875,0,0.75,3,10.5)\"><g clip-path=\"url(#vhcf6)\"><rect x=\"0\" y=\"0\" width=\"16\" height=\"16\" fill=\"#113013\"></rect><circle cx=\"8.50\" cy=\"4.05\" r=\"2.53\" fill=\"#2E7D32\"></circle><circle cx=\"3.73\" cy=\"14.49\" r=\"2.63\" fill=\"#609c63\"></circle><circle cx=\"2.13\" cy=\"13.65\" r=\"2.72\" fill=\"#27692a\"></circle><circle cx=\"4.01\" cy=\"9.57\" r=\"1.75\" fill=\"#478d4b\"></circle><circle cx=\"8.04\" cy=\"2.27\" r=\"1.95\" fill=\"#2E7D32\"></circle><circle cx=\"11.26\" cy=\"3.81\" r=\"2.11\" fill=\"#609c63\"></circle><circle cx=\"5.88\" cy=\"9.16\" r=\"2.61\" fill=\"#27692a\"></circle><circle cx=\"2.63\" cy=\"1.88\" r=\"1.70\" fill=\"#478d4b\"></circle><circle cx=\"9.46\" cy=\"13.09\" r=\"1.61\" fill=\"#2E7D32\"></circle><circle cx=\"1.44\" cy=\"11.33\" r=\"2.75\" fill=\"#609c63\"></circle><circle cx=\"14.04\" cy=\"12.16\" r=\"1.82\" fill=\"#27692a\"></circle><circle cx=\"12.04\" cy=\"4.54\" r=\"2.52\" fill=\"#478d4b\"></circle><circle cx=\"12.00\" cy=\"8.01\" r=\"2.30\" fill=\"#2E7D32\"></circle><circle cx=\"3.86\" cy=\"7.92\" r=\"2.51\" fill=\"#609c63\"></circle><circle cx=\"1.89\" cy=\"2.09\" r=\"2.69\" fill=\"#27692a\"></circle><circle cx=\"11.64\" cy=\"3.26\" r=\"2.75\" fill=\"#478d4b\"></circle><rect x=\"0\" y=\"0\" width=\"16\" height=\"16\" fill=\"#000000\" opacity=\"0.14\"></rect></g></g><g transform=\"matrix(0.8125,-0.46875,0,0.75,16,18)\"><g clip-path=\"url(#vhcf6)\"><rect x=\"0\" y=\"0\" width=\"16\" height=\"16\" fill=\"#113013\"></rect><circle cx=\"8.50\" cy=\"4.05\" r=\"2.53\" fill=\"#2E7D32\"></circle><circle cx=\"3.73\" cy=\"14.49\" r=\"2.63\" fill=\"#609c63\"></circle><circle cx=\"2.13\" cy=\"13.65\" r=\"2.72\" fill=\"#27692a\"></circle><circle cx=\"4.01\" cy=\"9.57\" r=\"1.75\" fill=\"#478d4b\"></circle><circle cx=\"8.04\" cy=\"2.27\" r=\"1.95\" fill=\"#2E7D32\"></circle><circle cx=\"11.26\" cy=\"3.81\" r=\"2.11\" fill=\"#609c63\"></circle><circle cx=\"5.88\" cy=\"9.16\" r=\"2.61\" fill=\"#27692a\"></circle><circle cx=\"2.63\" cy=\"1.88\" r=\"1.70\" fill=\"#478d4b\"></circle><circle cx=\"9.46\" cy=\"13.09\" r=\"1.61\" fill=\"#2E7D32\"></circle><circle cx=\"1.44\" cy=\"11.33\" r=\"2.75\" fill=\"#609c63\"></circle><circle cx=\"14.04\" cy=\"12.16\" r=\"1.82\" fill=\"#27692a\"></circle><circle cx=\"12.04\" cy=\"4.54\" r=\"2.52\" fill=\"#478d4b\"></circle><circle cx=\"12.00\" cy=\"8.01\" r=\"2.30\" fill=\"#2E7D32\"></circle><circle cx=\"3.86\" cy=\"7.92\" r=\"2.51\" fill=\"#609c63\"></circle><circle cx=\"1.89\" cy=\"2.09\" r=\"2.69\" fill=\"#27692a\"></circle><circle cx=\"11.64\" cy=\"3.26\" r=\"2.75\" fill=\"#478d4b\"></circle><rect x=\"0\" y=\"0\" width=\"16\" height=\"16\" fill=\"#000000\" opacity=\"0.34\"></rect></g></g><path d=\"M16 3 L29 10.5 L29 22.5 L16 30 L3 22.5 L3 10.5 Z\" fill=\"none\" stroke=\"#000000\" stroke-opacity=\"0.5\" stroke-width=\"0.8\" stroke-linejoin=\"round\"></path><path d=\"M3 10.5 L16 18 L29 10.5 M16 18 L16 30\" fill=\"none\" stroke=\"#000000\" stroke-opacity=\"0.28\" stroke-width=\"0.6\"></path></svg>",
  PLANKS: "<svg width=\"36.08\" height=\"36.08\" viewBox=\"0 0 32 32\"><defs><clipPath id=\"vhcf11\"><rect x=\"0\" y=\"0\" width=\"16\" height=\"16\"></rect></clipPath></defs><g transform=\"matrix(0.8125,-0.46875,0.8125,0.46875,3,10.5)\"><g clip-path=\"url(#vhcf11)\"><rect x=\"0\" y=\"0\" width=\"16\" height=\"16\" fill=\"#c8a55a\"></rect><g><rect x=\"0\" y=\"0\" width=\"16\" height=\"3.6\" fill=\"#c8a55a\"></rect><rect x=\"0\" y=\"0.4\" width=\"16\" height=\"0.6\" fill=\"#d3b77b\" opacity=\"0.55\"></rect><rect x=\"6.5\" y=\"0\" width=\"0.7\" height=\"3.6\" fill=\"#64532d\"></rect><rect x=\"1.4\" y=\"2.2\" width=\"4.6\" height=\"0.45\" fill=\"#9c8146\" opacity=\"0.6\"></rect><rect x=\"8.8\" y=\"1.5\" width=\"4.2\" height=\"0.45\" fill=\"#9c8146\" opacity=\"0.5\"></rect><rect x=\"0\" y=\"3.6\" width=\"16\" height=\"0.55\" fill=\"#64532d\"></rect></g><g><rect x=\"0\" y=\"4\" width=\"16\" height=\"3.6\" fill=\"#b89853\"></rect><rect x=\"0\" y=\"4.4\" width=\"16\" height=\"0.6\" fill=\"#d3b77b\" opacity=\"0.55\"></rect><rect x=\"11\" y=\"4\" width=\"0.7\" height=\"3.6\" fill=\"#64532d\"></rect><rect x=\"1.4\" y=\"6.2\" width=\"4.6\" height=\"0.45\" fill=\"#9c8146\" opacity=\"0.6\"></rect><rect x=\"8.8\" y=\"5.5\" width=\"4.2\" height=\"0.45\" fill=\"#9c8146\" opacity=\"0.5\"></rect><rect x=\"0\" y=\"7.6\" width=\"16\" height=\"0.55\" fill=\"#64532d\"></rect></g><g><rect x=\"0\" y=\"8\" width=\"16\" height=\"3.6\" fill=\"#c8a55a\"></rect><rect x=\"0\" y=\"8.4\" width=\"16\" height=\"0.6\" fill=\"#d3b77b\" opacity=\"0.55\"></rect><rect x=\"4\" y=\"8\" width=\"0.7\" height=\"3.6\" fill=\"#64532d\"></rect><rect x=\"1.4\" y=\"10.2\" width=\"4.6\" height=\"0.45\" fill=\"#9c8146\" opacity=\"0.6\"></rect><rect x=\"8.8\" y=\"9.5\" width=\"4.2\" height=\"0.45\" fill=\"#9c8146\" opacity=\"0.5\"></rect><rect x=\"0\" y=\"11.6\" width=\"16\" height=\"0.55\" fill=\"#64532d\"></rect></g><g><rect x=\"0\" y=\"12\" width=\"16\" height=\"3.6\" fill=\"#b89853\"></rect><rect x=\"0\" y=\"12.4\" width=\"16\" height=\"0.6\" fill=\"#d3b77b\" opacity=\"0.55\"></rect><rect x=\"9.5\" y=\"12\" width=\"0.7\" height=\"3.6\" fill=\"#64532d\"></rect><rect x=\"1.4\" y=\"14.2\" width=\"4.6\" height=\"0.45\" fill=\"#9c8146\" opacity=\"0.6\"></rect><rect x=\"8.8\" y=\"13.5\" width=\"4.2\" height=\"0.45\" fill=\"#9c8146\" opacity=\"0.5\"></rect><rect x=\"0\" y=\"15.6\" width=\"16\" height=\"0.55\" fill=\"#64532d\"></rect></g><rect x=\"0\" y=\"0\" width=\"16\" height=\"16\" fill=\"#ffffff\" opacity=\"0.1\"></rect></g></g><g transform=\"matrix(0.8125,0.46875,0,0.75,3,10.5)\"><g clip-path=\"url(#vhcf11)\"><rect x=\"0\" y=\"0\" width=\"16\" height=\"16\" fill=\"#c8a55a\"></rect><g><rect x=\"0\" y=\"0\" width=\"16\" height=\"3.6\" fill=\"#c8a55a\"></rect><rect x=\"0\" y=\"0.4\" width=\"16\" height=\"0.6\" fill=\"#d3b77b\" opacity=\"0.55\"></rect><rect x=\"6.5\" y=\"0\" width=\"0.7\" height=\"3.6\" fill=\"#64532d\"></rect><rect x=\"1.4\" y=\"2.2\" width=\"4.6\" height=\"0.45\" fill=\"#9c8146\" opacity=\"0.6\"></rect><rect x=\"8.8\" y=\"1.5\" width=\"4.2\" height=\"0.45\" fill=\"#9c8146\" opacity=\"0.5\"></rect><rect x=\"0\" y=\"3.6\" width=\"16\" height=\"0.55\" fill=\"#64532d\"></rect></g><g><rect x=\"0\" y=\"4\" width=\"16\" height=\"3.6\" fill=\"#b89853\"></rect><rect x=\"0\" y=\"4.4\" width=\"16\" height=\"0.6\" fill=\"#d3b77b\" opacity=\"0.55\"></rect><rect x=\"11\" y=\"4\" width=\"0.7\" height=\"3.6\" fill=\"#64532d\"></rect><rect x=\"1.4\" y=\"6.2\" width=\"4.6\" height=\"0.45\" fill=\"#9c8146\" opacity=\"0.6\"></rect><rect x=\"8.8\" y=\"5.5\" width=\"4.2\" height=\"0.45\" fill=\"#9c8146\" opacity=\"0.5\"></rect><rect x=\"0\" y=\"7.6\" width=\"16\" height=\"0.55\" fill=\"#64532d\"></rect></g><g><rect x=\"0\" y=\"8\" width=\"16\" height=\"3.6\" fill=\"#c8a55a\"></rect><rect x=\"0\" y=\"8.4\" width=\"16\" height=\"0.6\" fill=\"#d3b77b\" opacity=\"0.55\"></rect><rect x=\"4\" y=\"8\" width=\"0.7\" height=\"3.6\" fill=\"#64532d\"></rect><rect x=\"1.4\" y=\"10.2\" width=\"4.6\" height=\"0.45\" fill=\"#9c8146\" opacity=\"0.6\"></rect><rect x=\"8.8\" y=\"9.5\" width=\"4.2\" height=\"0.45\" fill=\"#9c8146\" opacity=\"0.5\"></rect><rect x=\"0\" y=\"11.6\" width=\"16\" height=\"0.55\" fill=\"#64532d\"></rect></g><g><rect x=\"0\" y=\"12\" width=\"16\" height=\"3.6\" fill=\"#b89853\"></rect><rect x=\"0\" y=\"12.4\" width=\"16\" height=\"0.6\" fill=\"#d3b77b\" opacity=\"0.55\"></rect><rect x=\"9.5\" y=\"12\" width=\"0.7\" height=\"3.6\" fill=\"#64532d\"></rect><rect x=\"1.4\" y=\"14.2\" width=\"4.6\" height=\"0.45\" fill=\"#9c8146\" opacity=\"0.6\"></rect><rect x=\"8.8\" y=\"13.5\" width=\"4.2\" height=\"0.45\" fill=\"#9c8146\" opacity=\"0.5\"></rect><rect x=\"0\" y=\"15.6\" width=\"16\" height=\"0.55\" fill=\"#64532d\"></rect></g><rect x=\"0\" y=\"0\" width=\"16\" height=\"16\" fill=\"#000000\" opacity=\"0.14\"></rect></g></g><g transform=\"matrix(0.8125,-0.46875,0,0.75,16,18)\"><g clip-path=\"url(#vhcf11)\"><rect x=\"0\" y=\"0\" width=\"16\" height=\"16\" fill=\"#c8a55a\"></rect><g><rect x=\"0\" y=\"0\" width=\"16\" height=\"3.6\" fill=\"#c8a55a\"></rect><rect x=\"0\" y=\"0.4\" width=\"16\" height=\"0.6\" fill=\"#d3b77b\" opacity=\"0.55\"></rect><rect x=\"6.5\" y=\"0\" width=\"0.7\" height=\"3.6\" fill=\"#64532d\"></rect><rect x=\"1.4\" y=\"2.2\" width=\"4.6\" height=\"0.45\" fill=\"#9c8146\" opacity=\"0.6\"></rect><rect x=\"8.8\" y=\"1.5\" width=\"4.2\" height=\"0.45\" fill=\"#9c8146\" opacity=\"0.5\"></rect><rect x=\"0\" y=\"3.6\" width=\"16\" height=\"0.55\" fill=\"#64532d\"></rect></g><g><rect x=\"0\" y=\"4\" width=\"16\" height=\"3.6\" fill=\"#b89853\"></rect><rect x=\"0\" y=\"4.4\" width=\"16\" height=\"0.6\" fill=\"#d3b77b\" opacity=\"0.55\"></rect><rect x=\"11\" y=\"4\" width=\"0.7\" height=\"3.6\" fill=\"#64532d\"></rect><rect x=\"1.4\" y=\"6.2\" width=\"4.6\" height=\"0.45\" fill=\"#9c8146\" opacity=\"0.6\"></rect><rect x=\"8.8\" y=\"5.5\" width=\"4.2\" height=\"0.45\" fill=\"#9c8146\" opacity=\"0.5\"></rect><rect x=\"0\" y=\"7.6\" width=\"16\" height=\"0.55\" fill=\"#64532d\"></rect></g><g><rect x=\"0\" y=\"8\" width=\"16\" height=\"3.6\" fill=\"#c8a55a\"></rect><rect x=\"0\" y=\"8.4\" width=\"16\" height=\"0.6\" fill=\"#d3b77b\" opacity=\"0.55\"></rect><rect x=\"4\" y=\"8\" width=\"0.7\" height=\"3.6\" fill=\"#64532d\"></rect><rect x=\"1.4\" y=\"10.2\" width=\"4.6\" height=\"0.45\" fill=\"#9c8146\" opacity=\"0.6\"></rect><rect x=\"8.8\" y=\"9.5\" width=\"4.2\" height=\"0.45\" fill=\"#9c8146\" opacity=\"0.5\"></rect><rect x=\"0\" y=\"11.6\" width=\"16\" height=\"0.55\" fill=\"#64532d\"></rect></g><g><rect x=\"0\" y=\"12\" width=\"16\" height=\"3.6\" fill=\"#b89853\"></rect><rect x=\"0\" y=\"12.4\" width=\"16\" height=\"0.6\" fill=\"#d3b77b\" opacity=\"0.55\"></rect><rect x=\"9.5\" y=\"12\" width=\"0.7\" height=\"3.6\" fill=\"#64532d\"></rect><rect x=\"1.4\" y=\"14.2\" width=\"4.6\" height=\"0.45\" fill=\"#9c8146\" opacity=\"0.6\"></rect><rect x=\"8.8\" y=\"13.5\" width=\"4.2\" height=\"0.45\" fill=\"#9c8146\" opacity=\"0.5\"></rect><rect x=\"0\" y=\"15.6\" width=\"16\" height=\"0.55\" fill=\"#64532d\"></rect></g><rect x=\"0\" y=\"0\" width=\"16\" height=\"16\" fill=\"#000000\" opacity=\"0.34\"></rect></g></g><path d=\"M16 3 L29 10.5 L29 22.5 L16 30 L3 22.5 L3 10.5 Z\" fill=\"none\" stroke=\"#000000\" stroke-opacity=\"0.5\" stroke-width=\"0.8\" stroke-linejoin=\"round\"></path><path d=\"M3 10.5 L16 18 L29 10.5 M16 18 L16 30\" fill=\"none\" stroke=\"#000000\" stroke-opacity=\"0.28\" stroke-width=\"0.6\"></path></svg>",
};

const ITEM_ICON_SRC = readFileSync(path.resolve(__dirname, "../ui/ItemIcon.tsx"), "utf8");
const MINIMAP_SRC = readFileSync(path.resolve(__dirname, "../ui/MinimapUI.tsx"), "utf8");

// Every id token cubeFaces/BLOCK_CATEGORIES used to switch/map on before this
// pass — oak (LOG/LEAVES/PLANKS) plus every new species id, so a regression
// back to per-id branching (for any species) fails this test.
const WOOD_ID_TOKENS = [
  "BLOCK_ID.LOG",
  "BLOCK_ID.LEAVES",
  "BLOCK_ID.PLANKS",
  "BLOCK_ID.BIRCH_LOG",
  "BLOCK_ID.BIRCH_LEAVES",
  "BLOCK_ID.BIRCH_PLANKS",
  "BLOCK_ID.SPRUCE_LOG",
  "BLOCK_ID.SPRUCE_LEAVES",
  "BLOCK_ID.SPRUCE_PLANKS",
];

function renderIcon(blockId: number): string {
  return renderToStaticMarkup(React.createElement(ItemIcon, { blockId, size: 44 }));
}

describe("WOOD_PALETTE completeness", () => {
  it("every wood block id resolves a palette entry with string face colors", () => {
    expect(woodBlockIds().length).toBeGreaterThan(0);
    for (const id of woodBlockIds()) {
      const wood = BLOCK_DEFINITIONS[id]?.wood;
      expect(wood).toBeDefined();
      const species = (wood as { species: WoodSpecies; part: WoodPart }).species;
      const part = (wood as { species: WoodSpecies; part: WoodPart }).part;
      const palette = WOOD_PALETTE[species][part];
      for (const value of Object.values(palette)) {
        expect(typeof value).toBe("string");
        expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });
});

describe("ItemIcon oak parity after the cubeFaces wood refactor", () => {
  it("LOG icon markup is byte-identical to the pre-refactor baseline", () => {
    expect(renderIcon(BLOCK_ID.LOG)).toBe(OAK_BASELINE.LOG);
  });

  it("LEAVES icon markup is byte-identical to the pre-refactor baseline", () => {
    expect(renderIcon(BLOCK_ID.LEAVES)).toBe(OAK_BASELINE.LEAVES);
  });

  it("PLANKS icon markup is byte-identical to the pre-refactor baseline", () => {
    expect(renderIcon(BLOCK_ID.PLANKS)).toBe(OAK_BASELINE.PLANKS);
  });
});

describe("ItemIcon birch/spruce icons differ from oak", () => {
  it("birch log/leaves/planks icons render structurally (not flat-tint fallback) and differ from oak", () => {
    expect(renderIcon(BLOCK_ID.BIRCH_LOG)).not.toBe(OAK_BASELINE.LOG);
    expect(renderIcon(BLOCK_ID.BIRCH_LOG)).toContain("<circle");
    expect(renderIcon(BLOCK_ID.BIRCH_LEAVES)).not.toBe(OAK_BASELINE.LEAVES);
    expect(renderIcon(BLOCK_ID.BIRCH_PLANKS)).not.toBe(OAK_BASELINE.PLANKS);
  });

  it("spruce log/leaves/planks icons render structurally (not flat-tint fallback) and differ from oak", () => {
    expect(renderIcon(BLOCK_ID.SPRUCE_LOG)).not.toBe(OAK_BASELINE.LOG);
    expect(renderIcon(BLOCK_ID.SPRUCE_LOG)).toContain("<circle");
    expect(renderIcon(BLOCK_ID.SPRUCE_LEAVES)).not.toBe(OAK_BASELINE.LEAVES);
    expect(renderIcon(BLOCK_ID.SPRUCE_PLANKS)).not.toBe(OAK_BASELINE.PLANKS);
  });

  it("birch and spruce differ from each other too, not just from oak", () => {
    expect(renderIcon(BLOCK_ID.BIRCH_LOG)).not.toBe(renderIcon(BLOCK_ID.SPRUCE_LOG));
    expect(renderIcon(BLOCK_ID.BIRCH_LEAVES)).not.toBe(renderIcon(BLOCK_ID.SPRUCE_LEAVES));
    expect(renderIcon(BLOCK_ID.BIRCH_PLANKS)).not.toBe(renderIcon(BLOCK_ID.SPRUCE_PLANKS));
  });
});

describe("MinimapUI category for wood blocks", () => {
  it.each(woodBlockIds("log"))("log id %i categorizes as Wood", (id) => {
    expect(blockCategory(id)?.name).toBe("Wood");
  });

  it.each(woodBlockIds("planks"))("planks id %i categorizes as Wood", (id) => {
    expect(blockCategory(id)?.name).toBe("Wood");
  });

  it.each(woodBlockIds("leaves"))("leaves id %i categorizes as Leaves", (id) => {
    expect(blockCategory(id)?.name).toBe("Leaves");
  });
});

describe("no per-id wood switch left in the owned UI files", () => {
  it("ItemIcon.tsx has no literal BLOCK_ID.<wood> reference", () => {
    for (const token of WOOD_ID_TOKENS) expect(ITEM_ICON_SRC).not.toContain(token);
  });

  it("MinimapUI.tsx has no literal BLOCK_ID.<wood> reference", () => {
    for (const token of WOOD_ID_TOKENS) expect(MINIMAP_SRC).not.toContain(token);
  });
});
