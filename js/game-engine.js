/* ============================================
   HR AI TOWER - GAME ENGINE
   Lógica principal. Generalmente NO necesitas
   tocar este archivo para agregar contenido,
   eso se hace en data/missions.json
   ============================================ */

const GameEngine = (function () {
  let GAME_DATA = null;
  let state = {
    playerName: "",
    avatar: null,
    ico: 0,
    resources: { productivity: 0, innovation: 0, trust: 0, integration: 0, experience: 0, governance: 0 },
    choices: {},        // { missionId: { type, value, risk, stability, timeTaken } }
    currentMissionIdx: 0,
    bossStepsDone: 0,
    missionStartTime: null
  };

  // ---------- Carga de datos ----------
  // missionIds (opcional): filtra y reordena GAME_DATA.missions según ese
  // array de ids, para partidas configuradas por el host con un subset
  // de misiones en un orden específico.
  async function loadData(path = "data/missions.json", missionIds) {
    const res = await fetch(path);
    if (!res.ok) throw new Error("No se pudo cargar missions.json");
    GAME_DATA = await res.json();

    if (Array.isArray(missionIds) && missionIds.length) {
      const byId = {};
      GAME_DATA.missions.forEach((m) => { byId[m.id] = m; });
      GAME_DATA.missions = missionIds.map((id) => byId[id]).filter(Boolean);
    }

    return GAME_DATA;
  }

  function getData() {
    return GAME_DATA;
  }

  // ---------- Scoring ----------
  // Puntuación = 0.40 × Valor + 0.25 × Tiempo + 0.35 × Riesgo
  function calcTimeScore(secondsTaken) {
    const cfg = GAME_DATA.gameConfig.timeScoring;
    const t = Math.min(secondsTaken, cfg.maxSeconds);
    const ratio = t / cfg.maxSeconds;
    // decae suave de maxPoints a minPoints, nunca penaliza duro la reflexión
    return Math.round(cfg.maxPoints - ratio * (cfg.maxPoints - cfg.minPoints));
  }

  function calcMissionScore(option, secondsTaken) {
    const w = GAME_DATA.gameConfig.scoringWeights;
    const valueScore = Math.min(100, option.value * 12.5); // normaliza value (0-8) a 0-100
    const timeScore = calcTimeScore(secondsTaken);
    const riskScore = option.risk; // ya viene en escala 0-100

    const total = w.value * valueScore + w.time * timeScore + w.risk * riskScore;
    return Math.round(total / 10); // escalado a contribución razonable sobre ICO (0-100)
  }

  // ---------- Flujo de misión ----------
  function startMissionTimer() {
    state.missionStartTime = Date.now();
  }

  function getElapsedSeconds() {
    return (Date.now() - state.missionStartTime) / 1000;
  }

  function confirmChoice(missionIdx, optionIdx) {
    const mission = GAME_DATA.missions[missionIdx];
    const option = mission.options[optionIdx];
    const seconds = getElapsedSeconds();

    const missionScore = calcMissionScore(option, seconds);

    state.choices[mission.id] = {
      type: option.type,
      label: option.label,
      stability: option.stability,
      score: missionScore,
      seconds: Math.round(seconds)
    };

    // aplica recursos
    Object.keys(option.resources || {}).forEach((k) => {
      state.resources[k] = (state.resources[k] || 0) + option.resources[k];
    });

    // ICO acumulado (promedio simple, tope 100)
    state.ico = Math.min(100, Math.round((state.ico * Object.keys(state.choices).length - missionScore + missionScore + state.ico) / (Object.keys(state.choices).length + 1)));
    // (fórmula simplificada de acumulación, ver nota abajo)
    state.ico = Math.min(100, computeRunningICO());

    return { missionScore, option, isNative: option.type === "native" };
  }

  function computeRunningICO() {
    const scores = Object.values(state.choices).map((c) => c.score);
    if (scores.length === 0) return 0;
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return Math.round(avg);
  }

  function getICOState(icoValue) {
    const states = GAME_DATA.gameConfig.icoStates;
    return states.find((s) => icoValue >= s.min && icoValue <= s.max) || states[0];
  }

  // ---------- Boss event ----------
  function doBossStep(stepIdx) {
    const step = GAME_DATA.bossEvent.steps[stepIdx];
    Object.keys(step.effect).forEach((k) => {
      state.resources[k] = (state.resources[k] || 0) + step.effect[k];
    });
    state.ico = Math.min(100, state.ico + step.icoBonus);
    state.bossStepsDone++;
    return step;
  }

  // ---------- Reset ----------
  function reset() {
    state = {
      playerName: state.playerName,
      avatar: state.avatar,
      ico: 0,
      resources: { productivity: 0, innovation: 0, trust: 0, integration: 0, experience: 0, governance: 0 },
      choices: {},
      currentMissionIdx: 0,
      bossStepsDone: 0,
      missionStartTime: null
    };
  }

  function getState() {
    return state;
  }

  function setPlayer(name, avatar) {
    state.playerName = name;
    state.avatar = avatar;
  }

  return {
    loadData,
    getData,
    getState,
    setPlayer,
    startMissionTimer,
    confirmChoice,
    getICOState,
    doBossStep,
    reset
  };
})();
