# Dieta Kauzar

App web instalable en el móvil (PWA) con mi plan de comidas: menú del día y de la semana, recetas con cantidades y preparación, y cálculo de calorías y plazo hasta el objetivo. Funciona sin conexión una vez abierta.

## Qué hay

| Archivo | Para qué sirve |
|---|---|
| `data/alimentos.json` | Alimentos con kcal y macros por 100 g y su sección del súper |
| `data/recetas.json` | Recetas: ingredientes en gramos, pasos y, si llevan salmón, su alternativa |
| `data/plan-semanal.json` | Qué receta toca cada día y en cada comida |
| `data/perfil.json` | Datos personales, mínimo de kcal, límite de AOVE y alimentos excluidos |
| `js/nutricion.js` | Cálculos (metabolismo, gasto, proyección) y validación de restricciones |
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
2. Añade la receta a `data/recetas.json` (copia una parecida). Las calorías se calculan solas.
3. Para ponerla en el menú, cambia su `id` en `data/plan-semanal.json`.
4. Sube la versión en `sw.js` (`dieta-v1` → `dieta-v2`) para que el móvil la actualice.

## Instalar en el móvil

Cuando esté publicada en GitHub Pages, abre la dirección en el móvil y:

- **Android (Chrome):** menú ⋮ → *Añadir a pantalla de inicio* / *Instalar app*.
- **iPhone (Safari):** botón compartir → *Añadir a pantalla de inicio*.

## Nota

Los valores nutricionales son aproximados y los cálculos son estimaciones; no sustituyen el consejo de un profesional sanitario.
