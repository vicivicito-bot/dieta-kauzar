// Generador de menús semanales. Funciones puras: sin DOM ni almacenamiento.

// Números aleatorios repetibles a partir de un texto (misma semilla, mismo menú).
export function aleatorio(semilla) {
  let h = 1779033703 ^ semilla.length;
  for (let i = 0; i < semilla.length; i++) {
    h = Math.imul(h ^ semilla.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Elige uno al azar; los de más peso salen más a menudo.
export function elegir(lista, azar) {
  const total = lista.reduce((s, c) => s + c.peso, 0);
  let x = azar() * total;
  for (const c of lista) if ((x -= c.peso) < 0) return c;
  return lista[lista.length - 1];
}

// candidatos: { tipo: [{ id, peso, p, principal }] }. usados: { tipo: [ids] } ya puestos esa semana.
// Cada día prueba varias combinaciones y se queda con la mejor: prefiere lo que gusta,
// llega a la proteína y no repite el alimento principal en comida y cena.
export function generarSemana(candidatos, { azar, proteinaMin, dias = 7, usados = {} }) {
  const tipos = Object.keys(candidatos);
  const vistos = Object.fromEntries(tipos.map((t) => [t, new Set(usados[t] || [])]));
  const semana = [];
  for (let d = 0; d < dias; d++) {
    const libres = {};
    for (const t of tipos) {
      libres[t] = candidatos[t].filter((c) => !vistos[t].has(c.id));
      if (!libres[t].length) {
        vistos[t].clear();
        libres[t] = candidatos[t];
      }
    }
    let mejor;
    for (let intento = 0; intento < 8; intento++) {
      const dia = Object.fromEntries(tipos.map((t) => [t, elegir(libres[t], azar)]));
      let nota = tipos.reduce((s, t) => s + Math.log(dia[t].peso), 0);
      const p = tipos.reduce((s, t) => s + dia[t].p, 0);
      if (p < proteinaMin) nota -= (proteinaMin - p) * 0.15;
      if (dia.comida && dia.cena && dia.comida.principal === dia.cena.principal) nota -= 3;
      if (!mejor || nota > mejor.nota) mejor = { dia, nota };
    }
    for (const t of tipos) vistos[t].add(mejor.dia[t].id);
    semana.push(Object.fromEntries(tipos.map((t) => [t, mejor.dia[t].id])));
  }
  return semana;
}
