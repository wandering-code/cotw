(function () {
  'use strict';

  const DATA = window.COTW_DATA;
  const main = document.getElementById('main');
  const reserveList = document.getElementById('reserve-list');
  const sidebar = document.getElementById('sidebar');
  const menuToggle = document.getElementById('menu-toggle');

  const LEVELS = {
    1: 'Trivial', 2: 'Menor', 3: 'Muy fácil', 4: 'Fácil', 5: 'Media',
    6: 'Difícil', 7: 'Muy difícil', 8: 'Mítica', 9: 'Legendaria',
  };
  const ZONES = {
    f: { label: 'Comiendo', verb: 'come', noun: 'Zona de comida' },
    d: { label: 'Bebiendo', verb: 'bebe', noun: 'Zona de bebida' },
    r: { label: 'Descansando', verb: 'descansa', noun: 'Zona de descanso' },
    a: { label: 'Activo', verb: 'está activo', noun: 'Fuera de la madriguera' },
    n: { label: 'Sin zona', verb: 'no tiene zona', noun: 'Sin zona' },
  };
  const WEAPON_TYPES = [
    ['rifle', 'Rifles'], ['shotgun', 'Escopetas'], ['handgun', 'Armas cortas'], ['bow', 'Arcos y ballestas'],
  ];
  const SEX = { m: 'Macho', f: 'Hembra', both: 'Macho o hembra' };
  // Horas con luz: fuera de esta franja hace falta visión nocturna para aprovechar la zona
  const DAY_START = 5, DAY_END = 20;

  // localStorage puede no estar disponible (modo privado, datos bloqueados): la web funciona igual sin él
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* sin persistencia */ }
    },
  };

  const state = { query: '', sort: 'class', view: store.get('cotw.view', 'cards') === 'table' ? 'table' : 'cards' };
  // Diamantes conseguidos, por especie: el mismo animal cuenta en todas las reservas donde aparece
  const owned = new Set(store.get('cotw.diamonds', []));

  const pad = (h) => String(h % 24).padStart(2, '0') + ':00';
  const fmt = (n) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 });
  const fmtWeight = (kg) => (kg < 1 ? fmt(Math.round(kg * 1000)) + ' g' : fmt(kg) + ' kg');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // ---------- Mejor zona de caza ----------

  function zoneStats(zones) {
    const stats = {};
    for (const [from, to, type] of zones) {
      const s = stats[type] || (stats[type] = { type, hours: 0, day: 0, windows: [] });
      s.hours += to - from;
      s.day += Math.max(0, Math.min(to, DAY_END) - Math.max(from, DAY_START));
      s.windows.push([from, to]);
    }
    // Una franja que cruza la medianoche viene partida en dos (18–24 y 0–6): se une
    for (const s of Object.values(stats)) {
      const first = s.windows[0], last = s.windows[s.windows.length - 1];
      if (s.windows.length > 1 && first[0] === 0 && last[1] === 24) {
        s.windows.shift();
        last[1] = first[1];
      }
    }
    return stats;
  }

  // Gana la zona con más horas de luz; a igualdad, la de más horas totales y luego beber
  // (las zonas de bebida son pequeñas y despejadas). Descansar solo si no hay otra cosa.
  function bestSpot(stats) {
    const candidates = ['d', 'f', 'a'].map((t) => stats[t]).filter(Boolean);
    if (!candidates.length) return stats.r || null;
    return candidates.sort((x, y) => y.day - x.day || y.hours - x.hours)[0];
  }

  function spotReason(best, stats) {
    const describe = (s) => {
      const n = s.windows.length;
      const light = s.day < s.hours ? ` (${s.day} h con luz)` : '';
      return `${ZONES[s.type].verb} ${s.hours} h al día${light} en ${n} ${n === 1 ? 'franja' : 'franjas'}`;
    };
    const parts = [describe(best)];
    for (const t of ['f', 'd', 'a']) {
      if (stats[t] && stats[t] !== best) parts.push(describe(stats[t]));
    }
    let text = parts.join('; ') + '.';
    text = text.charAt(0).toUpperCase() + text.slice(1);
    if (best.day === 0) text += ' Todo de noche: lleva visión nocturna.';
    return text;
  }

  // ---------- Render ----------

  function timeline(zones) {
    const segs = zones.map(([from, to, type]) =>
      `<span class="seg seg-${type}" style="flex:${to - from}" title="${pad(from)}–${pad(to)} · ${ZONES[type].label}"></span>`).join('');
    return `
      <div class="timeline" role="img" aria-label="Horario de zonas de necesidad">
        <div class="timeline-bar">${segs}</div>
        <div class="timeline-ticks"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
      </div>`;
  }

  function ammoBlock(cls) {
    const ammo = DATA.ammo[cls];
    const rifles = ammo.rifle || [];
    const groups = WEAPON_TYPES.filter(([key]) => ammo[key] && ammo[key].length).map(([key, label]) => `
      <div class="ammo-group">
        <span class="ammo-type">${label}</span>
        <span class="chips">${ammo[key].map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</span>
      </div>`).join('');
    return `
      <details class="ammo">
        <summary>
          <span class="chips">${rifles.slice(0, 5).map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</span>
          <span class="more">Ver todo</span>
        </summary>
        ${groups}
      </details>`;
  }

  function bestTrophy(a) {
    const bestFemale = a.sex === 'f' || (a.sex === 'both' && a.maxF > a.maxM);
    return { bestFemale, max: bestFemale ? a.maxF : a.maxM, weight: bestFemale ? a.wF : a.wM };
  }

  function ownToggle(id, name) {
    return `
      <label class="own" title="Marcar si ya tienes el diamante">
        <input type="checkbox" data-own="${id}"${owned.has(id) ? ' checked' : ''} aria-label="Diamante conseguido: ${esc(name)}">
        <span class="own-mark" aria-hidden="true"></span>
      </label>`;
  }

  function trophyBlock(a) {
    const { bestFemale, max, weight } = bestTrophy(a);
    let sexNote = '';
    if (a.sex === 'm') sexNote = a.maxF ? 'La hembra no llega a diamante' : 'La hembra no puntúa';
    else if (a.sex === 'f') sexNote = 'El macho no llega a diamante';
    else sexNote = bestFemale ? 'La hembra puntúa más' : 'El macho puntúa más';

    return `
      <div class="trophy">
        <div class="trophy-head">
          <span class="sex sex-${a.sex}">${SEX[a.sex]}</span>
          <span class="level">Nivel ${a.level} · ${LEVELS[a.level]}</span>
        </div>
        <p class="note">${sexNote}${a.trophy ? (a.trophy === 'combinada' ? ' · puntuación combinada' : ` · puntúa por ${a.trophy}`) : ''}</p>
        <dl class="stats">
          <div><dt>Diamante</dt><dd class="diamond">${fmt(a.diamond)}</dd></div>
          <div><dt>Máximo</dt><dd>${fmt(max)}</dd></div>
          <div><dt>Peso máx.</dt><dd>${fmtWeight(weight)}</dd></div>
        </dl>
        ${a.go ? `<p class="great-one">Great One · nivel 10 Fabulosa · desde ${fmt(a.go.min)} · hasta ${fmtWeight(a.go.w)}</p>` : ''}
      </div>`;
  }

  function animalCard(entry) {
    const a = DATA.animals[entry.id];
    const stats = zoneStats(entry.zones);
    const best = bestSpot(stats);
    const windows = best.windows.map(([f, t]) => `${pad(f)}–${pad(t)}`).join(' · ');
    return `
      <article class="card${owned.has(entry.id) ? ' owned' : ''}" data-animal="${entry.id}">
        <header class="card-head">
          <span class="class-badge" title="Clase ${a.cls}"><small>Clase</small>${a.cls}</span>
          <div class="card-title">
            <h3>${esc(a.es)}</h3>
            <p>${esc(a.en)} · <i>${esc(a.latin)}</i></p>
          </div>
          ${ownToggle(entry.id, a.es)}
        </header>

        <section class="block">
          <h4>Calibre <span>clase ${a.cls}</span></h4>
          ${ammoBlock(a.cls)}
        </section>

        <section class="block">
          <h4>Mejor zona de caza</h4>
          <div class="spot spot-${best.type}">
            <span class="spot-label">${ZONES[best.type].label}</span>
            <span class="spot-times">${windows}</span>
          </div>
          <p class="note">${spotReason(best, stats)}</p>
          ${timeline(entry.zones)}
        </section>

        <section class="block">
          <h4>Mejor trofeo</h4>
          ${trophyBlock(a)}
        </section>
      </article>`;
  }

  function tableRow(entry) {
    const a = DATA.animals[entry.id];
    const best = bestSpot(zoneStats(entry.zones));
    const windows = best.windows.map(([f, t]) => `${pad(f)}–${pad(t)}`).join(' · ');
    const { max, weight } = bestTrophy(a);
    const rifles = DATA.ammo[a.cls].rifle || [];
    const calibres = rifles.slice(0, 4).map(esc).join(', ') + (rifles.length > 4 ? '…' : '');
    return `
      <tr class="${owned.has(entry.id) ? 'owned' : ''}" data-animal="${entry.id}">
        <td class="col-own">${ownToggle(entry.id, a.es)}</td>
        <th scope="row"><span class="t-name">${esc(a.es)}</span><span class="t-en">${esc(a.en)}</span></th>
        <td class="num"><span class="t-class">${a.cls}</span></td>
        <td class="t-cal">${calibres}</td>
        <td><span class="t-spot spot-${best.type}">${ZONES[best.type].label}</span> <span class="t-times">${windows}</span></td>
        <td><span class="sex sex-${a.sex}">${SEX[a.sex]}</span></td>
        <td>${a.level} · ${LEVELS[a.level]}${a.go ? ' <span class="t-go" title="Tiene Great One">GO</span>' : ''}</td>
        <td class="num diamond">${fmt(a.diamond)}</td>
        <td class="num">${fmt(max)}</td>
        <td class="num">${fmtWeight(weight)}</td>
      </tr>`;
  }

  function table(entries) {
    return `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th class="col-own" scope="col"><span class="own-head" title="Diamante conseguido"></span></th>
              <th scope="col">Animal</th>
              <th scope="col" class="num">Clase</th>
              <th scope="col">Calibre (rifle)</th>
              <th scope="col">Mejor zona</th>
              <th scope="col">Sexo</th>
              <th scope="col">Nivel máx.</th>
              <th scope="col" class="num">Diamante</th>
              <th scope="col" class="num">Punt. máx.</th>
              <th scope="col" class="num">Peso máx.</th>
            </tr>
          </thead>
          <tbody>${entries.map(tableRow).join('')}</tbody>
        </table>
      </div>`;
  }

  function updateOwnedCount(reserve) {
    const el = document.getElementById('owned-count');
    if (!el) return;
    const n = reserve.animals.filter((e) => owned.has(e.id)).length;
    el.textContent = `${n}/${reserve.animals.length} diamantes`;
    el.classList.toggle('complete', n === reserve.animals.length);
  }

  function sortEntries(entries) {
    const by = {
      class: (x, y) => x.a.cls - y.a.cls || x.a.es.localeCompare(y.a.es, 'es'),
      name: (x, y) => x.a.es.localeCompare(y.a.es, 'es'),
      level: (x, y) => y.a.level - x.a.level || y.a.cls - x.a.cls,
    }[state.sort];
    return entries.map((e) => ({ e, a: DATA.animals[e.id] })).sort(by).map((x) => x.e);
  }

  function renderCards(reserve) {
    const q = norm(state.query.trim());
    let entries = reserve.animals;
    if (q) {
      entries = entries.filter((e) => {
        const a = DATA.animals[e.id];
        return norm(a.es).includes(q) || norm(a.en).includes(q);
      });
    }
    const grid = document.getElementById('cards');
    grid.className = state.view === 'table' ? 'table-view' : 'cards';
    if (!entries.length) grid.innerHTML = '<p class="empty">Ningún animal coincide con la búsqueda.</p>';
    else if (state.view === 'table') grid.innerHTML = table(sortEntries(entries));
    else grid.innerHTML = sortEntries(entries).map(animalCard).join('');
  }

  function renderReserve(reserve) {
    document.title = `${reserve.name} · Guía de caza COTW`;
    main.innerHTML = `
      <header class="reserve-head">
        <p class="eyebrow">${esc(reserve.location)} · ${reserve.base ? 'Juego base' : 'DLC'}</p>
        <h1>${esc(reserve.name)}</h1>
        <p class="reserve-sub">${esc(reserve.es)} · ${reserve.animals.length} especies · <span class="owned-count" id="owned-count"></span></p>
      </header>

      <div class="toolbar">
        <input type="search" id="search" placeholder="Buscar animal…" aria-label="Buscar animal" value="${esc(state.query)}">
        <div class="view-toggle" role="group" aria-label="Vista">
          <button type="button" data-view="cards" aria-pressed="${state.view === 'cards'}">Fichas</button>
          <button type="button" data-view="table" aria-pressed="${state.view === 'table'}">Tabla</button>
        </div>
        <label class="sort">Ordenar
          <select id="sort">
            <option value="class">Clase</option>
            <option value="name">Nombre</option>
            <option value="level">Nivel máximo</option>
          </select>
        </label>
        <ul class="legend" aria-label="Leyenda del horario">
          <li><span class="seg seg-f"></span>Comer</li>
          <li><span class="seg seg-d"></span>Beber</li>
          <li><span class="seg seg-r"></span>Descansar</li>
        </ul>
      </div>

      <div class="cards" id="cards"></div>`;

    const sort = document.getElementById('sort');
    sort.value = state.sort;
    sort.addEventListener('change', () => { state.sort = sort.value; renderCards(reserve); });
    document.getElementById('search').addEventListener('input', (ev) => { state.query = ev.target.value; renderCards(reserve); });
    main.querySelectorAll('.view-toggle button').forEach((btn) => btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      store.set('cotw.view', state.view);
      main.querySelectorAll('.view-toggle button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      renderCards(reserve);
    }));
    document.getElementById('cards').addEventListener('change', (ev) => {
      const id = Number(ev.target.dataset.own);
      if (!id) return;
      if (ev.target.checked) owned.add(id); else owned.delete(id);
      store.set('cotw.diamonds', [...owned]);
      ev.target.closest('[data-animal]').classList.toggle('owned', ev.target.checked);
      updateOwnedCount(reserve);
    });
    renderCards(reserve);
    updateOwnedCount(reserve);
  }

  function renderHome() {
    document.title = 'Guía de caza · theHunter: Call of the Wild';
    const tiles = DATA.reserves.map((r, i) => `
      <a class="tile" href="#/${r.slug}">
        <span class="tile-num">${String(i + 1).padStart(2, '0')}</span>
        <span class="tile-name">${esc(r.name)}</span>
        <span class="tile-meta">${esc(r.location)} · ${r.animals.length} especies</span>
      </a>`).join('');
    main.innerHTML = `
      <header class="reserve-head">
        <p class="eyebrow">${DATA.reserves.length} reservas · ${Object.keys(DATA.animals).length} especies</p>
        <h1>Elige una reserva</h1>
        <p class="reserve-sub">Calibre, mejor zona de caza y mejor trofeo de cada animal.</p>
      </header>
      <div class="tiles">${tiles}</div>
      <section class="howto">
        <h2>Cómo leer la guía</h2>
        <ul>
          <li><b>Calibre</b>: munición que abate esa clase sin perder la bonificación de integridad.</li>
          <li><b>Mejor zona de caza</b>: la zona de necesidad (comer o beber) en la que el animal pasa más horas con luz (05:00–20:00). A igualdad gana la de más horas totales, y después beber, porque sus zonas son pequeñas y despejadas.</li>
          <li><b>Mejor trofeo</b>: qué sexo puede llegar a diamante, el nivel máximo de la especie y la puntuación mínima de diamante.</li>
          <li><b>Diamante conseguido</b>: marca el rombo de cada animal cuando ya lo tengas. Se guarda en este navegador y vale para todas las reservas donde aparece la especie.</li>
          <li><b>Fichas / Tabla</b>: cada reserva se puede ver en fichas con todo el detalle o en una tabla resumida.</li>
        </ul>
      </section>`;
  }

  function renderSidebar(activeSlug) {
    reserveList.innerHTML = DATA.reserves.map((r) => `
      <li><a href="#/${r.slug}" class="${r.slug === activeSlug ? 'active' : ''}"${r.slug === activeSlug ? ' aria-current="page"' : ''}>
        <span>${esc(r.name)}</span><small>${r.animals.length}</small>
      </a></li>`).join('');
  }

  function route() {
    const slug = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    const reserve = DATA.reserves.find((r) => r.slug === slug);
    state.query = '';
    renderSidebar(reserve ? reserve.slug : null);
    if (reserve) renderReserve(reserve); else renderHome();
    sidebar.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
    window.scrollTo(0, 0);
  }

  menuToggle.addEventListener('click', () => {
    const open = sidebar.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(open));
  });
  window.addEventListener('hashchange', route);
  route();
})();
