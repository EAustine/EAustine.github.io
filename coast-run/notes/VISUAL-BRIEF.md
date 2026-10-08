# Visual brief: Coast run scenery

Written before the scenery was built and updated with what was measured
afterwards. Every number here is a named constant in `src/world/` or
`src/car/`. Lengths are metres, Y is up, the road runs toward -z, and lateral
positions are measured from the road centre line (negative is the sea side).

## 1. Target

| Field | Value |
|---|---|
| Goal | Browser game scenery, desktop and phone |
| Route | Three.js, procedural, no model or texture files |
| Art direction | Low-poly forms with flat facets, physical light, Coast run palette |
| Tone mapping | Khronos PBR Neutral, exposure 0.8, so paint matches its swatch |
| Draw-call budget | 150 per frame |
| Triangle budget | 300,000 per frame |
| Texture budget | procedural only, none larger than 1024 px |
| Shadows | one light, one map, 2048 px desktop and 1024 px touch |
| Post-processing | none |

## 2. Scale plan

| Feature | Size | Position | Source |
|---|---|---|---|
| Road | 18 wide | centre 0, y = 0 | handoff |
| Shoulders | 6.2 wide each | to ±15.2 | handoff |
| W-beam rail | 0.31 tall, top at 0.77 | ±10.2 | real W-beam section |
| Rail posts | 0.10 × 0.72 × 0.14 | every 4 along both rails | real spacing is 1.9 to 3.8 |
| Marker posts | 0.14 × 1.0, blue cap | ±11.3, every 26 | handoff |
| Bluff lip | starts 2.5 to 5 beyond the shoulder | sea side | est. |
| Beach | reaches sea level about 22 beyond the shoulder | sea side | est. |
| Sea level | y = -4.5 | everything left of the beach | est. |
| Cut bank | 1.2 to 5.8 high | 4 to 17 beyond the shoulder, inland | est. |
| Hillside | up to about 56 high | from 14 to 170 beyond the shoulder | est. |
| Palm | 8.0 tall at scale 1 (6.2 to 10.2 placed), trunk radius 0.24 to 0.14, nine fronds of 3.4 | 6 to 12 beyond the rail inland, 6 to 7.6 on the sea side | real palms run 6 to 15 |
| Rock | radius 0.3 to 1.95 | verge and lower hillside | est. |
| Scrub | radius 0.45 to 1.55 | verge to 60 inland | est. |
| Car, for scale | 4.6 × 2.24 × 1.24 | lanes at ±2 and ±6 | handoff |

## 3. Light

| Item | Value |
|---|---|
| Sun direction | 30° above the horizon, 60° left of the road (over the sea) |
| Sun | colour `#FFE7C8`, intensity 7.5 |
| Sky fill | the baked sky as environment, intensity 0.75 |
| Ratio | direct sun about four times the sky fill on level ground |
| Fog | linear, 120 to 285, colour `#DCE6F6` (the sky's horizon) |
| Shadow frustum | 60 × 60 around the player, bias -0.0004, normal bias 0.04 |

Sky palette: zenith `#4F86E8`, mid `#9DC0F8`, horizon `#DCE6F6`, warm glow
`#FFD9C7` (peach), far ridges `#B9CBEA` and `#9FB3D6`.

Ground palette: sand `#DED3B8`, dry grass `#B3B287`, scrub `#8C9A6E`, rock
`#A69A88` and `#8A8072`, beach `#E8DEC6`, wet sand `#C4B89E`, sea `#2E63C4`,
palm frond `#5E8E4F`, palm trunk `#8B7B68`.

## 4. Relationships that must hold

- Nothing visual reads `Math.random`; a run plays out the same with the scenery on or off.
- The terrain's inner edge tucks under the shoulder, so no gap shows at ±15.2.
- Props are planted at the terrain height under them, sunk slightly so none float.
- Sea-side palms stand between the rail and the bluff lip and never overhang the road edge line.
- Fog and the sky's horizon are the same colour, so the far road melts into the sky.
- The car's paint on screen matches the swatch on the start panel.
- Traffic, coins, cones, barriers and boost pads stay readable against the road in both sun and shadow.

## 5. Build order

1. Light: sky, sun direction, sun-to-sky ratio, tone mapping.
2. Large forms: hillside, bluff, beach, sea.
3. Road surface and guardrail.
4. Props: palms, rocks, scrub, rail posts.
5. Car materials and moving parts.
6. Pickups and hazards, checked for legibility.

## 6. Gates and results

| Gate | Result |
|---|---|
| Gameplay parity with the prototype (same seed, same inputs) | pass: three crash-out runs and three 200 s runs, state identical |
| Draw calls, all 13 traffic cars on screen | 102 (budget 150) |
| Triangles | about 155,000 (budget 300,000) |
| Textures | 8 |
| Script per frame, whole tick without the draw | 0.96 ms, of which terrain 0.12 and props 0.16 |
| Rendered frames looked at | top speed, low speed, menu turntable, staged frame with every entity, portrait touch, viewer |
| Quality fallback | steps at frames 150, 210, 270, 330 and 390 when fed 33 fps timestamps; no steps at 60 fps; a real frame drew cleanly in the final state |
| Type-check, strict | pass |

## 7. Not verified

- Frame time on a real GPU, desktop or phone. The only timing available was a
  software renderer: 2.6 s per frame against the prototype's 0.56 s, with
  image-based lighting the largest share.
- The sky bake's start-up cost on a phone. It is 512 px per face there and
  1024 px on desktop.
- The look on a real phone screen in daylight.
