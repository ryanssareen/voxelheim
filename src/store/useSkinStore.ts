import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SkinColors {
  skinColor: number;
  hairColor: number;
  shirtColor: number;
  pantsColor: number;
  shoeColor: number;
}

const DEFAULT_SKIN: SkinColors = {
  skinColor: 0xc8a882,
  hairColor: 0x3a2a1a,
  shirtColor: 0x4a90d9,
  pantsColor: 0x3b3b6e,
  shoeColor: 0x4a4a4a,
};

export const SKIN_PRESETS: Record<string, SkinColors> = {
  Steve: { ...DEFAULT_SKIN },
  Alex: { skinColor: 0xc8a882, hairColor: 0xc4773a, shirtColor: 0x5a9a3a, pantsColor: 0x6b5b3a, shoeColor: 0x4a3a2a },
  Knight: { skinColor: 0xc8a882, hairColor: 0x222222, shirtColor: 0x8a8a8a, pantsColor: 0x555555, shoeColor: 0x333333 },
  Farmer: { skinColor: 0xd4a574, hairColor: 0xd4a830, shirtColor: 0x5d8a3e, pantsColor: 0x6b5534, shoeColor: 0x5a3a2a },
  Pirate: { skinColor: 0xc8a882, hairColor: 0x1a1a1a, shirtColor: 0x8a2020, pantsColor: 0x2a2a2a, shoeColor: 0x3a2a1a },
  Royal: { skinColor: 0xc8a882, hairColor: 0x3a2a1a, shirtColor: 0x6a2fa0, pantsColor: 0xd4a520, shoeColor: 0x3a2a1a },
  Arctic: { skinColor: 0xe8d8c8, hairColor: 0xd0d0d0, shirtColor: 0x8ab4d8, pantsColor: 0xa0c8e0, shoeColor: 0x6a8a9a },
  Lumberjack: { skinColor: 0xc8a882, hairColor: 0x8a4a2a, shirtColor: 0xaa3030, pantsColor: 0x4a6a9a, shoeColor: 0x5a3a2a },
};

interface SkinState extends SkinColors {
  setSkinColors: (colors: Partial<SkinColors>) => void;
  resetSkin: () => void;
}

export const useSkinStore = create<SkinState>()(
  persist(
    (set) => ({
      ...DEFAULT_SKIN,
      setSkinColors: (colors) => set(colors),
      resetSkin: () => set(DEFAULT_SKIN),
    }),
    { name: "voxelheim-skin" }
  )
);
