const itemClasses = [
  { folder: '1-common', label: 'Common', slug: 'common', order: 1 },
  { folder: '2-uncommon', label: 'Uncommon', slug: 'uncommon', order: 2 },
  { folder: '3-unusual', label: 'Unusual', slug: 'unusual', order: 3 },
  { folder: '4-rare', label: 'Rare', slug: 'rare', order: 4 },
  { folder: '5-epic', label: 'Epic', slug: 'epic', order: 5 },
  { folder: '6-mythic', label: 'Mythic', slug: 'mythic', order: 6 },
  { folder: '7-legendary', label: 'Legendary', slug: 'legendary', order: 7 },
  { folder: '8-relic', label: 'Relic', slug: 'relic', order: 8 }
];

const collections = {
  flora: {
    id: 'flora',
    title: 'Flora',
    singular: 'Flora Item',
    kingdom: 'Flora',
    root: 'content/flora',
    routeRoot: '/flora',
    globalName: 'ASTERIA_FLORA_INDEX',
    legacyOutput: 'js/flora-index.js',
    categories: [
      { slug: 'flowers', label: 'Flowers', defaultItemCategory: 'Flower' },
      { slug: 'herbs', label: 'Herbs', defaultItemCategory: 'Herb' },
      { slug: 'grasses', label: 'Grasses', defaultItemCategory: 'Grass' },
      { slug: 'vines', label: 'Vines', defaultItemCategory: 'Vine' },
      { slug: 'aquatic', label: 'Aquatic', defaultItemCategory: 'Aquatic' },
      { slug: 'fungi', label: 'Fungi', defaultItemCategory: 'Fungus' },
      { slug: 'shrubs', label: 'Shrubs', defaultItemCategory: 'Shrub' },
      { slug: 'trees', label: 'Trees', defaultItemCategory: 'Tree' },
      { slug: 'mosses', label: 'Mosses', defaultItemCategory: 'Moss' }
    ],
    filterLabels: {
      searchPlaceholder: 'Rose, Life, Gardens...',
      habitat: 'Biome / Habitat'
    },
    summaryFields: [
      { key: 'item_class', label: 'Class' },
      { key: 'category', label: 'Category' },
      { key: 'habitats', label: 'Habitats', empty: 'None' },
      { key: 'climate', label: 'Climate', empty: 'Unknown' },
      { key: 'harvest_season', label: 'Season', empty: 'None' },
      { key: 'mana_density', label: 'Mana', empty: 'Unknown' },
      { key: 'toxicity', label: 'Toxicity', empty: 'Unknown' },
      { key: 'market_value', label: 'Market', empty: 'Unknown' }
    ]
  },
  minerals: {
    id: 'minerals',
    title: 'Minerals',
    singular: 'Mineral',
    kingdom: 'Mineral',
    root: 'content/minerals',
    routeRoot: '/minerals',
    globalName: 'ASTERIA_MINERALS_INDEX',
    categories: [
      { slug: 'ores', label: 'Ores', defaultItemCategory: 'Ore' },
      { slug: 'crystals', label: 'Crystals', defaultItemCategory: 'Crystal' },
      { slug: 'gems', label: 'Gems', defaultItemCategory: 'Gem' },
      { slug: 'stones', label: 'Stones', defaultItemCategory: 'Stone' },
      { slug: 'clays', label: 'Clays', defaultItemCategory: 'Clay' },
      { slug: 'salts', label: 'Salts', defaultItemCategory: 'Salt' },
      { slug: 'metals', label: 'Metals', defaultItemCategory: 'Metal' },
      { slug: 'fossils', label: 'Fossils', defaultItemCategory: 'Fossil' },
      { slug: 'arcane', label: 'Arcane Minerals', defaultItemCategory: 'Arcane Mineral' }
    ],
    filterLabels: {
      searchPlaceholder: 'Iron, ore, Earth, forge...',
      habitat: 'Terrain / Source'
    },
    summaryFields: [
      { key: 'item_class', label: 'Class' },
      { key: 'category', label: 'Category' },
      { key: 'deposit_type', label: 'Deposit', empty: 'Unknown' },
      { key: 'habitats', label: 'Sources', empty: 'None' },
      { key: 'hardness', label: 'Hardness', empty: 'Unknown' },
      { key: 'refinement_yield', label: 'Refinement', empty: 'Unknown' },
      { key: 'mana_density', label: 'Mana', empty: 'Unknown' },
      { key: 'market_value', label: 'Market', empty: 'Unknown' }
    ]
  },
  materials: {
    id: 'materials',
    title: 'Materials',
    singular: 'Material',
    kingdom: 'Material',
    root: 'content/materials',
    routeRoot: '/materials',
    globalName: 'ASTERIA_MATERIALS_INDEX',
    categories: [
      { slug: 'metals', label: 'Metals', defaultItemCategory: 'Metal' },
      { slug: 'woods', label: 'Woods', defaultItemCategory: 'Wood' },
      { slug: 'fibres', label: 'Fibres', defaultItemCategory: 'Fibre' },
      { slug: 'leathers', label: 'Leathers', defaultItemCategory: 'Leather' },
      { slug: 'stones', label: 'Stones', defaultItemCategory: 'Stone Material' },
      { slug: 'glass', label: 'Glass', defaultItemCategory: 'Glass' },
      { slug: 'ceramics', label: 'Ceramics', defaultItemCategory: 'Ceramic' },
      { slug: 'alloys', label: 'Alloys', defaultItemCategory: 'Alloy' },
      { slug: 'reagents', label: 'Reagents', defaultItemCategory: 'Reagent' }
    ],
    filterLabels: {
      searchPlaceholder: 'Iron ingot, alloy, forge, smithing...',
      habitat: 'Source / Origin'
    },
    summaryFields: [
      { key: 'item_class', label: 'Class' },
      { key: 'category', label: 'Category' },
      { key: 'material_family', label: 'Family', empty: 'Unknown' },
      { key: 'source_items', label: 'Sources', empty: 'None' },
      { key: 'processing', label: 'Processing', empty: 'Unknown' },
      { key: 'crafting_grade', label: 'Craft Grade', empty: 'Unknown' },
      { key: 'mana_density', label: 'Mana', empty: 'Unknown' },
      { key: 'market_value', label: 'Market', empty: 'Unknown' }
    ]
  }
};

module.exports = {
  itemClasses,
  collections
};
