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

  // ---------- Limpieza de salas antiguas (>48h) ----------
  async function cleanOldRooms() {
    const snap = await db.ref("rooms").get();
    if (!snap.exists()) return;

    const rooms = snap.val();
    const now = Date.now();
    const maxAgeMs = 48 * 60 * 60 * 1000;

    for (const roomId of Object.keys(rooms)) {
      const room = rooms[roomId];
      if (room && room.createdAt && (now - room.createdAt) > maxAgeMs) {
        await db.ref("rooms/" + roomId).remove();
      }
    }
  }

  // ---------- HOST: crea una sala nueva ----------
  async function createRoom() {
    await cleanOldRooms();
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
  async function joinRoom(code, playerName, avatar, email, company) {
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
      email: email || "",
      company: company || "",
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

  // ---------- HOST: guarda las misiones elegidas y su orden ----------
  async function setSelectedMissions(missionIds) {
    await db.ref(`rooms/${roomCode}`).update({ selectedMissions: missionIds });
  }

  // ---------- HOST: inicia el temporizador de la misión actual ----------
  async function startMissionTimer(code, seconds) {
    await db.ref(`rooms/${code}/timer`).set({
      startedAt: firebase.database.ServerValue.TIMESTAMP,
      duration: seconds,
      paused: false
    });
  }

  // ---------- HOST: pausa o reanuda el temporizador activo ----------
  async function pauseResumeTimer(code) {
    const timerRef = db.ref(`rooms/${code}/timer`);
    const snap = await timerRef.get();
    const timer = snap.val();
    if (!timer) return;

    if (timer.paused) {
      // Reanudar: desplaza startedAt hacia adelante por lo que duró la pausa,
      // así el cálculo de tiempo restante (duration - (now - startedAt)) sigue siendo correcto.
      const pausedForMs = Date.now() - (timer.pausedAt || Date.now());
      await timerRef.update({
        paused: false,
        startedAt: timer.startedAt + pausedForMs,
        pausedAt: null
      });
    } else {
      await timerRef.update({
        paused: true,
        pausedAt: firebase.database.ServerValue.TIMESTAMP
      });
    }
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
    setSelectedMissions,
    startMissionTimer,
    pauseResumeTimer,
    syncPlayerChoice,
    leaveRoom,
    closeRoom,
    getRoomCode,
    getPlayerId,
    getJoinLink
  };
})();
