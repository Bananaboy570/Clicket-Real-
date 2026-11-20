export type Rarity = 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Chroma' | 'Mystic';

export interface BlookItem {
  id: string;
  name: string;
  rarity: Rarity;
  chance: number; // Exact percentage shown in PNG
  chanceLabel: string; // e.g., "17%", "8%", "3%", "0.3%", "0.05%", "0.03%", "0.002%"
  sellPrice: number;
  packId: string;
}

export interface PackInfo {
  id: string;
  name: string;
  price: number;
  bgColor: string;
  borderColor: string;
  blooks: BlookItem[];
}

export const RARITY_COLORS: Record<Rarity, string> = {
  Uncommon: '#4bc22e', // Lime green
  Rare: '#0a5cf5',     // Vibrant blue
  Epic: '#be0000',     // Crimson red
  Legendary: '#ff910f',// Orange
  Chroma: '#00ccff',   // Cyan
  Mystic: '#9900ff',   // Purple
};

export const CIRCUS_BLOOKS: BlookItem[] = [
  {
    id: 'tightrope-walker',
    name: 'Tightrope Walker',
    rarity: 'Uncommon',
    chance: 17,
    chanceLabel: '17%',
    sellPrice: 5,
    packId: 'circus',
  },
  {
    id: 'jester',
    name: 'Jester',
    rarity: 'Uncommon',
    chance: 17,
    chanceLabel: '17%',
    sellPrice: 5,
    packId: 'circus',
  },
  {
    id: 'magician',
    name: 'Magician',
    rarity: 'Uncommon',
    chance: 17,
    chanceLabel: '17%',
    sellPrice: 5,
    packId: 'circus',
  },
  {
    id: 'top-hat',
    name: 'Top Hat',
    rarity: 'Uncommon',
    chance: 17,
    chanceLabel: '17%',
    sellPrice: 5,
    packId: 'circus',
  },
  {
    id: 'popcorn',
    name: 'Popcorn',
    rarity: 'Uncommon',
    chance: 17,
    chanceLabel: '17%',
    sellPrice: 5,
    packId: 'circus',
  },
  {
    id: 'cotton-candy',
    name: 'Cotton Candy',
    rarity: 'Rare',
    chance: 8,
    chanceLabel: '8%',
    sellPrice: 20,
    packId: 'circus',
  },
  {
    id: 'unicycler',
    name: 'Unicycler',
    rarity: 'Rare',
    chance: 8,
    chanceLabel: '8%',
    sellPrice: 20,
    packId: 'circus',
  },
  {
    id: 'canon-ball',
    name: 'Canon Ball',
    rarity: 'Rare',
    chance: 8,
    chanceLabel: '8%',
    sellPrice: 20,
    packId: 'circus',
  },
  {
    id: 'magic-wand',
    name: 'Magic Wand',
    rarity: 'Epic',
    chance: 3,
    chanceLabel: '3%',
    sellPrice: 75,
    packId: 'circus',
  },
  {
    id: 'tent',
    name: 'Tent',
    rarity: 'Epic',
    chance: 3,
    chanceLabel: '3%',
    sellPrice: 75,
    packId: 'circus',
  },
  {
    id: 'circus-ball',
    name: 'Circus Ball',
    rarity: 'Legendary',
    chance: 0.3,
    chanceLabel: '0.3%',
    sellPrice: 200,
    packId: 'circus',
  },
  {
    id: 'circus-elephant',
    name: 'Circus Elephant',
    rarity: 'Chroma',
    chance: 0.05,
    chanceLabel: '0.05%',
    sellPrice: 300,
    packId: 'circus',
  },
  {
    id: 'ring-lion',
    name: 'Ring Lion',
    rarity: 'Chroma',
    chance: 0.03,
    chanceLabel: '0.03%',
    sellPrice: 350,
    packId: 'circus',
  },
  {
    id: 'fire-guy',
    name: 'Fire Guy',
    rarity: 'Chroma',
    chance: 0.03,
    chanceLabel: '0.03%',
    sellPrice: 350,
    packId: 'circus',
  },
  {
    id: 'the-golden-ticket',
    name: 'The Golden Ticket',
    rarity: 'Mystic',
    chance: 0.002,
    chanceLabel: '0.002%',
    sellPrice: 1000,
    packId: 'circus',
  },
];

export const CIRCUS_PACK: PackInfo = {
  id: 'circus',
  name: 'Circus Pack',
  price: 20,
  bgColor: '#7b1113',
  borderColor: '#a31b1e',
  blooks: CIRCUS_BLOOKS,
};

// ONLY CIRCUS PACK!
export const MARKET_PACKS: PackInfo[] = [CIRCUS_PACK];

export function rollBlookFromPack(pack: PackInfo, luckMultiplier: number = 1): BlookItem {
  const items = pack.blooks;
  const weights = items.map((item) => {
    if (luckMultiplier > 1 && item.rarity !== 'Uncommon') {
      return item.chance * luckMultiplier;
    }
    return item.chance;
  });

  const totalWeight = weights.reduce((acc, w) => acc + w, 0);
  let random = Math.random() * totalWeight;

  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      return items[i];
    }
  }
  return items[0];
}
