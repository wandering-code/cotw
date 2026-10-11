# COTW — Guía de caza

Guía por reservas para **theHunter: Call of the Wild**. Una vista por reserva y, dentro, una
ficha por animal con:

- **Calibre**: munición válida para la clase del animal (sin perder la bonificación de integridad).
- **Mejor zona de caza**: zona de necesidad recomendada, sus franjas horarias y el horario
  completo de 24 h (comer / beber / descansar).
- **Mejor trofeo**: sexo que puede llegar a diamante, nivel máximo, puntuación mínima de
  diamante, puntuación máxima y peso máximo. Indica también si la especie tiene Great One.

Cada reserva se puede ver en **fichas** (todo el detalle) o en **tabla** (resumen de un vistazo).
En ambas se puede marcar el rombo de cada animal cuando ya se tiene su diamante; la marca es por
especie (vale en todas las reservas donde aparece) y se guarda en `localStorage`, es decir, solo
en ese navegador y para esa dirección.

Web estática sin dependencias ni build: HTML + CSS + JS.

## Arrancar en local

```bash
python -m http.server 8080 --bind 0.0.0.0
```

Y abrir `http://<ip-lan>:8080` (con la IP LAN funciona también desde el móvil).

## Estructura

```
index.html
css/style.css
js/app.js            # vistas, enrutado por hash (#/<reserva>) y cálculo de la mejor zona
js/data.js           # GENERADO — no editar a mano
tools/build_data.py  # genera js/data.js
tools/sources/       # copia de los datos de origen
```

## Actualizar los datos

Cuando salga una reserva o un parche nuevo:

1. Descargar de nuevo en `tools/sources/` los JSON de
   [`cotw-companion/assets/raw`](https://github.com/janstehno/cotw-companion/tree/main/assets/raw)
   (`animals`, `animalszones`, `reserves`, `ammo`, `weapons`) y de `assets/translations`
   (`en`, `es`).
2. Si hay reserva nueva, añadirla a `RESERVE_INFO` en `tools/build_data.py`.
3. `python tools/build_data.py`

El script comprueba que cada reserva tenga todas sus especies y que el horario de cada animal
sume 24 h.

## Cómo se decide la "mejor zona de caza"

Entre comer y beber gana la zona en la que el animal pasa más horas **con luz** (05:00–20:00).
A igualdad, la de más horas totales y después beber (zonas más pequeñas y despejadas).
Descansar solo se recomienda si la especie no tiene otra zona. Está en `bestSpot()` de
`js/app.js`.

## Despliegue

GitHub Pages sirviendo la raíz de la rama principal; no hay paso de build.

## Datos y licencia

- Reservas, especies, clases, niveles, puntuaciones, pesos, horarios de zonas y munición:
  base de datos abierta de [COTW Companion](https://github.com/janstehno/cotw-companion) de
  Jan Stehno, **GPL-3.0**. Por eso este repositorio se publica también bajo GPL-3.0 (`LICENSE`).
- Tipo de trofeo de cada especie y ubicación de las reservas:
  [wiki de theHunter: Call of the Wild](https://thehuntercotw.fandom.com), CC BY-SA.

Proyecto de fans sin relación con Expansive Worlds ni Avalanche Studios. El icono de la app
(`img/`) es el icono oficial del juego, propiedad de Expansive Worlds; el resto no usa arte del juego.
