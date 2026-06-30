/* ============================================
   FIREBASE CONFIG
   ============================================
   PASOS PARA OBTENER TUS CREDENCIALES:
   1. Ve a https://console.firebase.google.com
   2. Crea un proyecto nuevo (gratis)
   3. En el panel, click en el ícono "</>" (Web app)
   4. Dale un nombre, registra la app
   5. Copia el objeto firebaseConfig que te muestra
      y pégalo abajo reemplazando el de ejemplo
   6. En el menú lateral ve a "Build > Realtime Database"
      y créala en modo de PRUEBA (test mode) para
      empezar rápido (luego ajustamos reglas de seguridad)
   ============================================ */

const firebaseConfig = {
  apiKey: "TU_API_KEY_AQUI",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  databaseURL: "https://TU_PROYECTO-default-rtdb.firebaseio.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "000000000000",
  appId: "TU_APP_ID"
};

// Inicializa Firebase (usa el SDK compat para mantenerlo simple sin bundlers)
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
