import type { WoodSpecies } from "@data/blocks";

/**
 * Face colours a log's inventory-icon cube needs: `bark` is the side (trunk)
 * fill, `endGrain` is the top (cut-face) fill, and `streak` is the accent
 * used for the bark texture's lighter grain lines.
 */
export interface LogPalette {
  bark: string;
  endGrain: string;
  streak: string;
}

/**
 * Face colours a planks icon needs: `board` is the fill and `seam` is the
 * accent used for the butt joints and board seams.
 */
export interface PlanksPalette {
  board: string;
  seam: string;
}

/**
 * Colours a leaves icon's clump texture needs: `base` is the primary clump
 * tone, `dark` and `light` are secondary clump tones mixed in alongside it.
 */
export interface LeavesPalette {
  base: string;
  dark: string;
  light: string;
}

/** Per-species face palette, keyed by wood part. */
export interface WoodPartPalette {
  log: LogPalette;
  planks: PlanksPalette;
  leaves: LeavesPalette;
}

/**
 * Face colours for every species/part combination, consumed by
 * `ItemIcon.cubeFaces` so the inventory icon for a wood block is resolved
 * from `BlockDefinition.wood` instead of a per-id switch. Oak's values
 * reproduce the icon's pre-existing hardcoded colors exactly (including the
 * darken/lighten-derived accents), so oak's rendered SVG is unchanged.
 */
export const WOOD_PALETTE: Record<WoodSpecies, WoodPartPalette> = {
  oak: {
    log: { bark: "#5D4037", endGrain: "#D7CCC8", streak: "#7d665f" },
    planks: { board: "#c8a55a", seam: "#64532d" },
    leaves: { base: "#2E7D32", dark: "#27692a", light: "#609c63" },
  },
  birch: {
    log: { bark: "#d7cbb0", endGrain: "#e5ddcc", streak: "#a19884" },
    planks: { board: "#d8c9a3", seam: "#6c6552" },
    leaves: { base: "#6fa84f", dark: "#5d8d42", light: "#92bd79" },
  },
  spruce: {
    log: { bark: "#4a3423", endGrain: "#897b70", streak: "#6e5d4f" },
    planks: { board: "#7a5a3a", seam: "#3d2d1d" },
    leaves: { base: "#1f4d2b", dark: "#1a4124", light: "#55785e" },
  },
};
