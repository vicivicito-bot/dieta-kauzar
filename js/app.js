import { TIPOS, ACTIVIDAD, totales, sumar, metabolismoBasal, gastoTotal, proyeccion, validar } from './nutricion.js';

const CLAVE = 'kauzar.v1';
const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

let alimentos, recetas, recetaPorId, plan, perfilBase, problemas;
let estado = { hechos: {}, alternativas: {}, perfil: {} };

// ---------- Almacenamiento (puede fallar en modo privado) ----------
function cargarEstado() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE));
    if (guardado) estado = { ...estado, ...guardado };
  } catch {}
}
function guardarEstado() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(estado));
  } catch {}
}

// ---------- Utilidades ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const r0 = (n) => Math.round(n);
const fechaClave = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const indiceDia = (d) => (d.getDay() + 6) % 7; // 0 = lunes
const perfil = () => ({ ...perfilBase, ...estado.perfil });

// La versión de la receta que se está usando (original o alternativa).
function version(receta) {
  return receta.alternativa && estado.alternativas[receta.id] ? receta.alternativa : receta;
}
function totalReceta(receta) {
  return totales(version(receta).ingredientes, alimentos);
}
function totalDia(dia) {
  return sumar(TIPOS.map((t) => totalReceta(recetaPorId[dia[t.id]])));
}

function cantidad(id, gramos) {
  const a = alimentos[id];
  if (id === 'cafe') return '1 taza';
  if (id === 'especias' || id === 'edulcorante') return 'al gusto';
  if (['bebida_soja', 'leche_desnatada', 'caldo'].includes(id)) return `${gramos} ml`;
  if (id === 'aove') {
    if (gramos >= 10 && gramos % 10 === 0) return `${gramos} g (${gramos / 10} cda)`;
    return `${gramos} g (${gramos <= 5 ? '1 cdta' : '≈ 1 cda'})`;
  }
  if (a.ud) {
    const uds = Math.round((gramos / a.ud) * 2) / 2;
    if (uds >= 0.5 && Math.abs(uds * a.ud - gramos) / gramos < 0.15) {
      return `${gramos} g (${String(uds).replace('.', ',')} ${uds === 1 ? 'ud' : 'uds'})`;
    }
  }
  return `${gramos} g`;
}

function etiquetaAlternativa(receta) {
  const original = perfilBase.con_alternativa_obligatoria.find((id) => receta.ingredientes.some(([i]) => i === id));
  return {
    original: `Con ${alimentos[original].nombre.toLowerCase()}`,
    alternativa: alimentos[receta.alternativa.ingredientes[0][0]].nombre,
  };
}

function macros(t, clase = '') {
  return `<div class="macros ${clase}">
    <span><b>${r0(t.p)}</b> g proteína</span>
    <span><b>${r0(t.c)}</b> g hidratos</span>
    <span><b>${r0(t.g)}</b> g grasa</span>
  </div>`;
}

// ---------- Componentes ----------
function detalleReceta(receta) {
  const v = version(receta);
  const t = totalReceta(receta);
  let selector = '';
  if (receta.alternativa) {
    const e = etiquetaAlternativa(receta);
    const usaAlt = !!estado.alternativas[receta.id];
    selector = `
      <div class="alternativa">
        <div class="segmentado" role="group" aria-label="Elegir versión">
          <button data-alt="${receta.id}" data-valor="0" aria-pressed="${!usaAlt}">${esc(e.original)}</button>
          <button data-alt="${receta.id}" data-valor="1" aria-pressed="${usaAlt}">${esc(e.alternativa)}</button>
        </div>
        ${usaAlt && receta.alternativa.nota ? `<p class="nota">${esc(receta.alternativa.nota)}</p>` : ''}
      </div>`;
  }
  return `
    ${selector}
    <ul class="ingredientes">
      ${v.ingredientes
        .map(([id, g]) => `<li><span>${esc(alimentos[id].nombre)}</span><span class="cant">${esc(cantidad(id, g))}</span></li>`)
        .join('')}
    </ul>
    <ol class="pasos">${(v.pasos || receta.pasos).map((p) => `<li>${esc(p)}</li>`).join('')}</ol>
    ${macros(t)}`;
}

function tarjetaComida(tipo, receta, { fecha, abierta } = {}) {
  const v = version(receta);
  const t = totalReceta(receta);
  const hecho = fecha && estado.hechos[fecha]?.[tipo.id];
  const check = fecha
    ? `<label class="check" title="Marcar como hecho">
         <input type="checkbox" data-hecho="${tipo.id}" data-fecha="${fecha}" ${hecho ? 'checked' : ''}>
         <span aria-hidden="true"></span><span class="sr">Hecho</span>
       </label>`
    : '';
  return `
    <article class="comida ${hecho ? 'hecha' : ''}">
      <details ${abierta ? 'open' : ''} data-receta="${receta.id}">
        <summary>
          <span class="icono" aria-hidden="true">${tipo.icono}</span>
          <span class="titulo">
            <small>${tipo.nombre}</small>
            <span>${esc(v.nombre)}</span>
            ${receta.alternativa ? `<em class="chip">🐟 alternativa disponible</em>` : ''}
          </span>
          <span class="kcal">${r0(t.kcal)}<small>kcal</small></span>
        </summary>
        <div class="cuerpo">${detalleReceta(receta)}</div>
      </details>
      ${check}
    </article>`;
}

function resumenDia(t, consumido) {
  const objetivo = Math.max(perfil().kcal_minimo, r0(t.kcal));
  const pct = consumido == null ? 100 : Math.min(100, (consumido.kcal / objetivo) * 100);
  const aoveOk = t.aove <= perfil().aove_max_g;
  return `
    <section class="resumen">
      <div class="cifra">
        ${consumido == null
          ? `<b>${r0(t.kcal)}</b> kcal en el plan`
          : `<b>${r0(consumido.kcal)}</b> / ${r0(t.kcal)} kcal`}
      </div>
      <div class="barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${r0(pct)}"><span style="width:${pct}%"></span></div>
      ${macros(t, 'compacto')}
      <p class="aove ${aoveOk ? '' : 'aviso'}">🫒 AOVE del día: ${r0(t.aove)} g de ${perfil().aove_max_g} g</p>
    </section>`;
}

// ---------- Vistas ----------
function vistaDia(indice, esHoy) {
  const dia = plan.dias[indice];
  const hoy = new Date();
  const fecha = esHoy ? fechaClave(hoy) : null;
  const t = totalDia(dia);
  const consumido = esHoy
    ? sumar(TIPOS.filter((tp) => estado.hechos[fecha]?.[tp.id]).map((tp) => totalReceta(recetaPorId[dia[tp.id]])))
    : null;
  const titulo = esHoy
    ? `Hoy, ${hoy.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}`
    : dia.dia;
  return `
    <header class="cabecera">
      ${esHoy ? '' : '<a href="#semana" class="volver" aria-label="Volver a la semana">‹ Semana</a>'}
      <h1>${esc(titulo)}</h1>
    </header>
    ${resumenDia(t, consumido)}
    ${TIPOS.map((tp) => tarjetaComida(tp, recetaPorId[dia[tp.id]], { fecha })).join('')}
    ${esHoy ? '<p class="pie">Toca una comida para ver ingredientes y preparación. Marca el círculo cuando la hagas.</p>' : ''}`;
}

function vistaSemana() {
  const hoy = indiceDia(new Date());
  return `
    <header class="cabecera"><h1>Semana</h1></header>
    <ul class="semana">
      ${plan.dias
        .map((d, i) => {
          const t = totalDia(d);
          return `<li>
            <a href="#dia/${i}" class="${i === hoy ? 'hoy' : ''}">
              <span class="d">${DIAS_CORTOS[i]}</span>
              <span class="platos">
                <span>${esc(version(recetaPorId[d.comida]).nombre)}</span>
                <small>${esc(version(recetaPorId[d.cena]).nombre)}</small>
              </span>
              <span class="kcal">${r0(t.kcal)}<small>kcal</small></span>
            </a>
          </li>`;
        })
        .join('')}
    </ul>
    <p class="pie">Comida arriba, cena debajo. Toca un día para verlo completo.</p>`;
}

let filtroTipo = 'todas';
let busqueda = '';
function vistaRecetas() {
  const normal = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const q = normal(busqueda);
  const lista = recetas.filter(
    (r) =>
      (filtroTipo === 'todas' || r.tipo === filtroTipo) &&
      (!q || normal(r.nombre).includes(q) || r.ingredientes.some(([id]) => normal(alimentos[id].nombre).includes(q))),
  );
  return `
    <header class="cabecera"><h1>Recetas</h1></header>
    <input type="search" id="buscar" placeholder="Buscar receta o ingrediente…" value="${esc(busqueda)}" aria-label="Buscar">
    <div class="chips" role="group" aria-label="Filtrar por comida">
      <button data-filtro="todas" aria-pressed="${filtroTipo === 'todas'}">Todas</button>
      ${TIPOS.map((t) => `<button data-filtro="${t.id}" aria-pressed="${filtroTipo === t.id}">${t.nombre}</button>`).join('')}
    </div>
    <div id="lista-recetas">
      ${lista.length
        ? lista.map((r) => tarjetaComida(TIPOS.find((t) => t.id === r.tipo), r)).join('')
        : '<p class="pie">No hay recetas que coincidan.</p>'}
    </div>`;
}

function vistaPerfil() {
  const p = perfil();
  const mb = metabolismoBasal(p);
  const tdee = gastoTotal(p);
  const kcalPlan = sumar(plan.dias.map(totalDia)).kcal / plan.dias.length;
  const deficit = tdee - kcalPlan;
  const proy = proyeccion(p, kcalPlan);
  let fechaMeta = '';
  if (proy.semanas) {
    const f = new Date();
    f.setDate(f.getDate() + proy.semanas * 7);
    fechaMeta = f.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  }
  const campo = (id, etiqueta, valor, attrs) =>
    `<label>${etiqueta}<input type="number" inputmode="decimal" data-perfil="${id}" value="${valor}" ${attrs}></label>`;
  return `
    <header class="cabecera"><h1>Mis números</h1></header>
    ${Object.keys(estado.perfil).length
      ? ''
      : '<div class="alerta">Estos son datos de ejemplo. Escribe los tuyos: se guardan solo en este móvil.</div>'}
    <section class="tarjeta formulario">
      ${campo('peso_kg', 'Peso actual (kg)', p.peso_kg, 'step="0.1" min="30" max="200"')}
      ${campo('peso_objetivo_kg', 'Peso objetivo (kg)', p.peso_objetivo_kg, 'step="0.1" min="30" max="200"')}
      ${campo('edad', 'Edad', p.edad, 'step="1" min="14" max="100"')}
      ${campo('altura_cm', 'Altura (cm)', p.altura_cm, 'step="1" min="120" max="220"')}
      <label class="ancho">Actividad
        <select data-perfil="actividad">
          ${Object.entries(ACTIVIDAD).map(([k, a]) => `<option value="${k}" ${k === p.actividad ? 'selected' : ''}>${a.nombre}</option>`).join('')}
        </select>
      </label>
    </section>
    <section class="tarjeta numeros">
      <div><small>Metabolismo basal</small><b>${r0(mb)}</b> kcal</div>
      <div><small>Gasto diario</small><b>${r0(tdee)}</b> kcal</div>
      <div><small>Tu menú (media)</small><b>${r0(kcalPlan)}</b> kcal</div>
      <div><small>Déficit</small><b>${r0(deficit)}</b> kcal/día</div>
    </section>
    <section class="tarjeta">
      ${deficit > 0
        ? `<p>Ritmo actual: <b>≈ ${r0(((deficit * 7) / 7700) * 1000)} g por semana</b>.</p>
           ${proy.semanas
             ? `<p>Llegarías a ${String(p.peso_objetivo_kg).replace('.', ',')} kg en unas <b>${proy.semanas} semanas</b> (hacia ${fechaMeta}). El cálculo ya tiene en cuenta que el gasto baja a medida que adelgazas.</p>`
             : '<p>Con este menú no se llega al objetivo en 2 años: el déficit se agota antes. Prueba a subir la actividad.</p>'}`
        : '<p>Con estos datos el menú no genera déficit. Sube la actividad en lugar de bajar de 1.200 kcal.</p>'}
      <p class="nota">Cambiar la actividad a «Ligera» (≈ 8.000 pasos al día) acelera mucho más que comer menos. No bajes de ${p.kcal_minimo} kcal. Estos cálculos son estimaciones y no sustituyen el consejo de un profesional sanitario.</p>
    </section>
    <section class="tarjeta">
      <h2>Excluidos siempre</h2>
      <p>${p.excluidos.map(esc).join(' · ')}</p>
      <p class="nota">El salmón solo aparece con una alternativa al lado para cambiarlo con un toque.</p>
    </section>`;
}

// ---------- Router ----------
const vista = document.getElementById('vista');

function render() {
  const [ruta, param] = location.hash.replace('#', '').split('/');
  let html;
  if (ruta === 'semana') html = vistaSemana();
  else if (ruta === 'dia' && plan.dias[param]) html = vistaDia(Number(param), false);
  else if (ruta === 'recetas') html = vistaRecetas();
  else if (ruta === 'perfil') html = vistaPerfil();
  else html = vistaDia(indiceDia(new Date()), true);

  if (problemas.length) {
    html = `<div class="alerta"><b>Revisar recetas:</b><ul>${problemas.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>` + html;
  }
  // Conserva qué tarjetas estaban abiertas al volver a pintar.
  const abiertas = new Set([...vista.querySelectorAll('details[open]')].map((d) => d.dataset.receta));
  vista.innerHTML = html;
  vista.querySelectorAll('details').forEach((d) => {
    if (abiertas.has(d.dataset.receta)) d.open = true;
  });

  const activa = ruta === 'dia' ? 'semana' : ruta || 'hoy';
  document.querySelectorAll('nav a').forEach((a) => a.setAttribute('aria-current', a.dataset.ruta === activa ? 'page' : 'false'));
}

// ---------- Eventos ----------
vista.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.hecho) {
    const f = el.dataset.fecha;
    estado.hechos[f] = { ...estado.hechos[f], [el.dataset.hecho]: el.checked };
    guardarEstado();
    render();
  } else if (el.dataset.perfil) {
    const v = el.tagName === 'SELECT' ? el.value : parseFloat(el.value);
    if (el.tagName === 'SELECT' || Number.isFinite(v)) {
      estado.perfil[el.dataset.perfil] = v;
      guardarEstado();
      render();
    }
  }
});

vista.addEventListener('click', (e) => {
  const alt = e.target.closest('[data-alt]');
  if (alt) {
    estado.alternativas[alt.dataset.alt] = alt.dataset.valor === '1';
    guardarEstado();
    render();
    return;
  }
  const filtro = e.target.closest('[data-filtro]');
  if (filtro) {
    filtroTipo = filtro.dataset.filtro;
    render();
  }
});

vista.addEventListener('input', (e) => {
  if (e.target.id === 'buscar') {
    busqueda = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const input = document.getElementById('buscar');
    input.focus();
    input.setSelectionRange(pos, pos);
  }
});

window.addEventListener('hashchange', () => {
  vista.innerHTML = '';
  render();
  window.scrollTo(0, 0);
});

// ---------- Arranque ----------
async function iniciar() {
  const cargar = (f) => fetch(`data/${f}`).then((r) => r.json());
  let recetasLista;
  [alimentos, recetasLista, plan, perfilBase] = await Promise.all(
    ['alimentos.json', 'recetas.json', 'plan-semanal.json', 'perfil.json'].map(cargar),
  );
  delete alimentos._nota;
  recetas = recetasLista;
  recetaPorId = Object.fromEntries(recetas.map((r) => [r.id, r]));
  problemas = validar(recetas, alimentos, perfilBase);
  for (const d of plan.dias) {
    for (const t of TIPOS) if (!recetaPorId[d[t.id]]) problemas.push(`${d.dia}: no existe la receta "${d[t.id]}"`);
  }
  cargarEstado();
  render();
}

iniciar().catch((err) => {
  vista.innerHTML = `<div class="alerta">No se pudieron cargar los datos. ${esc(err.message)}</div>`;
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
