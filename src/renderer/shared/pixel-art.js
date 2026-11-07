// Pixel art drawn from text grids as SVG: crisp at whole-number scales and colored from CSS variables (see "Pixel
// art" in components.css). In a grid '.' is empty and any other character is a pixel painted with the class
// `pa-<char>`: m (main), l (light), d (dark) and g (ink) take their color from the tier variables of the parent;
// i is the text color.
const SVG_NS = 'http://www.w3.org/2000/svg';

/** The glyphs of the achievement medals: 10 x 10, '#' is ink. The names are the `icon` of the catalog. */
const GLYPHS = {
  pr: [
    '###....#..',
    '#.#...###.',
    '###....#..',
    '.#.....#..',
    '.#.....#..',
    '.#.....#..',
    '.#.....#..',
    '###...###.',
    '#.#...#.#.',
    '###...###.',
  ],
  merge: [
    '###....###',
    '#.#....#.#',
    '###....###',
    '.#.....#..',
    '.#....#...',
    '.##..#....',
    '..####....',
    '.###......',
    '.#.#......',
    '.###......',
  ],
  eye: [
    '..........',
    '...####...',
    '.##....##.',
    '#..####..#',
    '#.######.#',
    '#.######.#',
    '#..####..#',
    '.##....##.',
    '...####...',
    '..........',
  ],
  commit: [
    '..........',
    '...####...',
    '..#....#..',
    '.#......#.',
    '###....###',
    '###....###',
    '.#......#.',
    '..#....#..',
    '...####...',
    '..........',
  ],
  issue: [
    '...####...',
    '..#....#..',
    '.#......#.',
    '#...##...#',
    '#..####..#',
    '#..####..#',
    '#...##...#',
    '.#......#.',
    '..#....#..',
    '...####...',
  ],
  flame: [
    '....#.....',
    '....##....',
    '...###....',
    '..####.#..',
    '..#####.#.',
    '.#######.#',
    '.####.####',
    '.###...###',
    '..##...##.',
    '...#####..',
  ],
  bolt: [
    '......###.',
    '.....###..',
    '....###...',
    '...###....',
    '..#######.',
    '....####..',
    '...###....',
    '..###.....',
    '.###......',
    '.##.......',
  ],
  cycle: [
    '..####....',
    '.#....#.#.',
    '#......###',
    '#.....####',
    '#.........',
    '.........#',
    '####.....#',
    '.###.....#',
    '.#.#....#.',
    '....####..',
  ],
};

/** A trophy cup (for the tiers): 14 x 13. */
const CUP = [
  '...gggggggg...',
  '.gggllmmmdggg.',
  'g..gllmmmdg..g',
  'g..gllmmmdg..g',
  '.gg.gmmmmg.gg.',
  '....gmmmmg....',
  '.....gmmg.....',
  '......gg......',
  '......gg......',
  '......gg......',
  '....ggmmgg....',
  '...gllmmddg...',
  '...gggggggg...',
];

/** A padlock: 7 x 8. */
const LOCK = ['..ggg..', '.g...g.', '.g...g.', 'ggggggg', 'gmmmmmg', 'gmmgmmg', 'gmmgmmg', 'ggggggg'];

/** A 5 x 7 bitmap font: digits and the slash. */
const FONT = {
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
};

const MEDAL_SIZE = 20;

/** The names of the glyphs that exist. */
const GLYPH_NAMES = Object.keys(GLYPHS);

/** SVG path data per pixel character: one subpath per horizontal run, so a sprite is a handful of paths. */
function pixelPaths(rows) {
  const paths = {};
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const char = row[x];
      if (char === '.') {
        x++;
        continue;
      }
      let end = x;
      while (end < row.length && row[end] === char) end++;
      (paths[char] ??= []).push(`M${x} ${y}h${end - x}v1h-${end - x}z`);
      x = end;
    }
  });
  return Object.fromEntries(Object.entries(paths).map(([char, parts]) => [char, parts.join('')]));
}

/** An SVG of the grid, `scale` screen pixels per grid pixel. */
function pixelSvg(rows, scale) {
  const width = Math.max(...rows.map((row) => row.length));
  const svg = document.createElementNS(SVG_NS, 'svg');
  const attributes = {
    class: 'pa',
    viewBox: `0 0 ${width} ${rows.length}`,
    width: width * scale,
    height: rows.length * scale,
    'shape-rendering': 'crispEdges',
    'aria-hidden': 'true',
  };
  for (const [name, value] of Object.entries(attributes)) svg.setAttribute(name, value);
  for (const [char, d] of Object.entries(pixelPaths(rows))) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', `pa-${char}`);
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/**
 * The medal grid: a bevelled coin (dark outline, light rim on the upper left, dark rim on the lower right) with the
 * glyph in ink at its center.
 */
function medalRows(name) {
  const glyph = GLYPHS[name] ?? GLYPHS.issue;
  const radius = MEDAL_SIZE / 2;
  const inside = (x, y) =>
    x >= 0 &&
    y >= 0 &&
    x < MEDAL_SIZE &&
    y < MEDAL_SIZE &&
    (x + 0.5 - radius) ** 2 + (y + 0.5 - radius) ** 2 <= radius ** 2;
  const NEIGHBORS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const isEdge = (x, y) => inside(x, y) && NEIGHBORS.some(([dx, dy]) => !inside(x + dx, y + dy));
  const rows = Array.from({ length: MEDAL_SIZE }, (_, y) =>
    Array.from({ length: MEDAL_SIZE }, (_, x) => {
      if (!inside(x, y)) return '.';
      if (isEdge(x, y)) return 'g';
      if (NEIGHBORS.some(([dx, dy]) => isEdge(x + dx, y + dy))) return x + y < MEDAL_SIZE - 1 ? 'l' : 'd';
      return 'm';
    }),
  );
  const offset = (MEDAL_SIZE - glyph.length) / 2;
  glyph.forEach((row, y) => {
    [...row].forEach((char, x) => {
      if (char === '#') rows[offset + y][offset + x] = 'g';
    });
  });
  return rows.map((row) => row.join(''));
}

/** The grid of a text in the bitmap font (digits and '/'), one column apart. */
function digitRows(text) {
  const glyphs = [...String(text)].map((char) => FONT[char] ?? FONT['0']);
  return Array.from({ length: 7 }, (_, y) => glyphs.map((glyph) => glyph[y].replaceAll('#', 'i')).join('.'));
}

/** A tier medal with the glyph `name`: 20 x 20 grid pixels. */
const medal = (name, scale = 3) => pixelSvg(medalRows(name), scale);
/** A trophy cup. */
const cup = (scale = 2) => pixelSvg(CUP, scale);
/** A padlock. */
const lock = (scale = 2) => pixelSvg(LOCK, scale);
/** Digits and slashes in the bitmap font, in the text color. */
const digits = (text, scale = 4) => pixelSvg(digitRows(text), scale);

export { GLYPH_NAMES, MEDAL_SIZE, pixelPaths, medalRows, digitRows, medal, cup, lock, digits };
