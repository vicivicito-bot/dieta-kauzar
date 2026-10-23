// Cálculos nutricionales. Funciones puras: sin DOM ni almacenamiento.

export const TIPOS = [
  { id: 'desayuno', nombre: 'Desayuno', icono: '☕' },
  { id: 'media_manana', nombre: 'Media mañana', icono: '🍎' },
  { id: 'comida', nombre: 'Comida', icono: '🍽️' },
  { id: 'merienda', nombre: 'Merienda', icono: '🥣' },
  { id: 'cena', nombre: 'Cena', icono: '🌙' },
];

export const ACTIVIDAD = {
  sedentaria: { nombre: 'Sedentaria (oficina, < 5.000 pasos)', factor: 1.2 },
  ligera: { nombre: 'Ligera (≈ 8.000 pasos o 1-3 días de ejercicio)', factor: 1.375 },
  moderada: { nombre: 'Moderada (3-5 días de ejercicio)', factor: 1.55 },
  alta: { nombre: 'Alta (6-7 días de ejercicio)', factor: 1.725 },
};

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
