// Cálculos nutricionales. Funciones puras: sin DOM ni almacenamiento.

export const TIPOS = [
  { id: 'desayuno', nombre: 'Desayuno', icono: '☕' },
  { id: 'media_manana', nombre: 'Media mañana', icono: '🍎' },
  { id: 'comida', nombre: 'Comida', icono: '🍽️' },
  { id: 'merienda', nombre: 'Merienda', icono: '🥣' },
  { id: 'cena', nombre: 'Cena', icono: '🌙' },
];

// pasos: los que ya cuenta ese nivel en un día normal; solo los de más suman kcal.
export const ACTIVIDAD = {
  sedentaria: { nombre: 'Sedentaria (oficina, < 5.000 pasos)', factor: 1.2, pasos: 5000 },
  ligera: { nombre: 'Ligera (≈ 8.000 pasos o 1-3 días de ejercicio)', factor: 1.375, pasos: 8000 },
  moderada: { nombre: 'Moderada (3-5 días de ejercicio)', factor: 1.55, pasos: 9000 },
  alta: { nombre: 'Alta (6-7 días de ejercicio)', factor: 1.725, pasos: 10000 },
};

// Gasto de cada ejercicio en METs (Compendium of Physical Activities, valores típicos).
// Caminar no está: se apunta con los pasos.
export const EJERCICIOS = {
  correr: { nombre: 'Correr', met: 9 },
  bici: { nombre: 'Bici o spinning', met: 7 },
  nadar: { nombre: 'Nadar', met: 6 },
  pesas: { nombre: 'Gimnasio (pesas)', met: 5 },
  eliptica: { nombre: 'Elíptica', met: 5 },
  clases: { nombre: 'Zumba, aeróbic o baile', met: 6.5 },
  raqueta: { nombre: 'Pádel o tenis', met: 7 },
  yoga: { nombre: 'Yoga o pilates', met: 3 },
};

// Del gasto extra, cuánto se suma al menú: la mitad, con tope, para seguir en déficit.
export const ACTIVIDAD_DEVUELTA = 0.5;
export const ACTIVIDAD_TOPE_KCAL = 400;

// Grupos de alimentos que se pueden cambiar entre sí.
// Las verduras se cambian gramo a gramo (casi no tienen kcal); el resto, a igualdad de kcal.
export const GRUPOS = {
  proteina: { nombre: 'Carnes, pescados y huevos', icono: '🍗', base: ['pollo', 100] },
  hidratos: { nombre: 'Cereales, pan y patata', icono: '🍚', base: ['arroz', 100] },
  legumbre: { nombre: 'Legumbres', icono: '🫘', base: ['lentejas', 150] },
  fruta: { nombre: 'Fruta', icono: '🍎', base: ['manzana', 130] },
  lacteo: { nombre: 'Lácteos y bebidas', icono: '🥛', base: ['yogur_0', 125] },
  grasa: { nombre: 'Grasas y frutos secos', icono: '🥑', base: ['almendras', 10] },
  verdura: { nombre: 'Verduras', icono: '🥦', base: ['calabacin', 150], gramoAGramo: true },
};

// Déficit diario según lo rápido que quiera ir (7.700 kcal ≈ 1 kg).
export const RITMO = {
  suave: { nombre: 'Suave (≈ 250 g por semana)', deficit: 275 },
  normal: { nombre: 'Normal (≈ 500 g por semana)', deficit: 550 },
};

// Parte de las kcal del día que va a cada comida (suma 1).
export const REPARTO = { desayuno: 0.23, media_manana: 0.075, comida: 0.33, merienda: 0.085, cena: 0.28 };

const KCAL_POR_KG_GRASA = 7700;

// Suma kcal y macros de una lista de [idAlimento, gramos].
export function totales(ingredientes, alimentos) {
  const t = { kcal: 0, p: 0, c: 0, g: 0, aove: 0 };
  for (const [id, gramos] of ingredientes) {
    const a = alimentos[id];
    if (!a) continue;
    t.kcal += (a.kcal * gramos) / 100;
    t.p += (a.p * gramos) / 100;
    t.c += (a.c * gramos) / 100;
    t.g += (a.g * gramos) / 100;
    if (id === 'aove') t.aove += gramos;
  }
  return t;
}

export function sumar(lista) {
  return lista.reduce(
    (acc, t) => ({ kcal: acc.kcal + t.kcal, p: acc.p + t.p, c: acc.c + t.c, g: acc.g + t.g, aove: acc.aove + t.aove }),
    { kcal: 0, p: 0, c: 0, g: 0, aove: 0 },
  );
}

// Metabolismo basal, fórmula de Mifflin-St Jeor.
export function metabolismoBasal({ sexo, edad, altura_cm, peso_kg }) {
  const base = 10 * peso_kg + 6.25 * altura_cm - 5 * edad;
  return sexo === 'hombre' ? base + 5 : base - 161;
}

export function gastoTotal(perfil) {
  const factor = (ACTIVIDAD[perfil.actividad] || ACTIVIDAD.sedentaria).factor;
  return metabolismoBasal(perfil) * factor;
}

// Kcal diarias del menú: gasto menos el déficit del ritmo, nunca por debajo del mínimo.
// Con el objetivo alcanzado, mantenimiento.
export function kcalObjetivo(perfil) {
  const gasto = gastoTotal(perfil);
  const meta = perfil.peso_kg <= perfil.peso_objetivo_kg ? gasto : gasto - (RITMO[perfil.ritmo] || RITMO.normal).deficit;
  return Math.max(perfil.kcal_minimo, Math.round(meta / 10) * 10);
}

// No se escalan: el aceite (tiene tope diario), los condimentos y el café.
const SIN_ESCALAR = new Set(['aove', 'cafe', 'especias', 'edulcorante', 'caldo', 'limon', 'ajo']);

// Ajusta las cantidades de una receta para acercarla a kcalMeta. Lo que se compra
// por unidades (huevos, latas, yogures, fruta) queda en unidades enteras y el resto compensa.
export function escalar(ingredientes, kcalMeta, alimentos) {
  const kcal = (id, g) => (alimentos[id].kcal * g) / 100;
  const limitar = (f) => Math.min(2.5, Math.max(0.5, f));
  const unidades = (id, g) => {
    const ud = alimentos[id].ud;
    return ud && Math.round(g / ud) >= 1 && Math.abs(g / ud - Math.round(g / ud)) < 0.15;
  };

  let fijo = 0;
  let variable = 0;
  for (const [id, g] of ingredientes) {
    if (SIN_ESCALAR.has(id)) fijo += kcal(id, g);
    else variable += kcal(id, g);
  }
  if (variable <= 0) return ingredientes;
  const f1 = limitar((kcalMeta - fijo) / variable);

  const resultado = ingredientes.map(([id, g]) => ({ id, g, tipo: SIN_ESCALAR.has(id) ? 'fijo' : unidades(id, g) ? 'ud' : 'g' }));
  let enUnidades = 0;
  let continuo = 0;
  for (const x of resultado) {
    if (x.tipo === 'ud') {
      const ud = alimentos[x.id].ud;
      x.g = Math.max(1, Math.round((x.g * f1) / ud)) * ud;
      enUnidades += kcal(x.id, x.g);
    } else if (x.tipo === 'g') continuo += kcal(x.id, x.g);
  }
  const f2 = continuo ? limitar((kcalMeta - fijo - enUnidades) / continuo) : 1;
  for (const x of resultado) {
    if (x.tipo !== 'g') continue;
    const g = x.g * f2;
    x.g = g < 20 ? Math.max(1, Math.round(g)) : Math.round(g / 5) * 5;
  }
  return resultado.map((x) => [x.id, x.g]);
}

// Cantidad de cada alimento del mismo grupo que equivale a `gramos` de `id`.
export function equivalentes(id, gramos, alimentos) {
  const a = alimentos[id];
  const grupo = GRUPOS[a?.grupo];
  if (!grupo) return [];
  return Object.entries(alimentos)
    .filter(([otro, b]) => otro !== id && b.grupo === a.grupo && b.kcal > 0)
    .map(([otro, b]) => {
      const g = grupo.gramoAGramo ? gramos : (gramos * a.kcal) / b.kcal;
      const redondo = g < 20 ? Math.max(1, Math.round(g)) : Math.round(g / 5) * 5;
      return { id: otro, gramos: redondo, ...totales([[otro, redondo]], alimentos) };
    })
    .sort((x, y) => x.gramos - y.gramos);
}

// Kcal gastadas de más en el día: pasos por encima de los de su nivel de actividad y ejercicios.
export function kcalActividad(perfil, { pasos = 0, ejercicios = [] } = {}) {
  const base = (ACTIVIDAD[perfil.actividad] || ACTIVIDAD.sedentaria).pasos;
  // ≈ 0,5 kcal por kg de peso cada 1.000 pasos.
  const porPasos = Math.max(0, pasos - base) * perfil.peso_kg * 0.0005;
  // Solo lo que se gasta por encima de estar en reposo (MET − 1).
  const porEjercicio = ejercicios.reduce(
    (s, e) => s + ((EJERCICIOS[e.tipo]?.met || 1) - 1) * perfil.peso_kg * (e.min / 60),
    0,
  );
  const gastado = porPasos + porEjercicio;
  return { porPasos, porEjercicio, gastado, devuelto: Math.min(ACTIVIDAD_TOPE_KCAL, gastado * ACTIVIDAD_DEVUELTA) };
}

// Simula semana a semana, recalculando el gasto según baja el peso.
export function proyeccion(perfil, kcalDiarias) {
  let peso = perfil.peso_kg;
  const puntos = [{ semana: 0, peso }];
  for (let semana = 1; semana <= 104 && peso > perfil.peso_objetivo_kg; semana++) {
    const deficit = gastoTotal({ ...perfil, peso_kg: peso }) - kcalDiarias;
    if (deficit <= 0) break;
    peso -= (deficit * 7) / KCAL_POR_KG_GRASA;
    puntos.push({ semana, peso });
  }
  const alcanzado = peso <= perfil.peso_objetivo_kg;
  return { puntos, alcanzado, semanas: alcanzado ? puntos.length - 1 : null };
}

// Comprueba exclusiones y que todo salmón tenga alternativa sin salmón.
export function validar(recetas, alimentos, perfil) {
  const normal = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const excluidos = perfil.excluidos.map(normal);
  const problemas = [];

  const revisar = (ingredientes, donde) => {
    for (const [id] of ingredientes) {
      const a = alimentos[id];
      if (!a) {
        problemas.push(`${donde}: alimento desconocido "${id}"`);
        continue;
      }
      // "sin azúcar" no es azúcar: se quita antes de buscar.
      const nombre = normal(a.nombre).replace(/sin [a-z]+/g, '');
      for (const ex of excluidos) {
        if (nombre.includes(ex)) problemas.push(`${donde}: contiene "${a.nombre}" (excluido)`);
      }
    }
  };

  for (const r of recetas) {
    revisar(r.ingredientes, r.nombre);
    const usaObligatoria = perfil.con_alternativa_obligatoria.filter((id) => r.ingredientes.some(([i]) => i === id));
    if (usaObligatoria.length) {
      if (!r.alternativa) problemas.push(`${r.nombre}: lleva ${usaObligatoria.join(', ')} y no tiene alternativa`);
      else if (r.alternativa.ingredientes.some(([i]) => usaObligatoria.includes(i)))
        problemas.push(`${r.nombre}: la alternativa también lleva ${usaObligatoria.join(', ')}`);
    }
    if (r.alternativa) revisar(r.alternativa.ingredientes, `${r.nombre} (alternativa)`);
  }
  return problemas;
}
