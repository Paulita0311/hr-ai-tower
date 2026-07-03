/* ============================================
   PLAYER APP - v2
   Cada jugador juega individualmente.
   Responde, espera al host, ve sus resultados.
   ============================================ */

   const PlayerApp = (function () {
    let selectedCardIdx = null;
    let gameData = null;
    let currentMissionIdx = 0;
    let hasAnsweredThisMission = false;
    let playerName = "";
    let tutorialDismissed = false;
    let pendingFirstMission = false;

    async function init() {
      gameData = await GameEngine.loadData();

      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get("room");
      if (roomParam) {
        document.getElementById("input-room-code").value = roomParam;
        await checkRoom();
      }

      document.getElementById("input-player-name").addEventListener("input", checkCanJoin);
      TowerRenderer.init(document.getElementById("tower-canvas"), gameData.missions);
    }

    function renderRoundIndicator(idx, total) {
      const lbl = document.getElementById("gh-round-lbl");
      const dots = document.getElementById("gh-round-dots");
      if (lbl) lbl.textContent = `RONDA ${idx + 1}/${total}`;
      if (dots) {
        let h = "";
        for (let i = 0; i < total; i++) {
          const cls = i < idx ? "done" : i === idx ? "active" : "";
          h += `<span class="gh-dot ${cls}"></span>`;
        }
        dots.innerHTML = h;
      }
    }

    function animateICOCounter(newVal) {
      const el = document.getElementById("tower-ico-num");
      if (!el) return;
      const from = parseInt(el.textContent, 10) || 0;
      const to = Math.min(100, newVal);
      if (from === to) return;
      const duration = 700;
      const start = performance.now();
      function step(now) {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(from + (to - from) * eased);
        if (p < 1) {
          requestAnimationFrame(step);
        } else {
          el.classList.remove("bump");
          void el.offsetWidth;
          el.classList.add("bump");
        }
      }
      requestAnimationFrame(step);
    }

    async function checkRoom() {
      const code = document.getElementById("input-room-code").value.trim();
      const errEl = document.getElementById("join-error");
      if (!code) { errEl.textContent = "Ingresa un código."; return; }
      errEl.textContent = "";
      goScreen("scr-intro");
    }

    function checkCanJoin() {
      const name = document.getElementById("input-player-name").value.trim();
      document.getElementById("btn-go").disabled = !name;
    }

    async function joinGame() {
      const name = document.getElementById("input-player-name").value.trim();
      const code = document.getElementById("input-room-code").value.trim();
      const avatar = "champion";
      try {
        await Multiplayer.joinRoom(code, name, avatar);
        GameEngine.setPlayer(name, avatar);
        playerName = name;
        const nameEl = document.getElementById("gh-player-name");
        const avEl = document.getElementById("gh-player-avatar");
        if (nameEl) nameEl.textContent = name;
        if (avEl) avEl.textContent = name.trim().charAt(0).toUpperCase() || "J";
        goScreen("scr-waiting");
        listenRoom();
      } catch (e) {
        alert(e.message);
      }
    }

    function listenRoom() {
      Multiplayer.onRoomUpdate((room) => {
        if (!room) return;

        if (room.status === "playing") {
          const newIdx = room.currentMissionIdx || 0;

          if (newIdx !== currentMissionIdx) {
            currentMissionIdx = newIdx;
            hasAnsweredThisMission = false;
          }

          if (!hasAnsweredThisMission) {
            // Show tutorial before the very first mission
            if (!tutorialDismissed && currentMissionIdx === 0) {
              pendingFirstMission = true;
              goScreen("scr-tutorial");
            } else {
              goScreen("scr-game");
              renderMission(currentMissionIdx);
            }
          }

        } else if (room.status === "results") {
          goScreen("scr-res");
          renderResults();
        }
      });
    }

    function dismissTutorial() {
      tutorialDismissed = true;
      pendingFirstMission = false;
      goScreen("scr-game");
      renderMission(currentMissionIdx);
    }

    function renderMission(idx) {
      const m = gameData.missions[idx];
      const total = gameData.missions.length;
      selectedCardIdx = null;
      GameEngine.startMissionTimer();

      renderRoundIndicator(idx, total);
      document.getElementById("pan-ttl").textContent = m.missionTitle;
      document.getElementById("pan-sub").textContent = `Piso ${idx + 1} de ${total}`;

      let h = `<div class="cat-tag">Piso ${idx + 1}: ${m.floorName || m.missionTitle}</div>
               <div class="brief">${m.brief}</div>
               <div class="sec-lbl" style="margin-top:4px">¿Cómo lo resuelves?</div>`;

      m.options.forEach((opt, oi) => {
        const letters = ["A","B","C"];
        const bullets = opt.bullets.map((b) => `<li>${b}</li>`).join("");
        h += `<div class="dc" id="dc${oi}" onclick="PlayerApp.selectCard(${oi})">
          <span class="opt-letter">${letters[oi]}</span>
          <div class="dc-body">
            <div class="dc-ttl">${opt.label}</div>
            <ul class="dc-ul">${bullets}</ul>
          </div>
        </div>`;
      });

      h += `<div class="tip">
              <div class="tip-lbl">Consejo SAP</div>
              <div class="tip-txt">${m.tooltip}</div>
            </div>`;
      h += `<button class="btn-conf" id="btn-conf" onclick="PlayerApp.confirm(${idx})" disabled>
              Confirmar mi decisión
            </button>`;

      document.getElementById("pan-body").innerHTML = h;
      updateHUD(GameEngine.getState());
    }

    function selectCard(idx) {
      if (hasAnsweredThisMission) return;
      document.querySelectorAll(".dc").forEach((el) => el.classList.remove("sel"));
      const el = document.getElementById(`dc${idx}`);
      el.classList.add("sel");
      selectedCardIdx = idx;
      document.getElementById("btn-conf").disabled = false;
    }

    async function confirm(missionIdx) {
      if (selectedCardIdx === null || hasAnsweredThisMission) return;
      hasAnsweredThisMission = true;

      const result = GameEngine.confirmChoice(missionIdx, selectedCardIdx);
      const state = GameEngine.getState();
      const mission = gameData.missions[missionIdx];

      await Multiplayer.syncPlayerChoice(
        mission.id,
        {
          ...state.choices[mission.id],
          optionIdx: selectedCardIdx
        },
        state.ico,
        state.resources
      );

      updateHUD(state);
      const floorLabel = (mission.floorName || mission.missionTitle).replace(/^Piso\s+/i, "");
      TowerRenderer.buildFloor(missionIdx, result.option.type, floorLabel);
      showToast(result.isNative ? mission.tooltip : "Esta opción limita trazabilidad y gobernanza.");
      showEvent(mission, result.isNative);

      document.querySelectorAll(".dc").forEach((el, i) => {
        if (i !== selectedCardIdx) {
          el.style.opacity = "0.4";
          el.style.pointerEvents = "none";
        }
      });

      const btn = document.getElementById("btn-conf");
      btn.disabled = true;
      btn.textContent = "✓ Decisión confirmada — esperando al anfitrión...";
      btn.style.background = "#1D9E75";
    }

    function updateHUD(state) {
      const ico = Math.min(100, state.ico);
      document.getElementById("ico-fill").style.width = ico + "%";
      document.getElementById("ico-num").textContent = ico;
      document.getElementById("ico-tag").textContent = GameEngine.getICOState(ico).label;
      animateICOCounter(ico);

      const resMap = {
        productivity: "PR", innovation: "IN", trust: "TR",
        integration: "IG", experience: "EX", governance: "GO"
      };
      let rh = "";
      Object.keys(resMap).forEach((k) => {
        rh += `<div class="res-chip"><span class="res-ico-badge">${resMap[k]}</span><span class="res-v">${state.resources[k] || 0}</span></div>`;
      });
      document.getElementById("res-row").innerHTML = rh;
    }

    function showToast(msg) {
      const a = document.getElementById("toast-area");
      const d = document.createElement("div");
      d.className = "toast";
      d.textContent = msg;
      a.appendChild(d);
      setTimeout(() => d.remove(), 8000);
    }

    function showEvent(mission, isNative) {
      const ev = mission.unexpectedEvent;
      if (!ev) return;
      setTimeout(() => {
        const a = document.getElementById("ev-area");
        const d = document.createElement("div");
        d.className = "ev-box";
        d.innerHTML = `<div class="ev-glyph">!</div>
                       <div class="ev-ttl">${ev.title}</div>
                       <div class="ev-dsc">${isNative ? ev.outcomeIfNative : ev.outcomeIfOther}</div>`;
        a.appendChild(d);
        setTimeout(() => d.remove(), 10000);
      }, 1200);
    }

    function renderResults() {
      const state = GameEngine.getState();
      const ico = Math.min(100, state.ico);
      document.getElementById("res-ico").textContent = ico;
      document.getElementById("res-status").textContent = GameEngine.getICOState(ico).label;

      const choices = state.choices;
      const missions = gameData.missions;
      let towerH = '<div style="display:flex;flex-direction:column;gap:6px;width:100%;max-width:340px">';
      missions.forEach((m) => {
        const ch = choices[m.id];
        if (!ch) return;
        const color = ch.type === "native" ? "#0070F2" : ch.type === "external" ? "#7C4DFF" : "#8891A6";
        const glyph = ch.type === "native" ? "▲" : ch.type === "external" ? "◆" : "■";
        towerH += `<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:10px 14px;border-left:3px solid ${color}">
          <div style="font-size:12px;color:rgba(255,255,255,0.55)">${m.missionTitle}</div>
          <div style="font-size:13px;font-weight:700;color:#fff;margin-top:2px">${glyph} ${ch.label || ""}</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:2px">Estabilidad: ${ch.stability || 0}%</div>
        </div>`;
      });
      towerH += "</div>";

      const learnEl = document.getElementById("res-learn");
      if (learnEl) learnEl.innerHTML = `<div class="rl-ttl">Tu torre</div>${towerH}`;

      const nativeCount = Object.values(choices).filter((c) => c.type === "native").length;
      const badges = [];
      if (nativeCount === missions.length) badges.push("Business AI Champion", "AI First Master");
      else if (nativeCount >= 3) badges.push("AI Process Champion", "Maestro Joule");
      else if (nativeCount >= 2) badges.push("Shadow IT Hunter");
      else badges.push("Aprendiz en Transición");

      const badgesEl = document.getElementById("res-badges");
      if (badgesEl) badgesEl.innerHTML = badges.map((b) => `<span class="rbadge">${b}</span>`).join("");
    }

    function goScreen(id) {
      document.querySelectorAll(".scr").forEach((s) => s.classList.remove("on"));
      document.getElementById(id).classList.add("on");
    }

    return { init, checkRoom, joinGame, selectCard, confirm, dismissTutorial };
  })();

  document.addEventListener("DOMContentLoaded", () => PlayerApp.init());
