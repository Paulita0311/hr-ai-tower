/* ============================================
   HOST APP
   Controla la pantalla del anfitrión (host.html)
   ============================================ */

const HostApp = (function () {
  let gameData = null;
  let players = {};
  let currentMissionIdx = 0;
  const TOTAL_MISSIONS_PLACEHOLDER = 4; // se ajusta tras cargar gameData

  async function init() {
    const res = await fetch("data/missions.json");
    gameData = await res.json();

    const roomCode = await Multiplayer.createRoom();
    document.getElementById("room-code-display").textContent = roomCode;

    const joinLink = Multiplayer.getJoinLink();
    document.getElementById("host-link-display").textContent = joinLink;

    renderQR(joinLink);
    listenPlayers();
  }

  function renderQR(link) {
    const wrap = document.getElementById("qr-canvas-wrap");
    QRCode.toCanvas(link, { width: 200, margin: 1 }, (err, canvas) => {
      if (!err) wrap.appendChild(canvas);
    });
  }

  function listenPlayers() {
    Multiplayer.onPlayersUpdate((p) => {
      players = p;
      const count = Object.keys(players).length;
      document.getElementById("player-count").textContent = count;
      document.getElementById("btn-start-game").disabled = count < 1;

      let h = "";
      Object.values(players).forEach((pl) => {
        h += `<div class="host-player-chip">${avatarEmoji(pl.avatar)} ${pl.name}</div>`;
      });
      document.getElementById("host-players-grid").innerHTML = h;

      // si ya estamos en pantalla de juego, refresca el grid de progreso también
      if (document.getElementById("host-playing").classList.contains("on")) {
        renderProgressGrid();
      }
    });
  }

  function avatarEmoji(id) {
    const map = { champion: "🏆", explorer: "🔭", builder: "🔧", architect: "📐" };
    return map[id] || "👤";
  }

  async function startGame() {
    currentMissionIdx = 0;
    await Multiplayer.advanceRoom("playing", 0);
    goScreen("host-playing");
    document.getElementById("host-mission-ttl").textContent = `Misión 1: ${gameData.missions[0].missionTitle}`;
    renderProgressGrid();
  }

  function renderProgressGrid() {
    let h = "";
    Object.values(players).forEach((pl) => {
      const missionId = gameData.missions[currentMissionIdx].id;
      const answered = pl.choices && pl.choices[missionId];
      h += `<div class="host-player-chip" style="${answered ? "opacity:1" : "opacity:0.5"}">
        ${avatarEmoji(pl.avatar)} ${pl.name} ${answered ? "✓" : "..."}
      </div>`;
    });
    document.getElementById("host-progress-grid").innerHTML = h;
  }

  async function nextMission() {
    currentMissionIdx++;
    if (currentMissionIdx >= gameData.missions.length) {
      await Multiplayer.advanceRoom("boss");
      goScreen("host-results"); // o una pantalla boss propia del host si la agregas luego
      renderLeaderboard();
      // nota: para mostrar boss en el host puedes crear una vista similar a player
      setTimeout(async () => {
        await Multiplayer.advanceRoom("results");
        renderLeaderboard();
      }, 3000);
      return;
    }
    await Multiplayer.advanceRoom("playing", currentMissionIdx);
    document.getElementById("host-mission-ttl").textContent = `Misión ${currentMissionIdx + 1}: ${gameData.missions[currentMissionIdx].missionTitle}`;
    renderProgressGrid();
  }

  function renderLeaderboard() {
    goScreen("host-results");
    const sorted = Object.values(players).sort((a, b) => (b.ico || 0) - (a.ico || 0));
    let h = "";
    sorted.forEach((pl, i) => {
      h += `<div class="lb-row ${i === 0 ? "first" : ""}">
        <span>${i + 1}. ${avatarEmoji(pl.avatar)} ${pl.name}</span>
        <span><strong>${pl.ico || 0}</strong> ICO</span>
      </div>`;
    });
    document.getElementById("leaderboard").innerHTML = h;
  }

  function goScreen(id) {
    document.querySelectorAll(".scr").forEach((s) => s.classList.remove("on"));
    document.getElementById(id).classList.add("on");
  }

  async function restart() {
    await Multiplayer.closeRoom();
    location.reload();
  }

  return { init, startGame, nextMission, restart };
})();

document.addEventListener("DOMContentLoaded", () => HostApp.init());
