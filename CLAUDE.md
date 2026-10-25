# Dieta Kauzar — notas para continuar

PWA de dieta personal, instalada en el móvil de la usuaria. Habla con ella en español y en lenguaje sencillo: no es programadora.

- Web: https://vicivicito-bot.github.io/dieta-kauzar/ (GitHub Pages, rama `main`, raíz)
- Repo: https://github.com/vicivicito-bot/dieta-kauzar (público)
- Requisitos originales: `PROYECTO DIETA KAUZAR.docx` (fuera de git a propósito: lleva datos personales)

## Reglas de la dieta (no negociables)

- Excluidos siempre: queso fresco, requesón, queso cottage, azúcar añadido, pimiento (rojo, verde, amarillo), maíz.
- El salmón puede aparecer, pero **siempre** con `alternativa` (receta completa sin salmón y con kcal parecidas).
- Kcal del día = gasto − déficit del ritmo elegido (`kcalObjetivo`), nunca menos de 1.200. AOVE ≤ 25 g/día. Proteína ≈ 90 g/día o más.
- Recetas nuevas, escritas para un día de 1.200: desayuno ~250-300, media mañana ~80-100, comida ~400, merienda ~100, cena ~320-350. AOVE máximo por receta: desayuno 5, comida 10, cena 10, tentempiés 0 (así ningún día pasa de 25; el aceite no se escala).
- `validar()` en `js/nutricion.js` comprueba exclusiones y alternativas al arrancar y muestra un aviso naranja.

## Cómo está hecho

- HTML + CSS + JavaScript (módulos ES) sin compilar: en este PC no hay Node.
- Datos en `data/*.json`; las kcal y macros de las recetas se calculan desde `alimentos.json` (por 100 g).
- `escalar()` ajusta las cantidades de cada receta a su parte del día (`REPARTO`); lo que va por unidades (`ud`) queda en unidades enteras.
- Menús: `js/menu.js` genera la semana (sin repetir, prefiere ❤️, llega a la proteína, no repite proteína principal en comida y cena). Se guardan en `estado.semanas` por lunes; los gustos (`estado.ingredientes`, `estado.valoraciones`) reemplazan lo que ya no encaja de hoy en adelante.
- `data/perfil.json` lleva datos **genéricos** a propósito (repo público). Sus datos reales los mete en "Mis números" y se guardan en `localStorage` (`kauzar.v1`) en su móvil.
- `sw.js`: red primero y caché sin conexión. **Sube `VERSION` en cada cambio publicado** y añade allí los archivos nuevos.

## Comprobar cambios

- Servidor local: `python -m http.server 8765` y abrir http://127.0.0.1:8765
- Chrome headless no baja de 512 px de ancho: para ver 390 px, mete la app en un iframe de 390 px en una página temporal (y bórrala después).
- Revisa los totales diarios del plan tras tocar recetas o el plan.

## Publicar

`gh` está en `/c/Program Files/GitHub CLI/gh.exe` (no en el PATH de la sesión). La cuenta es `vicivicito-bot`. Crear o publicar cosas públicas puede requerir que la usuaria lance el comando ella misma con `!` (en Bash, no PowerShell).

## Próximos pasos (fases acordadas)

1. ~~Fase 1: menú del día y de la semana, recetas, alternativa al salmón, calculadora~~ ✅
2. Fase 2: registro de peso semanal (en ayunas) con gráfica y recálculo de kcal.
3. Fase 3: ~~generador de menús, botón "cambiar", gustos y vetos, cantidades según sus kcal~~ ✅ (oct 2026). Falta: lista de la compra por secciones (`seccion` ya está en `alimentos.json`).
4. Fase 4: tabla de sustitutos equivalentes y ajuste de kcal por pasos o ejercicio.

Pendiente de preguntarle: qué recetas le han gustado o no tras usarla unos días (ahora puede marcarlas ella con ❤️/🚫).
