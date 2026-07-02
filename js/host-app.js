/* ============================================
   HOST APP - v2
   Pantalla proyectada. Muestra la situación,
   progreso de respuestas y controla el ritmo.
   Los jugadores juegan individualmente.
   ============================================ */

   const HostApp = (function () {
    let gameData = null;
    let players = {};
    let currentMissionIdx = 0;
  
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
      if (typeof QRCode === "undefined") {
        wrap.innerHTML = '<div style="color:rgba(255,255,255,0.4);font-size:11px;padding:12px;text-align:center">QR no disponible<br>Comparte el link</div>';
        return;
      }
      QRCode.toCanvas(link, { width: 180, margin: 1 }, (err, canvas) => {
        if (!err) wrap.appendChild(canvas);
      });
    }
  
    function listenPlayers() {
      Multiplayer.onPlayersUpdate((p) => {
        players = p || {};
        const count = Object.keys(players).length;
  
        document.getElementById("player-count").textContent = count;
        document.getElementById("btn-start-game").disabled = count < 1;
        renderLobbyChips();
  
        if (document.getElementById("host-playing").classList.contains("on")) {
          renderProgressPanel();
        }
      });
    }
  
    function renderLobbyChips() {
      let h = "";
      Object.values(players).forEach((pl) => {
        h += `<div class="host-player-chip">${avatarEmoji(pl.avatar)} ${pl.name}</div>`;
      });
      document.getElementById("host-players-grid").innerHTML = h;
    }
  
    function avatarEmoji(id) {
      const map = { champion: "🏆", explorer: "🔭", builder: "🔧", architect: "📐" };
      return map[id] || "👤";
    }
  
    async function startGame() {
      currentMissionIdx = 0;
      await Multiplayer.advanceRoom("playing", 0);
      goScreen("host-playing");
      renderMissionPanel(0);
      renderProgressPanel();
    }
  
    function renderMissionPanel(idx) {
      const m = gameData.missions[idx];
      const total = gameData.missions.length;
  
      document.getElementById("host-mission-ttl").textContent =
        `Misión ${idx + 1} de ${total}: ${m.missionTitle}`;
  
      document.getElementById("host-situation").textContent = m.brief;
  
      let optsH = "";
      m.options.forEach((opt, oi) => {
        const letter = ["A", "B", "C"][oi];
        const color = opt.type === "native" ? "#0070F2" : opt.type === "external" ? "#BA7517" : "#888780";
        optsH += `<div class="host-option">
          <span class="host-opt-letter" style="background:${color}">${letter}</span>
          <span class="host-opt-lbl">${opt.label}</span>
        </div>`;
      });
      document.getElementById("host-options").innerHTML = optsH;
  
      const btnNext = document.getElementById("btn-next-mission");
      btnNext.textContent = idx >= total - 1 ? "Ver resultados →" : "Siguiente misión →";
    }
  
    function renderProgressPanel() {
      const m = gameData.missions[currentMissionIdx];
      const playerList = Object.values(players);
      const total = playerList.length;
      const answered = playerList.filter(
        (pl) => pl.choices && pl.choices[m.id]
      ).length;
  
      document.getElementById("host-progress-count").textContent =
        `${answered} / ${total} respondieron`;
  
      let h = "";
      playerList.forEach((pl) => {
        const done = pl.choices && pl.choices[m.id];
        const optIdx = done ? pl.choices[m.id].optionIdx : null;
        const letter = optIdx !== null ? ["A","B","C"][optIdx] : "...";
        const opt = done ? m.options[optIdx] : null;
        const color = opt
          ? opt.type === "native" ? "#0070F2" : opt.type === "external" ? "#BA7517" : "#888780"
          : "rgba(255,255,255,0.2)";
  
        h += `<div class="host-player-row">
          <span class="host-player-name">${avatarEmoji(pl.avatar)} ${pl.name}</span>
          <span class="host-player-answer" style="background:${color}">${letter}</span>
        </div>`;
      });
      document.getElementById("host-progress-grid").innerHTML = h;
    }
  
    async function nextMission() {
      currentMissionIdx++;
  
      if (currentMissionIdx >= gameData.missions.length) {
        await Multiplayer.advanceRoom("results");
        goScreen("host-results");
        renderLeaderboard();
        return;
      }
  
      await Multiplayer.advanceRoom("playing", currentMissionIdx);
      renderMissionPanel(currentMissionIdx);
      renderProgressPanel();
    }
  
    function renderLeaderboard() {
      const sorted = Object.values(players).sort((a, b) => (b.ico || 0) - (a.ico || 0));
      let h = "";
      sorted.forEach((pl, i) => {
        const medals = ["🥇","🥈","🥉"];
        const medal = medals[i] || `${i+1}.`;
        const choices = Object.values(pl.choices || {});
        const avgStab = choices.length
          ? Math.round(choices.reduce((s, c) => s + (c.stability || 0), 0) / choices.length)
          : 0;
  
        h += `<div class="lb-row ${i === 0 ? "first" : ""}">
          <div class="lb-left">
            <span class="lb-medal">${medal}</span>
            <span class="lb-name">${avatarEmoji(pl.avatar)} ${pl.name}</span>
          </div>
          <div class="lb-right">
            <span class="lb-ico">ICO ${pl.ico || 0}</span>
            <span class="lb-stab">Torre ${avgStab}%</span>
          </div>
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