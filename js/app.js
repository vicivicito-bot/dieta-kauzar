import {
  TIPOS, ACTIVIDAD, RITMO, REPARTO, totales, sumar, metabolismoBasal, gastoTotal, kcalObjetivo, escalar, proyeccion, validar,
} from './nutricion.js';
import { aleatorio, elegir, generarSemana } from './menu.js';

const CLAVE = 'kauzar.v1';
const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
// No se ofrecen en "Mis gustos": vetarlos dejaría sin recetas o no tiene sentido.
const NO_VALORABLES = new Set(['aove', 'cafe', 'especias', 'edulcorante', 'caldo']);

let alimentos, recetas, recetaPorId, perfilBase, problemas;
// Lista de la compra: orden de los pasillos y cosas que no se apuntan (se tienen en casa).
const SECCIONES = ['Frutería', 'Carne y pescado', 'Charcutería', 'Huevos y lácteos', 'Panadería', 'Despensa', 'Congelados'];
const NO_COMPRAR = new Set(['cafe', 'especias', 'edulcorante']);
const LIQUIDOS = new Set(['bebida_soja', 'leche_desnatada', 'caldo']);

let estado = {
  hechos: {}, alternativas: {}, perfil: {}, ingredientes: {}, valoraciones: {}, semanas: {}, compra: {}, pesos: [],
};
let objetivo; // kcal diarias del menú; se recalcula en cada render

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
const miles = (n) => r0(n).toLocaleString('es-ES');
const fechaClave = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const leerFecha = (s) => {
  const [a, m, d] = s.split('-').map(Number);
  return new Date(a, m - 1, d);
};
const indiceDia = (d) => (d.getDay() + 6) % 7; // 0 = lunes
const masDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const lunesDe = (d) => masDias(d, -indiceDia(d));
const perfil = () => ({ ...perfilBase, ...estado.perfil });
const tipoDe = (id) => TIPOS.find((t) => t.id === id);

// ---------- Gustos y versión de cada receta ----------
const prohibido = (id) => estado.ingredientes[id] === 'no';
const permitida = (ingredientes) => ingredientes.every(([id]) => !prohibido(id));

// La versión que se usa (original o alternativa). Si una de las dos lleva algo vetado, se usa la otra.
function version(receta) {
  const alt = receta.alternativa;
  if (!alt) return receta;
  const okOriginal = permitida(receta.ingredientes);
  const okAlt = permitida(alt.ingredientes);
  if (okOriginal !== okAlt) return okAlt ? alt : receta;
  return estado.alternativas[receta.id] ? alt : receta;
}
const disponible = (r) => estado.valoraciones[r.id] !== 'no' && permitida(version(r).ingredientes);

// Receta con las cantidades ajustadas a las kcal que le tocan.
const porciones = new Map();
function porcion(receta, kcalMeta = objetivo * REPARTO[receta.tipo]) {
  const v = version(receta);
  const clave = `${receta.id}|${v === receta ? 0 : 1}|${r0(kcalMeta)}`;
  if (!porciones.has(clave)) {
    const ingredientes = escalar(v.ingredientes, kcalMeta, alimentos);
    porciones.set(clave, { nombre: v.nombre, ingredientes, pasos: v.pasos || receta.pasos, total: totales(ingredientes, alimentos) });
  }
  return porciones.get(clave);
}

function porcionesDia(dia) {
  const p = Object.fromEntries(TIPOS.map((t) => [t.id, porcion(recetaPorId[dia[t.id]])]));
  let total = sumar(Object.values(p).map((x) => x.total));
  // Si el redondeo deja el día por debajo del mínimo, la comida lo compensa.
  const minimo = perfil().kcal_minimo;
  for (let i = 0; i < 3 && total.kcal < minimo; i++) {
    const extra = minimo - total.kcal + 5;
    p.comida = porcion(recetaPorId[dia.comida], p.comida.total.kcal + extra);
    total = sumar(Object.values(p).map((x) => x.total));
  }
  return { porciones: p, total };
}

// El alimento que más proteína aporta: sirve para no repetirlo en comida y cena.
function principal(ingredientes) {
  let mejor = null;
  let max = 0;
  for (const [id, g] of ingredientes) {
    if (alimentos[id].p * g > max) [mejor, max] = [id, alimentos[id].p * g];
  }
  return mejor;
}

// ---------- Menús de cada semana (se guardan para que no cambien solos) ----------
function candidatos(evitar = new Set()) {
  const porTipo = {};
  for (const t of TIPOS) {
    let lista = recetas.filter((r) => r.tipo === t.id && disponible(r));
    if (!lista.length) lista = recetas.filter((r) => r.tipo === t.id);
    porTipo[t.id] = lista.map((r) => {
      const v = version(r);
      const favoritos = v.ingredientes.filter(([id]) => estado.ingredientes[id] === 'si').length;
      let peso = Math.min(4, 2 ** favoritos);
      if (estado.valoraciones[r.id] === 'si') peso *= 3;
      if (evitar.has(r.id)) peso *= 0.25;
      return { id: r.id, peso, p: porcion(r).total.p, principal: principal(v.ingredientes) };
    });
  }
  return porTipo;
}

// Recetas de la semana anterior: salen menos para no repetir.
function recetasSemanaAnterior(lunes) {
  const anterior = estado.semanas[fechaClave(masDias(lunes, -7))] || [];
  return new Set(anterior.flatMap((d) => Object.values(d)));
}

// Genera los días desde `desde` hasta el domingo y conserva los anteriores.
function rehacerSemana(lunes, desde, azar) {
  const clave = fechaClave(lunes);
  const previos = (estado.semanas[clave] || []).slice(0, desde);
  const usados = Object.fromEntries(TIPOS.map((t) => [t.id, previos.map((d) => d[t.id])]));
  const nuevos = generarSemana(candidatos(recetasSemanaAnterior(lunes)), {
    azar,
    proteinaMin: perfil().proteina_min_g,
    dias: 7 - desde,
    usados,
  });
  estado.semanas[clave] = [...previos, ...nuevos];
}

function cambiarReceta(lunes, indice, tipo) {
  const semana = estado.semanas[fechaClave(lunes)];
  const actual = semana[indice][tipo];
  const enSemana = new Set(semana.map((d) => d[tipo]));
  const lista = candidatos(recetasSemanaAnterior(lunes))[tipo].filter((c) => c.id !== actual);
  const nuevas = lista.filter((c) => !enSemana.has(c.id));
  const elegida = elegir(nuevas.length ? nuevas : lista.length ? lista : [{ id: actual, peso: 1 }], Math.random);
  semana[indice] = { ...semana[indice], [tipo]: elegida.id };
}

// Devuelve el menú de la semana: lo crea si no existe y cambia lo que ya no encaja con tus gustos.
function menuSemana(lunes) {
  const clave = fechaClave(lunes);
  let cambiado = false;
  if (!estado.semanas[clave]) {
    // La semana que viene necesita esta para no repetir platos.
    if (clave > fechaClave(lunesDe(new Date()))) menuSemana(masDias(lunes, -7));
    rehacerSemana(lunes, 0, aleatorio(clave));
    cambiado = true;
  }
  const hoy = fechaClave(new Date());
  estado.semanas[clave].forEach((dia, i) => {
    const pasado = fechaClave(masDias(lunes, i)) < hoy;
    for (const t of TIPOS) {
      const r = recetaPorId[dia[t.id]];
      if (!r || (!pasado && !disponible(r))) {
        cambiarReceta(lunes, i, t.id);
        cambiado = true;
      }
    }
  });
  if (cambiado) {
    // Solo se guardan la semana anterior, la actual y la siguiente.
    const limite = fechaClave(masDias(lunesDe(new Date()), -7));
    for (const k of Object.keys(estado.semanas)) if (k < limite) delete estado.semanas[k];
    for (const k of Object.keys(estado.compra)) if (k < limite) delete estado.compra[k];
    guardarEstado();
  }
  return estado.semanas[clave];
}

// ---------- Registro de peso ----------
// Un pesaje por fecha. El más reciente pasa a ser el peso actual, y con él se recalculan las kcal.
function registrarPeso(fecha, kg) {
  estado.pesos = [...estado.pesos.filter((x) => x.fecha !== fecha), { fecha, kg }].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  estado.perfil.peso_kg = estado.pesos.at(-1).kg;
}
function borrarPeso(fecha) {
  estado.pesos = estado.pesos.filter((x) => x.fecha !== fecha);
  if (estado.pesos.length) estado.perfil.peso_kg = estado.pesos.at(-1).kg;
}
const diasEntre = (a, b) => Math.round((leerFecha(b) - leerFecha(a)) / 86400000);
const tocaPesarse = () => !estado.pesos.length || diasEntre(estado.pesos.at(-1).fecha, fechaClave(new Date())) >= 7;

// ---------- Presentación ----------
const decimal = (n, d = 1) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const fechaCorta = (clave) => leerFecha(clave).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
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
function detalleReceta(receta, p) {
  let selector = '';
  // El selector solo aparece si las dos versiones encajan con tus gustos.
  if (receta.alternativa && permitida(receta.ingredientes) && permitida(receta.alternativa.ingredientes)) {
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
      ${p.ingredientes
        .map(([id, g]) => `<li><span>${esc(alimentos[id].nombre)}</span><span class="cant">${esc(cantidad(id, g))}</span></li>`)
        .join('')}
    </ul>
    <ol class="pasos">${p.pasos.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
    ${macros(p.total)}`;
}

function botonesValorar(receta) {
  const v = estado.valoraciones[receta.id];
  return `
    <button data-valorar="${receta.id}" data-valor="si" aria-pressed="${v === 'si'}">❤️ Me encanta</button>
    <button data-valorar="${receta.id}" data-valor="no" aria-pressed="${v === 'no'}">🚫 No me gusta</button>`;
}

// cambio: { fecha, tipo } si se puede cambiar por otra receta (días de hoy en adelante).
function tarjetaComida(tipo, receta, p, { fecha, abierta, cambio } = {}) {
  const hecho = fecha && estado.hechos[fecha]?.[tipo.id];
  const valor = estado.valoraciones[receta.id];
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
            <span>${esc(p.nombre)}</span>
            ${receta.alternativa ? `<em class="chip">🐟 alternativa disponible</em>` : ''}
            ${valor === 'si' ? `<em class="chip">❤️ te encanta</em>` : ''}
            ${valor === 'no' ? `<em class="chip aviso">🚫 no sale en tus menús</em>` : ''}
          </span>
          <span class="kcal">${r0(p.total.kcal)}<small>kcal</small></span>
        </summary>
        <div class="cuerpo">
          ${detalleReceta(receta, p)}
          <div class="acciones">
            ${cambio ? `<button class="principal" data-cambiar="${cambio.tipo}" data-fecha="${cambio.fecha}">🔄 Cambiar por otra</button>` : ''}
            ${botonesValorar(receta)}
          </div>
        </div>
      </details>
      ${check}
    </article>`;
}

function resumenDia(t, consumido) {
  const objetivoDia = Math.max(perfil().kcal_minimo, r0(t.kcal));
  const pct = consumido == null ? 100 : Math.min(100, (consumido.kcal / objetivoDia) * 100);
  const aoveOk = t.aove <= perfil().aove_max_g;
  return `
    <section class="resumen">
      <div class="cifra">
        ${consumido == null
          ? `<b>${miles(t.kcal)}</b> kcal en el plan`
          : `<b>${miles(consumido.kcal)}</b> / ${miles(t.kcal)} kcal`}
      </div>
      <div class="barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${r0(pct)}"><span style="width:${pct}%"></span></div>
      ${macros(t, 'compacto')}
      <p class="aove ${aoveOk ? '' : 'aviso'}">🫒 AOVE del día: ${r0(t.aove)} g de ${perfil().aove_max_g} g</p>
    </section>`;
}

// ---------- Vistas ----------
function vistaDia(fecha, esHoy) {
  const lunes = lunesDe(fecha);
  const i = indiceDia(fecha);
  const dia = menuSemana(lunes)[i];
  const clave = fechaClave(fecha);
  const editable = clave >= fechaClave(new Date());
  const { porciones: p, total } = porcionesDia(dia);
  const consumido = esHoy ? sumar(TIPOS.filter((t) => estado.hechos[clave]?.[t.id]).map((t) => p[t.id].total)) : null;
  const titulo = fecha.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const semanaQueViene = fechaClave(lunes) > fechaClave(lunesDe(new Date()));
  return `
    <header class="cabecera">
      ${esHoy ? '' : `<a href="#semana${semanaQueViene ? '/1' : ''}" class="volver" aria-label="Volver a la semana">‹ Semana</a>`}
      <h1>${esc(esHoy ? `Hoy, ${titulo}` : titulo)}</h1>
    </header>
    ${esHoy && tocaPesarse() ? '<a class="aviso-peso" href="#perfil">⚖️ <span>Toca pesarte. Mejor en ayunas y una vez por semana. <b>Apuntar peso ›</b></span></a>' : ''}
    ${resumenDia(total, consumido)}
    ${TIPOS.map((t) =>
      tarjetaComida(t, recetaPorId[dia[t.id]], p[t.id], {
        fecha: esHoy ? clave : null,
        cambio: editable ? { fecha: clave, tipo: t.id } : null,
      }),
    ).join('')}
    ${esHoy ? '<p class="pie">Toca una comida para ver ingredientes y preparación. Marca el círculo cuando la hagas.</p>' : ''}`;
}

function vistaSemana(desplazamiento) {
  const hoy = new Date();
  const lunes = masDias(lunesDe(hoy), desplazamiento * 7);
  const menu = menuSemana(lunes);
  const domingo = masDias(lunes, 6);
  const rango = `${lunes.getDate()} ${lunes.toLocaleDateString('es-ES', { month: 'short' })} – ${domingo.getDate()} ${domingo.toLocaleDateString('es-ES', { month: 'short' })}`;
  return `
    <header class="cabecera"><h1>Semana</h1></header>
    <div class="chips" role="group" aria-label="Elegir semana">
      <a href="#semana" aria-pressed="${desplazamiento === 0}">Esta semana</a>
      <a href="#semana/1" aria-pressed="${desplazamiento === 1}">La que viene</a>
    </div>
    <p class="nota">${esc(rango)}</p>
    <ul class="semana">
      ${menu
        .map((d, i) => {
          const fecha = masDias(lunes, i);
          const t = porcionesDia(d).total;
          return `<li>
            <a href="#dia/${fechaClave(fecha)}" class="${fechaClave(fecha) === fechaClave(hoy) ? 'hoy' : ''}">
              <span class="d">${DIAS_CORTOS[i]}<small>${fecha.getDate()}</small></span>
              <span class="platos">
                <span>${esc(porcion(recetaPorId[d.comida]).nombre)}</span>
                <small>${esc(porcion(recetaPorId[d.cena]).nombre)}</small>
              </span>
              <span class="kcal">${miles(t.kcal)}<small>kcal</small></span>
            </a>
          </li>`;
        })
        .join('')}
    </ul>
    <p class="pie">Comida arriba, cena debajo. Toca un día para verlo completo y cambiar platos.</p>
    <a class="boton-ancho" href="#compra${desplazamiento ? '/1' : ''}">🛒 Lista de la compra</a>
    <button class="boton-ancho" data-rehacer="${fechaClave(lunes)}">🔀 Hacer otro menú para esta semana</button>
    <p class="pie">${desplazamiento === 0 ? 'Cambia los platos de hoy al domingo; los días pasados se quedan como están.' : 'Cambia todos los platos de esa semana.'}</p>`;
}

function cantidadCompra(id, g) {
  const a = alimentos[id];
  const liquido = LIQUIDOS.has(id);
  const peso = (x) =>
    x >= 1000
      ? `${decimal(x / 1000)} ${liquido ? 'l' : 'kg'}`
      : `${x >= 100 ? Math.round(x / 10) * 10 : Math.round(x)} ${liquido ? 'ml' : 'g'}`;
  if (a.ud) {
    const n = Math.max(1, Math.ceil(g / a.ud - 0.15));
    return `${n} ${n === 1 ? 'ud' : 'uds'} (${peso(g)})`;
  }
  if (a.seco) return `${peso(g * a.seco)} en seco`;
  return peso(g);
}

// Suma lo que piden los menús, de hoy al domingo (o la semana entera si es la que viene).
function listaCompra(lunes, desde) {
  const menu = menuSemana(lunes);
  const suma = {};
  for (let i = desde; i < 7; i++) {
    for (const p of Object.values(porcionesDia(menu[i]).porciones)) {
      for (const [id, g] of p.ingredientes) if (!NO_COMPRAR.has(id)) suma[id] = (suma[id] || 0) + g;
    }
  }
  // El arroz, la pasta… se compran en seco: fuera el "(cocido)" del nombre.
  const nombre = (id) => (alimentos[id].seco ? alimentos[id].nombre.replace(/\s*\(cocid[ao]\)/, '') : alimentos[id].nombre);
  return SECCIONES.map((s) => ({
    seccion: s,
    items: Object.keys(suma)
      .filter((id) => alimentos[id].seccion === s)
      .sort((x, y) => nombre(x).localeCompare(nombre(y), 'es'))
      .map((id) => ({ id, nombre: nombre(id), cantidad: cantidadCompra(id, suma[id]) })),
  })).filter((s) => s.items.length);
}

function datosCompra(desplazamiento) {
  const hoy = new Date();
  const lunes = masDias(lunesDe(hoy), desplazamiento * 7);
  const desde = desplazamiento === 0 ? indiceDia(hoy) : 0;
  return { lunes, desde, clave: fechaClave(lunes), secciones: listaCompra(lunes, desde) };
}

function vistaCompra(desplazamiento) {
  const { lunes, desde, clave, secciones } = datosCompra(desplazamiento);
  const marcados = estado.compra[clave] || {};
  const todos = secciones.flatMap((s) => s.items);
  const faltan = todos.filter((x) => !marcados[x.id]).length;
  const inicio = masDias(lunes, desde).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' });
  const fin = masDias(lunes, 6).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' });
  return `
    <header class="cabecera">
      <a href="#semana${desplazamiento ? '/1' : ''}" class="volver" aria-label="Volver a la semana">‹ Semana</a>
      <h1>Lista de la compra</h1>
    </header>
    <div class="chips" role="group" aria-label="Elegir semana">
      <a href="#compra" aria-pressed="${desplazamiento === 0}">Esta semana</a>
      <a href="#compra/1" aria-pressed="${desplazamiento === 1}">La que viene</a>
    </div>
    <p class="nota">${desde === 6
      ? `Solo para hoy, ${esc(inicio)}. ¿Compras para la semana que viene? Toca «La que viene».`
      : `Para los menús del ${esc(inicio)} al ${esc(fin)}, con tus cantidades.`} ${faltan ? `Te faltan <b>${faltan}</b> de ${todos.length}.` : '¡Lo tienes todo!'}</p>
    ${secciones
      .map(
        (s) => `<section class="tarjeta">
          <h2>${esc(s.seccion)}</h2>
          <ul class="compra">
            ${s.items
              .map(
                (x) => `<li class="${marcados[x.id] ? 'comprado' : ''}">
                  <label>
                    <input type="checkbox" data-comprado="${x.id}" data-semana="${clave}" ${marcados[x.id] ? 'checked' : ''}>
                    <span>${esc(x.nombre)}</span>
                    <span class="cant">${esc(x.cantidad)}</span>
                  </label>
                </li>`,
              )
              .join('')}
          </ul>
        </section>`,
      )
      .join('')}
    <button class="boton-ancho" data-compartir="${desplazamiento}">📤 Enviar la lista (lo que falta)</button>
    <p class="pie">Café o té, especias y edulcorante no se apuntan: se supone que los tienes en casa. Si cambias platos del menú, la lista se actualiza sola.</p>`;
}

async function compartirLista(desplazamiento) {
  const { clave, secciones } = datosCompra(desplazamiento);
  const marcados = estado.compra[clave] || {};
  const texto = secciones
    .map((s) => ({ ...s, items: s.items.filter((x) => !marcados[x.id]) }))
    .filter((s) => s.items.length)
    .map((s) => `${s.seccion.toUpperCase()}\n${s.items.map((x) => `- ${x.nombre}: ${x.cantidad}`).join('\n')}`)
    .join('\n\n');
  try {
    if (navigator.share) await navigator.share({ title: 'Lista de la compra', text: texto });
    else {
      await navigator.clipboard.writeText(texto);
      alert('Lista copiada. Pégala donde quieras (WhatsApp, notas…).');
    }
  } catch {}
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
      <button data-filtro="todas" aria-pressed="${filtroTipo === 'todas'}">Todas (${recetas.length})</button>
      ${TIPOS.map((t) => `<button data-filtro="${t.id}" aria-pressed="${filtroTipo === t.id}">${t.nombre}</button>`).join('')}
    </div>
    <p class="nota">Las cantidades ya están ajustadas a tus ${miles(objetivo)} kcal diarias.</p>
    <div id="lista-recetas">
      ${lista.length
        ? lista.map((r) => tarjetaComida(tipoDe(r.tipo), r, porcion(r))).join('')
        : '<p class="pie">No hay recetas que coincidan.</p>'}
    </div>`;
}

function vistaGustos() {
  // Cuántas recetas usa cada alimento, para ver lo que supone vetarlo.
  const usos = {};
  for (const r of recetas) {
    const ids = new Set([...r.ingredientes, ...(r.alternativa?.ingredientes || [])].map(([id]) => id));
    for (const id of ids) usos[id] = (usos[id] || 0) + 1;
  }
  const secciones = {};
  for (const [id, a] of Object.entries(alimentos)) {
    if (!usos[id] || NO_VALORABLES.has(id)) continue;
    (secciones[a.seccion] ||= []).push(id);
  }
  const avisos = TIPOS.map((t) => {
    const n = recetas.filter((r) => r.tipo === t.id && disponible(r)).length;
    if (!n) return `No queda ninguna receta de ${t.nombre.toLowerCase()} con tus gustos, así que se usan todas.`;
    if (n < 7) return `Solo quedan ${n} recetas de ${t.nombre.toLowerCase()}: alguna se repetirá en la semana.`;
    return null;
  }).filter(Boolean);
  const valoradas = Object.entries(estado.valoraciones).filter(([id]) => recetaPorId[id]);
  const fila = (id) => {
    const v = estado.ingredientes[id];
    const nombre = alimentos[id].nombre;
    return `<li class="${v === 'no' ? 'vetado' : ''}">
      <span>${esc(nombre)}<small>${usos[id]} ${usos[id] === 1 ? 'receta' : 'recetas'}</small></span>
      <span class="botones">
        <button data-gusto="${id}" data-valor="si" aria-pressed="${v === 'si'}" aria-label="Me gusta: ${esc(nombre)}">❤️</button>
        <button data-gusto="${id}" data-valor="no" aria-pressed="${v === 'no'}" aria-label="No quiero: ${esc(nombre)}">🚫</button>
      </span>
    </li>`;
  };
  return `
    <header class="cabecera"><h1>Mis gustos</h1></header>
    <p class="nota">Marca ❤️ lo que te gusta (saldrá más a menudo) y 🚫 lo que no quieres (no saldrá nunca). Los menús se ajustan solos.</p>
    ${avisos.length ? `<div class="alerta"><ul>${avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
    <section class="tarjeta">
      <h2>Nunca aparecen</h2>
      <p>${perfil().excluidos.map(esc).join(' · ')}</p>
      <p class="nota">El salmón siempre lleva una alternativa al lado. Si marcas 🚫 el salmón, se usa siempre la alternativa.</p>
    </section>
    ${valoradas.length
      ? `<section class="tarjeta">
          <h2>Recetas que has valorado</h2>
          <ul class="gustos">
            ${valoradas
              .map(([id, v]) => `<li><span>${v === 'si' ? '❤️' : '🚫'} ${esc(porcion(recetaPorId[id]).nombre)}</span>
                <span class="botones"><button data-valorar="${id}" data-valor="${v}" aria-pressed="true">Quitar</button></span></li>`)
              .join('')}
          </ul>
        </section>`
      : ''}
    ${Object.entries(secciones)
      .map(([s, ids]) => `<section class="tarjeta"><h2>${esc(s)}</h2><ul class="gustos">${ids.map(fila).join('')}</ul></section>`)
      .join('')}`;
}

// Gráfica de línea del peso con la línea del objetivo. Tocar un punto muestra su dato.
function graficaPeso(pesos, objetivoKg) {
  const W = 340, H = 180, izq = 34, der = 14, arr = 14, aba = 24;
  const kgs = pesos.map((x) => x.kg);
  let lo = Math.floor(Math.min(...kgs, objetivoKg) - 0.5);
  let hi = Math.ceil(Math.max(...kgs, objetivoKg) + 0.5);
  const paso = [0.5, 1, 2, 5, 10].find((p) => (hi - lo) / p <= 4) || 20;
  lo = Math.floor(lo / paso) * paso;
  hi = Math.ceil(hi / paso) * paso;
  const total = Math.max(1, diasEntre(pesos[0].fecha, pesos.at(-1).fecha));
  const x = (f) => izq + ((W - izq - der) * diasEntre(pesos[0].fecha, f)) / total;
  const y = (kg) => arr + ((H - arr - aba) * (hi - kg)) / (hi - lo);
  const marcas = [];
  for (let v = lo; v <= hi + 1e-9; v += paso) marcas.push(v);
  const ultimo = pesos.at(-1);
  const etiquetaDerecha = x(ultimo.fecha) > W - 60;
  // La etiqueta del último dato va al lado contrario por el que llega la línea, para no pisarla.
  const etiquetaDebajo = pesos.at(-2).kg >= ultimo.kg && y(ultimo.kg) + 20 < H - aba;
  return `
    <svg class="grafica" viewBox="0 0 ${W} ${H}" role="img"
      aria-label="Evolución del peso: de ${decimal(pesos[0].kg)} kg el ${fechaCorta(pesos[0].fecha)} a ${decimal(ultimo.kg)} kg el ${fechaCorta(ultimo.fecha)}. Objetivo ${decimal(objetivoKg)} kg.">
      ${marcas
        .map((v) => `<line class="rejilla" x1="${izq}" x2="${W - der}" y1="${y(v)}" y2="${y(v)}"/>
          <text class="eje" x="${izq - 6}" y="${y(v) + 4}" text-anchor="end">${decimal(v, paso < 1 ? 1 : 0)}</text>`)
        .join('')}
      <line class="meta" x1="${izq}" x2="${W - der}" y1="${y(objetivoKg)}" y2="${y(objetivoKg)}"/>
      <text class="eje" x="${W - der}" y="${y(objetivoKg) - 5}" text-anchor="end">Objetivo ${decimal(objetivoKg)}</text>
      <text class="eje" x="${izq}" y="${H - 6}">${fechaCorta(pesos[0].fecha)}</text>
      <text class="eje" x="${W - der}" y="${H - 6}" text-anchor="end">${fechaCorta(ultimo.fecha)}</text>
      <polyline class="linea" points="${pesos.map((p) => `${x(p.fecha)},${y(p.kg)}`).join(' ')}"/>
      ${pesos.map((p) => `<circle class="punto" cx="${x(p.fecha)}" cy="${y(p.kg)}" r="4"/>`).join('')}
      <text class="valor" x="${x(ultimo.fecha) + (etiquetaDerecha ? -8 : 8)}" y="${y(ultimo.kg) + (etiquetaDebajo ? 18 : -9)}" text-anchor="${etiquetaDerecha ? 'end' : 'start'}">${decimal(ultimo.kg)} kg</text>
      ${pesos
        .map((p) => `<circle class="toque" cx="${x(p.fecha)}" cy="${y(p.kg)}" r="14" data-punto="${p.fecha}" data-kg="${p.kg}">
          <title>${fechaCorta(p.fecha)}: ${decimal(p.kg)} kg</title></circle>`)
        .join('')}
    </svg>`;
}

function seccionPeso(p, kcalDia) {
  const pesos = estado.pesos;
  const hoy = fechaClave(new Date());
  let resumen = '';
  if (pesos.length >= 2) {
    const inicio = pesos[0];
    const ultimo = pesos.at(-1);
    const cambio = ultimo.kg - inicio.kg;
    const semanas = diasEntre(inicio.fecha, ultimo.fecha) / 7;
    const previsto = Math.max(0, ((gastoTotal(p) - kcalDia) * 7) / 7700) * 1000;
    const faltan = ultimo.kg - p.peso_objetivo_kg;
    resumen = `
      <div class="numeros">
        <div><small>Desde el ${fechaCorta(inicio.fecha)}</small><b>${cambio > 0 ? '+' : ''}${decimal(cambio)}</b> kg</div>
        <div><small>Te faltan</small><b>${decimal(Math.max(0, faltan))}</b> kg</div>
      </div>
      ${semanas >= 2
        ? `<p class="nota">Vas a ≈ <b>${r0((-cambio / semanas) * 1000)} g por semana</b>${previsto ? `; lo previsto era ≈ ${r0(previsto)} g` : ''}. ${
            cambio >= 0
              ? 'Si sigue sin bajar unas semanas más, lo que mejor funciona es moverse más.'
              : 'El peso sube y baja de un día a otro: fíjate en la tendencia, no en un pesaje suelto.'
          }</p>`
        : ''}`;
  }
  return `
    <section class="tarjeta">
      <h2>Mi peso</h2>
      <form id="form-peso" class="form-peso">
        <label>Peso (kg)<input name="kg" type="number" inputmode="decimal" step="0.1" min="30" max="250" required placeholder="${decimal(p.peso_kg)}"></label>
        <label>Fecha<input name="fecha" type="date" value="${hoy}" max="${hoy}" required></label>
        <button type="submit">Guardar</button>
      </form>
      <p class="nota">Pésate en ayunas, una vez por semana y el mismo día. Al guardar, tu peso actual y tus kcal se actualizan solos.</p>
      ${pesos.length >= 2
        ? `${graficaPeso(pesos, p.peso_objetivo_kg)}<p class="nota lectura" id="lectura-peso" aria-live="polite">Toca un punto para ver su dato.</p>`
        : pesos.length === 1
          ? '<p class="nota">Con dos pesajes aparecerá aquí la gráfica.</p>'
          : ''}
      ${resumen}
      ${pesos.length
        ? `<ul class="pesajes">
            ${pesos
              .map((x, i) => ({ ...x, dif: i ? x.kg - pesos[i - 1].kg : null }))
              .slice(-8)
              .reverse()
              .map((x) => `<li>
                <span>${fechaCorta(x.fecha)}</span>
                <b>${decimal(x.kg)} kg</b>
                <small>${x.dif == null ? '' : `${x.dif > 0 ? '+' : ''}${decimal(x.dif)}`}</small>
                <button data-borrar-peso="${x.fecha}" aria-label="Borrar el pesaje del ${fechaCorta(x.fecha)}">✕</button>
              </li>`)
              .join('')}
          </ul>`
        : ''}
    </section>`;
}

function vistaPerfil() {
  const p = perfil();
  const mb = metabolismoBasal(p);
  const tdee = gastoTotal(p);
  const deficit = tdee - objetivo;
  const enObjetivo = p.peso_kg <= p.peso_objetivo_kg;
  const enMinimo = !enObjetivo && objetivo === p.kcal_minimo && tdee - RITMO[p.ritmo || 'normal'].deficit < p.kcal_minimo;
  const proy = proyeccion(p, objetivo);
  let fechaMeta = '';
  if (proy.semanas) {
    const f = new Date();
    f.setDate(f.getDate() + proy.semanas * 7);
    fechaMeta = f.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  }
  const campo = (id, etiqueta, valor, attrs) =>
    `<label>${etiqueta}<input type="number" inputmode="decimal" data-perfil="${id}" value="${valor}" ${attrs}></label>`;
  const selector = (id, etiqueta, opciones, valor) => `<label class="ancho">${etiqueta}
      <select data-perfil="${id}">
        ${Object.entries(opciones).map(([k, o]) => `<option value="${k}" ${k === valor ? 'selected' : ''}>${o.nombre}</option>`).join('')}
      </select>
    </label>`;
  let explicacion;
  if (enObjetivo) explicacion = '<p>🎉 Ya estás en tu peso objetivo: el menú pasa a <b>mantenimiento</b> (lo que gastas cada día).</p>';
  else if (enMinimo)
    explicacion = `<p>Tu gasto diario es bajo, así que el menú se queda en el mínimo de <b>${miles(p.kcal_minimo)} kcal</b>: no se baja de ahí. Para ir más rápido, lo que funciona es moverse más (cambia la actividad y verás el efecto).</p>`;
  else explicacion = `<p>El menú se calcula como tu gasto diario menos ${RITMO[p.ritmo || 'normal'].deficit} kcal, según el ritmo elegido.</p>`;
  return `
    <header class="cabecera"><h1>Mis números</h1></header>
    ${Object.keys(estado.perfil).length
      ? ''
      : '<div class="alerta">Estos son datos de ejemplo. Escribe los tuyos: se guardan solo en este móvil.</div>'}
    ${seccionPeso(p, objetivo)}
    <section class="tarjeta formulario">
      ${campo('peso_kg', 'Peso actual (kg)', p.peso_kg, 'step="0.1" min="30" max="200"')}
      ${campo('peso_objetivo_kg', 'Peso objetivo (kg)', p.peso_objetivo_kg, 'step="0.1" min="30" max="200"')}
      ${campo('edad', 'Edad', p.edad, 'step="1" min="14" max="100"')}
      ${campo('altura_cm', 'Altura (cm)', p.altura_cm, 'step="1" min="120" max="220"')}
      ${selector('actividad', 'Actividad', ACTIVIDAD, p.actividad)}
      ${selector('ritmo', 'Ritmo de pérdida', RITMO, p.ritmo || 'normal')}
    </section>
    <section class="tarjeta numeros">
      <div><small>Metabolismo basal</small><b>${miles(mb)}</b> kcal</div>
      <div><small>Gasto diario</small><b>${miles(tdee)}</b> kcal</div>
      <div class="destacado"><small>Tu menú diario</small><b>${miles(objetivo)}</b> kcal</div>
      <div><small>Déficit</small><b>${miles(Math.max(0, deficit))}</b> kcal/día</div>
    </section>
    <section class="tarjeta">
      ${explicacion}
      ${!enObjetivo && deficit > 0
        ? `<p>Ritmo estimado: <b>≈ ${r0(((deficit * 7) / 7700) * 1000)} g por semana</b>.</p>
           ${proy.semanas
             ? `<p>Llegarías a ${String(p.peso_objetivo_kg).replace('.', ',')} kg en unas <b>${proy.semanas} semanas</b> (hacia ${fechaMeta}). El cálculo ya tiene en cuenta que el gasto baja a medida que adelgazas.</p>`
             : '<p>Con este menú no se llega al objetivo en 2 años: el déficit se agota antes. Prueba a subir la actividad.</p>'}`
        : ''}
      ${!enObjetivo && deficit <= 0 ? '<p>Con estos datos el menú no genera déficit. Sube la actividad en lugar de bajar de 1.200 kcal.</p>' : ''}
      <p class="nota">Cuando cambies tu peso, las cantidades de las recetas se ajustan solas. Estos cálculos son estimaciones y no sustituyen el consejo de un profesional sanitario.</p>
    </section>
    <section class="tarjeta">
      <h2>Cómo se reparte el día</h2>
      <ul class="reparto">
        ${TIPOS.map((t) => `<li><span>${t.icono} ${t.nombre}</span><b>≈ ${miles(objetivo * REPARTO[t.id])} kcal</b></li>`).join('')}
      </ul>
      <p class="nota">Aceite de oliva: máximo ${p.aove_max_g} g al día. Proteína: unos ${p.proteina_min_g} g al día o más.</p>
    </section>`;
}

// ---------- Router ----------
const vista = document.getElementById('vista');

function render() {
  objetivo = kcalObjetivo(perfil());
  const [ruta, param] = location.hash.replace('#', '').split('/');
  const hoy = new Date();
  let html;
  if (ruta === 'semana') html = vistaSemana(param === '1' ? 1 : 0);
  else if (ruta === 'compra') html = vistaCompra(param === '1' ? 1 : 0);
  else if (ruta === 'dia' && /^\d{4}-\d{2}-\d{2}$/.test(param || '')) {
    const fecha = leerFecha(param);
    // Solo esta semana y la siguiente.
    const desde = lunesDe(hoy);
    const ok = fecha >= desde && fecha < masDias(desde, 14);
    html = ok ? vistaDia(fecha, fechaClave(fecha) === fechaClave(hoy)) : vistaDia(hoy, true);
  } else if (ruta === 'recetas') html = vistaRecetas();
  else if (ruta === 'gustos') html = vistaGustos();
  else if (ruta === 'perfil') html = vistaPerfil();
  else html = vistaDia(hoy, true);

  if (problemas.length) {
    html = `<div class="alerta"><b>Revisar recetas:</b><ul>${problemas.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>` + html;
  }
  // Conserva qué tarjetas estaban abiertas al volver a pintar.
  const abiertas = new Set([...vista.querySelectorAll('details[open]')].map((d) => d.dataset.receta));
  vista.innerHTML = html;
  vista.querySelectorAll('details').forEach((d) => {
    if (abiertas.has(d.dataset.receta)) d.open = true;
  });

  const activa = ruta === 'dia' || ruta === 'compra' ? 'semana' : ruta || 'hoy';
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
  } else if (el.dataset.comprado) {
    const s = el.dataset.semana;
    estado.compra[s] = { ...estado.compra[s], [el.dataset.comprado]: el.checked };
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

// Pulsar otra vez el mismo botón lo desmarca.
function alternar(mapa, id, valor) {
  if (mapa[id] === valor) delete mapa[id];
  else mapa[id] = valor;
}

vista.addEventListener('submit', (e) => {
  if (e.target.id !== 'form-peso') return;
  e.preventDefault();
  const datos = new FormData(e.target);
  const kg = parseFloat(String(datos.get('kg')).replace(',', '.'));
  const fecha = datos.get('fecha');
  if (!Number.isFinite(kg) || !fecha) return;
  registrarPeso(fecha, Math.round(kg * 10) / 10);
  guardarEstado();
  render();
});

vista.addEventListener('click', (e) => {
  const punto = e.target.closest('[data-punto]');
  if (punto) {
    const lectura = document.getElementById('lectura-peso');
    lectura.textContent = `${fechaCorta(punto.dataset.punto)}: ${decimal(Number(punto.dataset.kg))} kg`;
    vista.querySelectorAll('.punto').forEach((c, i) => c.classList.toggle('activo', vista.querySelectorAll('.toque')[i] === punto));
    return;
  }
  const boton = e.target.closest('button');
  if (!boton) return;
  const d = boton.dataset;
  if (d.compartir) {
    compartirLista(Number(d.compartir));
    return;
  }
  if (d.borrarPeso) {
    if (!confirm('¿Borrar este pesaje?')) return;
    borrarPeso(d.borrarPeso);
  } else if (d.alt) estado.alternativas[d.alt] = d.valor === '1';
  else if (d.gusto) alternar(estado.ingredientes, d.gusto, d.valor);
  else if (d.valorar) alternar(estado.valoraciones, d.valorar, d.valor);
  else if (d.cambiar) {
    const fecha = leerFecha(d.fecha);
    cambiarReceta(lunesDe(fecha), indiceDia(fecha), d.cambiar);
  } else if (d.rehacer) {
    const lunes = leerFecha(d.rehacer);
    if (!confirm('¿Hacer un menú nuevo? Los platos que no hayas pasado cambiarán.')) return;
    const hoy = new Date();
    const desde = fechaClave(lunes) === fechaClave(lunesDe(hoy)) ? indiceDia(hoy) : 0;
    rehacerSemana(lunes, desde, Math.random);
  } else if (d.filtro) {
    filtroTipo = d.filtro;
    render();
    return;
  } else return;
  guardarEstado();
  render();
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
  [alimentos, recetas, perfilBase] = await Promise.all(['alimentos.json', 'recetas.json', 'perfil.json'].map(cargar));
  delete alimentos._nota;
  recetaPorId = Object.fromEntries(recetas.map((r) => [r.id, r]));
  problemas = validar(recetas, alimentos, perfilBase);
  cargarEstado();
  render();
}

iniciar().catch((err) => {
  vista.innerHTML = `<div class="alerta">No se pudieron cargar los datos. ${esc(err.message)}</div>`;
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
