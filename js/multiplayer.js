/* ============================================
   HR AI TOWER - MULTIPLAYER
   Maneja salas (rooms), jugadores y sincronización
   en tiempo real vía Firebase Realtime Database
   ============================================ */

const Multiplayer = (function () {
  let roomCode = null;
  let playerId = null;
  let isHost = false;

  function generateRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin caracteres ambiguos
    let code = "";
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // ---------- HOST: crea una sala nueva ----------
  async function createRoom() {
    roomCode = generateRoomCode();
    isHost = true;
    await db.ref(`rooms/${roomCode}`).set({
      status: "lobby", // lobby -> playing -> boss -> results
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      currentMissionIdx: 0,
      players: {}
    });
    return roomCode;
  }

  // ---------- PLAYER: se une a una sala existente ----------
  async function joinRoom(code, playerName, avatar) {
    roomCode = code.toUpperCase();
    const roomRef = db.ref(`rooms/${roomCode}`);
    const snap = await roomRef.get();

    if (!snap.exists()) {
      throw new Error("Sala no encontrada. Verifica el código.");
    }

    playerId = db.ref().push().key;
    await roomRef.child(`players/${playerId}`).set({
      name: playerName,
      avatar: avatar,
      ico: 0,
      resources: { productivity: 0, innovation: 0, trust: 0, integration: 0, experience: 0, governance: 0 },
      choices: {},
      joinedAt: firebase.database.ServerValue.TIMESTAMP
    });

    return playerId;
  }

  // ---------- Escuchar cambios de la sala (host y jugadores) ----------
  function onRoomUpdate(callback) {
    db.ref(`rooms/${roomCode}`).on("value", (snap) => {
      callback(snap.val());
    });
  }

  function onPlayersUpdate(callback) {
    db.ref(`rooms/${roomCode}/players`).on("value", (snap) => {
      callback(snap.val() || {});
    });
  }

  // ---------- HOST: avanza la sala a la siguiente fase/misión ----------
  async function advanceRoom(newStatus, missionIdx) {
    const updates = { status: newStatus };
    if (missionIdx !== undefined) updates.currentMissionIdx = missionIdx;
    await db.ref(`rooms/${roomCode}`).update(updates);
  }

  // ---------- PLAYER: guarda su elección y progreso ----------
  async function syncPlayerChoice(missionId, choiceData, newIco, newResources) {
    const playerRef = db.ref(`rooms/${roomCode}/players/${playerId}`);
    await playerRef.update({
      ico: newIco,
      resources: newResources,
      [`choices/${missionId}`]: choiceData
    });
  }

  // ---------- Limpieza ----------
  function leaveRoom() {
    db.ref(`rooms/${roomCode}`).off();
    db.ref(`rooms/${roomCode}/players`).off();
  }

  // ---------- Eliminar sala (host, al terminar) ----------
  async function closeRoom() {
    if (roomCode) {
      await db.ref(`rooms/${roomCode}`).remove();
    }
  }

  function getRoomCode() {
    return roomCode;
  }

  function getPlayerId() {
    return playerId;
  }

  function getJoinLink() {
    const base = window.location.origin + window.location.pathname.replace("host.html", "play.html");
    return `${base}?room=${roomCode}`;
  }

  return {
    createRoom,
    joinRoom,
    onRoomUpdate,
    onPlayersUpdate,
    advanceRoom,
    syncPlayerChoice,
    leaveRoom,
    closeRoom,
    getRoomCode,
    getPlayerId,
    getJoinLink
  };
})();
