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
    let selectedMissionIds = [];
    let activeMissions = [];

    // ---------- Temporizador de misión ----------
    const MISSION_TIMER_SECONDS = 45;
    let hostTimerInterval = null;
    let hostLastTimerStartedAt = null;
    let hostCurrentTimer = null;
    let hostAutoAdvanceTriggered = false;
    let lastBeepedRemaining = null;

    // ---------- Sonido de cuenta regresiva ----------
    const SOUND_PREF_KEY = "hrAiTowerSoundEnabled";
    let soundEnabled = localStorage.getItem(SOUND_PREF_KEY) === "true"; // desactivado por defecto
    let audioCtx = null;

    async function init() {
      const res = await fetch("data/missions.json");
      gameData = await res.json();

      const roomCode = await Multiplayer.createRoom();
      document.getElementById("room-code-display").textContent = roomCode;

      const joinLink = Multiplayer.getJoinLink();
      document.getElementById("host-link-display").textContent = joinLink;

      renderQR(joinLink);
      initSoundToggle();
      listenPlayers();
      Multiplayer.onRoomUpdate(handleRoomUpdate);
    }

    function handleRoomUpdate(room) {
      if (!room) return;
      renderLobbySelectedMissions(room.selectedMissions);
      handleHostTimer(room.timer);
    }

    // ---------- Sonido de cuenta regresiva (Web Audio API, sin archivos) ----------
    function initSoundToggle() {
      const input = document.getElementById("sound-toggle-input");
      if (input) input.checked = soundEnabled;
    }

    function toggleSound(checked) {
      soundEnabled = checked;
      localStorage.setItem(SOUND_PREF_KEY, String(checked));
    }

    function playBeep(frequency, duration) {
      if (!soundEnabled) return;
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration / 1000);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration / 1000);
      } catch (e) {
        // Web Audio no disponible/bloqueada: se ignora silenciosamente
      }
    }

    // ---------- Temporizador de misión ----------
    function timerColorFor(remaining) {
      return remaining < 10 ? "#D32F2F" : remaining <= 20 ? "#E8B84B" : "#1D9E75";
    }

    function computeRemainingSeconds(timer) {
      const elapsedMs = timer.paused ? (timer.pausedAt - timer.startedAt) : (Date.now() - timer.startedAt);
      return Math.max(0, timer.duration - Math.floor(elapsedMs / 1000));
    }

    function updatePauseButtonLabel(paused) {
      const btn = document.getElementById("btn-pause-timer");
      if (btn) btn.textContent = paused ? "Reanudar" : "Pausar";
    }

    function updateProgressTimerUI(remaining) {
      const numEl = document.getElementById("progress-timer-num");
      if (!numEl) return;
      numEl.textContent = remaining;
      numEl.style.color = timerColorFor(remaining);
    }

    function handleHostTimer(timer) {
      hostCurrentTimer = timer || null;

      if (!timer) {
        clearInterval(hostTimerInterval);
        hostTimerInterval = null;
        return;
      }

      updatePauseButtonLabel(timer.paused);

      if (timer.startedAt !== hostLastTimerStartedAt) {
        hostLastTimerStartedAt = timer.startedAt;
        hostAutoAdvanceTriggered = false;
        lastBeepedRemaining = null;
        clearInterval(hostTimerInterval);
        tickHostTimer();
        hostTimerInterval = setInterval(tickHostTimer, 1000);
      } else {
        tickHostTimer();
      }
    }

    function tickHostTimer() {
      if (!hostCurrentTimer) return;
      const remaining = computeRemainingSeconds(hostCurrentTimer);
      updateProgressTimerUI(remaining);

      if (!hostCurrentTimer.paused && remaining <= 5 && remaining !== lastBeepedRemaining) {
        lastBeepedRemaining = remaining;
        if (remaining === 4) playBeep(440, 150);
        else if (remaining === 3) playBeep(480, 150);
        else if (remaining === 2) playBeep(520, 150);
        else if (remaining === 1) playBeep(560, 150);
        else if (remaining === 0) playBeep(880, 400);
      }

      if (!hostCurrentTimer.paused && remaining <= 0 && !hostAutoAdvanceTriggered) {
        hostAutoAdvanceTriggered = true;
        nextMission();
      }
    }

    async function pauseTimer() {
      const roomCode = Multiplayer.getRoomCode();
      if (roomCode) await Multiplayer.pauseResumeTimer(roomCode);
    }

    function renderLobbySelectedMissions(selectedIds) {
      const wrap = document.getElementById("lobby-selected-wrap");
      if (!wrap) return;
      if (!selectedIds || !selectedIds.length) {
        wrap.style.display = "none";
        return;
      }
      wrap.style.display = "";
      const names = selectedIds.map((id) => {
        const m = gameData.missions.find((mm) => mm.id === id);
        return m ? (m.floorName || m.missionTitle) : id;
      });
      document.getElementById("lobby-selected-list").innerHTML =
        names.map((n) => `<span class="selected-mission-chip">${n}</span>`).join("");
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
          renderProgressPanel();
        }
      });
    }

    function renderLobbyChips() {
      let h = "";
      Object.values(players).forEach((pl) => {
        h += `<div class="host-player-chip">
          <span class="avatar-circle">${initial(pl.name)}</span>
          <div class="host-chip-body">
            <span class="host-chip-name">${pl.name}</span>
            ${pl.company ? `<span class="host-chip-company">${pl.company}</span>` : ""}
          </div>
        </div>`;
      });
      document.getElementById("host-players-grid").innerHTML = h;
    }

    function initial(name) {
      return (name || "?").trim().charAt(0).toUpperCase() || "?";
    }

    function typeColor(type) {
      return type === "native" ? "#0070F2" : type === "external" ? "#7C4DFF" : "#8891A6";
    }

    // ---------- Pantalla de configuración de partida ----------
    function openConfigScreen() {
      selectedMissionIds = [];
      goScreen("host-config");
      renderConfigScreen();
    }

    function applyPreset(count) {
      selectedMissionIds = gameData.missions.slice(0, count).map((m) => m.id);
      renderConfigScreen();
    }

    function toggleMission(missionId) {
      const idx = selectedMissionIds.indexOf(missionId);
      if (idx === -1) {
        selectedMissionIds.push(missionId); // nueva selección va al final del orden
      } else {
        selectedMissionIds.splice(idx, 1);
      }
      renderConfigScreen();
    }

    function renderConfigScreen() {
      let gridH = "";
      gameData.missions.forEach((m) => {
        const isSelected = selectedMissionIds.includes(m.id);
        gridH += `<div class="cfg-mission-card ${isSelected ? "selected" : ""}" onclick="HostApp.toggleMission('${m.id}')">
          <div class="cfg-mission-name">${m.floorName || m.missionTitle}</div>
          <div class="cfg-mission-desc">${m.missionTitle}</div>
        </div>`;
      });
      document.getElementById("cfg-mission-grid").innerHTML = gridH;

      let orderH = "";
      if (selectedMissionIds.length) {
        orderH = selectedMissionIds.map((id, i) => {
          const m = gameData.missions.find((mm) => mm.id === id);
          const name = m ? (m.floorName || m.missionTitle) : id;
          return `<div class="cfg-order-item"><span class="cfg-order-num">${i + 1}</span>${name}</div>`;
        }).join("");
      } else {
        orderH = `<div class="cfg-order-empty">Selecciona al menos una misión</div>`;
      }
      document.getElementById("cfg-order-list").innerHTML = orderH;

      const count = selectedMissionIds.length;
      const btn = document.getElementById("btn-confirm-config");
      btn.disabled = count === 0;
      btn.textContent = `Iniciar juego con ${count} piso${count === 1 ? "" : "s"}`;
    }

    async function confirmConfig() {
      if (!selectedMissionIds.length) return;
      await Multiplayer.setSelectedMissions(selectedMissionIds);
      await startGame();
    }

    async function startGame() {
      const byId = {};
      gameData.missions.forEach((m) => { byId[m.id] = m; });
      activeMissions = selectedMissionIds.map((id) => byId[id]).filter(Boolean);
      if (!activeMissions.length) activeMissions = gameData.missions.slice();

      currentMissionIdx = 0;
      await Multiplayer.advanceRoom("playing", 0);
      await Multiplayer.startMissionTimer(Multiplayer.getRoomCode(), MISSION_TIMER_SECONDS);
      goScreen("host-playing");
      buildHostTowerFloors();
      renderMissionPanel(0);
      renderFooter();
      renderLiveLeaderboard();
      renderSolidezPanel();
      renderProgressPanel();
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
      const m = activeMissions[idx];
      const total = activeMissions.length;

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
        : 'Siguiente misión <span class="gh-arrow">&rarr;</span>';
    }

    function renderFooter() {
      const m = activeMissions[currentMissionIdx];
      const playerList = Object.values(players);
      const total = playerList.length;
      const answered = playerList.filter((pl) => pl.choices && pl.choices[m.id]).length;

      document.getElementById("gh-conn-count").textContent = total;
      document.getElementById("gh-footer-status").textContent =
        total === 0 ? "Esperando jugadores…" : `${answered} / ${total} respondieron`;
    }

    const CHECK_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`;
    const CLOCK_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>`;

    function renderProgressPanel() {
      const list = document.getElementById("progress-player-list");
      if (!list) return;

      const mission = activeMissions[currentMissionIdx];
      const playerList = Object.values(players);
      const total = playerList.length;
      const answered = mission ? playerList.filter((pl) => pl.choices && pl.choices[mission.id]).length : 0;

      const countEl = document.getElementById("progress-answered-count");
      if (countEl) countEl.textContent = `${answered} de ${total} respondieron`;

      let rowsH = "";
      playerList.forEach((pl) => {
        const hasAnswered = !!(mission && pl.choices && pl.choices[mission.id]);
        rowsH += `<div class="progress-player-row">
          <span class="progress-player-name">${pl.name}</span>
          <span class="progress-player-status ${hasAnswered ? "answered" : "pending"}">${hasAnswered ? CHECK_ICON_SVG : CLOCK_ICON_SVG}</span>
        </div>`;
      });
      list.innerHTML = rowsH;
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
      const total = activeMissions.length;
      stack.innerHTML = "";
      activeMissions.forEach((m, i) => {
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
      const mission = activeMissions[idx];
      const type = majorityTypeForMission(mission.id);
      const glyph = type === "native" ? "▲" : type === "external" ? "◆" : "■";
      const f = document.getElementById(`host-floor-${idx}`);
      if (!f) return;
      f.className = `tower-floor built type-${type}`;
      f.innerHTML = `<span class="floor-glyph">${glyph}</span><span class="floor-num">${idx + 1}</span>`;
      void f.offsetWidth;
      f.classList.add("drop-anim");
      document.getElementById("host-tower-count").textContent = `${idx + 1}/${activeMissions.length}`;
    }

    async function nextMission() {
      buildHostFloor(currentMissionIdx);
      currentMissionIdx++;

      if (currentMissionIdx >= activeMissions.length) {
        clearInterval(hostTimerInterval);
        hostTimerInterval = null;
        await Multiplayer.advanceRoom("results");
        goScreen("host-results");
        renderLeaderboard();
        return;
      }

      await Multiplayer.advanceRoom("playing", currentMissionIdx);
      await Multiplayer.startMissionTimer(Multiplayer.getRoomCode(), MISSION_TIMER_SECONDS);
      renderMissionPanel(currentMissionIdx);
      renderFooter();
      renderLiveLeaderboard();
      renderSolidezPanel();
      renderProgressPanel();
    }

    function renderLeaderboard() {
      const sorted = Object.values(players).sort((a, b) => (b.ico || 0) - (a.ico || 0));
      document.getElementById("leaderboard").innerHTML = renderLeaderboardRows(sorted) + `
        <div class="export-wrap">
          <button class="btn-go" id="btn-export-csv" onclick="HostApp.exportParticipants()">Exportar participantes</button>
          <div class="export-status" id="export-status"></div>
        </div>`;
    }

    function csvEscape(value) {
      const str = value === null || value === undefined ? "" : String(value);
      if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }

    function exportParticipants() {
      const header = ["Nombre", "Empresa", "Correo", "ICO Final", "Decisiones Nativas", "Decisiones Externas", "Decisiones Manuales"];
      const rows = Object.values(players).map((pl) => {
        const choices = Object.values(pl.choices || {});
        return [
          pl.name || "",
          pl.company || "",
          pl.email || "",
          pl.ico || 0,
          choices.filter((c) => c.type === "native").length,
          choices.filter((c) => c.type === "external").length,
          choices.filter((c) => c.type === "manual").length
        ];
      });

      const csvContent = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const dateStr = new Date().toISOString().slice(0, 10);

      const a = document.createElement("a");
      a.href = url;
      a.download = `hr-ai-tower-sesion-${dateStr}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      Multiplayer.closeRoom().then(() => {
        const statusEl = document.getElementById("export-status");
        if (statusEl) statusEl.textContent = "Datos exportados y sala eliminada de Firebase";
        const btn = document.getElementById("btn-export-csv");
        if (btn) btn.disabled = true;
      });
    }

    function goScreen(id) {
      document.querySelectorAll(".scr").forEach((s) => s.classList.remove("on"));
      document.getElementById(id).classList.add("on");
    }

    async function restart() {
      await Multiplayer.closeRoom();
      location.reload();
    }

    return {
      init, startGame, nextMission, restart, setLeaderboardMode, exportParticipants,
      openConfigScreen, applyPreset, toggleMission, confirmConfig,
      pauseTimer, toggleSound
    };
  })();

  document.addEventListener("DOMContentLoaded", () => HostApp.init());
