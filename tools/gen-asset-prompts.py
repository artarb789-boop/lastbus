"""
Generates assets/ASSET-PROMPTS.en.md: one self-contained English prompt per asset for an
image-generating agent that only works with a single asset description at a time.
Asset ids and sizes mirror game/art/catalog.ts; colors mirror game/art/palette.ts.

    python tools/gen-asset-prompts.py
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

STYLE = (
    "Style: detailed retro pixel art like a 16-bit game sprite, crisp 1-pixel dark outline (#14161b) around the whole object, "
    "flat cel shading with 2-3 tones per material and small bright highlights, worn and dusty, warm sunset light from the top-left, "
    "post-apocalyptic desert setting with improvised welded scrap. "
    "Transparent background, the object alone and centered, whole object in frame with a small margin, "
    "no ground, no cast shadow, no scenery, no text, no logos, no watermark."
)
SIDE = "Strict side view, facing right (front of the vehicle on the right side of the image), no perspective."
ICON = "Front view game icon, bold readable silhouette that is recognizable at a tiny size."

def ratio(w, h):
    return f"Proportions: about {w}:{h} (width to height); the image will be shrunk to {w}x{h} pixels, so keep shapes bold and simple."

ASSETS = []  # (section, path, title, subject, extra)

def add(section, path, title, subject, w, h, extra=""):
    ASSETS.append((section, path, title, subject, w, h, extra))

# ---------- Buses ----------
BUS = "Player buses: all windows glow warm yellow-orange from inside. Wheels touch the bottom edge. Draw the bus WITHOUT any weapons on it."
add("Buses (player)", "buses/bus_city", "City bus (player)",
    "A 1970s Eastern European city bus, mustard-yellow body (#d99a2b) with an ochre stripe (#8c5a14) and light yellow roof (#e8b44f), "
    "slightly worn but cared for, two passenger doors, a row of large windows glowing warm, round headlights, tail lights",
    60, 24, SIDE + " " + BUS)
add("Buses (player)", "buses/bus_shuttle", "Minibus (player)",
    "A short boxy minibus (marshrutka), bright yellow body (#e8b13a) with an orange-brown stripe (#a8601c) and pale yellow roof (#f2c862), "
    "one sliding door, small windows glowing warm, light and nimble look",
    46, 24, SIDE + " " + BUS)
add("Buses (player)", "buses/bus_armored", "Shift bus on a truck chassis (player)",
    "A tall shift-worker bus built on a heavy truck chassis, mustard-khaki body (#a8923c) with a dark olive stripe (#5e5222) and light khaki roof (#c2ad5a), "
    "high ground clearance, big off-road wheels, riveted armor plates along the lower body, small windows glowing warm, sturdy and heavy look",
    64, 24, SIDE + " " + BUS)

ENEMY = "Enemy bus: windows are dark (unlit). Its weapons are part of the drawing. Wheels touch the bottom edge."
add("Buses (enemies)", "buses/enemy_raider_minibus", "Raider minibus",
    "A short rusty minibus of road raiders, red body (#a63a32) with a dark red stripe (#5e1f1b) and red roof (#c4544a), rust patches, "
    "a home-made machine gun on a tripod on the roof", 44, 24, SIDE + " " + ENEMY)
add("Buses (enemies)", "buses/enemy_raider_sawnoff", "Raiders with sawn-off shotguns",
    "A very rusty brown minibus (#8e4a2c body, #4a2414 stripe, #a85d38 roof), broken windows, sawn-off shotgun barrels sticking out of the windows",
    48, 24, SIDE + " " + ENEMY)
add("Buses (enemies)", "buses/enemy_rival_carrier", "Rival carrier bus",
    "A clean blue intercity coach of a rival transport company (#3e6d9c body, #1f3b57 stripe, #5b8cc0 roof), riveted armor plates along the bottom, "
    "a made-up company emblem on the side (a simple shape, no letters), a machine gun on the roof", 60, 24, SIDE + " " + ENEMY)
add("Buses (enemies)", "buses/enemy_rammer", "Rammer",
    "A heavy brown bus (#8a5a3c body, #4c2f1d stripe, #a4704c roof) with a big welded wedge-shaped ram made of rails on the front, "
    "spikes on the bumper, armor plates, menacing", 54, 24, SIDE + " " + ENEMY)
add("Buses (enemies)", "buses/enemy_siphoners", "Siphoners",
    "A dull green bus (#5d7d3a body, #2f441b stripe, #77994d roof) of fuel thieves: a big fuel barrel and hoses on the roof, "
    "jerry cans tied to the side, a flamethrower nozzle on the side", 52, 24, SIDE + " " + ENEMY)
add("Buses (enemies)", "buses/enemy_nemesis", "Nemesis",
    "A black armored bus (#2a2a33 body, #3a3a46 roof) with a purple stripe (#7a3fa0), a white painted skull on the side, armor plates, "
    "a machine gun on the roof; looks like a personal arch-enemy, the most sinister of the regular enemies", 60, 24, SIDE + " " + ENEMY)
add("Buses (enemies)", "buses/enemy_boss_prison_bus", "Boss: Prison Bus",
    "A long steel-grey prison bus (#6c7a86 body, #8996a2 roof) with an orange warning stripe (#d9772b), metal bars over every window, "
    "a rocket launcher box and a searchlight on the roof, a heavy push-bar ram on the front; the biggest bus in the game", 80, 28, SIDE + " " + ENEMY)
for eid, name in [("enemy_raider_minibus", "raider minibus"), ("enemy_raider_sawnoff", "sawn-off raiders' minibus"),
                  ("enemy_rival_carrier", "rival carrier coach"), ("enemy_rammer", "rammer bus"), ("enemy_siphoners", "siphoners' bus"),
                  ("enemy_nemesis", "nemesis black bus"), ("enemy_boss_prison_bus", "prison bus")]:
    src = next(a for a in ASSETS if a[1] == f"buses/{eid}")
    add("Buses (wrecks, optional)", f"buses/{eid}_wreck", f"Wrecked {name}",
        f"The same {name} as described here, but wrecked after a fight: shattered windows, torn and bent armor plates, burnt scorch marks, "
        f"one hanging door, broken weapons. Original look for reference: {src[3]}", src[4], src[5], SIDE + " Wheels touch the bottom edge.")

# ---------- Weapons mounted on the bus ----------
MOUNT = "This sprite is mounted on the side or roof of a bus: the weapon faces right and sits on the bottom edge of the image (its mount point is the middle of the bottom edge)."
W = [
    ("wpn_mg", "Machine gun", "A home-made machine gun on a small tripod: dark metal body, short barrel with a ventilated cooling jacket, ammo belt"),
    ("wpn_shotgun", "Shotgun in the window", "A double-barrel shotgun with a wooden stock, tied to a bracket with wire, barrels pointing right"),
    ("wpn_harpoon", "Harpoon launcher", "A welded harpoon launcher on a swivel mount with a barbed harpoon loaded and a coil of rope"),
    ("wpn_flamer", "Flamethrower", "A red gas cylinder connected by a hose to a metal nozzle pointing right, with a small blue-orange pilot flame at the tip"),
    ("wpn_rockets", "Rocket launcher", "A box launcher made of 4-6 steel pipes on a stand, red rocket tips visible at the right ends"),
    ("wpn_oil", "Oil barrels", "Two dark oil barrels on a welded bracket with a drain valve and a dripping spout"),
    ("wpn_ram", "Ram", "A welded wedge-shaped ram made of old rails and steel plates with rivets, pointing right"),
    ("wpn_spikes", "Spikes", "A bumper bar with sharp welded steel spikes pointing right"),
]
for wid, name, desc in W:
    add("Weapons on the bus", f"weapons/{wid}", name, desc + ". Everything is improvised: pipes, welds, wire, duct tape", 16, 10, SIDE + " " + MOUNT)

# ---------- Item icons ----------
for wid, name, desc in W:
    add("Item icons", f"items/{wid}", f"{name} (icon)", desc, 24, 24, ICON)
for iid, name, desc in [
    ("arm_plate_light", "Light armor plate", "A thin steel armor plate with a row of rivets and scratches"),
    ("arm_plate_heavy", "Heavy armor plate", "A thick steel armor plate with a double row of rivets and dents from bullets"),
    ("mod_big_tank", "Big fuel tank", "An extra fuel tank strapped with metal bands, with a filler cap"),
    ("mod_tuned_engine", "Tuned engine", "A polished engine block with shiny parts and a new air filter"),
    ("mod_medbay", "Medic's cot", "A folding cot with a white pillow and a red cross first-aid box"),
]:
    add("Item icons", f"items/{iid}", name, desc, 24, 24, ICON)

# ---------- People ----------
add("People", "people/passenger_base", "Passenger (grey base for recoloring)",
    "A small seated person seen from the side, facing right, sitting upright. Use EXACTLY three flat greys for recoloring: "
    "hair #404040, clothes #808080, skin #c0c0c0; trousers dark #3a3f4a, outline #14161b. No other colors",
    7, 9, "Very small sprite: keep it extremely simple, readable silhouette of head, torso and legs.")
add("People", "people/passenger_wounded", "Passenger, wounded",
    "The same small seated person as the grey base (hair #404040, clothes #808080, skin #c0c0c0, trousers #3a3f4a), "
    "with a white bandage #f2efe6 wrapped around the head and a small red spot",
    7, 9, "Very small sprite: keep it extremely simple.")
for did, name, desc in [
    ("drv_trucker", "Driver: trucker", "a sturdy middle-aged trucker with a thick moustache, a worn cap and a plaid shirt, calm confident look"),
    ("drv_racer", "Driver: racer", "a young cocky racer with goggles pushed up on the forehead and a striped racing jacket, smirking"),
    ("drv_guard", "Driver: ex armored-car guard", "a stern former armored-car guard with a buzz cut, a scar on the cheek, a bulletproof vest over a uniform"),
]:
    add("Drivers", f"drivers/{did}", name, f"Portrait (head and chest) of {desc}, looking to the right, warm light", 32, 32, "")

# ---------- Map icons ----------
for mid, desc in [
    ("start", "a bus stop sign post with a small flag (start of the route)"),
    ("village", "a small village of two houses with roofs"),
    ("garage", "a wrench crossed with a screwdriver over a garage door"),
    ("junkyard", "a pile of scrap: a tire, a bent pipe and metal sheets"),
    ("checkpoint", "a striped road barrier with a small guard booth"),
    ("special", "a star-shaped glowing landmark sign (a unique place)"),
    ("encounter", "two crossed swords made of wrenches (an enemy fight)"),
    ("incident", "a warning triangle with an exclamation mark (a road event)"),
    ("boss", "a skull with a prison-bar pattern (the region boss)"),
]:
    add("Map icons", f"map/{mid}", mid, desc, 16, 16, ICON)

# ---------- Resource icons ----------
for rid, desc in [
    ("fuel", "a red metal jerry can"),
    ("food", "two tin cans of food, one opened"),
    ("parts", "a hex nut and a bolt"),
    ("ammo", "three brass cartridges standing together"),
    ("medkits", "a white first-aid kit with a red cross"),
    ("tokens", "a worn round metal token coin with a bus symbol"),
]:
    add("Resource icons", f"resources/{rid}", rid, desc, 12, 12, ICON + " Icons of different resources must differ by silhouette, not only by color.")

# ---------- Shop signs ----------
for sid, desc in [
    ("kiosk", "a roadside kiosk sign made of a painted board with a bottle and a can drawn on it"),
    ("gunsmith", "a gunsmith's sign: a crossed rifle and wrench on a metal plate"),
    ("mechanic", "a mechanic's shop sign: a big gear and a wrench on a rusty plate"),
    ("pharmacy", "a pharmacy sign: a green cross on a white board with a lamp"),
    ("fleamarket", "a flea market sign: a tarp awning with hanging junk, a teapot, a radio and a boot"),
]:
    add("Shop signs", f"shops/{sid}", sid, desc + ", no letters or words", 64, 32, "Front view.")

# ---------- Combat background layers ----------
TILE = "The image must tile seamlessly horizontally: the left and right edges must match exactly."
add("Combat background", "scene/sky", "Sky", "A desert sunset sky: deep violet at the top (#2b2340) to burnt orange (#c46a3c) to warm gold at the horizon (#e9a65a), a big pale sun (#f6d68b), a few thin clouds",
    334, 70, TILE + " This layer fills the whole image (no transparency).")
add("Combat background", "scene/dunes_far", "Far dunes", "A silhouette of distant desert dunes in dusty brown-red (#7a4a3a) with ruined power line towers on the horizon",
    334, 70, TILE + " Only the lower part has dunes; everything above them is transparent.")
add("Combat background", "scene/dunes_near", "Near dunes", "Closer desert dunes in warm sand (#a8683f) with a couple of rusty leaning road signs",
    334, 70, TILE + " Only the lower part has dunes; everything above them is transparent.")
add("Combat background", "scene/road", "Road", "A cracked asphalt highway seen from the side (#2d3038) with white dashed lane markings and a sandy shoulder",
    334, 70, TILE + " Only the bottom quarter is road; everything above is transparent.")

# ---------- Event illustrations ----------
EV = [
    ("ev_road_blockade", "abandoned rusted cars block a desert road"),
    ("ev_road_dust_storm", "a towering wall of dust rolling toward a lonely road"),
    ("ev_road_empty_post", "an abandoned roadside checkpoint with a lowered barrier and suspiciously neatly stacked wooden crates"),
    ("ev_road_fuel_cache", "an overturned fuel tanker truck lying in a roadside ditch"),
    ("ev_road_gas_station", "an abandoned gas station with dead pumps and a faded canopy"),
    ("ev_road_hitchhikers", "two travelers with big backpacks hitchhiking at the roadside"),
    ("ev_road_potholes", "a washed-out road full of deep potholes and cracks"),
    ("ev_road_radio_cache", "an old radio on a dashboard crackling, a hand-drawn map with a cross nearby"),
    ("ev_road_refugees", "a family pushing a cart loaded with belongings along the road"),
    ("ev_road_sagging_bridge", "an old concrete bridge whose span sags in the middle over a dry riverbed"),
    ("ev_road_siphoners", "at night, shadowy thieves siphoning fuel from a parked bus with a hose"),
    ("ev_road_sniper", "a sniper on top of a rusty water tower aiming at the road"),
    ("ev_road_stray_bullet", "a close-up of a bus fuel tank with a fresh bullet hole leaking fuel"),
    ("ev_road_stuck_truck", "a food delivery truck stuck in a ditch, its driver waving for help"),
    ("ev_road_wreck", "a wrecked gang bus on the roadside, something moving inside a broken window"),
    ("ev_special_chapel", "a tiny desert chapel by a bus stop, robed monks tending to wounded people"),
    ("ev_special_fuel_depot", "an old oil depot with big tanks behind a chain-link fence, no guards"),
    ("ev_special_militia", "a group of local militia with mismatched gear asking for ammunition"),
    ("ev_special_old_depot", "an old bus depot with open gates and rows of decommissioned buses inside"),
    ("ev_special_scrap_king", "a scrap king sitting on a throne made of old tires, surrounded by junk"),
    ("ev_special_trader", "a trader's caravan: a covered truck with goods and a merchant waving"),
    ("ev_stop_apprentice", "a teenager holding a big wrench, eager to join the bus crew"),
    ("ev_stop_bounty", "a village elder pointing at raiders hiding near a water pump"),
    ("ev_stop_brawl", "a brawl between locals and bus passengers at a bus stop"),
    ("ev_stop_doctor", "a wandering doctor with a medical bag treating people under an awning"),
    ("ev_stop_fever", "a feverish passenger lying on a bus seat, sweating, others worried"),
    ("ev_stop_market_day", "a busy market day at a bus stop with stalls and traders"),
    ("ev_stop_night_siphon", "locals at night warning the driver, pointing at shadows near parked vehicles"),
    ("ev_stop_sabotage", "a saboteur running away after stabbing a bus fuel tank with a screwdriver"),
    ("ev_stop_welder", "a welder in a dusty garage with sparks flying, offering services"),
]
for eid, desc in EV:
    add("Event illustrations", f"events/{eid}", eid, f"A small scene: {desc}, post-apocalyptic desert, dusty sunset colors", 160, 90,
        "This is a full scene illustration: it may have a background and fill the whole image, still no text.")

# ---------- Output ----------
lines = [
    "# Asset prompts for an image-generating agent — \"Last Bus\"",
    "",
    "One self-contained prompt per asset. Give the agent **one block at a time**. Each block contains everything needed: subject, style, size and file name.",
    "",
    "The style matches the approved reference (the yellow city bus): detailed retro pixel art, dark outline, flat cel shading, warm light, transparent background.",
    "",
    "Return each image as a PNG with exactly the file name shown. Priority order: player buses → enemy buses → weapons → people and drivers → item icons → map and resource icons → shop signs → background → events → wrecks.",
    "",
    f"Total: {len(ASSETS)} assets. Generated by `tools/gen-asset-prompts.py`.",
    "",
]
section = None
for sec, path, title, subject, w, h, extra in ASSETS:
    if sec != section:
        section = sec
        lines += [f"## {sec}", ""]
    prompt = f"{subject}. {extra + ' ' if extra else ''}{STYLE} {ratio(w, h)}"
    lines += [f"### {title}", "", f"File: `{path}_src.png` · target {w}×{h} px", "", "```", prompt, "```", ""]

out = os.path.join(ROOT, "assets", "ASSET-PROMPTS.en.md")
with open(out, "w", encoding="utf-8", newline="\n") as f:
    f.write("\n".join(lines))
print(f"{len(ASSETS)} prompts -> {out}")
