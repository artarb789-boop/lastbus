# Art brief: "Last Bus" (image-generating agent)

You draw sprites for a small indie game. You have no access to the code. You get **one asset prompt at a time**, generate it by these rules, and return a PNG.

## The game
Post-apocalyptic desert. The last city bus carries passengers from stop to stop. Rival buses attack it on the road: raiders, rival carriers, rammers, and the Prison Bus boss. Combat is shown **from the side**, with two buses driving in parallel and shooting, like FTL.
**Mood:** a warm yellow bus with glowing windows is the last island of life in a cold, rusty, sun-bleached world. It is a sad, slightly cozy road movie, not grimdark: sunset, dust, guns welded from pipes.
No real brands, logos, text, or characters from other games or films.

## Style (match the approved yellow city bus)
- Detailed retro pixel art, like a 16-bit game sprite.
- Crisp 1-pixel dark outline `#14161b` around the object.
- Flat cel shading: 2–3 tones per material and small bright highlights. No gradients, blur, or photo realism.
- Worn and dusty. Warm sunset light from the top-left.
- Vehicles: strict side view, **facing right**, no perspective, wheels on the bottom edge.
- Player buses: windows glow warm, **no weapons drawn** (the game attaches weapons). Enemy buses: dark windows, weapons drawn in.
- Readability first: the object must be recognizable when shrunk to its target size.

Shared palette for metal, glass, fire and shadows: `#14161b` outline · `#2b2f37` tires · `#3a3f4a` dark metal · `#5c6370` metal · `#8a8f99` light metal · `#c9c1b0` rivets · `#22344a` dark glass · `#f6d68b` warm window · `#fff1c4` glint · `#ffd34d` headlight · `#d9423b` tail light · `#ff8a2b` fire.

## Technical rules
1. **Transparent background.** The object alone, centered, whole in frame with a small margin. No ground, cast shadow, scenery, text, or watermark. Exception: event illustrations and the sky layer are full scenes.
2. **Generate large** (at least 8× the target), but **keep the target proportions**: the image will be shrunk to exactly the target pixels.
3. **File name** exactly as given: `<category>/<id>_src.png`.
4. Return the **prompt you used** with each image.
5. Never invent new ids. If something is unclear, ask.

## Asset list (id → target px)
**Player buses** `buses/`: `bus_city` 60×24 (mustard-yellow 1970s city bus), `bus_shuttle` 46×24 (short yellow minibus), `bus_armored` 64×24 (khaki shift bus on a truck chassis, lower armor).
**Enemy buses** `buses/`:
- `enemy_raider_minibus` 44×24: rusty red, roof MG
- `enemy_raider_sawnoff` 48×24: rustier brown, sawn-offs out of the windows
- `enemy_rival_carrier` 60×24: clean blue coach, lower armor, roof MG
- `enemy_rammer` 54×24: brown, welded wedge ram
- `enemy_siphoners` 52×24: dull green, roof fuel barrel, flamethrower
- `enemy_nemesis` 60×24: black with a purple stripe and skull, armor, MG
- `enemy_boss_prison_bus` 80×28: long steel-grey prison bus, bars, rockets, searchlight

Optional: `<id>_wreck` for each enemy, same size.
**Weapons on the bus** `weapons/` 16×10, facing right, on the bottom edge: `wpn_mg`, `wpn_shotgun`, `wpn_harpoon`, `wpn_flamer`, `wpn_rockets`, `wpn_oil`, `wpn_ram`, `wpn_spikes`. Home-made from pipes, welds, wire and tape.
**Item icons** `items/` 24×24, front view: the same 8 weapons, plus `arm_plate_light`, `arm_plate_heavy`, `mod_big_tank`, `mod_tuned_engine`, `mod_medbay`.
**People:**
- `people/passenger_base` 7×9: a seated figure facing right, using EXACTLY three greys: hair `#404040`, clothes `#808080`, skin `#c0c0c0`.
- `people/passenger_wounded` 7×9: the same figure with a white head bandage `#f2efe6`.
- `drivers/` 32×32 portraits facing right: `drv_trucker` (moustache, cap, plaid shirt), `drv_racer` (young, goggles, striped jacket), `drv_guard` (buzz cut, scar, bulletproof vest).

**Map icons** `map/` 16×16: `start`, `village`, `garage`, `junkyard`, `checkpoint`, `special`, `encounter`, `incident`, `boss`.
**Resource icons** `resources/` 12×12: `fuel`, `food`, `parts`, `ammo`, `medkits`, `tokens`. They must differ by silhouette.
**Shop signs** `shops/` 64×32, no letters: `kiosk`, `gunsmith`, `mechanic`, `pharmacy`, `fleamarket`.
**Combat background** `scene/` 334×70, **seamlessly tileable horizontally**: `sky` (full sunset sky), and `dunes_far`, `dunes_near`, `road` (transparent above the content).
**Event illustrations** `events/` 160×90: full scenes with no text, 30 of them. Each comes with its own prompt.

## Order
First, style approval: `bus_city`, `enemy_raider_minibus`, `enemy_boss_prison_bus`, `wpn_mg`, `passenger_base`, `drv_trucker`. Wait for the OK.
Then: the remaining buses, weapons, people, item icons, map and resource icons, shop signs, background, events, and finally wrecks.

## Self-check
- [ ] Transparent background (except scenes), nothing else in the image.
- [ ] Target proportions are kept.
- [ ] Facing right, wheels on the bottom edge, no weapons on player buses.
- [ ] Dark outline, flat shading, palette colors.
- [ ] Still readable when downscaled to the target size.
- [ ] No text or logos. The file name is exact and the prompt is attached.
