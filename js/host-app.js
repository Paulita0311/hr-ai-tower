/* ============================================
   HOST APP - v3
   Pantalla proyectada. Muestra la situación,
   la torre colectiva, el leaderboard en vivo
   y controla el ritmo del juego.
   Pantalla final: Top 3 con títulos + % decisiones
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
      wrap.innerHTML = "";
      if (typeof QRCode === "undefined") {
        wrap.innerHTML = '<div style="color:rgba(255,255,255,0.4);font-size:11px;padding:12px;text-align:center">QR no disponible<br>Comparte el link</div>';
        return;
      }
      try {
        new QRCode(wrap, {
          text: link,
          width: 180,
          height: 180,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.H
        });
      } catch(e) {
        wrap.innerHTML = '<div style="color:rgba(255,255,255,0.4);font-size:11px;padding:12px;text-align:center">QR no disponible<br>Comparte el link</div>';
      }
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

    // ---------- Configuración de partida ----------
    function openConfigScreen() {
      goScreen("host-config");
      renderConfigGrid();
    }

    function renderConfigGrid() {
      const grid = document.getElementById("cfg-mission-grid");
      if (!grid || !gameData) return;
      let h = "";
      gameData.missions.forEach((m, i) => {
        h += `<div class="cfg-mission-item" id="cfg-item-${m.id}" onclick="HostApp.toggleMission('${m.id}')">
          <span class="cfg-mission-num">${i + 1}</span>
          <span class="cfg-mission-name">${m.floorName || m.missionTitle}</span>
          <span class="cfg-mission-check"></span>
        </div>`;
      });
      grid.innerHTML = h;
    }

    let selectedMissionIds = [];

    function toggleMission(id) {
      const idx = selectedMissionIds.indexOf(id);
      if (idx >= 0) {
        selectedMissionIds.splice(idx, 1);
      } else {
        selectedMissionIds.push(id);
      }
      updateConfigUI();
    }

    function applyPreset(count) {
      selectedMissionIds = gameData.missions.slice(0, count).map((m) => m.id);
      updateConfigUI();
    }

    function updateConfigUI() {
      gameData.missions.forEach((m) => {
        const el = document.getElementById(`cfg-item-${m.id}`);
        if (el) el.classList.toggle("selected", selectedMissionIds.includes(m.id));
      });

      const orderList = document.getElementById("cfg-order-list");
      if (orderList) {
        orderList.innerHTML = selectedMissionIds.map((id, i) => {
          const m = gameData.missions.find((mm) => mm.id === id);
          return `<span class="cfg-order-chip">${i + 1}. ${m ? m.floorName : id}</span>`;
        }).join("");
      }

      const btn = document.getElementById("btn-confirm-config");
      if (btn) {
        btn.disabled = selectedMissionIds.length < 1;
        btn.textContent = `Iniciar juego con ${selectedMissionIds.length} piso${selectedMissionIds.length !== 1 ? "s" : ""}`;
      }
    }

    async function confirmConfig() {
      if (selectedMissionIds.length < 1) return;
      await Multiplayer.setSelectedMissions(selectedMissionIds);

      // Filter gameData missions
      const byId = {};
      gameData.missions.forEach((m) => { byId[m.id] = m; });
      gameData.missions = selectedMissionIds.map((id) => byId[id]).filter(Boolean);

      currentMissionIdx = 0;
      await Multiplayer.advanceRoom("playing", 0);
      goScreen("host-playing");
      buildHostTowerFloors();
      renderMissionPanel(0);
      renderFooter();
      renderLiveLeaderboard();
      renderSolidezPanel();
      startTimer();
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
      startTimer();
    }

    function startTimer() {
      const code = Multiplayer.getRoomCode();
      Multiplayer.startMissionTimer(code, 45);
    }

    function pauseTimer() {
      const code = Multiplayer.getRoomCode();
      Multiplayer.pauseResumeTimer(code);
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
          <span class="opt-letter">${letter}</span>
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
      const glyph = type === "native" ? "\u25B2" : type === "external" ? "\u25C6" : "\u25A0";
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
        renderFinalResults();
        return;
      }

      await Multiplayer.advanceRoom("playing", currentMissionIdx);
      renderMissionPanel(currentMissionIdx);
      renderFooter();
      renderLiveLeaderboard();
      renderSolidezPanel();
      startTimer();
    }

    // ---------- PANTALLA FINAL DEL HOST ----------
    function getRankTitle(position) {
      switch (position) {
        case 1: return "Capitán Al Mando";
        case 2: return "Primer Oficial";
        case 3: return "Timonel";
        default: return "Marinero";
      }
    }

    function renderFinalResults() {
      const container = document.getElementById("host-results-content");
      if (!container) return;

      const playerList = Object.values(players);
      // Ordenar por granos (principal ranking)
      const sorted = playerList.sort((a, b) => (b.grains || 0) - (a.grains || 0));

      // --- TOP 3 PODIO ---
      let podiumH = '<div class="host-podium">';
      const top3 = sorted.slice(0, 3);
      const podiumClasses = ["podium-gold", "podium-silver", "podium-bronze"];
      const podiumEmojis = ["1°", "2°", "3°"];

      top3.forEach((pl, i) => {
        const title = getRankTitle(i + 1);
        podiumH += `<div class="podium-card ${podiumClasses[i]}">
          <div class="podium-position">${podiumEmojis[i]}</div>
          <div class="podium-avatar">${initial(pl.name)}</div>
          <div class="podium-name">${pl.name}</div>
          <div class="podium-title">${title}</div>
          <div class="podium-grains">${pl.grains || 0} granos</div>
        </div>`;
      });
      podiumH += '</div>';

      // --- PORCENTAJES DE DECISIONES ---
      let totalChoices = 0;
      let manualCount = 0;
      let externalCount = 0;
      let nativeCount = 0;

      playerList.forEach((pl) => {
        if (!pl.choices) return;
        Object.values(pl.choices).forEach((ch) => {
          if (ch.type === "manual") { manualCount++; totalChoices++; }
          else if (ch.type === "external") { externalCount++; totalChoices++; }
          else if (ch.type === "native") { nativeCount++; totalChoices++; }
          // timeout no se cuenta
        });
      });

      const pctManual = totalChoices > 0 ? Math.round((manualCount / totalChoices) * 100) : 0;
      const pctExternal = totalChoices > 0 ? Math.round((externalCount / totalChoices) * 100) : 0;
      const pctNative = totalChoices > 0 ? Math.round((nativeCount / totalChoices) * 100) : 0;

      let statsH = `<div class="host-stats-section">
        <div class="host-stats-title">Distribución de decisiones</div>
        <div class="host-stats-grid">
          <div class="host-stat-card stat-manual">
            <div class="host-stat-pct">${pctManual}%</div>
            <div class="host-stat-label">Manual</div>
            <div class="host-stat-bar"><div class="host-stat-fill" style="width:${pctManual}%;background:#8891A6"></div></div>
          </div>
          <div class="host-stat-card stat-external">
            <div class="host-stat-pct">${pctExternal}%</div>
            <div class="host-stat-label">Externo (parcial)</div>
            <div class="host-stat-bar"><div class="host-stat-fill" style="width:${pctExternal}%;background:#7C4DFF"></div></div>
          </div>
          <div class="host-stat-card stat-native">
            <div class="host-stat-pct">${pctNative}%</div>
            <div class="host-stat-label">Nativo (IA integrada)</div>
            <div class="host-stat-bar"><div class="host-stat-fill" style="width:${pctNative}%;background:#0070F2"></div></div>
          </div>
        </div>
      </div>`;

      // --- LEADERBOARD COMPLETO ---
      let lbH = '<div class="host-final-leaderboard"><div class="host-final-lb-title">Ranking completo</div>';
      sorted.forEach((pl, i) => {
        const title = getRankTitle(i + 1);
        const rankCls = i === 0 ? "r1" : i === 1 ? "r2" : i === 2 ? "r3" : "";
        lbH += `<div class="lb-row ${i < 3 ? "top3" : ""}">
          <div class="lb-left">
            <span class="lb-rank ${rankCls}">${i + 1}</span>
            <span class="lb-name">${pl.name}</span>
            <span class="lb-title-tag">${title}</span>
          </div>
          <div class="lb-right">
            <span class="lb-grains">${pl.grains || 0} granos</span>
            <span class="lb-ico">ICO ${pl.ico || 0}</span>
          </div>
        </div>`;
      });
      lbH += '</div>';

      // --- EXPORTAR ---
      let exportH = `<div class="host-export-section">
        <button class="btn-export" onclick="HostApp.exportResults()">Exportar resultados (CSV)</button>
      </div>`;

      container.innerHTML = podiumH + statsH + lbH + exportH;
    }

    function exportResults() {
      const playerList = Object.values(players);
      const sorted = playerList.sort((a, b) => (b.grains || 0) - (a.grains || 0));

      let csv = "Nombre,Empresa,Correo,ICO Final,Decisiones Nativas,Decisiones Externas,Decisiones Manuales\n";

      sorted.forEach((pl) => {
        let nativeCount = 0;
        let externalCount = 0;
        let manualCount = 0;

        if (pl.choices) {
          Object.values(pl.choices).forEach((ch) => {
            if (ch.type === "native") nativeCount++;
            else if (ch.type === "external") externalCount++;
            else if (ch.type === "manual") manualCount++;
          });
        }

        csv += `"${pl.name}","${pl.company || ""}","${pl.email || ""}",${pl.ico || 0},${nativeCount},${externalCount},${manualCount}\n`;
      });

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hr-ai-tower-resultados-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }

    function renderLeaderboard() {
      renderFinalResults();
    }

    function goScreen(id) {
      document.querySelectorAll(".scr").forEach((s) => s.classList.remove("on"));
      document.getElementById(id).classList.add("on");
    }

    async function restart() {
      await Multiplayer.closeRoom();
      location.reload();
    }

    function toggleSound(enabled) {
      // Placeholder for sound toggle
    }

    return { init, startGame, openConfigScreen, confirmConfig, toggleMission, applyPreset, nextMission, restart, setLeaderboardMode, pauseTimer, exportResults, toggleSound };
  })();

  document.addEventListener("DOMContentLoaded", () => HostApp.init());
