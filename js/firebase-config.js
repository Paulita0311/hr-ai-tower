/* ============================================
   FIREBASE CONFIG
   ============================================ */

   const firebaseConfig = {
      apiKey: "AIzaSyBN48rq-42oEyYKl7QMDgVLwY4theHdrRw",
      authDomain: "hr-ai-tower.firebaseapp.com",
      databaseURL: "https://hr-ai-tower-default-rtdb.firebaseio.com",
      projectId: "hr-ai-tower",
      storageBucket: "hr-ai-tower.firebasestorage.app",
      messagingSenderId: "457401274131",
      appId: "1:457401274131:web:bcb24542b401a4324ad4e6"
    };
    
    // Inicializa Firebase (usa el SDK compat para mantenerlo simple sin bundlers)
    firebase.initializeApp(firebaseConfig);
    const db = firebase.database();