# Plumb

Six shapes a day. Adjust each one until it looks right, then see how far that
is from where the maths puts it.

A plumb line finds true by gravity rather than by eye, and plumb centre means
exactly centred. The game is the gap between those two: mathematically correct
is optically wrong, and almost nobody knows the magnitudes.

## The four adjustments

Every target is taken from working practice or derived. A game that grades an
eye has to be able to say where its answer comes from.

- **Size.** A circle needs to be 111% of a square to look the same size, which
  is Material's keyline grid: an 18px square and a 20px circle in one 24px
  frame. Matching the square's area exactly gives 112.8, so the two agree.
- **Centring.** An object takes 45 per cent of the free space above it and 55
  below, from poster and book layout. Measured as the top margin's share, which
  is what the rule actually describes.
- **Stroke weight.** Horizontals read heavier, so type designers cut them 10 to
  20 per cent thinner. The crossbar of an H is lighter than its stems.
- **Centre of mass.** Computed per shape with the shoelace formula, so each one
  carries its own answer rather than a borrowed one.

## Worth knowing

262 distinct shapes across 360 generated sets, with 107 different centre-of-mass
targets between 7 and 17 per cent in both directions, so no single habit works.
Leaving a shape at the mathematical value is always a miss, half-correcting
never passes, and random dragging lands inside the band 12.7 per cent of the
time.

No measurement appears while you adjust. A number on screen turns judging by eye
into counting to a target.

The record tracks direction rather than accuracy, across five buckets from
moving the wrong way to pushing far past. Most people stop short.

Built as a single HTML file with no dependencies and no build step. Everything
stays in the browser.
