/* ============================================
   PLAYER APP - v2
   Cada jugador juega individualmente.
   Responde, espera al host, ve sus resultados.
   ============================================ */

   const PlayerApp = (function () {
    let selectedAvatar = null;
    let selectedCardIdx = null;
    let gameData = null;
    let currentMissionIdx = 0;
    let hasAnsweredThisMission = false;
  
    async function init() {
      gameData = await GameEngine.loadData();
  
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get("room");
      if (roomParam) {
        document.getElementById("input-room-code").value = roomParam;
        await checkRoom();
      }
  
      document.getElementById("input-player-name").addEventListener("input", checkCanJoin);
    }
  
    async function checkRoom() {
      const code = document.getElementById("input-room-code").value.trim();
      const errEl = document.getElementById("join-error");
      if (!code) { errEl.textContent = "Ingresa un código."; return; }
      errEl.textContent = "";
      goScreen("scr-intro");
    }
  
    function selectAvatar(el, avatarId) {
      document.querySelectorAll(".av-card").forEach((c) => c.classList.remove("sel"));
      el.classList.add("sel");
      selectedAvatar = avatarId;
      checkCanJoin();
    }
  
    function checkCanJoin() {
      const name = document.getElementById("input-player-name").value.trim();
      document.getElementById("btn-go").disabled = !(name && selectedAvatar);
    }
  
    async function joinGame() {
      const name = document.getElementById("input-player-name").value.trim();
      const code = document.getElementById("input-room-code").value.trim();
      try {
        await Multiplayer.joinRoom(code, name, selectedAvatar);
        GameEngine.setPlayer(name, selectedAvatar);
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
            goScreen("scr-game");
            renderMission(currentMissionIdx);
          }
  
        } else if (room.status === "results") {
          goScreen("scr-res");
          renderResults();
        }
      });
    }
  
    function renderMission(idx) {
      const m = gameData.missions[idx];
      selectedCardIdx = null;
      GameEngine.startMissionTimer();
  
      document.getElementById("pan-ttl").textContent = `Misión ${idx + 1}: ${m.missionTitle}`;
      document.getElementById("pan-sub").textContent = `Piso ${idx + 1} de ${gameData.missions.length}`;
  
      let h = `<div class="sec-lbl">Situación</div>
               <div class="brief">${m.brief}</div>
               <div class="sec-lbl" style="margin-top:4px">¿Cómo lo resuelves?</div>`;
  
      m.options.forEach((opt, oi) => {
        const letters = ["A","B","C"];
        const bcls = opt.type === "native" ? "b-native" : opt.type === "external" ? "b-external" : "b-manual";
        const label = opt.type === "native" ? "NATIVO" : opt.type === "external" ? "EXTERNO" : "MANUAL";
        const bullets = opt.bullets.map((b) => `<li>${b}</li>`).join("");
        h += `<div class="dc" id="dc${oi}" onclick="PlayerApp.selectCard(${oi})">
          <div class="dc-hdr">
            <span class="opt-letter">${letters[oi]}</span>
            <span class="badge ${bcls}">${label}</span>
            ${opt.recommended ? '<span class="badge b-rec">⭐ Recomendado</span>' : ""}
          </div>
          <div class="dc-ttl">${opt.label}</div>
          <ul class="dc-ul">${bullets}</ul>
        </div>`;
      });
  
      h += `<div class="tip">
              <div class="tip-lbl">💡 Consejo SAP</div>
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
      document.querySelectorAll(".dc").forEach((el) => el.classList.remove("sel", "external", "manual"));
      const el = document.getElementById(`dc${idx}`);
      const opt = gameData.missions[currentMissionIdx].options[idx];
      el.classList.add("sel");
      if (opt.type === "external") el.classList.add("external");
      if (opt.type === "manual") el.classList.add("manual");
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
  
      const resMap = {
        productivity: "⚡", innovation: "💡", trust: "🛡️",
        integration: "🔗", experience: "😊", governance: "📋"
      };
      let rh = "";
      Object.keys(resMap).forEach((k) => {
        rh += `<div class="res-chip">${resMap[k]}<span class="res-v">${state.resources[k] || 0}</span></div>`;
      });
      document.getElementById("res-row").innerHTML = rh;
    }
  
    function showToast(msg) {
      const a = document.getElementById("toast-area");
      const d = document.createElement("div");
      d.className = "toast";
      d.textContent = msg;
      a.appendChild(d);
      setTimeout(() => d.remove(), 4500);
    }
  
    function showEvent(mission, isNative) {
      const ev = mission.unexpectedEvent;
      if (!ev) return;
      setTimeout(() => {
        const a = document.getElementById("ev-area");
        const d = document.createElement("div");
        d.className = "ev-box";
        d.innerHTML = `<div class="ev-emo">${ev.emoji}</div>
                       <div class="ev-ttl">${ev.title}</div>
                       <div class="ev-dsc">${isNative ? ev.outcomeIfNative : ev.outcomeIfOther}</div>`;
        a.appendChild(d);
        setTimeout(() => d.remove(), 6000);
      }, 1000);
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
        const color = ch.type === "native" ? "#0070F2" : ch.type === "external" ? "#BA7517" : "#888780";
        const icon = ch.type === "native" ? "🟢" : ch.type === "external" ? "🟠" : "⚫";
        towerH += `<div style="background:rgba(255,255,255,0.09);border-radius:8px;padding:10px 14px;border-left:3px solid ${color}">
          <div style="font-size:12px;color:rgba(255,255,255,0.6)">${m.missionTitle}</div>
          <div style="font-size:13px;font-weight:600;color:#fff;margin-top:2px">${icon} ${ch.label || ""}</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:2px">Estabilidad: ${ch.stability || 0}%</div>
        </div>`;
      });
      towerH += "</div>";
  
      const learnEl = document.getElementById("res-learn");
      if (learnEl) learnEl.innerHTML = `<div class="rl-ttl">Tu torre</div>${towerH}`;
  
      const nativeCount = Object.values(choices).filter((c) => c.type === "native").length;
      const badges = [];
      if (nativeCount === missions.length) badges.push("🏆 Business AI Champion", "⭐ AI First Master");
      else if (nativeCount >= 3) badges.push("🎯 AI Process Champion", "🔵 Maestro Joule");
      else if (nativeCount >= 2) badges.push("🔍 Shadow IT Hunter");
      else badges.push("🌱 Aprendiz en Transición");
  
      const badgesEl = document.getElementById("res-badges");
      if (badgesEl) badgesEl.innerHTML = badges.map((b) => `<span class="rbadge">${b}</span>`).join("");
    }
  
    function goScreen(id) {
      document.querySelectorAll(".scr").forEach((s) => s.classList.remove("on"));
      document.getElementById(id).classList.add("on");
    }
  
    return { init, checkRoom, selectAvatar, joinGame, selectCard, confirm };
  })();
  
  document.addEventListener("DOMContentLoaded", () => PlayerApp.init());