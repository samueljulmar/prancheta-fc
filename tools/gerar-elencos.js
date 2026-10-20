#!/usr/bin/env node
'use strict';
// Prancheta FC — gera o arquivo de elencos reais a partir do transfermarkt-datasets (licença CC0).
//
// Uso: node tools/gerar-elencos.js <pasta-com-os-csv> <pasta-de-saida>
// A pasta de entrada precisa de players.csv(.gz); player_valuations.csv(.gz) e appearances.csv(.gz) são opcionais
// e melhoram o potencial (tendência do valor) e a força (minutos jogados).
// Saída: jogadores.csv (formato do jogo, para importar em "Importar elencos reais") e relatorio.txt.
//
// O arquivo gerado tem nomes de pessoas reais: não publique no repositório; use só no seu aparelho.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');

const [inDir, outDir] = process.argv.slice(2);
if (!inDir || !outDir) {
  console.error('Uso: node tools/gerar-elencos.js <pasta-com-os-csv> <pasta-de-saida>');
  process.exit(1);
}

// Carrega o motor do jogo para usar a mesma lista de clubes, o mesmo casamento de nomes e a mesma fórmula.
global.window = global;
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const root = path.join(__dirname, '..');
for (const f of ['data.js', 'pack-brasil.js', 'pack-mundo.js', 'medical.js', 'news.js', 'engine.js', 'board.js', 'importer.js']) require(path.join(root, f));
const FB = global.FB;
const world = FB.createWorld({ pack: 'real' });
const SEASON = world.season;

const fileOf = name => ['.csv.gz', '.csv'].map(ext => path.join(inDir, name + ext)).find(f => fs.existsSync(f));

// Lê um CSV linha a linha (os arquivos de aparições têm mais de um milhão de linhas).
async function eachRow(file, fn) {
  let stream = fs.createReadStream(file);
  if (file.endsWith('.gz')) stream = stream.pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let head = null;
  for await (const line of rl) {
    if (!line) continue;
    const cells = splitLine(line);
    if (!head) { head = cells.map(h => h.trim().replace(/^﻿/, '')); continue; }
    const row = {};
    head.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    fn(row);
  }
}

function splitLine(line) {
  const out = [];
  let cell = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cell); cell = ''; }
    else cell += c;
  }
  out.push(cell);
  return out;
}

const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
const DAY = 86400000;

(async () => {
  const playersFile = fileOf('players');
  if (!playersFile) { console.error(`players.csv não encontrado em ${inDir}`); process.exit(1); }

  // 1. Jogadores com clube atual reconhecido no jogo.
  const rows = [];
  let maxSeason = 0;
  await eachRow(playersFile, r => { rows.push(r); maxSeason = Math.max(maxSeason, +r.last_season || 0); });
  // Só casa clubes do mesmo país: a liga da base (BRA1, ARG1, GB1...) diz o país do clube.
  const countryOf = FB.countryOfComp;

  // Grafias da base diferentes das do jogo.
  const FIX = { 'Mirasol Futebol Clube': 'Mirassol Futebol Clube' };

  const clubCache = new Map();
  const unmatched = new Map();
  const cands = []; // jogadores com clube do jogo, antes de escolher a origem certa de cada clube
  for (const r of rows) {
    if (!r.current_club_name || (maxSeason && +r.last_season < maxSeason - 1)) continue;
    const comp = r.current_club_domestic_competition_id;
    const key = r.current_club_name + '|' + comp;
    if (!clubCache.has(key)) {
      const country = countryOf(comp);
      clubCache.set(key, country ? FB.findClub(world, FIX[r.current_club_name] || r.current_club_name, country) : null);
    }
    const club = clubCache.get(key);
    if (!club) { unmatched.set(r.current_club_name, (unmatched.get(r.current_club_name) || 0) + 1); continue; }
    const pos = FB.parsePos(r.sub_position) || FB.parsePos(r.position);
    const eur = num(r.market_value_in_eur);
    const birth = r.date_of_birth ? new Date(r.date_of_birth) : null;
    if (!pos || !eur || !r.name || !birth || isNaN(birth)) continue;
    cands.push({ id: r.player_id, src: `${r.current_club_name} [${comp || '?'}]`, p: { name: r.name, club, pos, age: SEASON - birth.getFullYear(), eur, peak: num(r.highest_market_value_in_eur), prev: null, minutes: null } });
  }

  // Se dois clubes da base caem no mesmo clube do jogo (Estudiantes de La Plata e Estudiantes de Río Cuarto),
  // fica o de maior valor de elenco; o outro vai para a lista de sem correspondência.
  const sources = new Map(); // clube do jogo -> Map(origem -> { n, eur })
  for (const c of cands) {
    if (!sources.has(c.p.club)) sources.set(c.p.club, new Map());
    const m = sources.get(c.p.club);
    const o = m.get(c.src) || { n: 0, eur: 0 };
    o.n++; o.eur += c.p.eur;
    m.set(c.src, o);
  }
  const chosen = new Map();
  for (const [club, m] of sources) chosen.set(club, [...m].sort((a, b) => b[1].eur - a[1].eur)[0][0]);
  const picked = new Map(); // player_id -> dados
  for (const c of cands) {
    if (chosen.get(c.p.club) === c.src) picked.set(c.id, c.p);
    else unmatched.set(c.src, (unmatched.get(c.src) || 0) + 1);
  }

  // 2. Valor de um ano antes da última avaliação (tendência de valorização).
  const valFile = fileOf('player_valuations');
  if (valFile) {
    const hist = new Map();
    await eachRow(valFile, r => {
      if (!picked.has(r.player_id)) return;
      const t = Date.parse(r.date);
      const v = num(r.market_value_in_eur);
      if (isNaN(t) || !v) return;
      if (!hist.has(r.player_id)) hist.set(r.player_id, []);
      hist.get(r.player_id).push([t, v]);
    });
    for (const [id, list] of hist) {
      list.sort((a, b) => a[0] - b[0]);
      const target = list[list.length - 1][0] - 365 * DAY;
      const before = list.filter(x => x[0] <= target);
      if (before.length) picked.get(id).prev = before[before.length - 1][1];
    }
  }

  // 3. Minutos nos últimos 12 meses da base.
  const appFile = fileOf('appearances');
  if (appFile) {
    const mins = new Map();
    let last = 0;
    const list = [];
    await eachRow(appFile, r => {
      if (!picked.has(r.player_id)) return;
      const t = Date.parse(r.date);
      if (isNaN(t)) return;
      last = Math.max(last, t);
      list.push([r.player_id, t, num(r.minutes_played) || 0]);
    });
    for (const [id, t, m] of list) if (t >= last - 365 * DAY) mins.set(id, (mins.get(id) || 0) + m);
    for (const [id, p] of picked) p.minutes = mins.get(id) || 0;
  }

  // 4. Notas e arquivo final.
  const out = [];
  const byClub = new Map();
  for (const p of picked.values()) {
    const value = p.eur * FB.EUR_BRL;
    const { ovr, pot } = FB.rateFromCareer({
      value, age: p.age, name: p.name,
      peak: p.peak ? p.peak * FB.EUR_BRL : null, prev: p.prev ? p.prev * FB.EUR_BRL : null, minutes: p.minutes,
    });
    const sal = FB.calcSalary({ ovr, pot, age: p.age });
    out.push({ nome: p.name, clube: p.club.short, posicao: p.pos, idade: p.age, forca: ovr, potencial: pot, valor: Math.round(value), salario: sal });
    byClub.set(p.club, (byClub.get(p.club) || 0) + 1);
  }
  out.sort((a, b) => a.clube.localeCompare(b.clube) || b.forca - a.forca);

  fs.mkdirSync(outDir, { recursive: true });
  const csvCell = v => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const head = ['nome', 'clube', 'posicao', 'idade', 'forca', 'potencial', 'valor', 'salario'];
  fs.writeFileSync(path.join(outDir, 'jogadores.csv'), '﻿' + [head.join(';'), ...out.map(r => head.map(h => csvCell(r[h])).join(';'))].join('\n') + '\n');

  const lines = [];
  lines.push(`Prancheta FC — elencos reais (temporada ${SEASON})`);
  lines.push(`Base: transfermarkt-datasets (CC0). Última temporada na base: ${maxSeason || '?'}.`);
  lines.push(`Histórico de valores: ${valFile ? 'sim' : 'não'} · Minutos jogados: ${appFile ? 'sim' : 'não'}`);
  lines.push(`Jogadores no arquivo: ${out.length}`);
  lines.push('');
  const groups = [0, 1, 2, 3].map(d => [FB.DIV_NAMES[d], world.teams.filter(t => t.div === d)])
    .concat(Object.values(FB.LEAGUES).map(L => [L.name, world.teams.filter(t => t.lg === L.key)]));
  for (const [label, teams] of groups) {
    if (!teams.length) continue;
    const ok = teams.filter(t => (byClub.get(t) || 0) >= 11);
    lines.push(`${label}: ${ok.length} de ${teams.length} clubes com elenco real (11+ jogadores)`);
    for (const t of teams) {
      const src = chosen.get(t) ? `${chosen.get(t)}` : '';
      lines.push(`  ${(byClub.get(t) || 0) >= 11 ? '✔' : '✘'} ${t.name}: ${byClub.get(t) || 0}${src ? '  ← ' + src : ''}`);
    }
  }
  if (unmatched.size) {
    lines.push('', 'Clubes da base sem correspondência no jogo (os 20 com mais jogadores):');
    for (const [n, c] of [...unmatched].sort((a, b) => b[1] - a[1]).slice(0, 20)) lines.push(`  ${n}: ${c}`);
  }
  fs.writeFileSync(path.join(outDir, 'relatorio.txt'), lines.join('\n') + '\n');
  console.log(lines.slice(0, 5).join('\n'));
})().catch(e => { console.error(e); process.exit(1); });
