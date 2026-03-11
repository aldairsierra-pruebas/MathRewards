
Misiones Matemáticas — versión unificada v1
==========================================

Contenido del paquete:
- index.html (juego principal)
- styles.css (estilos)
- js/gameEngine.js (lógica del juego: niveles, preguntas, cronómetro, vida del enemigo, medallas)
- js/storage.js (guardado local + hook para Firebase)
- js/firebase-placeholder.js (archivo ejemplo para integrar Firebase)
- panel.html (panel simple para ver progreso local)
- README.md (este archivo)

Instrucciones rápidas:
1. Descomprime el ZIP y abre `index.html` en tu navegador.
2. Para conectar Firebase: edita `js/firebase-placeholder.js` con la inicialización de Firebase y sustituye la función save con llamadas a Firestore/RealtimeDB.
3. `panel.html` lee el `localStorage` y muestra el progreso guardado en el navegador (útil para ver datos antes de mandar a Firebase).

Si quieres, lo integro con Firebase, creo el panel con gráficas (Chart.js) y subo una versión con autenticación por email/UID.
