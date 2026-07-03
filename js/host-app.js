/* ============================================
   HOST APP - v2
   Pantalla proyectada. Muestra la situación,
   la torre colectiva, el leaderboard en vivo
   y controla el ritmo del juego.
   ============================================ */

   const HostApp = (function () {
    let gameData = null;
    let players = {};
    let currentMissionIdx = 0;
    let leaderboardMode = "ico";

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
          renderFooter();
          renderLiveLeaderboard();
          renderSolidezPanel();
        }
      });
    }

    function renderLobbyChips() {
      let h = "";
      Object.values(players).forEach((pl) => {
        h += `<div class="host-player-chip"><span class="avatar-circle">${initial(pl.name)}</span>${pl.name}</div>`;
      });
      document.getElementById("host-players-grid").innerHTML = h;
    }

    function initial(name) {
      return (name || "?").trim().charAt(0).toUpperCase() || "?";
    }

    function typeColor(type) {
      return type === "native" ? "#0070F2" : type === "external" ? "#7C4DFF" : "#8891A6";
    }

    async function startGame() {
      currentMissionIdx = 0;
      await Multiplayer.advanceRoom("playing", 0);
      goScreen("host-playing");
      buildHostTowerFloors();
      renderMissionPanel(0);
      renderFooter();
      renderLiveLeaderboard();
      renderSolidezPanel();
    }

    function renderRoundIndicator(idx, total) {
      document.getElementById("gh-round-lbl").textContent = `RONDA ${idx + 1}/${total}`;
      let h = "";
      for (let i = 0; i < total; i++) {
        const cls = i < idx ? "done" : i === idx ? "active" : "";
        h += `<span class="gh-dot ${cls}"></span>`;
      }
      document.getElementById("gh-round-dots").innerHTML = h;
    }

    function renderMissionPanel(idx) {
      const m = gameData.missions[idx];
      const total = gameData.missions.length;

      renderRoundIndicator(idx, total);
      document.getElementById("host-cat-tag").textContent = `Piso ${idx + 1}: ${m.floorName || m.missionTitle}`;
      document.getElementById("host-situation").textContent = m.brief;

      let optsH = "";
      m.options.forEach((opt, oi) => {
        const letter = ["A", "B", "C"][oi];
        optsH += `<div class="host-option">
          <span class="opt-letter type-${opt.type}">${letter}</span>
          <span class="host-opt-lbl">${opt.label}</span>
        </div>`;
      });
      document.getElementById("host-options").innerHTML = optsH;

      const btnNext = document.getElementById("btn-next-mission");
      btnNext.innerHTML = idx >= total - 1
        ? 'Ver resultados <span class="gh-arrow">&rarr;</span>'
        : 'Siguiente <span class="gh-arrow">&rarr;</span>';
    }

    function renderFooter() {
      const m = gameData.missions[currentMissionIdx];
      const playerList = Object.values(players);
      const total = playerList.length;
      const answered = playerList.filter((pl) => pl.choices && pl.choices[m.id]).length;

      document.getElementById("gh-conn-count").textContent = total;
      document.getElementById("gh-footer-status").textContent =
        total === 0 ? "Esperando jugadores…" : `${answered} / ${total} respondieron`;
    }

    function avgStability(pl) {
      const choices = Object.values(pl.choices || {});
      if (!choices.length) return 0;
      return Math.round(choices.reduce((s, c) => s + (c.stability || 0), 0) / choices.length);
    }

    function setLeaderboardMode(mode) {
      leaderboardMode = mode;
      document.getElementById("lb-tab-ico").classList.toggle("active", mode === "ico");
      document.getElementById("lb-tab-stab").classList.toggle("active", mode === "stability");
      renderLiveLeaderboard();
    }

    function renderLiveLeaderboard() {
      const el = document.getElementById("host-live-leaderboard");
      if (!el) return;
      const sorted = Object.values(players).sort((a, b) =>
        leaderboardMode === "ico" ? (b.ico || 0) - (a.ico || 0) : avgStability(b) - avgStability(a)
      );
      el.innerHTML = renderLeaderboardRows(sorted);
    }

    function renderLeaderboardRows(sorted) {
      let h = "";
      sorted.forEach((pl, i) => {
        const rankCls = i === 0 ? "r1" : i === 1 ? "r2" : i === 2 ? "r3" : "";
        h += `<div class="lb-row ${i === 0 ? "first" : ""}">
          <div class="lb-left">
            <span class="lb-rank ${rankCls}">${i + 1}</span>
            <span class="lb-name">${pl.name}</span>
          </div>
          <div class="lb-right">
            <span class="lb-ico">ICO ${pl.ico || 0}</span>
            <span class="lb-stab">Torre ${avgStability(pl)}%</span>
          </div>
        </div>`;
      });
      return h;
    }

    function renderSolidezPanel() {
      const playerList = Object.values(players);
      const avg = playerList.length
        ? Math.round(playerList.reduce((s, pl) => s + avgStability(pl), 0) / playerList.length)
        : 0;

      const label = avg >= 80 ? "Muy sólida" : avg >= 55 ? "Sólida" : avg >= 30 ? "En construcción" : "Frágil";

      document.getElementById("solidez-pct").textContent = `${avg}%`;
      document.getElementById("solidez-label").textContent = label;
      document.getElementById("solidez-fill").style.width = `${avg}%`;
      document.getElementById("solidez-hint").textContent =
        avg >= 55
          ? "¡Vas por buen camino! Responde correctamente para fortalecer la torre."
          : "Las decisiones nativas fortalecen la solidez de la torre.";
    }

    function buildHostTowerFloors() {
      const stack = document.getElementById("host-tower-stack");
      const total = gameData.missions.length;
      stack.innerHTML = "";
      gameData.missions.forEach((m, i) => {
        const f = document.createElement("div");
        f.className = "tower-floor empty";
        f.id = `host-floor-${i}`;
        f.innerHTML = `<span class="floor-num">${i + 1}</span>`;
        stack.appendChild(f);
      });
      document.getElementById("host-tower-count").textContent = `0/${total}`;
    }

    function majorityTypeForMission(missionId) {
      const counts = { native: 0, external: 0, manual: 0 };
      Object.values(players).forEach((pl) => {
        const ch = pl.choices && pl.choices[missionId];
        if (ch && counts[ch.type] !== undefined) counts[ch.type]++;
      });
      const total = counts.native + counts.external + counts.manual;
      if (total === 0) return "manual";
      return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    }

    function buildHostFloor(idx) {
      const mission = gameData.missions[idx];
      const type = majorityTypeForMission(mission.id);
      const glyph = type === "native" ? "▲" : type === "external" ? "◆" : "■";
      const f = document.getElementById(`host-floor-${idx}`);
      if (!f) return;
      f.className = `tower-floor built type-${type}`;
      f.innerHTML = `<span class="floor-glyph">${glyph}</span><span class="floor-num">${idx + 1}</span>`;
      void f.offsetWidth;
      f.classList.add("drop-anim");
      document.getElementById("host-tower-count").textContent = `${idx + 1}/${gameData.missions.length}`;
    }

    async function nextMission() {
      buildHostFloor(currentMissionIdx);
      currentMissionIdx++;

      if (currentMissionIdx >= gameData.missions.length) {
        await Multiplayer.advanceRoom("results");
        goScreen("host-results");
        renderLeaderboard();
        return;
      }

      await Multiplayer.advanceRoom("playing", currentMissionIdx);
      renderMissionPanel(currentMissionIdx);
      renderFooter();
      renderLiveLeaderboard();
      renderSolidezPanel();
    }

    function renderLeaderboard() {
      const sorted = Object.values(players).sort((a, b) => (b.ico || 0) - (a.ico || 0));
      document.getElementById("leaderboard").innerHTML = renderLeaderboardRows(sorted);
    }

    function goScreen(id) {
      document.querySelectorAll(".scr").forEach((s) => s.classList.remove("on"));
      document.getElementById(id).classList.add("on");
    }

    async function restart() {
      await Multiplayer.closeRoom();
      location.reload();
    }

    return { init, startGame, nextMission, restart, setLeaderboardMode };
  })();

  document.addEventListener("DOMContentLoaded", () => HostApp.init());
