Misiones Matemáticas — versión unificada v1
==========================================

Contenido del paquete:
- index.html (juego principal)
- styles.css (estilos)
- js/gameEngine.js (lógica del juego: niveles, preguntas, cronómetro, vida del enemigo, medallas)
- js/storage.js (guardado local + sincronización de jugadores con Firebase)
- js/firebase-placeholder.js (integración real de Firebase Firestore)
- panel.html (panel simple para ver progreso local)
- README.md (este archivo)

Instrucciones rápidas:
1. Sirve la carpeta en un servidor local (por ejemplo `python3 -m http.server 8080`) y abre `http://localhost:8080/index.html`.
2. En la pantalla de juego, usa el selector de jugador para confirmar quién está jugando.
3. El juego guarda en local y además intenta guardar en Firestore.

Integración Firestore (sin login)
---------------------------------
La integración ya está conectada al proyecto Firebase compartido y usa Cloud Firestore.

Comportamiento actual:
- Crea automáticamente (si no existen) los jugadores:
  - `players/PR_1`
  - `players/PR_2`
- Si agregas más jugadores manualmente en Firestore dentro de `players`, también aparecen al recargar.
- Guarda:
  - resumen rápido en `players/{playerId}/stats/summary`
  - sesión en `players/{playerId}/sessions/{sessionId}`
  - intentos en `players/{playerId}/sessions/{sessionId}/attempts/{attemptId}`
  - snapshot en `players/{playerId}/snapshots/latest`

Formato de IDs legibles:
- `playerId`: `PR_1`, `PR_2`, etc.
- `sessionId`: `s_YYYYMMDD_HHMMSS`
- `attemptId`: `a_0001`, `a_0002`, ...

Nota:
- Si Firestore falla (reglas/red), la app sigue guardando localmente y muestra estado de fallback en UI.
