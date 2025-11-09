/*
  Dice Roller main logic
  - parse NdS±M (N signed allowed)
  - preset 2d6, 2d6+3..+10
  - select 1d1..1d100
  - logs saved in localStorage (newest first)
  - do NOT show fumble/critical for exact 1dN where N in [1,100]
*/

const PRESETS = [
  "2d6",
  "2d6+3",
  "2d6+4",
  "2d6+5",
  "2d6+6",
  "2d6+7",
  "2d6+8",
  "2d6+9",
  "2d6+10"
];

const STORAGE_KEY = "dice_roll_logs_v1";
const MAX_LOGS = 500;

function $(id){ return document.getElementById(id); }

function makePresetButtons(){
  const container = $("preset-buttons");
  PRESETS.forEach(p=>{
    const btn = document.createElement("button");
    btn.textContent = p;
    btn.className = "small";
    btn.addEventListener("click", ()=> doRollAndLog(p));
    container.appendChild(btn);
  });
}

function populate1dN(){
  const sel = $("select-1dN");
  for(let i=1;i<=100;i++){
    const opt = document.createElement("option");
    opt.value = `1d${i}`;
    opt.textContent = `1d${i}`;
    sel.appendChild(opt);
  }
}

function parseNotation(input){
  // Accept formats: NdS+M  (N may have sign), dS, S must be integer >=1, M signed optional
  // returns {ok, error, parts: {N,S,M}}
  input = input.trim().toLowerCase();
  const m = input.match(/^([+-]?\d*)d(\d+)([+-]\d+)?$/);
  if(!m) return { ok:false, error:"書式エラー。例: 2d6+3, d20, -1d6+2" };
  let N = m[1];
  if(N==="" || N==="+") N = "1";
  if(N=="-") N = "-1";
  N = parseInt(N,10);
  const S = parseInt(m[2],10);
  const M = m[3] ? parseInt(m[3],10) : 0;
  if(isNaN(N) || isNaN(S) || isNaN(M)) return { ok:false, error:"数値解析エラー" };
  if(S < 1) return { ok:false, error:"面数 S は 1 以上である必要があります" };
  return { ok:true, parts:{N,S,M} };
}

function rollOnce(min, max){
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rollDice(N, S){
  // N signed integer. We'll roll abs(N) dice, each from 1..S.
  // For negative N, we'll treat their contribution as negative in total.
  const count = Math.abs(N);
  const rolls = [];
  for(let i=0;i<count;i++){
    rolls.push(rollOnce(1,S));
  }
  return rolls;
}

function computeTotal(rollsGrouped, M){
  // rollsGrouped: array of {N, S, rolls[]} for each group in a single notation (we only have one group in this app).
  // For our simple model there is only one group; M is modifier.
  let total = 0;
  const details = [];
  rollsGrouped.forEach(g=>{
    const sign = g.N < 0 ? -1 : 1;
    const sum = g.rolls.reduce((a,b)=>a+b,0) * sign;
    total += sum;
    details.push({ ...g, sum });
  });
  total += M;
  return { total, details };
}

function determineFumbleCritical(parts, rolls){
  // parts: {N,S,M}
  // rolls: array of individual roll numbers (unsigned numbers)
  // Suppress for exact 1dN where N in [1,100]
  const absN = Math.abs(parts.N);
  if(absN === 1 && parts.S >= 1 && parts.S <= 100){
    return null; // do not mark
  }
  // For fumble: all dice that were rolled (absN) equal 1
  // For critical: all dice equal S
  if(absN === 0) return null;
  const allOnes = rolls.length>0 && rolls.every(r => r === 1);
  const allMax = rolls.length>0 && rolls.every(r => r === parts.S);
  if(allOnes) return "fumble";
  if(allMax) return "critical";
  return null;
}

function formatTime(date){
  return new Date(date).toLocaleString();
}

// Logging
function loadLogs(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return [];
    return JSON.parse(raw);
  }catch(e){
    console.error(e);
    return [];
  }
}
function saveLogs(logs){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(0, MAX_LOGS)));
}

function addLog(entry){
  const logs = loadLogs();
  logs.unshift(entry);
  saveLogs(logs);
  renderLogs();
}

function deleteLog(id){
  let logs = loadLogs();
  logs = logs.filter(l => l.id !== id);
  saveLogs(logs);
  renderLogs();
}

function clearAllLogs(){
  if(!confirm("ログを全て削除しますか？")) return;
  localStorage.removeItem(STORAGE_KEY);
  renderLogs();
}

// UI rendering
function renderLogs(){
  const list = $("log-list");
  list.innerHTML = "";
  const logs = loadLogs();
  logs.forEach((l, idx) => {
    const li = document.createElement("li");
    li.className = "log-item";
    if(idx === 0) li.classList.add("latest");

    const main = document.createElement("div");
    main.className = "log-main";

    const left = document.createElement("div");
    left.innerHTML = `<div class="formula">${escapeHtml(l.formula)}</div>`;

    const rollsDiv = document.createElement("div");
    rollsDiv.className = "rolls";
    l.rolls.forEach(r=>{
      const pill = document.createElement("span");
      pill.className = "roll-pill";
      if(r.signed) pill.classList.add("neg");
      pill.textContent = (r.signed ? "-" : "") + r.value;
      rollsDiv.appendChild(pill);
    });

    left.appendChild(rollsDiv);
    main.appendChild(left);

    const meta = document.createElement("div");
    meta.className = "log-meta";
    const time = document.createElement("div");
    time.className = "small-text";
    time.textContent = formatTime(l.timestamp);
    const total = document.createElement("div");
    total.innerHTML = `<strong>${l.total}</strong>`;
    meta.appendChild(total);

    if(l.tag){
      const badge = document.createElement("div");
      badge.className = "badge " + (l.tag === "fumble" ? "fumble" : "crit");
      badge.textContent = l.tag === "fumble" ? "Fumble" : "Critical";
      meta.appendChild(badge);
    }
    meta.appendChild(time);

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.flexDirection = "column";
    right.style.alignItems = "flex-end";
    right.style.gap = "6px";

    const del = document.createElement("button");
    del.className = "delete-btn";
    del.textContent = "削除";
    del.addEventListener("click", ()=> deleteLog(l.id));

    right.appendChild(meta);
    right.appendChild(del);

    li.appendChild(main);
    li.appendChild(right);

    list.appendChild(li);
  });

  if(logs.length === 0){
    const empty = document.createElement("div");
    empty.className = "small-text";
    empty.style.padding = "12px";
    empty.textContent = "ログはまだありません。";
    list.appendChild(empty);
  }
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, function(m){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]);
  });
}

function doRollAndLog(notation){
  const parsed = parseNotation(notation);
  if(!parsed.ok){
    alert(parsed.error);
    return;
  }
  const parts = parsed.parts;
  const rolls = rollDice(parts.N, parts.S);
  // Map rolls to objects indicating if they came from negative N group (signed true)
  const signed = parts.N < 0;
  const rollsForDisplay = rolls.map(r => ({value:r, signed: signed}));
  const comp = computeTotal([{N:parts.N,S:parts.S,rolls}], parts.M);
  // Determine tag
  const tag = determineFumbleCritical(parts, rolls);
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2,8),
    formula: notation,
    rolls: rollsForDisplay,
    total: comp.total,
    timestamp: Date.now(),
    tag: tag
  };
  addLog(entry);
}

function rollCustomFromInput(){
  const val = $("custom-input").value.trim();
  if(!val) return alert("入力してください（例: 2d6+3）");
  doRollAndLog(val);
  $("custom-input").value = "";
}

function rollSelect1dN(){
  const sel = $("select-1dN");
  doRollAndLog(sel.value);
}

function setup(){
  makePresetButtons();
  populate1dN();
  renderLogs();

  $("roll-custom").addEventListener("click", rollCustomFromInput);
  $("roll-1dN").addEventListener("click", rollSelect1dN);
  $("clear-all").addEventListener("click", clearAllLogs);

  // Enter key in custom input
  $("custom-input").addEventListener("keydown", (e)=>{
    if(e.key === "Enter") rollCustomFromInput();
  });
}

document.addEventListener("DOMContentLoaded", setup);
```
