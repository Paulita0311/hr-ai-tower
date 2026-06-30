# HR AI Tower 🏗️

Juego interactivo multijugador estilo Kahoot para experimentar las consecuencias
de decisiones de adopción de SAP Business AI en SuccessFactors.

## 🚀 Cómo correrlo la primera vez

### 1. Configura Firebase (una sola vez, ~5 minutos)

1. Ve a [console.firebase.google.com](https://console.firebase.google.com)
2. **Add project** → ponle un nombre (ej. `hr-ai-tower`) → sigue el asistente (puedes desactivar Google Analytics)
3. En el panel del proyecto, click en el ícono `</>` (Web app) → registra la app con cualquier nombre
4. Copia el bloque `firebaseConfig` que te muestra
5. Pégalo en `js/firebase-config.js`, reemplazando los valores de ejemplo
6. En el menú lateral: **Build → Realtime Database → Create Database**
   - Elige la región más cercana
   - Selecciona **"Start in test mode"** (para empezar rápido; luego puedes ajustar seguridad)

### 2. Instala Visual Studio Code + Live Server

1. Descarga VS Code: [code.visualstudio.com](https://code.visualstudio.com)
2. Abre la carpeta `hr-ai-tower` en VS Code (File → Open Folder)
3. Ve a la pestaña de Extensiones (ícono de cuadritos a la izquierda)
4. Busca **"Live Server"** (de Ritwick Dey) → Install
5. Click derecho sobre `index.html` → **"Open with Live Server"**
6. Se abre tu navegador en `http://127.0.0.1:5500` — ¡ya estás corriendo el juego!

### 3. Pruébalo

- Abre `host.html` en una pestaña (esta es la que proyectarías)
- Abre `play.html` en otra pestaña o en tu celular (usa el QR o el código)
- Ese mismo computador funciona como host y jugador a la vez para probar

## 📝 Cómo modificar el juego

### Cambiar situaciones, opciones, textos
Edita **`data/missions.json`**. No necesitas tocar código. Estructura de cada misión:

```json
{
  "id": "ess",
  "missionTitle": "Employee Self Service",
  "brief": "La situación que se presenta...",
  "tooltip": "El consejo educativo que aparece...",
  "options": [
    { "type": "native", "label": "...", "value": 8, "risk": 100, "resources": {...} }
  ]
}
```

- `value` (0-8 aprox): impacto de la decisión
- `risk` (0-100): trazabilidad/gobernanza — nativo=100, externo≈55, manual≈25
- `resources`: cuánto suma a cada recurso (productivity, innovation, trust, integration, experience, governance)

**Para agregar una misión nueva (un piso más):** copia un bloque de misión completo dentro del array `"missions"` y cambia los valores. El juego se adapta automáticamente al número de misiones que tengas.

### Cambiar colores y estilo visual
Edita **`css/theme.css`**. Todas las variables de color están ahí arriba, documentadas.
No necesitas tocar `css/game.css` (ese es el que usa las variables).

### Cambiar la fórmula de puntuación
En `data/missions.json`, bajo `"gameConfig" → "scoringWeights"`.

## 📂 Estructura del proyecto

```
hr-ai-tower/
├── index.html          ← landing, elige host o jugador
├── host.html            ← pantalla que proyectas (QR + código)
├── play.html             ← pantalla del jugador (celular)
├── css/
│   ├── theme.css           ← TODOS los colores aquí
│   └── game.css             ← estilos (usa las variables de theme.css)
├── js/
│   ├── firebase-config.js    ← tus credenciales de Firebase
│   ├── multiplayer.js          ← lógica de salas/sincronización
│   ├── game-engine.js           ← lógica de puntuación y estado
│   ├── host-app.js               ← controla host.html
│   └── player-app.js              ← controla play.html
└── data/
    └── missions.json                ← situaciones y opciones (lo que más editas)
```

## 🌐 Publicarlo gratis en GitHub Pages

1. Crea un repositorio nuevo en GitHub, sube esta carpeta completa
2. En el repo: **Settings → Pages → Branch: main → Save**
3. En unos minutos tu juego estará en `https://tu-usuario.github.io/hr-ai-tower/`
4. Comparte ese link de `host.html` cuando vayas a presentar

## ⚠️ Notas pendientes / próximos pasos sugeridos

- [ ] La pantalla de host aún no muestra la animación del Boss en vivo (solo el jugador la ve) — se puede agregar una vista espejo
- [ ] Falta lógica para mostrar la "torre" visual en el host con el progreso de todos
- [ ] Las reglas de seguridad de Firebase están en modo prueba — antes de un evento real con clientes, conviene revisarlas
- [ ] Considerar un timeout automático por misión (actualmente el host avanza manualmente con el botón)
