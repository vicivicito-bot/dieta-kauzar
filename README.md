# Dieta Kauzar

App web instalable en el móvil (PWA) con mis menús: cada semana genera un menú distinto según mis gustos, ajusta las cantidades a mis calorías y calcula el plazo hasta el objetivo. Funciona sin conexión una vez abierta.

## Qué hay

| Archivo | Para qué sirve |
|---|---|
| `data/alimentos.json` | Alimentos con kcal y macros por 100 g y su sección del súper |
| `data/recetas.json` | Recetas: ingredientes en gramos, pasos y, si llevan salmón, su alternativa |
| `data/perfil.json` | Datos de ejemplo, mínimo de kcal, límite de AOVE, proteína y alimentos excluidos |
| `js/nutricion.js` | Cálculos (gasto, kcal objetivo, ajuste de cantidades, proyección) y validación |
| `js/menu.js` | Generador de menús semanales |
| `js/app.js` | Pantallas de la app |
| `sw.js` | Guarda la app para usarla sin conexión |

La app comprueba al arrancar que ninguna receta lleve alimentos excluidos y que todo lo que lleve salmón tenga alternativa. Si algo falla, aparece un aviso naranja arriba.

## Probarla en el ordenador

```
python -m http.server 8765
```

y abrir http://localhost:8765

## Añadir o cambiar una receta

1. Si usa un alimento nuevo, añádelo a `data/alimentos.json`.
2. Añade la receta a `data/recetas.json` (copia una parecida, con kcal parecidas a las de su comida). Las calorías se calculan solas y las cantidades se ajustan a cada persona.
3. Entra sola en los menús que se generen.
4. Sube la versión en `sw.js` (`dieta-v2` → `dieta-v3`) para que el móvil la actualice.

## Instalar en el móvil

Cuando esté publicada en GitHub Pages, abre la dirección en el móvil y:

- **Android (Chrome):** menú ⋮ → *Añadir a pantalla de inicio* / *Instalar app*.
- **iPhone (Safari):** botón compartir → *Añadir a pantalla de inicio*.

## Nota

Los valores nutricionales son aproximados y los cálculos son estimaciones; no sustituyen el consejo de un profesional sanitario.
