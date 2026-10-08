// Every tuning number the world and the entities share. GAME.md mirrors these.

export const ROAD_HALF = 9;      // m, road centre to edge line
export const EDGE = 10.2;        // m, road centre to guardrail
export const AHEAD = 300;        // m of world drawn in front of the player
export const BEHIND = 24;        // m of world drawn behind
export const STEP = 3;           // m between ribbon rows

export const LANES = [-6, -2, 2, 6] as const;
export const SAME_LANES = [2, 3] as const;       // indexes into LANES, player's direction
export const ONCOMING_LANES = [0, 1] as const;   // head-on traffic

export const MAX_SPEED = 66;     // m/s, about 238 km/h
export const BOOST_SPEED = 90;   // m/s, about 324 km/h
export const MAX_KMH = 340;      // gauge full scale

export const PAINTS = [
  { name: 'Surf', hex: '#1F5BD6' },
  { name: 'Night', hex: '#0E1B30' },
  { name: 'Sky', hex: '#7FAAF0' },
  { name: 'Sand', hex: '#EBCDB4' },
  { name: 'Foam', hex: '#E6E9EF' },
] as const;

export const TRAFFIC_PAINTS = ['#E6E9EF', '#9AA3B5', '#0E1B30', '#EBCDB4', '#7FAAF0'] as const;

export const POOL = { traffic: 13, pads: 5, coins: 26, obstacles: 9, skids: 44 } as const;

export const BEST_KEY = 'coast-run:best';   // namespaced per project
