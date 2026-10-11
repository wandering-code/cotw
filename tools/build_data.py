"""Genera js/data.js a partir de los JSON de tools/sources/.

Uso (desde la raíz del repo):  python tools/build_data.py

Fuentes (ver README): base de datos abierta de COTW Companion (Jan Stehno, GPL-3.0)
y tipos de trofeo de la wiki de theHunter: Call of the Wild (CC BY-SA).
"""
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "sources"


def load(name):
    return json.loads((SRC / f"{name}.json").read_text(encoding="utf-8"))


ANIMALS, ZONES, RESERVES = load("animals"), load("animalszones"), load("reserves")
AMMO, WEAPONS, EN, ES = load("ammo"), load("weapons"), load("en"), load("es")
TROPHY_TYPES = load("wiki_trophy_types")

# Zonas del dataset: 0 comer, 1 beber, 2 descansar, 3 activo (madriguera/recolectando), 4 sin zona
ZONE_CODES = {0: "f", 1: "d", 2: "r", 3: "a", 4: "n"}

# Nombre que se muestra, ubicación (el dataset no la trae; sale de la tabla de reservas de la wiki)
RESERVE_INFO = {
    1: ("Hirschfelden", "Alemania"),
    2: ("Layton Lake District", "Noroeste del Pacífico, EE. UU."),
    3: ("Medved-Taiga", "Siberia, Rusia"),
    4: ("Vurhonga Savanna", "África austral"),
    5: ("Parque Fernando", "Patagonia, Argentina"),
    6: ("Yukon Valley", "Yukón, Norteamérica"),
    7: ("Cuatro Colinas", "España"),
    8: ("Silver Ridge Peaks", "Montañas Rocosas, EE. UU."),
    9: ("Te Awaroa", "Nueva Zelanda"),
    10: ("Rancho del Arroyo", "México"),
    11: ("Mississippi Acres", "Misisipi, EE. UU."),
    12: ("Revontuli Coast", "Finlandia"),
    13: ("New England Mountains", "Apalaches, EE. UU."),
    14: ("Emerald Coast", "Australia"),
    15: ("Sundarpatan", "Nepal"),
    16: ("Salzwiesen Park", "Alemania"),
    17: ("Askiy Ridge", "Alberta, Canadá"),
    18: ("Tòrr nan Sìthean", "Escocia"),
    19: ("Intisuyu", "Perú"),
}

# Traducciones del dataset que están mal o son confusas
ES_FIXES = {
    "ANIMAL:NORTHERN_RED_MUNTJAC": "Muntíaco Rojo del Norte",
    "ANIMAL:SNOW_LEOPARD": "Leopardo de las Nieves",
    "ANIMAL:BARASINGHA": "Barasinga (Ciervo de los Pantanos)",
    "ANIMAL:REINDEER": "Reno de Montaña",
    "ANIMAL:ROCKY_MOUNTAIN_ELK": "Wapití de las Rocosas",
    "ANIMAL:EASTERN_COTTONTAIL_RABBIT": "Conejo de Florida",
    "ANIMAL:RACCOON_DOG": "Perro Mapache",
    "ANIMAL:MEXICAN_BOBCAT": "Lince Rojo",
    "ANIMAL:MOOSE": "Alce",
    "ANIMAL:RED_GROUSE": "Lagópodo Escocés",
}

TROPHY_ES = {
    "Antlers": "cuernas", "Horns": "cuernos", "Tusks": "colmillos", "Skull": "cráneo",
    "Weight": "peso", "Length": "longitud", "Combined": "combinada",
}

WEAPON_TYPES = {0: "rifle", 1: "shotgun", 2: "handgun", 3: "bow"}
SHOT_ES = {"birdshot": "perdigones", "steel birdshot": "perdigones de acero",
           "buckshot": "postas", "slug": "bala", "arrow": "flecha", "bolt": "virote"}
BULLET_ES = {"soft": "punta blanda", "polymer": "punta de polímero", "hollow": "punta hueca",
             "flat": "punta plana", "round": "bola", "minie": "minié"}


def slugify(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def num(x, nd=2):
    """Redondea y quita decimales sobrantes (los float32 del dataset traen ruido)."""
    if x is None:
        return None
    x = round(float(x), nd)
    return int(x) if x == int(x) else x


def build_ammo_by_class():
    """Para cada clase 1-9, calibres válidos (sin perder integridad) agrupados por tipo de arma."""
    types_of = defaultdict(set)
    for w in WEAPONS:
        for a in w["AMMO"]:
            types_of[a].add(WEAPON_TYPES[w["TYPE"]])

    # (tipo, calibre) -> variantes de bala
    groups = defaultdict(list)
    for a in AMMO:
        name = EN[a["NAME"]]
        calibre, _, variant = name.partition(" ")
        if variant.startswith("BP "):  # pólvora negra: es otro cartucho, no una variante de bala
            calibre, variant = f"{calibre} BP", variant[3:]
        for t in types_of[a["ID"]]:
            groups[(t, calibre)].append((variant, a["MIN_LEVEL"], a["MAX_LEVEL"]))

    by_class = {}
    for cls in range(1, 10):
        out = defaultdict(list)
        for (t, calibre), variants in groups.items():
            ok = [v for v in variants if v[1] <= cls <= v[2]]
            if not ok:
                continue
            if any(v[0] in SHOT_ES for v in variants):
                # escopetas y arcos: el tipo de cartucho/flecha es lo que decide la clase
                for v in ok:
                    out[t].append(f"{calibre} {SHOT_ES.get(v[0], v[0])}")
            elif len(ok) == len(variants):
                out[t].append(calibre)
            else:
                out[t].append(f"{calibre} ({', '.join(BULLET_ES.get(v[0], v[0]) for v in ok)})")
        by_class[cls] = {t: sorted(set(v), key=sort_key) for t, v in out.items()}
    return by_class


def sort_key(label):
    m = re.search(r"[\d.]+", label)
    return (float(m.group()) if m else 0, label)


def build():
    animals = {}
    for a in ANIMALS:
        key = a["NAME"]
        max_m, max_f = a["MAX_TROPHY_MALE"], a.get("MAX_TROPHY_FEMALE") or 0
        diamond = a["TROPHY_DIAMOND"]
        # Margen pequeño: los máximos vienen de float32 y algún caso queda a centésimas del umbral
        male_ok, female_ok = max_m >= diamond - 0.01, max_f >= diamond - 0.01
        entry = {
            "en": EN[key],
            "es": ES_FIXES.get(key, ES.get(key, EN[key])),
            "latin": a["LATIN"],
            "cls": a["LEVEL"],
            "level": a["DIFFICULTY"],
            "silver": num(a["TROPHY_SILVER"]),
            "gold": num(a["TROPHY_GOLD"]),
            "diamond": num(diamond),
            "maxM": num(max_m),
            "maxF": num(max_f) if max_f else None,
            "wM": num(a["MAX_WEIGHT_MALE"], 3),
            "wF": num(a["MAX_WEIGHT_FEMALE"], 3),
            "sex": "both" if male_ok and female_ok else ("f" if female_ok else "m"),
            "trophy": TROPHY_ES.get(TROPHY_TYPES.get(key)),
        }
        if "MAX_TROPHY_GO" in a:
            entry["go"] = {"min": num(a["MIN_TROPHY_GO"]), "w": num(a["MAX_WEIGHT_GO"])}
        animals[a["ID"]] = entry

    zones = defaultdict(list)
    for z in ZONES:
        zones[(z["RESERVE_ID"], z["ANIMAL_ID"])].append([z["TIME_FROM"], z["TIME_TO"], ZONE_CODES[z["ZONE"]]])

    reserves = []
    for r in sorted(RESERVES, key=lambda r: r["ID"]):
        name, location = RESERVE_INFO[r["ID"]]
        roster = [a for a in ANIMALS if r["ID"] in a["RESERVES"]]
        roster.sort(key=lambda a: (a["LEVEL"], EN[a["NAME"]]))
        reserves.append({
            "slug": slugify(name),
            "name": name,
            "es": ES.get(r["NAME"], name),
            "location": location,
            "base": not r["DLC"],
            "animals": [{"id": a["ID"], "zones": sorted(zones[(r["ID"], a["ID"])])} for a in roster],
        })
        assert len(roster) == r["COUNT"], (name, len(roster), r["COUNT"])
        for a in roster:
            hours = sum(t - f for f, t, _ in zones[(r["ID"], a["ID"])])
            assert hours == 24, (name, EN[a["NAME"]], hours)

    data = {"reserves": reserves, "animals": animals, "ammo": build_ammo_by_class()}
    out = ROOT / "js" / "data.js"
    out.write_text(
        "// GENERADO por tools/build_data.py — no editar a mano.\n"
        "window.COTW_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8", newline="\n",
    )
    print(f"{out.relative_to(ROOT)}: {len(reserves)} reservas, {len(animals)} especies, "
          f"{sum(len(r['animals']) for r in reserves)} fichas")


if __name__ == "__main__":
    build()
