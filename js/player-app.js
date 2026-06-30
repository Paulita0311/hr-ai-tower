/* ============================================
   PLAYER APP
   Controla la pantalla del jugador (play.html)
   ============================================ */

const PlayerApp = (function () {
  let selectedAvatar = null;
  let selectedCardIdx = null;
  let gameData = null;
  let roomData = null;

  async function init() {
    gameData = await GameEngine.loadData();

    // si el link trae ?room=ABCDE, saltamos la pantalla de código
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room");
    if (roomParam) {
      document.getElementById("input-room-code").value = roomParam;
      await checkRoom();
    }
  }

  async function checkRoom() {
    const code = document.getElementById("input-room-code").value.trim();
    const errEl = document.getElementById("join-error");
    if (!code) { errEl.textContent = "Ingresa un código."; return; }

    try {
      // valida que exista (multiplayer.joinRoom hace la validación real al unirse)
      goScreen("scr-intro");
    } catch (e) {
      errEl.textContent = e.message;
    }
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
      listenForGameStart();
    } catch (e) {
      alert(e.message);
    }
  }

  function listenForGameStart() {
    Multiplayer.onRoomUpdate((room) => {
      roomData = room;
      if (!room) return;

      if (room.status === "playing") {
        goScreen("scr-game");
        renderMission(room.currentMissionIdx || 0);
      } else if (room.status === "boss") {
        goScreen("scr-boss");
        renderBoss();
      } else if (room.status === "results") {
        goScreen("scr-res");
        renderResults();
      }
    });
  }

  function goScreen(id) {
    document.querySelectorAll(".scr").forEach((s) => s.classList.remove("on"));
    document.getElementById(id).classList.add("on");
  }

  function renderMission(idx) {
    const m = gameData.missions[idx];
    selectedCardIdx = null;
    GameEngine.startMissionTimer();

    document.getElementById("pan-ttl").textContent = `Misión ${idx + 1}: ${m.missionTitle}`;
    document.getElementById("pan-sub").textContent = `Piso ${idx + 1} de ${gameData.missions.length}`;

    let h = `<div class="sec-lbl">Situación</div><div class="brief">${m.brief}</div>`;
    h += `<div class="sec-lbl">¿Cómo resolverán esto?</div>`;

    m.options.forEach((opt, oi) => {
      const bcls = opt.type === "native" ? "b-native" : opt.type === "external" ? "b-external" : "b-manual";
      const label = opt.type === "native" ? "NATIVO" : opt.type === "external" ? "EXTERNO" : "MANUAL";
      const bullets = opt.bullets.map((b) => `<li>${b}</li>`).join("");
      h += `<div class="dc" id="dc${oi}" onclick="PlayerApp.selectCard(${oi})">
        <div class="dc-hdr">
          <span class="badge ${bcls}">${label}</span>
          ${opt.recommended ? '<span class="badge b-rec">Recomendado</span>' : ""}
        </div>
        <div class="dc-ttl">${opt.label}</div>
        <ul class="dc-ul">${bullets}</ul>
      </div>`;
    });

    h += `<div class="tip"><div class="tip-lbl">Consejo SAP</div><div class="tip-txt">${m.tooltip}</div></div>`;
    h += `<button class="btn-conf" id="btn-conf" onclick="PlayerApp.confirm(${idx})" disabled>Confirmar decisión</button>`;

    document.getElementById("pan-body").innerHTML = h;
  }

  function selectCard(idx) {
    document.querySelectorAll(".dc").forEach((el) => el.classList.remove("sel", "external", "manual"));
    const el = document.getElementById(`dc${idx}`);
    const mIdx = roomData.currentMissionIdx || 0;
    const opt = gameData.missions[mIdx].options[idx];
    el.classList.add("sel");
    if (opt.type === "external") el.classList.add("external");
    if (opt.type === "manual") el.classList.add("manual");
    selectedCardIdx = idx;
    document.getElementById("btn-conf").disabled = false;
  }

  async function confirm(missionIdx) {
    if (selectedCardIdx === null) return;
    const result = GameEngine.confirmChoice(missionIdx, selectedCardIdx);
    const state = GameEngine.getState();

    await Multiplayer.syncPlayerChoice(
      gameData.missions[missionIdx].id,
      state.choices[gameData.missions[missionIdx].id],
      state.ico,
      state.resources
    );

    updateHUD(state);
    showToast(result.isNative ? gameData.missions[missionIdx].tooltip : "Esta opción limita trazabilidad y gobernanza.");
    showEvent(gameData.missions[missionIdx], result.isNative);

    document.getElementById("btn-conf").disabled = true;
    document.getElementById("btn-conf").textContent = "✓ Decisión confirmada — esperando a los demás...";
  }

  function updateHUD(state) {
    const ico = Math.min(100, state.ico);
    document.getElementById("ico-fill").style.width = ico + "%";
    document.getElementById("ico-num").textContent = ico;
    document.getElementById("ico-tag").textContent = GameEngine.getICOState(ico).label;

    const resMap = { productivity: "⚡", innovation: "💡", trust: "🛡️", integration: "🔗", experience: "😊", governance: "📋" };
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
    setTimeout(() => d.remove(), 4000);
  }

  function showEvent(mission, isNative) {
    const ev = mission.unexpectedEvent;
    if (!ev) return;
    const a = document.getElementById("ev-area");
    const d = document.createElement("div");
    d.className = "ev-box";
    d.innerHTML = `<div class="ev-emo">${ev.emoji}</div><div class="ev-ttl">${ev.title}</div><div class="ev-dsc">${isNative ? ev.outcomeIfNative : ev.outcomeIfOther}</div>`;
    a.appendChild(d);
    setTimeout(() => d.remove(), 6500);
  }

  function renderBoss() {
    const boss = gameData.bossEvent;
    document.getElementById("boss-name").textContent = boss.name;
    document.getElementById("boss-desc").textContent = boss.description;

    let h = "";
    boss.steps.forEach((step, i) => {
      h += `<div class="boss-step ${i === 0 ? "" : "locked"}" id="bs${i}" onclick="PlayerApp.doBossStep(${i})">
        <div class="bs-lbl">${step.label}</div>
        <div class="bs-tool">${step.tool}</div>
      </div>`;
    });
    document.getElementById("boss-grid").innerHTML = h;
  }

  async function doBossStep(idx) {
    const el = document.getElementById(`bs${idx}`);
    if (el.classList.contains("locked") || el.classList.contains("done")) return;
    el.classList.add("done");

    const step = GameEngine.doBossStep(idx);
    const state = GameEngine.getState();
    updateHUD(state);

    await Multiplayer.syncPlayerChoice("boss_" + idx, { done: true }, state.ico, state.resources);

    const next = document.getElementById(`bs${idx + 1}`);
    if (next) next.classList.remove("locked");
  }

  function renderResults() {
    const state = GameEngine.getState();
    const ico = Math.min(100, state.ico);
    document.getElementById("res-ico").textContent = ico;
    document.getElementById("res-status").textContent = GameEngine.getICOState(ico).label;
  }

  return { init, checkRoom, selectAvatar, joinGame, selectCard, confirm, doBossStep };
})();

document.addEventListener("DOMContentLoaded", () => {
  PlayerApp.init();
  document.getElementById("input-player-name").addEventListener("input", () => {
    const evt = new Event("change");
    document.dispatchEvent(evt);
  });
});
