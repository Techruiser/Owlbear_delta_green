import OBR from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";

const ID = "com.lurui.dgd20";
const SHEET_KEY = ID + "/sheet";
const ROLL_CH = ID + "/roll";
const GM_CH = ID + "/gm";

const inOBR = OBR.isAvailable;

const SKILLS = [
  ["accounting","Contabilidade","INT"],["alertness","Alerta","POW"],
  ["anthropology","Antropologia","INT"],["archaeology","Arqueologia","INT"],
  ["art","Arte","POW"],["athletics","Atletismo","STR"],
  ["bureaucracy","Burocracia","INT"],["computer","Computação","INT"],
  ["criminology","Criminologia","INT"],["demolitions","Demolições","INT"],
  ["disguise","Disfarce","CHA"],["dodge","Esquivar","DEX"],
  ["drive","Dirigir","DEX"],["elecRepair","Reparo Elétrico","INT"],
  ["firearms","Armas de Fogo","DEX"],["firstAid","Primeiros Socorros","INT"],
  ["language","Língua Estrangeira","INT"],["forensics","Forense","INT"],
  ["heavyMach","Maquinaria Pesada","STR"],["heavyWpn","Armas Pesadas","STR"],
  ["history","História","INT"],["intimidation","Intimidação","POW"],
  ["law","Direito","INT"],["leadership","Liderança","CHA"],
  ["medicine","Medicina","INT"],["melee","Armas Brancas","STR"],
  ["milScience","Ciência Militar","INT"],["navigate","Navegação","INT"],
  ["occult","Ocultismo","INT"],["persuasion","Persuasão","CHA"],
  ["pharmacy","Farmácia","INT"],["photography","Fotografia","INT"],
  ["pilot","Pilotar","DEX"],["psychotherapy","Psicoterapia","POW"],
  ["research","Pesquisa","INT"],["science","Ciência","INT"],
  ["search","Procurar","INT"],["sigint","SIGINT","INT"],
  ["sleight","Prestidigitação","DEX"],["sneak","Furtividade","DEX"],
  ["survival","Sobrevivência","INT"],["swim","Natação","STR"],
  ["unarmed","Luta Desarmada","STR"],["unnatural","O Unnatural","INT"],
];
const ATTRS = [["STR","Força"],["CON","Constituição"],["DEX","Destreza"],["INT","Inteligência"],["POW","Poder"],["CHA","Carisma"]];

const mod = a => Math.floor((a - 10) / 2);
const fmtMod = m => (m >= 0 ? "+" + m : "" + m);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const skillInfo = k => SKILLS.find(s => s[0] === k) || [k, k, "STR"];

function defaultSheet() {
  return {
    name: "", codename: "", profession: "", employer: "Delta Green",
    nationality: "", age: "",
    attrs: { STR: 10, CON: 10, DEX: 10, INT: 10, POW: 10, CHA: 10 },
    hp: 10, hpMax: 10, wp: 3, wpMax: 3, san: 50, sanMax: 50,
    luck: 3, prof: 3, armor: "",
    skills: {}, bonds: [], weapons: [], notes: "",
  };
}

let S = defaultSheet();
let role = "PLAYER";
let playerName = "Agente";
let tab = "ficha";
let log = [];
let lastRoll = null;
let party = [];
let stT;

const main = document.getElementById("main");
const setStatus = m => {
  const el = document.getElementById("status");
  el.textContent = m;
  clearTimeout(stT);
  stT = setTimeout(() => { el.textContent = inOBR ? "conectado ao Owlbear ✓" : "prévia (fora do Owlbear)"; }, 1500);
};
const notify = m => { if (inOBR) OBR.notification.show(m); };

/* ---------- persistência ---------- */
async function load() {
  if (inOBR) {
    const md = await OBR.player.getMetadata();
    if (md[SHEET_KEY]) S = { ...defaultSheet(), ...md[SHEET_KEY] };
  } else {
    const raw = localStorage.getItem("dg20-sheet");
    if (raw) S = { ...defaultSheet(), ...JSON.parse(raw) };
  }
}
async function save() {
  try {
    if (inOBR) await OBR.player.setMetadata({ [SHEET_KEY]: S });
    else localStorage.setItem("dg20-sheet", JSON.stringify(S));
    setStatus("salvo ✓");
  } catch (e) { setStatus("erro ao salvar"); }
}

/* ---------- dados ---------- */
function dice(str) {
  const m = String(str).trim().toLowerCase().match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!m) return null;
  const n = Math.min(20, parseInt(m[1] || "1", 10));
  const sides = parseInt(m[2], 10);
  const add = parseInt(m[3] || "0", 10);
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(1 + Math.floor(Math.random() * sides));
  return { parts, total: parts.reduce((a, b) => a + b, 0) + add, str: `${n}d${sides}${m[3] || ""}` };
}
function skillTotal(key) {
  const [, , attr] = skillInfo(key);
  const sk = S.skills[key] || {};
  return mod(S.attrs[attr]) + (sk.trained ? S.prof : 0) + (sk.mod || 0);
}
function softMaxes() {
  S.hpMax = Math.max(1, 10 + mod(S.attrs.CON));
  S.wpMax = Math.max(0, 3 + mod(S.attrs.POW));
  S.sanMax = Math.min(99, Math.max(1, S.attrs.POW * 5));
}
function d20(bonus, label, kind = "check", luckReroll = false) {
  const nat = 1 + Math.floor(Math.random() * 20);
  const total = nat + bonus;
  const dc = +document.getElementById("dc").value;
  const crit = nat === 20, fumble = nat === 1;
  const ok = crit || (!fumble && total >= dc);
  const rec = { t: Date.now(), who: playerName, label, kind, bonus, nat, total, dc, ok, crit, fumble, luck: luckReroll };
  lastRoll = { bonus, label, kind };
  pushLog(rec);
  if (inOBR) OBR.broadcast.sendMessage(ROLL_CH, rec); // destino padrão: os outros
  return rec;
}
function pushLog(rec) {
  log.unshift(rec);
  if (log.length > 120) log.pop();
  if (tab === "log") render();
}
function sysLog(msg) { pushLog({ t: Date.now(), who: "SISTEMA", label: msg, kind: "sys" }); }

/* ---------- render ---------- */
function hTrack(label, cur, max, key, btnLabel, rollKind) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  return `<div class="track">
    <div class="track-head"><span>${label}</span>
      <span class="track-num"><input type="number" data-set="${key}" value="${cur}" min="0" max="${max}" />/ ${max}</span></div>
    <div class="bar"><div class="bar-fill ${key}" data-bar="${key}" style="width:${pct}%"></div></div>
    ${rollKind ? `<button class="btn tiny block" data-roll-${rollKind}>${btnLabel}</button>` : ""}
  </div>`;
}
function hFicha() {
  const ident = [["name","NOME VERDADEIRO"],["codename","CODINOME"],["profession","PROFISSÃO"],["employer","EMPREGADOR"],["nationality","NACIONALIDADE"],["age","IDADE"]]
    .map(([k,l]) => `<label class="fld"><span>${l}</span><input data-set="${k}" value="${esc(S[k])}" /></label>`).join("");
  const attrs = ATTRS.map(([k,l]) => `
    <div class="attr" data-attr="${k}" title="${l}">
      <div class="attr-top"><span class="attr-name">${k}</span><span class="attr-mod">${fmtMod(mod(S.attrs[k]))}</span></div>
      <input type="number" min="3" max="18" data-set="attrs.${k}" value="${S.attrs[k]}" />
      <button class="mini" data-roll-attr="${k}">🎲 <span class="attr-bmod">${fmtMod(mod(S.attrs[k]))}</span></button>
    </div>`).join("");
  const bonds = S.bonds.map((b,i) => `
    <div class="row bond">
      <input data-bond="${i}.name" value="${esc(b.name)}" placeholder="Vínculo ${i+1}" />
      <input type="number" class="sm" data-bond="${i}.score" value="${b.score ?? 10}" min="0" max="99" title="Força do vínculo" />
      <button class="mini danger" data-del-bond="${i}">✕</button>
    </div>`).join("");
  return `
    <h3>IDENTIDADE</h3><div class="ident">${ident}</div>
    <h3>ATRIBUTOS</h3>
    <div class="attrs">${attrs}</div>
    <h3>STATUS</h3>
    <div class="tracks">
      ${hTrack("HP", S.hp, S.hpMax, "hp", null)}
      ${hTrack("WP", S.wp, S.wpMax, "wp", "TESTE DE WP", "wp")}
      ${hTrack("SAN", S.san, S.sanMax, "san", "TESTE DE SAN", "san")}
    </div>
    <div class="row luckrow">
      <label class="fld inline"><span>SORTE</span><input type="number" class="sm" data-set="luck" value="${S.luck}" min="0" /></label>
      <button class="btn ghost" data-act="recalc">⟲ RECALCULAR</button>
    </div>
    <p class="hint">HP máx = 10+mod.CON · WP máx = 3+mod.POW · SAN máx = POW×5 · Sorte máx = 3+mod.POW</p>
    <h3>VÍNCULOS</h3>${bonds || `<p class="empty">Sem vínculos registrados.</p>`}
    <button class="btn ghost" data-act="addBond">＋ Vínculo</button>
    <h3>NOTAS DO AGENTE</h3>
    <textarea data-set="notes">${esc(S.notes)}</textarea>
    <div class="row" style="margin-top:10px">
      <button class="btn ghost" data-act="export">⬇ Exportar</button>
      <button class="btn ghost" data-act="import">⬆ Importar</button>
      <button class="mini danger" data-act="reset">✕ Resetar</button>
    </div>`;
}
function hSkills() {
  const rows = SKILLS.map(([k, label, attr]) => {
    const sk = S.skills[k] || {};
    return `<div class="skill" title="Atributo: ${attr}">
      <label class="sk-t"><input type="checkbox" data-trained="${k}" ${sk.trained ? "checked" : ""} /><span class="sk-name">${label}</span></label>
      <span class="sk-attr">${attr} ${fmtMod(mod(S.attrs[attr]))}</span>
      <input type="number" class="sm" data-skillmod="${k}" value="${sk.mod || 0}" title="Modificador extra" />
      <span class="sk-total" data-k="${k}">${fmtMod(skillTotal(k))}</span>
      <button class="mini" data-roll-skill="${k}">🎲</button>
    </div>`;
  }).join("");
  return `<div class="skillhead">
      <label class="fld inline"><span>BÔNUS DE PROFICIÊNCIA</span><input type="number" class="sm" data-set="prof" value="${S.prof}" /></label>
    </div>
    <div class="skills">${rows}</div>
    <p class="hint">total = mod. atributo ${fmtMod(S.prof)} (se treinada) + extra · o 🎲 usa a DC selecionada no rodapé</p>`;
}
function hCombat() {
  const wpns = S.weapons.map((w,i) => `
    <div class="wpn">
      <div class="row">
        <input data-wpn="${i}.name" value="${esc(w.name)}" placeholder="Arma" />
        <button class="mini danger" data-del-wpn="${i}">✕</button>
      </div>
      <div class="row">
        <select data-wpn="${i}.skill">${SKILLS.map(([k,l]) => `<option value="${k}" ${w.skill === k ? "selected" : ""}>${l}</option>`).join("")}</select>
        <input class="sm" data-wpn="${i}.dmg" value="${esc(w.dmg)}" placeholder="1d6+2" title="Dano" />
        <button class="mini" data-wpn-atk="${i}" title="Atacar">🎯</button>
        <button class="mini" data-wpn-dmg="${i}" title="Rolar dano">💥</button>
      </div>
    </div>`).join("");
  return `${hTrack("HP", S.hp, S.hpMax, "hp", null)}
    <label class="fld"><span>COLETE / ARMADURA</span><input data-set="armor" value="${esc(S.armor)}" placeholder="ex: colete balístico leve" /></label>
    <h3>ARSENAL</h3>
    ${wpns || `<p class="empty">Sem armas. Adiciona aí.</p>`}
    <button class="btn ghost" data-act="addWpn">＋ Adicionar arma</button>`;
}
function hLogLine(r) {
  const time = new Date(r.t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (r.kind === "sys") return `<div class="logline sys"><span class="ltime">${time}</span><span class="lwho">SISTEMA</span><div class="lbody">${esc(r.label)}</div></div>`;
  let body;
  if (r.kind === "dano") {
    body = `<span class="dice">${esc(r.str)}</span> → <b>${r.total}</b> <span class="parts">(${r.parts.join(", ")})</span>`;
  } else {
    const m = r.crit ? ["crit"," CRÍTICO!"] : r.fumble ? ["fumble"," FALHA CRÍTICA"] : r.ok ? ["ok"," ✓ SUCESSO"] : ["fail"," ✗ FALHA"];
    body = `<span class="dice">d20${fmtMod(r.bonus)}</span> → <b>${r.nat}</b>${r.bonus ? ` (${fmtMod(r.bonus)})` : ""} = <b>${r.total}</b> vs DC ${r.dc} <span class="mark ${m[0]}">${m[1]}</span>${r.luck ? ' <span class="luck">🍀 SORTE</span>' : ""}`;
  }
  return `<div class="logline"><span class="ltime">${time}</span><span class="lwho">${esc(r.who)}</span><div class="lbody"><span class="llabel">${esc(r.label)}:</span> ${body}</div></div>`;
}
function hLog() {
  return `<div class="row">
      <input id="pureLabel" placeholder="Rolar d20 livre… ex: Percepção" />
      <button class="btn" data-act="rollPure">🎲 d20</button>
    </div>
    <div class="row">
      <button class="btn ghost" data-act="luck" ${!lastRoll || S.luck <= 0 ? "disabled" : ""}>🍀 Gastar Sorte (${S.luck})</button>
      <button class="btn ghost tiny" data-act="clearLog">limpar registro</button>
    </div>
    <div id="loglist">${log.map(hLogLine).join("") || `<p class="empty">Nenhuma rolagem ainda.</p>`}</div>`;
}
function miniBar(label, cur, max, color) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  return `<span class="miniBar">${label} <span class="pbar"><i style="width:${pct}%;background:${color}"></i></span> ${cur}/${max}</span>`;
}
function hGM() {
  const cards = party.map(p => {
    const s = { ...defaultSheet(), ...(p.metadata?.[SHEET_KEY] || {}) };
    return `<div class="pcard" style="border-left-color:${p.color || "#8fae6a"}">
      <div class="pname">${esc(s.name || p.name)} <span class="pprof">${esc(s.codename || s.profession || "")}</span></div>
      <div class="pstats">
        ${miniBar("HP", s.hp, s.hpMax, "#9cc46f")}
        ${miniBar("WP", s.wp, s.wpMax, "#6fa8cc")}
        ${miniBar("SAN", s.san, s.sanMax, "#d9a441")}
        <span class="pluck">🍀 ${s.luck}</span>
      </div>
    </div>`;
  }).join("");
  return `<div class="gmbtns">
      <button class="btn" data-act="gmReq" data-gmreq="SAN">☠ Pedir Teste de SAN</button>
      <button class="btn" data-act="gmReq" data-gmreq="WP">⚡ Pedir Teste de WP</button>
      <button class="btn" data-act="gmReq" data-gmreq="MSG">📻 Transmitir mensagem</button>
      <button class="btn ghost" data-act="gmRefresh">↻ Atualizar lista</button>
    </div>
    <h3>AGENTES NA OPERAÇÃO</h3>
    ${cards || `<p class="empty">Nenhum agente com ficha ainda. Os jogadores precisam abrir a extensão pelo menos uma vez.</p>`}`;
}
function hRules() {
  return `<div class="rules">
    <div class="warn">PROTOCOLO D20 — regras da casa. Delta Green adaptado para d20. O Mestre tem palavra final em tudo.</div>
    <p><b>Modificador de atributo</b> = (atributo − 10) ÷ 2, arredondado pra baixo. Ex: 14 → +2 · 7 → −1.</p>
    <p><b>Teste de perícia:</b> d20 + mod. do atributo ligado + bônus de proficiência (se treinada) + mod. extra. Sucesso se o total for ≥ DC.</p>
    <ul>
      <li>DC 10 — rotineiro</li>
      <li>DC 12 — desafiador</li>
      <li>DC 15 — difícil</li>
      <li>DC 18+ — quase impossível</li>
    </ul>
    <p><b>Crítico:</b> 20 natural sempre acerta. <b>Falha crítica:</b> 1 natural sempre falha.</p>
    <p><b>HP</b> = 10 + mod.CON (mín. 1). Zerou HP: inconsciente, risco de morte (Mestre decide).</p>
    <p><b>WP</b> = 3 + mod.POW. Gasta com esforço extremo, hipergeometria e rituais.</p>
    <p><b>SAN</b> começa em POW×5 (máx 99). Teste de SAN: d20 + mod.POW vs DC do horror. Falhou: perde SAN (Mestre decide 1d4/1d6/1d10). SAN 0 = perda permanente.</p>
    <p><b>SORTE</b> = 3 + mod.POW por sessão. Gaste 1 ponto pra repetir qualquer rolagem sua.</p>
    <p><b>Ataque:</b> d20 + total da perícia da arma vs DC do alvo (10 parado, 12+ em movimento). <b>Dano:</b> rolagem da arma.</p>
    <p><b>Vínculos:</b> em tese absorvem perda de SAN (Mestre decide quando).</p>
  </div>`;
}
function render() {
  main.innerHTML =
    tab === "ficha" ? hFicha() :
    tab === "skills" ? hSkills() :
    tab === "combat" ? hCombat() :
    tab === "log" ? hLog() :
    tab === "gm" ? hGM() : hRules();
  updateDerived();
  document.getElementById("who").textContent = "AGENTE: " + (S.name || (inOBR ? playerName : "—"));
}
function updateDerived() {
  document.querySelectorAll("#main .attr").forEach(el => {
    const inp = el.querySelector("input"); if (!inp) return;
    const m = fmtMod(mod(parseInt(inp.value || "10", 10)));
    el.querySelector(".attr-mod").textContent = m;
    el.querySelector(".attr-bmod").textContent = m;
  });
  document.querySelectorAll("#main .bar-fill").forEach(el => {
    const key = el.dataset.bar; if (!key) return;
    const max = S[key + "Max"] || 1;
    const cur = Math.min(S[key], max);
    el.style.width = Math.max(0, Math.min(100, (cur / max) * 100)) + "%";
  });
  document.querySelectorAll("#main .sk-total").forEach(el => {
    el.textContent = fmtMod(skillTotal(el.dataset.k));
  });
}

/* ---------- ações ---------- */
function spendLuck() {
  if (!lastRoll || S.luck <= 0) return;
  S.luck--;
  d20(lastRoll.bonus, lastRoll.label, lastRoll.kind, true);
  save(); render();
}
function weaponAttack(i) {
  const w = S.weapons[i]; if (!w) return;
  const bonus = w.skill ? skillTotal(w.skill) : 0;
  d20(bonus, "Ataque: " + (w.name || "arma"), "ataque");
}
function weaponDamage(i) {
  const w = S.weapons[i]; if (!w) return;
  const r = dice(w.dmg);
  if (!r) { notify("Dano inválido. Usa formato tipo 2d6+1"); return; }
  const rec = { t: Date.now(), who: playerName, label: "Dano: " + (w.name || "arma"), kind: "dano", str: r.str, parts: r.parts, total: r.total };
  pushLog(rec);
  if (inOBR) OBR.broadcast.sendMessage(ROLL_CH, rec);
}
function exportSheet() {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "ficha-" + (S.codename || S.name || "agente") + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
}
async function refreshParty() {
  if (!inOBR) return;
  try {
    const players = await OBR.party.getPlayers();
    party = players.filter(p => p.metadata && p.metadata[SHEET_KEY]);
    if (tab === "gm") render();
  } catch (e) {}
}
function gmRequest(kind) {
  const payload = { kind, t: Date.now() };
  if (kind === "MSG") {
    const text = prompt("Mensagem para os agentes:");
    if (!text) return;
    payload.text = text;
    sysLog("📻 Mestre transmitiu: " + text);
  } else {
    sysLog(kind === "SAN" ? "☠ Você pediu um TESTE DE SAN." : "⚡ Você pediu um TESTE DE WP.");
  }
  if (inOBR) OBR.broadcast.sendMessage(GM_CH, payload);
}

/* ---------- eventos ---------- */
document.getElementById("tabs").addEventListener("click", e => {
  const b = e.target.closest("button[data-tab]"); if (!b) return;
  tab = b.dataset.tab;
  document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("on", x === b));
  render();
});
main.addEventListener("click", e => {
  const b = e.target.closest("[data-act],[data-roll-skill],[data-roll-attr],[data-wpn-atk],[data-wpn-dmg],[data-del-bond],[data-del-wpn],[data-roll-wp],[data-roll-san]");
  if (!b) return;
  if (b.dataset.rollSkill) { const k = b.dataset.rollSkill; d20(skillTotal(k), skillInfo(k)[1], "perícia"); }
  else if (b.dataset.rollAttr) { const a = b.dataset.rollAttr; d20(mod(S.attrs[a]), "Atributo " + a, "atributo"); }
  else if (b.hasAttribute("data-roll-san")) d20(mod(S.attrs.POW), "Teste de SAN", "san");
  else if (b.hasAttribute("data-roll-wp")) d20(mod(S.attrs.POW), "Teste de WP", "wp");
  else if (b.dataset.wpnAtk !== undefined) weaponAttack(+b.dataset.wpnAtk);
  else if (b.dataset.wpnDmg !== undefined) weaponDamage(+b.dataset.wpnDmg);
  else if (b.dataset.delBond !== undefined) { S.bonds.splice(+b.dataset.delBond, 1); save(); render(); }
  else if (b.dataset.delWpn !== undefined) { S.weapons.splice(+b.dataset.delWpn, 1); save(); render(); }
  else switch (b.dataset.act) {
    case "addBond": S.bonds.push({ name: "", score: 10 }); save(); render(); break;
    case "addWpn": S.weapons.push({ name: "", skill: "firearms", dmg: "1d6" }); save(); render(); break;
    case "recalc":
      softMaxes(); S.luck = Math.max(0, 3 + mod(S.attrs.POW));
      S.hp = S.hpMax; S.wp = S.wpMax; S.san = S.sanMax;
      save(); render(); break;
    case "export": exportSheet(); break;
    case "import": document.getElementById("importFile").click(); break;
    case "reset": if (confirm("Apagar a ficha atual e começar do zero?")) { S = defaultSheet(); save(); render(); } break;
    case "luck": spendLuck(); break;
    case "clearLog": log = []; render(); break;
    case "gmRefresh": refreshParty(); break;
    case "gmReq": gmRequest(b.dataset.gmreq); break;
    case "rollPure": {
      const inp = main.querySelector("#pureLabel");
      d20(0, (inp && inp.value.trim()) || "Rolagem livre", "livre");
      break;
    }
  }
});
main.addEventListener("input", e => {
  const t = e.target;
  if (t.dataset.set) {
    const path = t.dataset.set.split(".");
    let o = S;
    for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
    o[path[path.length - 1]] = t.type === "number" ? parseInt(t.value || "0", 10) : t.value;
    if (path[0] === "attrs") { softMaxes(); save(); updateDerived(); }
    else save();
  } else if (t.dataset.skillmod !== undefined) {
    const k = t.dataset.skillmod;
    S.skills[k] = S.skills[k] || {};
    S.skills[k].mod = parseInt(t.value || "0", 10);
    save(); updateDerived();
  } else if (t.dataset.bond) {
    const [i, f] = t.dataset.bond.split(".");
    S.bonds[+i][f] = f === "score" ? parseInt(t.value || "0", 10) : t.value;
    save();
  } else if (t.dataset.wpn) {
    const [i, f] = t.dataset.wpn.split(".");
    S.weapons[+i][f] = t.value;
    save();
  }
});
main.addEventListener("change", e => {
  const t = e.target;
  if (t.dataset.trained !== undefined) {
    const k = t.dataset.trained;
    S.skills[k] = S.skills[k] || {};
    S.skills[k].trained = t.checked;
    save(); render();
  }
});
document.getElementById("importFile").addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try { S = { ...defaultSheet(), ...JSON.parse(rd.result) }; save(); render(); notify("Ficha importada ✓"); }
    catch { notify("Arquivo inválido"); }
  };
  rd.readAsText(f);
  e.target.value = "";
});

/* ---------- init ---------- */
if (inOBR) {
  OBR.onReady(async () => {
    try { role = await OBR.player.getRole(); } catch (e) {}
    try { playerName = await OBR.player.getName(); } catch (e) {}
    await load();
    if (role === "GM") document.getElementById("gmTab").hidden = false;
    document.getElementById("roleBadge").textContent = role === "GM" ? "MESTRE" : "AGENTE";
    refreshParty();
    try { OBR.party.onChange(refreshParty); } catch (e) {}
    OBR.broadcast.onMessage(ROLL_CH, e => pushLog(e.data));
    OBR.broadcast.onMessage(GM_CH, e => {
      const d = e.data;
      if (d.kind === "SAN") { sysLog("☠ O Mestre pede um TESTE DE SAN."); notify("☠ O Mestre pede um Teste de SAN"); }
      else if (d.kind === "WP") { sysLog("⚡ O Mestre pede um TESTE DE WP."); notify("⚡ O Mestre pede um Teste de WP"); }
      else if (d.kind === "MSG") { sysLog("📻 Mestre: " + d.text); notify(d.text); }
    });
    render();
    setStatus("pronto");
  });
} else {
  role = "GM";
  document.getElementById("gmTab").hidden = false;
  document.getElementById("roleBadge").textContent = "PRÉVIA";
  await load();
  render();
  setStatus("prévia (fora do Owlbear)");
}
