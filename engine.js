'use strict';
// Prancheta FC — motor: mundo, competições, calendário, partidas, finanças, mercado e temporada.
(function (FB) {
  const { ri, rf, pick, clamp, gauss, shuffle, weighted } = FB;

  FB.SAVE_KEY = 'prancheta.save.v2';
  FB.REF_TICKET = [60, 35, 25, 15, 12, 30];
  FB.TV_MONTH = [4.5e6, 1.2e6, 4e5, 2.6e5, 1e5, 1.5e6];
  FB.SPONSOR_K = [50000, 35000, 20000, 14000, 8000, 40000]; // por mil torcedores, por mês
  FB.LEAGUE_PRIZE = [45e6, 6e6, 2e6, 6e5];
  FB.SEAT_COST = 1500;
  FB.MAX_SQUAD = 34;
  FB.MIN_SQUAD = 18;
  FB.MAX_SUBS = 5;
  FB.EUR_BRL = 6;
  FB.LEAGUE_KEYS = ['A', 'B', 'C', 'D'];
  FB.leagueKey = div => FB.LEAGUE_KEYS[div];

  // ---------- Ligas do mundo ----------
  // Clubes estrangeiros têm div 5 e lg = país da liga ('ARG', 'ENG'...). A competição da liga é 'L-' + país.
  FB.LEAGUES = {};
  for (const L of (FB.PACK_MUNDO || { leagues: [] }).leagues) FB.LEAGUES[L.key] = L;
  FB.UEFA = ['ENG', 'ESP', 'ITA', 'GER', 'FRA', 'POR', 'NED'];
  FB.confOf = t => (t.country === 'BRA' ? 'CONMEBOL' : FB.LEAGUES[t.country] ? FB.LEAGUES[t.country].conf : 'CONMEBOL');
  FB.compKeyOf = t => (t.div <= 3 ? FB.LEAGUE_KEYS[t.div] : t.div === 5 && t.lg ? 'L-' + t.lg : null);
  FB.divName = t => (t.div === 5 && t.lg && FB.LEAGUES[t.lg] ? FB.LEAGUES[t.lg].name : FB.DIV_NAMES[t.div]);
  // Economia do clube: TV e patrocínio mensais, ingresso de referência, premiação da liga e reserva de caixa.
  FB.econ = t => (t.div === 5 && t.lg && FB.LEAGUES[t.lg] ? FB.LEAGUES[t.lg].econ : {
    tv: FB.TV_MONTH[t.div], sponsor: FB.SPONSOR_K[t.div], ticket: FB.REF_TICKET[t.div],
    prize: FB.LEAGUE_PRIZE[t.div] || 0, reserve: [3e7, 6e6, 1.5e6, 5e5, 2e5, 8e6][t.div],
  });

  // ---------- Jogadores ----------

  FB.calcValue = p => {
    let v = 1e6 * Math.pow(1.166, p.ovr - 55);
    if (p.age <= 21) v *= 1.5 + Math.max(0, p.pot - p.ovr) / 30;
    else if (p.age <= 24) v *= 1.2;
    else if (p.age <= 29) v *= 1;
    else if (p.age <= 31) v *= 0.7;
    else v *= 0.45;
    return Math.max(20000, Math.round(v / 10000) * 10000);
  };
  // Inverso aproximado de calcValue: estima a força pelo valor de mercado e idade.
  FB.ovrFromValue = (v, age) => {
    let o = 55 + Math.log(Math.max(v, 20000) / 1e6) / Math.log(1.166);
    if (age <= 21) o -= 3;
    else if (age <= 24) o -= 1.2;
    else if (age >= 32) o += 5;
    else if (age >= 30) o += 2.3;
    return clamp(Math.round(o), 35, 95);
  };
  FB.calcSalary = p => Math.max(4000, Math.round(FB.calcValue(p) * 0.02 / 1000) * 1000);

  FB.createPlayer = (state, pos, base, opts = {}) => {
    const age = opts.age ?? clamp(Math.round(26 + gauss() * 6), 17, 35);
    const ovr = clamp(Math.round(base + gauss() * 7), 30, 92);
    let pot = ovr;
    if (age <= 20) pot += ri(6, 20);
    else if (age <= 23) pot += ri(2, 10);
    else if (age <= 26) pot += ri(0, 4);
    const country = opts.team ? opts.team.country : opts.country;
    let n = FB.randomName(country);
    if (opts.team) {
      const taken = new Set(opts.team.squad.map(id => state.players[id].n));
      for (let k = 0; k < 20 && taken.has(n); k++) n = FB.randomName(country);
    }
    const p = {
      id: state.nextPid++, n, pos, age, ovr, pot: clamp(pot, ovr, 95),
      en: 100, mo: 60, t: null, j: 0, rs: 0, gl: {}, yc: {}, sus: {}, inj: null, frag: null, sale: false, sc: false,
    };
    p.sal = FB.calcSalary(p);
    state.players[p.id] = p;
    return p;
  };

  FB.available = (p, key) => !!p && (!p.inj || p.inj.play) && !(key && p.sus && p.sus[key] > 0);
  FB.goals = p => Object.values(p.gl || {}).reduce((s, v) => s + v, 0);

  const POS_FACTOR = {
    G: { G: 1, Z: 0.3, L: 0.3, M: 0.3, A: 0.3 },
    Z: { G: 0.3, Z: 1, L: 0.88, M: 0.8, A: 0.65 },
    L: { G: 0.3, Z: 0.88, L: 1, M: 0.85, A: 0.75 },
    M: { G: 0.3, Z: 0.8, L: 0.85, M: 1, A: 0.88 },
    A: { G: 0.3, Z: 0.65, L: 0.75, M: 0.88, A: 1 },
  };
  FB.posFactor = (slot, pos) => POS_FACTOR[slot][pos];

  FB.effective = (p, slot, en = p.en) =>
    p.ovr * FB.posFactor(slot, p.pos) * (0.72 + 0.28 * en / 100) * (0.93 + 0.14 * p.mo / 100) * (p.inj && p.inj.play ? 0.9 : 1);

  // ---------- Escalação ----------

  const SLOT_PRIORITY = { G: 0, A: 1, Z: 2, M: 3, L: 4 };

  FB.fillSlots = (state, formation, pool, score = FB.effective) => {
    const slots = FB.slotsOf(formation);
    const lineup = new Array(slots.length).fill(null);
    const used = new Set();
    const order = slots.map((_, i) => i).sort((a, b) => SLOT_PRIORITY[slots[a]] - SLOT_PRIORITY[slots[b]]);
    for (const pass of [0, 1]) {
      for (const i of order) {
        if (lineup[i] != null) continue;
        let best = null, bv = -1;
        for (const p of pool) {
          if (used.has(p.id) || (pass === 0 && p.pos !== slots[i])) continue;
          const v = score(p, slots[i]);
          if (v > bv) { bv = v; best = p; }
        }
        if (best) { lineup[i] = best.id; used.add(best.id); }
      }
    }
    return lineup;
  };

  // Melhor time disponível (não escala quem joga no sacrifício).
  // opts.min: energia mínima desejada (rodízio); opts.rest: poupar os principais jogadores.
  FB.bestLineup = (state, team, key, formation = team.formation, opts = {}) => {
    const pool = team.squad.map(id => state.players[id]).filter(p => FB.available(p, key) && !p.inj);
    const key13 = opts.rest ? new Set(pool.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 11).map(p => p.id)) : null;
    const score = (p, slot) => {
      let v = FB.effective(p, slot);
      if (opts.min && p.en < opts.min) v *= 0.82;
      if (key13 && key13.has(p.id)) v *= 0.8;
      return v;
    };
    return FB.fillSlots(state, formation, pool, score);
  };

  // Banco de reservas para a partida (até 12): goleiro reserva primeiro, depois os melhores.
  FB.MAX_BENCH = 12;
  FB.autoBench = (state, team, lineup, key) => {
    const pool = team.squad.map(id => state.players[id])
      .filter(p => !lineup.includes(p.id) && FB.available(p, key) && !p.inj).sort((a, b) => b.ovr - a.ovr);
    const gk = pool.find(p => p.pos === 'G');
    const rest = pool.filter(p => p !== gk);
    return (gk ? [gk] : []).concat(rest).slice(0, FB.MAX_BENCH).map(p => p.id);
  };
  FB.matchBench = (state, team, lineup, key) => {
    if (team.id === state.userId && team.bench && team.bench.length) {
      const ok = team.bench.filter(pid => team.squad.includes(pid) && !lineup.includes(pid) && FB.available(state.players[pid], key) && !state.players[pid].inj);
      if (ok.length) return ok.slice(0, FB.MAX_BENCH);
    }
    return FB.autoBench(state, team, lineup, key);
  };

  // Instruções táticas (com valores padrão para saves antigos).
  FB.TACTICS = {
    tempo: { label: 'Ritmo', opts: { lento: 'Cadenciado', normal: 'Normal', rapido: 'Acelerado' } },
    line: { label: 'Linha defensiva', opts: { baixa: 'Recuada', media: 'Média', alta: 'Adiantada' } },
    focus: { label: 'Foco do ataque', opts: { misto: 'Variado', lados: 'Pelos lados', meio: 'Pelo meio', contra: 'Contra-ataque' } },
    passing: { label: 'Passes', opts: { curto: 'Curtos', misto: 'Mistos', direto: 'Bola longa' } },
  };
  FB.tac = (team, k) => team[k] || { tempo: 'normal', line: 'media', focus: 'misto', passing: 'misto', press: 'media', posture: 'equilibrado' }[k];

  FB.reassign = (state, team, formation) => {
    const current = team.lineup.filter(id => id != null).map(id => state.players[id]);
    team.formation = formation;
    team.lineup = FB.fillSlots(state, formation, current);
    FB.fixLineup(state, team);
  };

  // Garante uma escalação válida para a competição; devolve as trocas feitas.
  FB.fixLineup = (state, team, key) => {
    const slots = FB.slotsOf(team.formation);
    const changes = [];
    if (!team.lineup || team.lineup.length !== slots.length) team.lineup = new Array(slots.length).fill(null);
    team.lineup = team.lineup.map(id => (id != null && team.squad.includes(id) ? id : null));
    for (let i = 0; i < slots.length; i++) {
      const id = team.lineup[i];
      if (id != null && FB.available(state.players[id], key)) continue;
      let best = null, bv = -1;
      for (const pid of team.squad) {
        const p = state.players[pid];
        if (!FB.available(p, key) || p.inj || team.lineup.includes(pid)) continue;
        const v = FB.effective(p, slots[i]);
        if (v > bv) { bv = v; best = p; }
      }
      if (id != null) changes.push({ out: id, in: best ? best.id : null });
      team.lineup[i] = best ? best.id : null;
    }
    return changes;
  };

  // Força do melhor time possível (em cache por data).
  const strCache = new WeakMap();
  FB.teamStrength = (state, team) => {
    const c = strCache.get(team);
    if (c && c.di === state.di && c.season === state.season && c.n === team.squad.length) return c.s;
    const lineup = FB.fillSlots(state, team.formation, team.squad.map(id => state.players[id]));
    const slots = FB.slotsOf(team.formation);
    let s = 0;
    lineup.forEach((id, i) => { if (id != null) s += state.players[id].ovr * FB.posFactor(slots[i], state.players[id].pos); });
    strCache.set(team, { di: state.di, season: state.season, n: team.squad.length, s: s / 11 });
    return s / 11;
  };

  FB.lineupStrength = (state, team) => {
    const slots = FB.slotsOf(team.formation);
    let s = 0;
    team.lineup.forEach((id, i) => { if (id != null) s += state.players[id].ovr * FB.posFactor(slots[i], state.players[id].pos); });
    return s / 11;
  };

  FB.payroll = (state, team) => team.squad.reduce((s, id) => s + state.players[id].sal, 0);

  FB.isKeyPlayer = (state, p) => {
    if (p.t == null) return false;
    const t = state.teams[p.t];
    const sorted = t.squad.map(id => state.players[id]).sort((a, b) => b.ovr - a.ovr);
    return sorted.indexOf(p) < 13;
  };

  // ---------- Mundo ----------

  const baseState = () => ({
    v: 2, season: 2026, di: 0, userId: null, coach: '',
    teams: [], players: {}, nextPid: 1, comps: {}, dates: [], free: [],
    inbox: [], news: [], nextMsg: 1, board: { conf: 60, target: 6, text: '' },
    fin: { week: {}, last: {}, season: {} }, history: [], champions: [], seasonOver: false, fired: false,
    qual: null, rumors: [], att: {}, settings: { speed: 2, htPause: true },
  });

  FB.parseLine = line => {
    const [name, short, city, uf, c1, c2, str, cap, fans, alias] = line.split('|');
    return { name, short, city, uf, c1, c2, str: +str, cap: +cap, fans: +fans * 1000, alias: alias ? alias.split(';') : [] };
  };

  FB.norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

  FB.addTeam = (state, c, div, fict, lg = null) => {
    const foreign = div === 5;
    let name = c.name, short = c.short;
    if (fict) {
      const used = new Set(state.teams.map(t => t.name));
      const pref = () => (foreign ? FB.FOREIGN_PREFIX[c.uf] || 'Club' : pick(FB.CLUB_PREFIX));
      name = `${pref()} ${c.city}`;
      for (let k = 0; used.has(name) && k < 30; k++) name = `${pick(FB.CLUB_PREFIX)} ${c.city}`;
      if (used.has(name)) name += ' ' + (state.teams.length % 9 + 2);
      // Sigla única: cidade, depois inicial do prefixo + cidade, depois cidade + número.
      const usedS = new Set(state.teams.map(t => t.short));
      const city = FB.norm(c.city).replace(/ /g, '').toUpperCase();
      const pre = FB.norm(name).charAt(0).toUpperCase();
      const opts = [city.slice(0, 3), pre + city.slice(0, 2), city.slice(0, 2) + pre, city[0] + city.slice(-2)];
      for (let k = 2; k < 10; k++) opts.push(city.slice(0, 2) + k);
      short = opts.find(s => !usedS.has(s));
    }
    const t = {
      id: state.teams.length, name, short, city: c.city, uf: foreign ? null : c.uf, country: foreign ? c.uf : 'BRA',
      lg: foreign ? lg : null,
      c1: c.c1, c2: c.c2, div, base: c.str + rf(-1, 1), fans: c.fans, cap: c.cap, ticket: 0,
      cash: 0, squad: [], lineup: [], formation: pick(Object.keys(FB.FORMATIONS)), posture: 'equilibrado',
      press: 'media', training: 'equilibrado', titles: {}, form: [],
      keys: [FB.norm(name), ...(fict ? [] : c.alias.map(FB.norm))],
    };
    const ec = FB.econ(t);
    t.ticket = ec.ticket;
    t.cash = Math.round((ec.tv + ec.sponsor * t.fans / 1000) * rf(2, 4) / 10000) * 10000;
    state.teams.push(t);
    return t;
  };

  FB.makeSquad = (state, t) => {
    const tpl = t.div === 4 ? FB.SMALL_TEMPLATE : FB.SQUAD_TEMPLATE;
    for (const pos of FB.POS) {
      for (let k = 0; k < tpl[pos]; k++) {
        const p = FB.createPlayer(state, pos, t.base - (k >= tpl[pos] - 1 ? 4 : 0), { team: t });
        p.t = t.id;
        t.squad.push(p.id);
      }
    }
    t.lineup = FB.bestLineup(state, t);
  };

  FB.createWorld = (opts = {}) => {
    const state = baseState();
    state.pack = opts.pack || 'real';
    if (opts.empty) return state;
    const pack = FB.PACK_BRASIL;
    state.season = pack.season;
    const fict = opts.pack === 'ficticio';
    pack.divs.forEach((list, div) => list.forEach(line => FB.addTeam(state, FB.parseLine(line), div, fict)));
    for (const L of FB.PACK_MUNDO.leagues) L.teams.forEach(line => FB.addTeam(state, FB.parseLine(line), 5, fict, L.key));
    FB.addFillers(state);
    for (const t of state.teams) FB.makeSquad(state, t);
    FB.refreshFreeAgents(state);
    state.world = 1;
    FB.initialQualifiers(state);
    FB.setupSeason(state);
    return state;
  };

  // Clubes do interior que completam os estaduais (8 por estado).
  FB.addFillers = state => {
    const ufs = [...new Set(state.teams.filter(t => t.div <= 3).map(t => t.uf))];
    for (const uf of ufs) {
      const have = state.teams.filter(t => t.uf === uf && t.div <= 3).length;
      const cities = shuffle((FB.UF_CITIES[uf] || []).filter(c => !state.teams.some(t => t.uf === uf && t.city === c)));
      for (let k = have; k < 8 && cities.length; k++) {
        const city = cities.pop();
        const c1 = pick(FB.PALETTE);
        FB.addTeam(state, {
          name: '', short: '', city, uf, c1, c2: c1 === '#111111' ? '#ffffff' : pick(['#ffffff', '#111111']),
          str: rf(44, 50), cap: ri(4, 12) * 1000, fans: ri(2, 6) * 1000, alias: [],
        }, 4, true);
      }
    }
  };

  FB.refreshFreeAgents = state => {
    for (const pid of state.free) delete state.players[pid];
    state.free = [];
    for (let i = 0; i < 40; i++) {
      const pos = weighted(FB.POS, p => FB.SQUAD_TEMPLATE[p]);
      const p = FB.createPlayer(state, pos, rf(45, 66), { age: ri(22, 35) });
      state.free.push(p.id);
    }
  };

  // Primeira temporada: vagas continentais pela força dos elencos.
  FB.initialQualifiers = state => {
    const A = state.teams.filter(t => t.div === 0).sort((a, b) => FB.teamStrength(state, b) - FB.teamStrength(state, a)).map(t => t.id);
    state.qual = { LIB: A.slice(0, 7), SUL: A.slice(7, 13), SUP: [A[0], A[1]] };
    Object.assign(state.qual, FB.foreignQualifiers(state, false));
  };

  // Vagas por país nas copas continentais (o Brasil usa state.qual.LIB/SUL).
  const QUOTAS = {
    LIB: { ARG: 6, COL: 3, URU: 3, PAR: 3, CHI: 3, ECU: 3, PER: 2, BOL: 1, VEN: 1 },
    SUL: { ARG: 6, COL: 4, URU: 3, PAR: 3, CHI: 3, ECU: 3, PER: 2, BOL: 1, VEN: 1 },
    UCL: { ENG: 5, ESP: 5, ITA: 5, GER: 5, FRA: 4, POR: 4, NED: 4 },
    UEL: { ENG: 5, ESP: 5, ITA: 5, GER: 5, FRA: 4, POR: 4, NED: 4 },
  };
  // Pela tabela da liga que acabou (fromTables) ou, na primeira temporada, pela força dos elencos.
  FB.foreignQualifiers = (state, fromTables) => {
    const ranked = {};
    for (const t of state.teams) {
      if (t.div !== 5) continue;
      const c = t.country;
      if (!ranked[c]) {
        const comp = fromTables && state.comps['L-' + c];
        ranked[c] = comp ? FB.groupTable(state, comp.phases[0].groups[0]).map(r => r.id) : null;
      }
    }
    for (const c of Object.keys(ranked)) {
      const ids = state.teams.filter(t => t.div === 5 && t.country === c).map(t => t.id);
      const order = (ranked[c] || []).filter(id => ids.includes(id));
      const rest = ids.filter(id => !order.includes(id)).sort((a, b) => FB.teamStrength(state, state.teams[b]) - FB.teamStrength(state, state.teams[a]));
      ranked[c] = order.concat(rest);
    }
    const out = {};
    for (const [first, second] of [['LIB', 'SUL'], ['UCL', 'UEL']]) {
      out['F' + first] = []; out['F' + second] = [];
      for (const [c, n] of Object.entries(QUOTAS[first])) {
        const list = ranked[c] || [];
        out['F' + first].push(...list.slice(0, n));
        out['F' + second].push(...list.slice(n, n + QUOTAS[second][c]));
      }
    }
    return out;
  };

  // ---------- Competições ----------

  FB.roundRobin = ids => {
    const arr = shuffle(ids.slice());
    if (arr.length % 2) arr.push(-1); // folga: quem enfrenta -1 não joga na rodada
    const n = arr.length;
    const rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const m = [];
      for (let i = 0; i < n / 2; i++) {
        const a = arr[i], b = arr[n - 1 - i];
        if (a !== -1 && b !== -1) m.push((r + i) % 2 ? [b, a] : [a, b]);
      }
      rounds.push(m);
      arr.splice(1, 0, arr.pop());
    }
    return rounds.concat(rounds.map(r => r.map(([a, b]) => [b, a])));
  };

  const makeRR = (name, groups, legs) => ({
    t: 'rr', name, legs,
    groups: groups.map((teams, gi) => {
      const all = FB.roundRobin(teams);
      const fixtures = legs === 2 ? all : all.slice(0, all.length / 2);
      return { name: groups.length > 1 ? 'Grupo ' + 'ABCDEFGH'[gi] : '', teams: teams.slice(), fixtures, results: fixtures.map(r => r.map(() => null)) };
    }),
  });
  // Em cada par [a, b], "a" é o mais bem colocado: manda o jogo único ou a volta.
  const makeKO = (name, pairs, legs, opts = {}) => ({
    t: 'ko', name, legs, neutral: !!opts.neutral,
    ties: pairs.map(([a, b]) => ({ a, b, res: new Array(legs).fill(null), pens: null, w: null })),
  });

  const FORMATS = {
    LEAGUE: { phases: ['Pontos corridos'], sched: [[0, 'r', 38]] },
    C: { phases: ['Primeira fase', 'Quadrangulares', 'Final'], sched: [[0, 'r', 19], [1, 'r', 6], [2, 'l', 2]] },
    D: { phases: ['Fase de grupos', 'Oitavas de final', 'Quartas de final', 'Semifinal', 'Final'], sched: [[0, 'r', 14], [1, 'l', 2], [2, 'l', 2], [3, 'l', 2], [4, 'l', 2]] },
    CB: { phases: ['Primeira fase', 'Segunda fase', 'Oitavas de final', 'Quartas de final', 'Semifinal', 'Final'], sched: [[0, 'l', 1], [1, 'l', 1], [2, 'l', 2], [3, 'l', 2], [4, 'l', 2], [5, 'l', 2]] },
    EST: { phases: ['Fase de classificação', 'Semifinal', 'Final'], sched: [[0, 'r', 7], [1, 'l', 1], [2, 'l', 1]] },
    CONT: { phases: ['Fase de grupos', 'Oitavas de final', 'Quartas de final', 'Semifinal', 'Final'], sched: [[0, 'r', 6], [1, 'l', 2], [2, 'l', 2], [3, 'l', 2], [4, 'l', 1]] },
    SUP: { phases: ['Final'], sched: [[0, 'l', 1]] },
  };

  const newComp = (state, key, name, short, fmt, kind, teams, extra = {}) => {
    const F = FORMATS[fmt];
    const sched = [];
    for (const [ph, kindS, n] of F.sched) for (let i = 0; i < n; i++) sched.push(kindS === 'r' ? { ph, r: i } : { ph, leg: i });
    const c = { key, name, short, fmt, kind, teams: teams.slice(), phases: [], phaseNames: F.phases, sched, md: 0, champion: null, stats: { goals: 0, games: 0 }, seed: {}, ...extra };
    teams.forEach((id, i) => { c.seed[id] = i; });
    state.comps[key] = c;
    return c;
  };

  const byStrength = (state, ids) => ids.slice().sort((a, b) => FB.teamStrength(state, state.teams[b]) - FB.teamStrength(state, state.teams[a]));

  FB.setupSeason = state => {
    state.comps = {};
    const T = state.teams;
    const div = d => T.filter(t => t.div === d).map(t => t.id);
    const A = newComp(state, 'A', 'Brasileirão Série A', 'Série A', 'LEAGUE', 'liga', div(0));
    A.phases.push(makeRR('Pontos corridos', [A.teams], 2));
    const B = newComp(state, 'B', 'Brasileirão Série B', 'Série B', 'LEAGUE', 'liga', div(1));
    B.phases.push(makeRR('Pontos corridos', [B.teams], 2));
    const C = newComp(state, 'C', 'Brasileirão Série C', 'Série C', 'C', 'liga', div(2));
    C.phases.push(makeRR('Primeira fase', [C.teams], 1));
    const D = newComp(state, 'D', 'Brasileirão Série D', 'Série D', 'D', 'liga', byStrength(state, div(3)));
    const dPots = [0, 1, 2, 3, 4, 5, 6, 7].map(k => shuffle(D.teams.slice(k * 4, k * 4 + 4)));
    D.phases.push(makeRR('Fase de grupos', [0, 1, 2, 3].map(g => dPots.map(p => p[g])), 2));

    // Copa do Brasil: Séries A, B e C + os 4 mais fortes da D.
    const cbTeams = div(0).concat(div(1), div(2), byStrength(state, div(3)).slice(0, 4));
    const CB = newComp(state, 'CB', 'Copa do Brasil', 'Copa do Brasil', 'CB', 'copa', cbTeams);
    CB.phases.push(makeKO('Primeira fase', FB.drawPairs(state, cbTeams, 'lowerHome'), 1));

    // Estaduais: até 8 clubes nacionais do estado + clubes do interior.
    for (const uf of Object.keys(FB.UF_COMP)) {
      const nat = T.filter(t => t.uf === uf && t.div <= 3).sort((a, b) => a.div - b.div || FB.teamStrength(state, b) - FB.teamStrength(state, a)).slice(0, 8);
      if (!nat.length) continue;
      const fill = T.filter(t => t.uf === uf && t.div === 4).slice(0, 8 - nat.length);
      const ids = nat.concat(fill).map(t => t.id);
      if (ids.length < 4) continue;
      while (ids.length % 2) ids.pop();
      const E = newComp(state, 'E-' + uf, FB.UF_COMP[uf], FB.UF_COMP[uf], 'EST', 'estadual', ids, { uf });
      E.phases.push(makeRR('Fase de classificação', [ids], 1));
      if (ids.length < 8) E.sched = E.sched.filter(s => s.ph > 0 || s.r < ids.length - 1);
    }

    // Supercopa e continentais
    const q = state.qual;
    const SUP = newComp(state, 'SUP', 'Supercopa do Brasil', 'Supercopa', 'SUP', 'copa', q.SUP);
    SUP.phases.push(makeKO('Final', [q.SUP], 1, { neutral: true }));

    // Ligas estrangeiras: pontos corridos (turno único quando a liga é grande).
    for (const L of Object.values(FB.LEAGUES)) {
      const ids = T.filter(t => t.div === 5 && t.lg === L.key).map(t => t.id);
      if (ids.length < 4) continue;
      const legs = L.legs || (ids.length > 20 ? 1 : 2);
      const c = newComp(state, 'L-' + L.key, L.name, L.short, 'LEAGUE', 'liga', ids, { country: L.key });
      c.phases.push(makeRR('Pontos corridos', [ids], legs));
      c.sched = c.phases[0].groups[0].fixtures.map((_, r) => ({ ph: 0, r }));
    }

    // Copas continentais: 32 clubes, completados pela força se faltar alguém (saves antigos).
    const pickCont = (base, foreignIds, conf, taken) => {
      const ids = base.concat(foreignIds || []).filter((id, i, a) => a.indexOf(id) === i && !taken.has(id) && T[id]);
      const pool = T.filter(t => (t.div === 5 || (conf === 'CONMEBOL' && t.div <= 1)) && FB.confOf(t) === conf && !ids.includes(t.id) && !taken.has(t.id))
        .map(t => ({ id: t.id, s: FB.teamStrength(state, t) + rf(-4, 4) })).sort((a, b) => b.s - a.s).map(x => x.id);
      while (ids.length < 32 && pool.length) ids.push(pool.shift());
      ids.length = Math.min(ids.length, 32);
      ids.forEach(id => taken.add(id));
      return ids;
    };
    const taken = new Set();
    const conts = [
      ['LIB', 'Copa Libertadores', 'Libertadores', pickCont(q.LIB, q.FLIB, 'CONMEBOL', taken)],
      ['SUL', 'Copa Sul-Americana', 'Sul-Americana', pickCont(q.SUL, q.FSUL, 'CONMEBOL', taken)],
    ];
    if (T.some(t => t.div === 5 && FB.confOf(t) === 'UEFA')) {
      conts.push(['UCL', 'Liga dos Campeões', 'Champions', pickCont([], q.FUCL, 'UEFA', taken)]);
      conts.push(['UEL', 'Liga Europa', 'Liga Europa', pickCont([], q.FUEL, 'UEFA', taken)]);
    }
    for (const [key, name, short, teams] of conts) {
      if (teams.length < 32) continue;
      const c = newComp(state, key, name, short, 'CONT', 'continental', byStrength(state, teams));
      const pots = [0, 1, 2, 3].map(k => shuffle(c.teams.slice(k * 8, k * 8 + 8)));
      c.phases.push(makeRR('Fase de grupos', [0, 1, 2, 3, 4, 5, 6, 7].map(g => pots.map(p => p[g])), 2));
    }

    FB.buildCalendar(state);
    state.di = 0;
    state.fin.season = {};
    state.att = {};
    state.youngest = null;
    for (const t of T) t.form = [];
  };

  // Pareia equipes. 'lowerHome': quem é de divisão inferior manda o jogo; 'better': o mais forte decide em casa.
  FB.drawPairs = (state, ids, mode) => {
    const list = shuffle(ids.slice());
    const pairs = [];
    for (let i = 0; i + 1 < list.length; i += 2) {
      let a = list[i], b = list[i + 1];
      const da = state.teams[a].div, db = state.teams[b].div;
      const swap = mode === 'lowerHome' ? da < db
        : da > db || (da === db && FB.teamStrength(state, state.teams[b]) > FB.teamStrength(state, state.teams[a]));
      if (swap) [a, b] = [b, a];
      pairs.push([a, b]);
    }
    return pairs;
  };

  // ---------- Calendário ----------

  const CONT_AFTER = [2, 4, 6, 8, 10, 12, 17, 19, 23, 25, 29, 31, 35];
  const CDB_AFTER = [14, 16, 20, 22, 26, 28, 32, 34];

  FB.dateOf = (state, day) => new Date(state.season, 0, day);
  FB.dayOfYear = d => Math.round((d - new Date(d.getFullYear(), 0, 0)) / 864e5);

  FB.buildCalendar = state => {
    const dates = [];
    const add = (day, slots) => { if (slots.length) dates.push({ day, slots }); };
    const est = Object.keys(state.comps).filter(k => k.startsWith('E-'));
    let day = 18, e = 0, cb = 0, cont = 0;
    ['E', 'SUP', 'E', 'CB', 'E', 'E', 'CB', 'E', 'E', 'E', 'E', 'E'].forEach((x, i) => {
      if (x === 'E') { add(day, est.filter(k => e < state.comps[k].sched.length).map(key => ({ key, k: e }))); e++; }
      else if (x === 'SUP') add(day, [{ key: 'SUP', k: 0 }]);
      else add(day, [{ key: 'CB', k: cb++ }]);
      day += i % 2 ? 3 : 4;
    });
    const apr = new Date(state.season, 3, 4);
    while (apr.getDay() !== 6) apr.setDate(apr.getDate() + 1);
    let sat = FB.dayOfYear(apr);
    for (let r = 0; r < 38; r++) {
      const slots = [{ key: 'A', k: r }, { key: 'B', k: r }];
      if (r < state.comps.C.sched.length) slots.push({ key: 'C', k: r });
      if (r < state.comps.D.sched.length) slots.push({ key: 'D', k: r });
      add(sat, slots);
      if (CONT_AFTER.includes(r + 1)) { add(sat + 4, [{ key: 'LIB', k: cont }, { key: 'SUL', k: cont }]); cont++; }
      else if (CDB_AFTER.includes(r + 1)) add(sat + 4, [{ key: 'CB', k: cb++ }]);
      sat += 7;
    }

    // Ligas estrangeiras: rodadas distribuídas pelos domingos do ano; Champions e Liga Europa na quarta e na quinta.
    const jan = new Date(state.season, 0, 25);
    while (jan.getDay() !== 0) jan.setDate(jan.getDate() + 1);
    const sun0 = FB.dayOfYear(jan);
    const W = Math.floor((FB.dayOfYear(new Date(state.season, 11, 6)) - sun0) / 7) + 1;
    const sundays = new Map();
    for (const c of Object.values(state.comps)) {
      if (!c.key.startsWith('L-')) continue;
      const R = c.sched.length;
      for (let r = 0; r < R; r++) {
        const w = Math.floor(r * W / R);
        if (!sundays.has(w)) sundays.set(w, []);
        sundays.get(w).push({ key: c.key, k: r });
      }
    }
    for (const [w, slots] of sundays) add(sun0 + w * 7, slots);
    const UEFA_AFTER = [6, 8, 10, 12, 14, 16, 22, 24, 28, 30, 34, 36, 40];
    UEFA_AFTER.forEach((w, k) => {
      const slots = ['UCL', 'UEL'].filter(key => state.comps[key]).map(key => ({ key, k }));
      add(sun0 + w * 7 + 3, slots);
    });

    // Junta datas no mesmo dia e ordena.
    const byDay = new Map();
    for (const d of dates) {
      if (byDay.has(d.day)) byDay.get(d.day).slots.push(...d.slots);
      else byDay.set(d.day, { day: d.day, slots: d.slots.slice() });
    }
    state.dates = [...byDay.values()].sort((a, b) => a.day - b.day);
  };

  FB.today = state => {
    if (state.dates[state.di]) return state.dates[state.di].day;
    return state.dates.length ? state.dates[state.dates.length - 1].day + 1 : 1;
  };

  const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  FB.fmtDate = (state, day, withWeekday = true) => {
    const d = FB.dateOf(state, day);
    const s = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    return withWeekday ? `${WEEKDAYS[d.getDay()]}, ${s}` : s;
  };

  // Janelas de transferência: início do ano (até o começo do Brasileirão) e julho.
  FB.windowOpen = state => {
    const d = FB.today(state);
    return d <= 95 || (d >= 182 && d <= 214);
  };
  FB.windowText = state => (FB.windowOpen(state) ? 'Janela aberta' : FB.today(state) < 182 ? 'Janela reabre em julho' : 'Janela reabre em janeiro');

  // ---------- Tabelas e fases ----------

  FB.groupTable = (state, g) => {
    const rows = {};
    for (const id of g.teams) rows[id] = { id, p: 0, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, form: [] };
    g.results.forEach((rd, r) => rd.forEach((res, i) => {
      if (!res) return;
      const [h, a] = g.fixtures[r][i];
      const H = rows[h], A = rows[a];
      H.j++; A.j++; H.gp += res.hg; H.gc += res.ag; A.gp += res.ag; A.gc += res.hg;
      if (res.hg > res.ag) { H.v++; H.p += 3; A.d++; H.form.push('V'); A.form.push('D'); }
      else if (res.hg < res.ag) { A.v++; A.p += 3; H.d++; H.form.push('D'); A.form.push('V'); }
      else { H.e++; A.e++; H.p++; A.p++; H.form.push('E'); A.form.push('E'); }
    }));
    return Object.values(rows).sort((a, b) =>
      b.p - a.p || b.v - a.v || (b.gp - b.gc) - (a.gp - a.gc) || b.gp - a.gp ||
      state.teams[a.id].name.localeCompare(state.teams[b.id].name));
  };

  FB.leagueTable = (state, key) => FB.groupTable(state, state.comps[key].phases[0].groups[0]);

  // Posição do clube na sua liga (Série D: posição no grupo).
  FB.leagueStanding = (state, tid) => {
    const t = state.teams[tid];
    const key = FB.compKeyOf(t);
    const c = key && state.comps[key];
    if (!c || !c.phases[0]) return null;
    const g = c.phases[0].groups.find(x => x.teams.includes(tid));
    if (!g) return null;
    const rows = FB.groupTable(state, g);
    const pos = rows.findIndex(r => r.id === tid) + 1;
    return { key, pos, of: rows.length, row: rows[pos - 1], group: g.name };
  };

  // Placar agregado de um confronto, do ponto de vista de [a, b].
  FB.tieAgg = tie => {
    let ga = 0, gb = 0;
    tie.res.forEach((r, leg) => {
      if (!r) return;
      const homeIsA = tie.res.length === 1 || leg === 1;
      if (homeIsA) { ga += r.hg; gb += r.ag; } else { ga += r.ag; gb += r.hg; }
    });
    return [ga, gb];
  };

  const winnersOf = P => P.ties.map(t => t.w);
  const better = (comp, a, b) => ((comp.seed[a] ?? 99) <= (comp.seed[b] ?? 99) ? [a, b] : [b, a]);
  const reseed = (comp, ranked) => ranked.forEach((id, i) => { comp.seed[id] = i; });

  FB.PHASE_PRIZE = {
    CB: [1e6, 1.5e6, 3e6, 4e6, 8e6, 40e6], LIB: [6e6, 4e6, 5e6, 6e6, 60e6], SUL: [2e6, 1.5e6, 2e6, 3e6, 25e6],
    EST: [2e5, 4e5, 2e6], SUP: [8e6], C: [0, 0, 1.5e6], D: [0, 2e5, 3e5, 3e5, 5e5],
    UCL: [90e6, 60e6, 75e6, 90e6, 120e6], UEL: [25e6, 15e6, 20e6, 30e6, 50e6],
  };

  // Executado quando a última rodada de uma fase termina.
  FB.closePhase = (state, comp, ph) => {
    closePhaseInner(state, comp, ph);
    if (comp.teams.includes(state.userId) && comp.kind !== 'liga') FB.boardCompUpdate(state, comp);
  };
  const closePhaseInner = (state, comp, ph) => {
    const P = comp.phases[ph];
    const T = state.teams;
    const prizes = FB.PHASE_PRIZE[comp.key] || FB.PHASE_PRIZE[comp.fmt] || [];
    if (prizes[ph]) {
      const paid = P.t === 'ko' ? winnersOf(P) : P.groups.flatMap(g => g.teams);
      for (const id of paid) FB.money(state, id, prizes[ph], 'premios');
    }
    const name = comp.phaseNames[ph + 1];
    const finishWith = id => {
      comp.champion = id;
      T[id].titles[comp.key] = (T[id].titles[comp.key] || 0) + 1;
      state.champions.unshift({ season: state.season, key: comp.key, comp: comp.name, tid: id });
      if (comp.kind !== 'estadual' || T[id].div <= 1 || id === state.userId || comp.teams.includes(state.userId)) {
        FB.news(state, 'noticia', `${T[id].name} é campeão: ${comp.name}!`, `O ${T[id].name} conquistou o título da ${comp.name} ${state.season}.`, { team: id });
      }
      if (id === state.userId) {
        FB.msg(state, `🏆 Campeão: ${comp.name}!`, `Seu ${T[id].name} conquistou a ${comp.name}! A diretoria e a torcida estão em festa.`, { from: 'Diretoria' });
        state.board.conf = clamp(state.board.conf + (comp.kind === 'estadual' ? 6 : comp.kind === 'liga' ? 10 : 15), 0, 100);
      }
    };
    if (P.t === 'ko') {
      const out = P.ties.map(t => (t.w === t.a ? t.b : t.a));
      if (out.includes(state.userId)) {
        FB.msg(state, comp.name, `Seu time foi eliminado na fase: ${comp.phaseNames[ph]}.`, { from: 'Auxiliar técnico' });
        if (comp.kind !== 'estadual') state.board.conf = clamp(state.board.conf - (comp.kind === 'continental' ? 4 : 3), 0, 100);
      }
    }

    switch (comp.fmt) {
      case 'LEAGUE':
        finishWith(FB.groupTable(state, P.groups[0])[0].id);
        return;
      case 'C':
        if (ph === 0) {
          const r = FB.groupTable(state, P.groups[0]).map(x => x.id);
          reseed(comp, r);
          comp.relegated = r.slice(-4);
          comp.phases.push(makeRR(name, [[r[0], r[3], r[4], r[7]], [r[1], r[2], r[5], r[6]]], 2));
        } else if (ph === 1) {
          const gs = P.groups.map(g => FB.groupTable(state, g).map(x => x.id));
          comp.promoted = gs.flatMap(g => g.slice(0, 2));
          comp.phases.push(makeKO(name, [better(comp, gs[0][0], gs[1][0])], 2));
          FB.news(state, 'noticia', 'Série C: definidos os acessos', `Sobem para a Série B: ${comp.promoted.map(id => T[id].name).join(', ')}.`);
        } else finishWith(P.ties[0].w);
        return;
      case 'D':
        if (ph === 0) {
          const gs = P.groups.map(g => FB.groupTable(state, g).map(x => x.id));
          const pairs = [];
          for (const [x, y] of [[0, 1], [2, 3]]) pairs.push([gs[x][0], gs[y][3]], [gs[y][1], gs[x][2]], [gs[y][0], gs[x][3]], [gs[x][1], gs[y][2]]);
          reseed(comp, [0, 1, 2, 3].flatMap(pos => gs.map(g => g[pos])));
          comp.phases.push(makeKO(name, pairs, 2));
        } else if (ph < 4) {
          const w = winnersOf(P);
          if (ph === 2) {
            comp.promoted = w.slice();
            FB.news(state, 'noticia', 'Série D: definidos os acessos', `Sobem para a Série C: ${w.map(id => T[id].name).join(', ')}.`);
          }
          const pairs = [];
          for (let i = 0; i < w.length; i += 2) pairs.push(better(comp, w[i], w[i + 1]));
          comp.phases.push(makeKO(name, pairs, 2));
        } else finishWith(P.ties[0].w);
        return;
      case 'CB': {
        if (ph >= 5) { finishWith(P.ties[0].w); return; }
        const w = winnersOf(P);
        const next = makeKO(name, FB.drawPairs(state, w, ph === 0 ? 'lowerHome' : 'better'), ph >= 1 ? 2 : 1);
        comp.phases.push(next);
        if (ph >= 1) {
          FB.news(state, 'atualizacao', `Sorteio: ${comp.name}`, `Confrontos das ${name.toLowerCase()}: ` +
            next.ties.map(t => `${T[t.b].short} x ${T[t.a].short}`).join(', ') + '.');
        }
        return;
      }
      case 'EST':
        if (ph === 0) {
          const r = FB.groupTable(state, P.groups[0]).map(x => x.id);
          reseed(comp, r);
          comp.phases.push(makeKO(name, [[r[0], r[3]], [r[1], r[2]]], 1));
        } else if (ph === 1) {
          const w = winnersOf(P);
          comp.phases.push(makeKO(name, [better(comp, w[0], w[1])], 1));
        } else finishWith(P.ties[0].w);
        return;
      case 'CONT':
        if (ph === 0) {
          const gs = P.groups.map(g => FB.groupTable(state, g).map(x => x.id));
          const pairs = [];
          for (let g = 0; g < 8; g += 2) pairs.push([gs[g][0], gs[g + 1][1]], [gs[g + 1][0], gs[g][1]]);
          reseed(comp, gs.map(g => g[0]).concat(gs.map(g => g[1])));
          comp.phases.push(makeKO(name, pairs, 2));
          const br = pairs.flat().filter(id => T[id].div <= 3);
          FB.news(state, 'atualizacao', `${comp.short}: definidos os classificados`, comp.key === 'LIB' || comp.key === 'SUL'
            ? `Brasileiros nas oitavas: ${br.map(id => T[id].name).join(', ') || 'nenhum'}.`
            : `Classificados às oitavas: ${pairs.flat().map(id => T[id].short).join(', ')}.`);
        } else if (ph < 4) {
          const w = winnersOf(P);
          const pairs = [];
          for (let i = 0; i < w.length; i += 2) pairs.push(better(comp, w[i], w[i + 1]));
          comp.phases.push(makeKO(name, pairs, ph === 3 ? 1 : 2, { neutral: ph === 3 }));
        } else finishWith(P.ties[0].w);
        return;
      case 'SUP':
        finishWith(P.ties[0].w);
    }
  };

  // Jogos de uma data.
  FB.dateFixtures = (state, di = state.di) => {
    const date = state.dates[di];
    if (!date) return [];
    const out = [];
    for (const { key, k } of date.slots) {
      const comp = state.comps[key];
      const s = comp && comp.sched[k];
      if (!s) continue;
      const P = comp.phases[s.ph];
      if (!P) continue;
      if (P.t === 'rr') {
        P.groups.forEach((g, gi) => g.fixtures[s.r].forEach(([h, a], i) =>
          out.push({ h, a, comp: { key, k, ph: s.ph, g: gi, r: s.r, i } })));
      } else {
        const final = P.ties.length === 1;
        P.ties.forEach((tie, ti) => {
          const decisive = s.leg === P.legs - 1;
          const homeA = P.legs === 1 || s.leg === 1;
          const h = homeA ? tie.a : tie.b, a = homeA ? tie.b : tie.a;
          let aggH = 0, aggA = 0;
          if (decisive && P.legs === 2 && tie.res[0]) { aggH = tie.res[0].ag; aggA = tie.res[0].hg; }
          out.push({ h, a, comp: { key, k, ph: s.ph, ti, leg: s.leg, ko: true, decisive, aggH, aggA, neutral: P.neutral, final } });
        });
      }
    }
    return out;
  };

  FB.userFixture = state => FB.dateFixtures(state).find(f => f.h === state.userId || f.a === state.userId) || null;

  FB.compLabel = (state, f) => {
    const c = state.comps[f.comp.key];
    const P = c.phases[f.comp.ph];
    if (P.t === 'rr') return `${c.name} · ${c.fmt === 'LEAGUE' ? '' : P.name + ' · '}${f.comp.r + 1}ª rodada`;
    return `${c.name} · ${P.name}${P.legs === 2 ? (f.comp.leg ? ' (volta)' : ' (ida)') : ''}`;
  };

  // Próximos jogos do clube (inclusive datas de fases ainda não sorteadas).
  FB.upcoming = (state, tid, n = 6) => {
    const out = [];
    for (let di = state.di; di < state.dates.length && out.length < n; di++) {
      const date = state.dates[di];
      const fx = FB.dateFixtures(state, di).find(f => f.h === tid || f.a === tid);
      if (fx) { out.push({ di, day: date.day, f: fx, label: FB.compLabel(state, fx) }); continue; }
      for (const { key, k } of date.slots) {
        const c = state.comps[key];
        const s = c.sched[k];
        if (!s || c.phases[s.ph] || c.champion != null) continue;
        const prev = c.phases[c.phases.length - 1];
        const alive = prev && (prev.t === 'ko'
          ? prev.ties.some(t => (t.a === tid || t.b === tid) && (t.w == null || t.w === tid))
          : prev.groups.some(g => g.teams.includes(tid)));
        if (alive && s.ph === c.phases.length) { out.push({ di, day: date.day, f: null, label: `${c.name} · ${c.phaseNames[s.ph]} (a definir)` }); break; }
      }
    }
    return out;
  };

  // ---------- Partida ----------

  const ATT_W = { Z: 0.05, L: 0.25, M: 0.55, A: 1 };
  const DEF_W = { Z: 1, L: 0.8, M: 0.4, A: 0.05 };
  const MID_W = { Z: 0.1, L: 0.4, M: 1, A: 0.3 };
  const SCORE_W = { G: 0.02, Z: 0.7, L: 0.8, M: 2.5, A: 6 };

  const GOAL_TXT = ['bate cruzado e marca', 'sobe mais que todos e cabeceia pro fundo da rede', 'acerta um chutaço de fora da área',
    'fica cara a cara e não perdoa', 'converte o pênalti', 'aproveita o rebote e empurra pra dentro', 'tabela e toca na saída do goleiro',
    'bate de primeira, sem chance', 'cobra falta no ângulo', 'completa o cruzamento rasteiro'];
  const MISS_TXT = ['{n} chuta para fora', '{n} cabeceia por cima do gol', 'Grande defesa de {gk}!', '{n} acerta a trave!',
    '{n} finaliza fraco, {gk} segura', '{n} perde gol feito!', 'Escanteio perigoso, a zaga afasta', '{n} arrisca de longe, por cima'];
  const HURT_TXT = ['sente a coxa e pede atendimento', 'cai após dividida e não consegue continuar', 'torce o tornozelo num lance isolado',
    'sente dores e faz sinal para o banco', 'leva uma pancada forte e precisa sair'];

  FB.MOMENTS = {
    contra: {
      title: 'Contra-ataque!',
      opts: { chutar: ['Chutar de primeira', 'Finaliza rápido, antes da zaga voltar'], driblar: ['Driblar o goleiro', 'Arrisca o drible na saída do goleiro'], tocar: ['Tocar para o companheiro', 'Rola para quem chega livre'] },
      hints: {
        chutar: '{n} recebe na entrada da área com espaço para bater. A zaga vem correndo atrás.',
        driblar: '{n} sai cara a cara. {gk} vem adiantado, abrindo espaço para o drible.',
        tocar: '{n} puxa o contra-ataque e {m} chega livre pelo outro lado.',
      },
    },
    falta: {
      title: 'Falta perigosa!',
      opts: { direto: ['Bater direto', 'Chute no gol, por cima da barreira'], cruzar: ['Cruzar na área', 'Bola alta para os zagueiros e atacantes'], ensaiada: ['Jogada ensaiada', 'Toque curto treinado no CT'] },
      hints: {
        direto: 'Falta frontal, na meia-lua. {n} ajeita a bola com carinho.',
        cruzar: 'Falta pelo lado da área. A defesa adversária é baixa e não tem bom jogo aéreo.',
        ensaiada: 'Falta perto da área, com a barreira mal posicionada. Tem gente livre no lado.',
      },
    },
    penalti: {
      title: 'Pênalti!',
      text: 'Pênalti para o {club}! {n} pega a bola para cobrar. {gk} se prepara.',
      opts: { esquerda: ['Canto esquerdo', 'Bola no canto'], meio: ['No meio', 'Arriscado: só funciona se o goleiro pular'], direita: ['Canto direito', 'Bola no canto'] },
    },
    defesa: {
      title: 'Perigo no seu campo!',
      opts: { falta: ['Fazer a falta', 'Para o lance, mas leva cartão'], bote: ['Dar o bote', 'Tenta roubar a bola'], recuar: ['Recuar e fechar', 'Espera o chute com a defesa fechada'] },
      hints: {
        falta: '{n} escapa em velocidade e só {d} pode pará-lo antes da área.',
        bote: '{n} domina mal a bola, bem na frente de {d}.',
        recuar: '{n} vem em velocidade; {d} está no mano a mano, mas a defesa já está voltando.',
      },
    },
  };

  class Match {
    constructor(state, hId, aId, comp) {
      this.state = state;
      this.comp = comp;
      this.minute = 0;
      this.events = [];
      this.done = false;
      this.pens = null;
      this.pending = null;
      this.moment = null;
      this.moments = 0;
      this.interactive = false; // a interface liga para o usuário decidir os lances decisivos
      this.today = FB.today(state);
      this.sides = [hId, aId].map((tid, i) => {
        const t = state.teams[tid];
        const en = {};
        for (const pid of t.squad) en[pid] = state.players[pid].en;
        const lineup = t.lineup.slice();
        const cap = t.captain != null && lineup.includes(t.captain) ? state.players[t.captain] : null;
        return {
          tid, i, home: i === 0, formation: t.formation, formationDef: FB.FORMATIONS[t.formationDef] ? t.formationDef : t.formation, posture: FB.tac(t, 'posture'), press: FB.tac(t, 'press'),
          tempo: FB.tac(t, 'tempo'), line: FB.tac(t, 'line'), focus: FB.tac(t, 'focus'), passing: FB.tac(t, 'passing'),
          boost: 1 + (cap && cap.mo >= 60 ? 0.01 : 0),
          cohesion: tid === state.userId && t.training === 'tatico' ? 1.025 : 1, lineup,
          bench: FB.matchBench(state, t, lineup, comp.key),
          en, goals: 0, subs: 0, played: new Set(lineup.filter(x => x != null)),
          yellow: {}, sent: [], hurt: new Set(), scorers: [],
        };
      });
    }

    get user() { return this.sides.findIndex(s => s.tid === this.state.userId); }
    p(pid) { return this.state.players[pid]; }

    // Efeito do estilo de jogo, considerando o estilo do adversário.
    styleMods(s, o) {
      let att = 1, def = 1, mid = 1;
      if (s.tempo === 'rapido') att *= 1.04;
      else if (s.tempo === 'lento') { att *= 0.96; def *= 1.03; }
      if (s.line === 'alta') { mid *= 1.04; if (o.focus === 'contra') def *= 0.92; }
      else if (s.line === 'baixa') { def *= 1.05; att *= 0.96; if (o.focus === 'contra') def *= 1.03; }
      if (s.passing === 'curto') { mid *= 1.05; att *= 0.98; }
      else if (s.passing === 'direto') { att *= 1.03; mid *= 0.96; }
      const f = FB.FORMATIONS[s.formation], fo = FB.FORMATIONS[o.formationDef];
      if (s.focus === 'lados') att *= fo.L === 0 ? 1.07 : f.L === 0 ? 0.96 : 1.02;
      else if (s.focus === 'meio') att *= f.M >= fo.M ? 1.05 : 0.97;
      else if (s.focus === 'contra') {
        att *= o.line === 'alta' || o.posture === 'ofensivo' ? 1.09 : o.line === 'baixa' || o.posture === 'defensivo' ? 0.92 : 1;
        mid *= 0.95;
      }
      return { att, def, mid };
    }

    // Força de cada setor numa forma (formação + jogadores nos slots).
    shape(side, formation, lineup) {
      const slots = FB.slotsOf(formation);
      let att = 0, def = 0, mid = 0, gk = 25;
      slots.forEach((pos, i) => {
        const pid = lineup[i];
        if (pid == null) return;
        let e = FB.effective(this.p(pid), pos, side.en[pid]) * side.boost * side.cohesion;
        if (side.hurt.has(pid)) e *= 0.4;
        if (pos === 'G') gk = e;
        else { att += e * ATT_W[pos]; def += e * DEF_W[pos]; mid += e * MID_W[pos]; }
      });
      return { att, def, mid, gk };
    }

    // Os mesmos jogadores redistribuídos na formação sem a bola.
    defLineup(side) {
      const key = side.formationDef + '|' + side.lineup.join(',');
      if (side.defKey !== key) {
        side.defKey = key;
        side.defCache = FB.fillSlots(this.state, side.formationDef, side.lineup.filter(x => x != null).map(pid => this.p(pid)));
      }
      return side.defCache;
    }

    // Com a bola vale a formação de ataque; sem a bola, a de defesa. Trocar de forma tem um pequeno custo de transição.
    rating(side) {
      const a = this.shape(side, side.formation, side.lineup);
      const two = side.formationDef !== side.formation;
      const d = two ? this.shape(side, side.formationDef, this.defLineup(side)) : a;
      const trans = two ? 0.97 : 1;
      const k = side.posture === 'ofensivo' ? [1.1, 0.9] : side.posture === 'defensivo' ? [0.88, 1.1] : [1, 1];
      const m = this.styleMods(side, this.sides[1 - side.i]);
      return { att: a.att / 4.8 * k[0] * m.att * (two ? 0.985 : 1), def: (d.def + d.gk * 1.2) / 6.5 * k[1] * m.def, mid: (a.mid + d.mid) / 2 * m.mid * trans };
    }

    ev(type, side, text, pid) {
      const e = { m: this.minute, type, side, text, pid };
      this.events.push(e);
      return e;
    }

    onField(side, includeGk = true) {
      const slots = FB.slotsOf(side.formation);
      return side.lineup.map((pid, i) => ({ pid, slot: i, pos: slots[i] }))
        .filter(x => x.pid != null && (includeGk || x.pos !== 'G'));
    }

    gkName(side) {
      const gk = side.lineup[0];
      return gk != null ? this.p(gk).n : 'o goleiro';
    }

    // Enquanto um lesionado do usuário aguarda substituição, o jogo não anda.
    step() {
      if (this.done || this.pending || this.moment) return;
      this.minute++;
      const r = this.sides.map(s => this.rating(s));
      for (let i = 0; i < 2; i++) {
        const s = this.sides[i], o = this.sides[1 - i];
        const share = r[i].mid / Math.max(1, r[i].mid + r[1 - i].mid);
        let lambda = 1.1 * Math.pow(r[i].att / Math.max(1, r[1 - i].def), 2.3) * Math.pow(share * 2, 0.6);
        lambda *= o.press === 'alta' ? 0.94 : o.press === 'baixa' ? 1.05 : 1;
        lambda *= this.comp.neutral ? 1 : s.home ? 1.12 : 0.95;
        const pr = lambda / 90;
        const x = Math.random();
        if (x < pr * 3.2 && this.interactive && !this.moment && this.moments < 4 && Math.random() < 0.28 && this.startMoment(i)) { /* decide o usuário */ }
        else if (x < pr) this.goal(s);
        else if (x < pr * 3.2) {
          const f = this.onField(s, false);
          if (f.length) {
            const pid = weighted(f, c => SCORE_W[c.pos]).pid;
            this.ev('chance', i, pick(MISS_TXT).replace('{n}', this.p(pid).n).replace('{gk}', this.gkName(o)), pid);
          }
        }
        if (Math.random() < 0.021) this.card(s, false);
        else if (Math.random() < 0.0008) this.card(s, true);
        if (Math.random() < 0.0014) this.injury(s);
      }
      for (const s of this.sides) {
        const drain = 0.2 + (s.posture === 'ofensivo' ? 0.05 : 0) + (s.press === 'alta' ? 0.07 : s.press === 'baixa' ? -0.04 : 0) +
          (s.tempo === 'rapido' ? 0.04 : s.tempo === 'lento' ? -0.03 : 0) + (s.line === 'alta' ? 0.02 : 0);
        for (const pid of s.lineup) if (pid != null) s.en[pid] = Math.max(0, s.en[pid] - drain - Math.random() * 0.06);
        if (s.i !== this.user) this.aiThink(s);
      }
      if (this.minute === 45) this.ev('ht', null, 'Fim do primeiro tempo');
      if (this.minute >= 90) this.finish();
    }

    goal(s) {
      const f = this.onField(s);
      if (!f.length) return;
      const pid = weighted(f, c => SCORE_W[c.pos] * this.p(c.pid).ovr / 70 * (s.hurt.has(c.pid) ? 0.2 : 1)).pid;
      this.scoreGoal(s, pid, `GOL! ${this.p(pid).n} ${pick(GOAL_TXT)}`);
    }

    scoreGoal(s, pid, text) {
      s.goals++;
      s.scorers.push({ pid, m: this.minute });
      this.ev('goal', s.i, text, pid);
    }

    // ---------- Lances decisivos ----------
    // Num lance de perigo do usuário (ou contra ele), o jogo para e ele escolhe a jogada.
    // A dica da situação aponta a melhor escolha; o resultado ainda depende da qualidade dos jogadores.

    startMoment(i) {
      const s = this.sides[i], o = this.sides[1 - i];
      const u = this.user;
      if (u < 0) return false;
      const f = this.onField(s, false).filter(c => !s.hurt.has(c.pid));
      if (!f.length) return false;
      const pid = weighted(f, c => SCORE_W[c.pos] * this.p(c.pid).ovr / 70).pid;
      const mates = f.filter(c => c.pid !== pid && (c.pos === 'A' || c.pos === 'M'));
      const mate = mates.length ? weighted(mates, c => SCORE_W[c.pos]).pid : null;
      let kind;
      if (i === u) kind = Math.random() < 0.08 ? 'penalti' : Math.random() < 0.55 ? 'contra' : 'falta';
      else kind = 'defesa';
      const M = { kind, side: i, pid, mate, m: this.minute };
      const D = FB.MOMENTS[kind];
      M.best = kind === 'penalti' ? null : pick(Object.keys(D.opts).filter(k => k !== 'tocar' || mate != null));
      if (kind === 'falta') {
        const takers = f.filter(c => c.pos === 'M' || c.pos === 'A');
        M.pid = (takers.length ? takers : f).slice().sort((a, b) => this.p(b.pid).ovr - this.p(a.pid).ovr)[0].pid;
      }
      if (kind === 'defesa') {
        const defs = this.onField(o, false).filter(c => !o.hurt.has(c.pid));
        if (!defs.length) return false;
        M.def = weighted(defs, c => DEF_W[c.pos] + 0.1).pid;
      }
      const name = id => (id != null ? this.p(id).n : '');
      M.text = (kind === 'penalti' ? D.text : D.hints[M.best])
        .replace('{n}', name(M.pid)).replace('{m}', name(mate)).replace('{d}', name(M.def))
        .replace('{gk}', this.gkName(o)).replace('{club}', this.state.teams[s.tid].name);
      this.moment = M;
      this.moments++;
      return true;
    }

    resolveMoment(choice) {
      const M = this.moment;
      if (!M) return null;
      const D = FB.MOMENTS[M.kind];
      if (!D.opts[choice]) choice = Object.keys(D.opts)[0];
      this.moment = null;
      const s = this.sides[M.side], o = this.sides[1 - M.side];
      const sh = this.p(M.pid);
      const gk = o.lineup[0] != null ? this.p(o.lineup[0]).ovr : 40;
      const edge = (sh.ovr - gk) / 200;
      const good = choice === M.best ? 0.2 : 0;
      const r = Math.random();
      let goal = false, scorer = M.pid, miss;
      if (M.kind === 'contra') {
        if (choice === 'tocar' && M.mate != null) scorer = M.mate;
        goal = r < 0.24 + edge + good;
        miss = { chutar: `${sh.n} bate de primeira, mas ${this.gkName(o)} defende!`, driblar: `${this.gkName(o)} fecha o ângulo e fica com a bola`, tocar: 'O passe sai forte demais e a zaga corta' }[choice];
      } else if (M.kind === 'falta') {
        if (choice !== 'direto') {
          const heads = this.onField(s, false).filter(c => c.pos === 'Z' || c.pos === 'A');
          if (heads.length) scorer = weighted(heads, c => this.p(c.pid).ovr).pid;
        }
        goal = r < 0.17 + edge + good;
        miss = { direto: `${sh.n} bate na barreira`, cruzar: 'O cruzamento passa por todo mundo', ensaiada: 'A jogada ensaiada não funciona e a zaga afasta' }[choice];
      } else if (M.kind === 'penalti') {
        const dive = Math.random() < 0.16 ? 'meio' : pick(['esquerda', 'direita']);
        const skill = (sh.ovr - gk) / 300;
        goal = choice === 'meio' ? (dive === 'meio' ? r < 0.12 : r < 0.92 + skill) : dive === choice ? r < 0.28 + skill : r < 0.94 + skill;
        miss = dive === choice ? `${this.gkName(o)} acerta o canto e defende o pênalti!` : `${sh.n} isola a cobrança!`;
      } else {
        // Defesa: o adversário (lado M.side) ataca o time do usuário.
        const def = this.p(M.def);
        if (choice === 'falta') {
          const slot = o.lineup.indexOf(M.def);
          if (slot >= 0) this.bookPlayer(o, slot, false);
          // A falta evita o lance, mas dá ao adversário uma bola parada perto da área.
          if (Math.random() < 0.2) {
            const txt = `GOL! ${sh.n} cobra a falta e marca`;
            this.scoreGoal(s, M.pid, txt);
            return { goal: true, text: `${def.n} fez a falta, mas ${sh.n} converte a cobrança.` };
          }
          this.ev('chance', M.side, `${def.n} para o contra-ataque com falta`);
          return { goal: false, text: `${def.n} faz a falta e evita o perigo.` };
        }
        const win = choice === 'bote' ? Math.random() < 0.4 + (def.ovr - sh.ovr) / 150 + good : false;
        if (win) { this.ev('chance', 1 - M.side, `${def.n} dá o bote e rouba a bola!`, M.def); return { goal: false, text: `${def.n} rouba a bola!` }; }
        goal = r < (choice === 'bote' ? 0.55 : 0.36 - good);
        miss = choice === 'recuar' ? `A defesa se fecha e ${sh.n} chuta para fora` : `${sh.n} passa por ${def.n}, mas finaliza mal`;
      }
      if (goal) {
        const txt = `GOL! ${this.p(scorer).n} ${M.kind === 'penalti' ? 'converte o pênalti' : pick(GOAL_TXT)}`;
        this.scoreGoal(s, scorer, txt);
        return { goal: true, text: txt };
      }
      this.ev('chance', M.side, miss, M.pid);
      return { goal: false, text: miss };
    }

    card(s, direct) {
      const f = this.onField(s);
      if (!f.length) return;
      const c = weighted(f, x => (x.pos === 'G' ? 0.1 : x.pos === 'Z' ? 1.4 : 1));
      this.bookPlayer(s, c.slot, direct);
    }

    bookPlayer(s, slot, direct) {
      const pid = s.lineup[slot];
      const name = this.p(pid).n;
      if (!direct) {
        s.yellow[pid] = (s.yellow[pid] || 0) + 1;
        if (s.yellow[pid] < 2) { this.ev('yellow', s.i, `Cartão amarelo para ${name}`, pid); return; }
        this.ev('red', s.i, `Segundo amarelo! ${name} é expulso`, pid);
      } else {
        this.ev('red', s.i, `Cartão vermelho direto para ${name}!`, pid);
      }
      s.sent.push({ pid, direct });
      s.lineup[slot] = null;
    }

    injury(s) {
      if (this.pending) return;
      const f = this.onField(s).filter(x => !s.hurt.has(x.pid));
      if (!f.length) return;
      const c = weighted(f, x => FB.injuryRisk(this.p(x.pid), s.en[x.pid], this.today));
      s.hurt.add(c.pid);
      this.ev('injury', s.i, `${this.p(c.pid).n} ${pick(HURT_TXT)}`, c.pid);
      if (!this.canSub(s)) {
        s.lineup[c.slot] = null;
        this.ev('sys', s.i, `Sem substituições: ${this.p(c.pid).n} deixa o campo e o time fica com um a menos`);
        return;
      }
      if (s.i === this.user) this.pending = { side: s.i, slot: c.slot, pid: c.pid };
      else this.aiSubSlot(s, c.slot);
    }

    // Preleção no intervalo (estilo Football Manager).
    teamTalk(sideIdx, kind) {
      const s = this.sides[sideIdx];
      const diff = s.goals - this.sides[1 - sideIdx].goals;
      let b;
      if (kind === 'cobrar') b = diff < 0 ? rf(0.02, 0.06) : diff > 0 ? rf(-0.04, 0.01) : rf(-0.01, 0.04);
      else if (kind === 'elogiar') b = diff > 0 ? rf(0.01, 0.04) : diff < 0 ? rf(-0.03, 0.01) : rf(0, 0.03);
      else b = rf(0, 0.02);
      s.boost = clamp(s.boost + b, 0.93, 1.1);
      const reac = b >= 0.03 ? 'Os jogadores voltam motivados!' : b >= 0 ? 'O time ouviu com atenção.' : 'O grupo não reagiu bem à conversa.';
      this.ev('talk', sideIdx, `Intervalo: ${reac}`);
      return b;
    }

    // Preleção antes do jogo: o efeito depende de quem é o favorito e do moral do grupo.
    preTalk(sideIdx, kind) {
      const s = this.sides[sideIdx];
      const st = this.state;
      const mine = FB.teamStrength(st, st.teams[s.tid]);
      const opp = FB.teamStrength(st, st.teams[this.sides[1 - sideIdx].tid]);
      const fav = mine - opp;
      const mo = st.teams[s.tid].squad.reduce((a, pid) => a + st.players[pid].mo, 0) / st.teams[s.tid].squad.length;
      let b;
      if (kind === 'motivar') b = fav < -3 ? rf(0.03, 0.06) : fav > 3 ? rf(0, 0.02) : rf(0.01, 0.04);
      else if (kind === 'cobrar') b = fav > 3 ? rf(0.02, 0.05) : fav < -3 ? rf(-0.03, 0.01) : rf(-0.01, 0.04);
      else if (kind === 'tranquilo') b = fav < -3 ? rf(0.01, 0.03) : mo < 45 ? rf(0.02, 0.04) : rf(0, 0.02);
      else if (kind === 'respeito') b = fav > 6 ? rf(0.02, 0.04) : rf(0, 0.02);
      else b = 0;
      if (mo < 40 && kind === 'cobrar') b -= 0.02;
      s.boost = clamp(s.boost + b, 0.93, 1.1);
      const reac = b >= 0.035 ? 'O vestiário pegou fogo: time ligado!' : b >= 0.01 ? 'O grupo entrou concentrado.' : b >= 0 ? 'Reação neutra à conversa.' : 'A conversa não caiu bem no elenco.';
      if (kind) this.ev('talk', sideIdx, `Preleção: ${reac}`);
      return b;
    }

    canSub(s) { return s.subs < FB.MAX_SUBS && s.bench.length > 0 && !this.done; }

    sub(sideIdx, slot, inPid) {
      const s = this.sides[sideIdx];
      const out = s.lineup[slot];
      if (out == null || !this.canSub(s) || !s.bench.includes(inPid)) return false;
      s.lineup[slot] = inPid;
      s.bench = s.bench.filter(x => x !== inPid);
      s.played.add(inPid);
      s.subs++;
      this.ev('sub', sideIdx, `Substituição: sai ${this.p(out).n}, entra ${this.p(inPid).n}`, inPid);
      if (this.pending && this.pending.side === sideIdx && this.pending.slot === slot) this.pending = null;
      return true;
    }

    bestBenchFor(s, slot) {
      const pos = FB.slotsOf(s.formation)[slot];
      let best = null, bv = -1;
      for (const pid of s.bench) {
        const v = FB.effective(this.p(pid), pos, s.en[pid]);
        if (v > bv) { bv = v; best = pid; }
      }
      return { pid: best, v: bv };
    }

    aiSubSlot(s, slot) {
      const b = this.canSub(s) ? this.bestBenchFor(s, slot) : { pid: null };
      if (b.pid != null) this.sub(s.i, slot, b.pid);
      else s.lineup[slot] = null;
    }

    aiThink(s) {
      const m = this.minute;
      if (m === 60 || m === 72 || m === 82) {
        const slots = FB.slotsOf(s.formation);
        const tired = s.lineup
          .map((pid, slot) => ({ pid, slot }))
          .filter(x => x.pid != null && slots[x.slot] !== 'G' && s.en[x.pid] < 62)
          .sort((a, b) => s.en[a.pid] - s.en[b.pid]);
        for (const t of tired.slice(0, 2)) {
          if (s.subs >= FB.MAX_SUBS - 1) break; // guarda uma troca para lesões
          const b = this.bestBenchFor(s, t.slot);
          if (b.pid != null && b.v > FB.effective(this.p(t.pid), slots[t.slot], s.en[t.pid]) * 1.02) this.sub(s.i, t.slot, b.pid);
        }
      }
      if (m === 70) {
        const mine = s.goals + (s.home ? this.comp.aggH || 0 : this.comp.aggA || 0);
        const theirs = this.sides[1 - s.i].goals + (s.home ? this.comp.aggA || 0 : this.comp.aggH || 0);
        if (mine < theirs) s.posture = 'ofensivo';
        else if (mine > theirs) s.posture = 'defensivo';
      }
    }

    finish() {
      if (this.done) return;
      const [h, a] = this.sides;
      if (this.comp.decisive && h.goals + (this.comp.aggH || 0) === a.goals + (this.comp.aggA || 0)) this.shootout();
      this.done = true;
      let txt = `Fim de jogo: ${h.goals} x ${a.goals}`;
      if (this.comp.decisive && this.comp.leg === 1) txt += ` (agregado ${h.goals + this.comp.aggH} x ${a.goals + this.comp.aggA})`;
      if (this.pens) txt += ` · pênaltis ${this.pens[0]} x ${this.pens[1]}`;
      this.ev('end', null, txt);
    }

    shootout() {
      const score = [0, 0];
      const kickers = this.sides.map(s => this.onField(s, false).map(x => x.pid).sort((a, b) => this.p(b).ovr - this.p(a).ovr));
      const gk = this.sides.map(s => (s.lineup[0] != null ? this.p(s.lineup[0]).ovr : 40));
      const kick = (i, k) => {
        const list = kickers[i].length ? kickers[i] : [null];
        const pid = list[k % list.length];
        const ovr = pid != null ? this.p(pid).ovr : 50;
        if (Math.random() < 0.75 + (ovr - gk[1 - i]) / 300) score[i]++;
      };
      for (let k = 0; k < 5; k++) { kick(0, k); kick(1, k); }
      let k = 5;
      while (score[0] === score[1]) { kick(0, k); kick(1, k); k++; }
      this.pens = score;
      this.ev('pens', score[0] > score[1] ? 0 : 1, `Disputa de pênaltis: ${score[0]} x ${score[1]}`);
    }

    // Simulação sem interface: lesões pendentes são resolvidas automaticamente.
    run() {
      while (!this.done) {
        if (this.moment) this.resolveMoment(this.moment.best);
        if (this.pending) {
          const pd = this.pending;
          this.pending = null;
          this.aiSubSlot(this.sides[pd.side], pd.slot);
        }
        this.step();
      }
    }

    // Quem venceu o jogo ou, num jogo decisivo de mata-mata, o confronto.
    winner() {
      const [h, a] = this.sides;
      if (this.comp.decisive) {
        const gh = h.goals + (this.comp.aggH || 0);
        const ga = a.goals + (this.comp.aggA || 0);
        if (gh !== ga) return gh > ga ? 0 : 1;
        if (this.pens) return this.pens[0] > this.pens[1] ? 0 : 1;
      }
      return this.matchWinner();
    }
    matchWinner() {
      const [h, a] = this.sides;
      return h.goals === a.goals ? -1 : h.goals > a.goals ? 0 : 1;
    }
  }
  FB.Match = Match;

  // ---------- Datas ----------

  // opts.manual: o usuário já montou o time na tela de pré-jogo (não aplica o rodízio automático).
  FB.startDate = (state, opts = {}) => {
    const fixtures = FB.dateFixtures(state);
    const notes = [];
    const matches = fixtures.map(f => {
      for (const tid of [f.h, f.a]) {
        const t = state.teams[tid];
        if (tid === state.userId) {
          const prio = (t.prio || {})[f.comp.key] || 'normal';
          if (t.rotation && t.rotation.auto && !opts.manual) {
            t.lineup = FB.bestLineup(state, t, f.comp.key, t.formation, { min: t.rotation.min || 65, rest: prio === 'poupar' });
            t.bench = FB.autoBench(state, t, t.lineup, f.comp.key);
          }
          for (const c of FB.fixLineup(state, t, f.comp.key)) {
            const p = state.players[c.out];
            notes.push(`${p.n} ${p.inj ? 'está lesionado' : 'está suspenso'}` + (c.in != null ? ` — entra ${state.players[c.in].n}` : ''));
          }
        } else FB.aiPrepare(state, t, f.h === tid ? f.a : f.h, f.comp.key);
      }
      return new Match(state, f.h, f.a, f.comp);
    });
    const suspended = [];
    for (const f of fixtures) {
      for (const tid of [f.h, f.a]) {
        for (const pid of state.teams[tid].squad) {
          if (state.players[pid].sus[f.comp.key] > 0) suspended.push({ pid, key: f.comp.key });
        }
      }
    }
    return { matches, userMatch: matches.find(m => m.user >= 0) || null, notes, suspended };
  };

  FB.aiPrepare = (state, team, oppId, key) => {
    const mine = FB.teamStrength(state, team);
    const o = state.teams[oppId];
    const opp = FB.teamStrength(state, o);
    team.posture = opp - mine > 5 ? 'defensivo' : mine - opp > 6 ? 'ofensivo' : 'equilibrado';
    team.line = team.posture === 'defensivo' ? 'baixa' : team.posture === 'ofensivo' ? 'alta' : 'media';
    team.focus = team.posture === 'defensivo' ? 'contra' : FB.FORMATIONS[o.formation].L === 0 ? 'lados' : pick(['misto', 'misto', 'lados', 'meio']);
    team.tempo = 'normal';
    team.passing = 'misto';
    // Quem joga para se defender se fecha numa linha de cinco (ou com cinco no meio) sem a bola.
    const f = FB.FORMATIONS[team.formation];
    team.formationDef = team.posture === 'defensivo' && f.A >= 2 ? (team.squad.filter(id => state.players[id].pos === 'Z').length >= 3 ? '5-4-1' : '4-5-1') : null;
    // Clubes grandes poupam titulares no começo dos estaduais.
    const comp = state.comps[key];
    const rest = comp && comp.kind === 'estadual' && team.div === 0 && comp.md < 4;
    team.lineup = FB.bestLineup(state, team, key, team.formation, { min: 60, rest });
  };

  // Dicas do auxiliar técnico para o próximo jogo.
  FB.scoutReport = (state, tid, oppId) => {
    const t = state.teams[tid], o = state.teams[oppId];
    const tips = [];
    const fo = FB.FORMATIONS[o.formation], f = FB.FORMATIONS[t.formation];
    const so = FB.teamStrength(state, o), st = FB.teamStrength(state, t);
    if (so - st > 4) tips.push('O adversário é mais forte. Linha recuada e contra-ataque costumam funcionar.');
    if (st - so > 4) tips.push('Somos favoritos. Pressão alta e ritmo acelerado podem decidir cedo.');
    if (fo.L === 0) tips.push(`Eles jogam no ${o.formation}, sem laterais: atacar pelos lados é uma boa saída.`);
    if (fo.M > f.M) tips.push(`O ${o.formation} deles tem mais gente no meio (${fo.M} x ${f.M}). Evite o foco pelo meio ou reforce o setor.`);
    if (fo.A >= 3) tips.push('Eles atacam com três: cuidado com a linha adiantada.');
    if (o.formationDef && o.formationDef !== o.formation) tips.push(`Sem a bola eles costumam se fechar no ${o.formationDef}. Paciência e jogo pelos lados ajudam a abrir a defesa.`);
    const tired = t.lineup.filter(id => id != null && state.players[id].en < 70).length;
    if (tired >= 3) tips.push(`${tired} titulares estão com menos de 70% de energia. Considere rodar o elenco ou usar ritmo cadenciado.`);
    const out = o.squad.map(id => state.players[id]).filter(p => p.inj && !p.inj.play).sort((a, b) => b.ovr - a.ovr);
    if (out.length) tips.push(`Desfalques deles: ${out.slice(0, 3).map(p => p.n).join(', ')}${out.length > 3 ? ' e outros' : ''}.`);
    const form = (o.form || []).slice(-5);
    if (form.length >= 3) {
      const w = form.filter(x => x === 'V').length;
      if (w >= 4) tips.push('O adversário vive grande fase.');
      else if (form.filter(x => x === 'D').length >= 3) tips.push('O adversário vem de resultados ruins.');
    }
    if (!tips.length) tips.push('Jogo equilibrado. Mantenha o plano e aproveite as oportunidades.');
    return tips;
  };

  FB.finishDate = (state, day) => {
    const { matches, suspended } = day;
    for (const m of matches) if (!m.done) m.run();
    for (const s of suspended) { const p = state.players[s.pid]; if (p) p.sus[s.key] = Math.max(0, p.sus[s.key] - 1); }
    for (const m of matches) FB.applyMatch(state, m);

    const date = state.dates[state.di];
    for (const { key, k } of date.slots) {
      const c = state.comps[key];
      if (!c.sched[k] || !c.phases[c.sched[k].ph]) continue;
      c.md = k + 1;
      const next = c.sched[k + 1];
      if (!next || next.ph !== c.sched[k].ph) FB.closePhase(state, c, c.sched[k].ph);
    }

    const um = matches.find(m => m.user >= 0);
    if (um) { FB.boardAfterMatch(state, um); FB.fanMail(state, um); state.lastMatch = FB.matchRecap(state, um, date.day); }
    FB.newsAfterDate(state, matches);

    const today = date.day;
    const nextDay = state.dates[state.di + 1] ? state.dates[state.di + 1].day : today + 7;
    FB.recover(state, today, nextDay);
    FB.medicalTick(state, today, nextDay);
    FB.monthly(state, today, nextDay);
    FB.marketTick(state);

    if (state.board.conf <= 0 && !state.fired) FB.fire(state);
    state.fin.last = state.fin.week;
    state.fin.week = {};
    state.di++;
    if (state.di >= state.dates.length) state.seasonOver = true;
    FB.save(state);
    return { matches, userMatch: um || null };
  };

  FB.applyMatch = (state, m) => {
    const [H, A] = m.sides;
    const win = m.matchWinner();
    const key = m.comp.key;
    const comp = state.comps[key];
    comp.stats.goals += H.goals + A.goals;
    comp.stats.games++;
    m.sides.forEach((s, i) => {
      const t = state.teams[s.tid];
      t.form.push(win === -1 ? 'E' : win === i ? 'V' : 'D');
      if (t.form.length > 12) t.form.shift();
      const conceded = m.sides[1 - i].goals;
      for (const pid of s.played) {
        const p = state.players[pid];
        if (!p) continue;
        p.j++;
        const goals = s.scorers.filter(x => x.pid === pid).length;
        let rt = 6.2 + goals * 0.9 + (win === i ? 0.4 : win === -1 ? 0 : -0.4) + rf(-0.6, 0.6);
        if ((p.pos === 'G' || p.pos === 'Z' || p.pos === 'L') && conceded === 0) rt += 0.6;
        if (p.pos === 'G' || p.pos === 'Z') rt -= conceded * 0.2;
        if (s.yellow[pid]) rt -= 0.2;
        if (s.sent.some(x => x.pid === pid)) rt -= 1.5;
        p.lastRt = Math.round(clamp(rt, 3, 10) * 10) / 10;
        p.rs = (p.rs || 0) + p.lastRt;
        p.en = Math.round(s.en[pid]);
        p.mo = clamp(p.mo + (win === -1 ? 1 : win === i ? 5 : -5), 10, 100);
        if (p.inj && p.inj.play && !s.hurt.has(pid)) FB.playedHurt(state, p);
      }
      for (const pid of t.squad) {
        const p = state.players[pid];
        if (!s.played.has(pid) && p.mo > 50) p.mo -= 1;
      }
      for (const sc of s.scorers) {
        const p = state.players[sc.pid];
        p.gl[key] = (p.gl[key] || 0) + 1;
        if (t.div <= 3 && (!state.youngest || p.age < state.youngest.age)) state.youngest = { pid: p.id, age: p.age, t: t.id };
      }
      for (const [pid, n] of Object.entries(s.yellow)) {
        const p = state.players[pid];
        if (n >= 2) continue;
        p.yc[key] = (p.yc[key] || 0) + 1;
        if (p.yc[key] >= 3) { p.yc[key] = 0; p.sus[key] = Math.max(p.sus[key] || 0, 1); }
      }
      for (const r of s.sent) {
        const p = state.players[r.pid];
        p.sus[key] = Math.max(p.sus[key] || 0, r.direct ? ri(1, 2) : 1);
      }
      for (const pid of s.hurt) {
        const p = state.players[pid];
        if (!p.inj || p.inj.play) FB.injure(state, p, FB.rollInjuryType(p));
      }
    });

    const c = m.comp;
    const P = comp.phases[c.ph];
    if (P.t === 'rr') P.groups[c.g].results[c.r][c.i] = { hg: H.goals, ag: A.goals };
    else {
      const tie = P.ties[c.ti];
      tie.res[c.leg] = { hg: H.goals, ag: A.goals };
      if (c.decisive) {
        tie.w = m.winner() === 0 ? H.tid : A.tid;
        tie.pens = m.pens ? (H.tid === tie.a ? m.pens : [m.pens[1], m.pens[0]]) : null;
      }
    }

    if (!c.neutral) FB.gate(state, H.tid, A.tid, c);
    if (m.user >= 0) {
      for (const r of m.sides[m.user].sent) {
        const p = state.players[r.pid];
        FB.msg(state, 'Suspensão', `${p.n} foi expulso e cumprirá ${p.sus[key]} jogo(s) de suspensão na ${comp.name}.`, { from: 'Auxiliar técnico' });
      }
    }
  };

  FB.TRAININGS = {
    equilibrado: { name: 'Equilibrado', desc: 'Recuperação e evolução normais.' },
    fisico: { name: 'Físico', desc: 'Recupera mais energia entre os jogos, com um pouco mais de risco de lesão.' },
    tecnico: { name: 'Técnico', desc: 'Os jogadores evoluem mais rápido, mas recuperam menos energia.' },
    tatico: { name: 'Tático', desc: 'Entrosamento: o time rende um pouco mais em campo.' },
    descanso: { name: 'Descanso', desc: 'Energia e moral sobem bastante, sem evolução e com menos lesões.' },
  };

  // Recuperação física e evolução entre uma data e a próxima.
  FB.recover = (state, today, nextDay) => {
    const gap = Math.max(1, nextDay - today);
    for (const t of state.teams) {
      const tr = t.id === state.userId ? (t.training || 'equilibrado') : 'equilibrado';
      const rec = { equilibrado: 9, fisico: 11, tecnico: 7, tatico: 8.5, descanso: 13 }[tr] * gap;
      const dev = { equilibrado: 1, fisico: 0.6, tecnico: 2.2, tatico: 0.8, descanso: 0 }[tr] * gap / 7;
      for (const pid of t.squad) {
        const p = state.players[pid];
        p.en = Math.min(100, Math.round(p.en + rec));
        if (tr === 'descanso') p.mo = Math.min(100, p.mo + 1);
        if (!p.inj && p.ovr < p.pot && p.age <= 27 && Math.random() < (p.age <= 21 ? 0.022 : 0.009) * dev) {
          p.ovr++;
          if (t.id === state.userId && p.ovr >= 60) FB.news(state, 'atualizacao', `${p.n} evolui nos treinos`, `${p.n} vem se destacando e agora tem força ${p.ovr}.`, { team: t.id });
        }
      }
    }
    for (const pid of state.free) state.players[pid].en = 100;
  };

  FB.attendance = (state, hId, aId, comp) => {
    const t = state.teams[hId];
    const opp = state.teams[aId];
    const ref = FB.econ(t).ticket;
    const form = (t.form || []).slice(-5);
    let occ = 0.6 + form.reduce((s, f) => s + (f === 'V' ? 0.03 : f === 'D' ? -0.03 : 0), 0);
    if (opp.country !== t.country || FB.teamStrength(state, opp) > FB.teamStrength(state, t) + 3) occ += 0.12;
    if (comp && comp.ko) occ += 0.08;
    if (comp && comp.final) occ += 0.25;
    occ *= Math.pow(ref / Math.max(1, t.ticket), 0.9);
    return Math.round(clamp(t.fans * occ * rf(0.92, 1.08), 300, t.cap));
  };

  FB.gate = (state, hId, aId, comp) => {
    const t = state.teams[hId];
    const att = FB.attendance(state, hId, aId, comp);
    FB.money(state, hId, att * t.ticket, 'bilheteria');
    const a = state.att[hId] || (state.att[hId] = { sum: 0, n: 0 });
    a.sum += att;
    a.n++;
    if (hId === state.userId) state.fin.lastGate = { att, cap: t.cap, income: att * t.ticket };
  };

  // Receitas e despesas mensais: lançadas a cada virada de mês entre duas datas.
  FB.monthly = (state, today, nextDay) => {
    const m0 = FB.dateOf(state, today).getMonth();
    const m1 = FB.dateOf(state, nextDay).getMonth() + (FB.dateOf(state, nextDay).getFullYear() > state.season ? 12 : 0);
    for (let m = m0 + 1; m <= m1; m++) {
      FB.boardMonthly(state, m - 1);
      for (const t of state.teams) {
        const ec = FB.econ(t);
        FB.money(state, t.id, ec.tv, 'tv');
        FB.money(state, t.id, Math.round(ec.sponsor * t.fans / 1000), 'patrocinio');
        FB.money(state, t.id, -FB.payroll(state, t), 'salarios');
        FB.money(state, t.id, -Math.round(t.cap * 8), 'manutencao');
      }
    }
  };

  // ---------- Diretoria ----------

  FB.setObjective = state => {
    const t = state.teams[state.userId];
    const key = FB.compKeyOf(t);
    if (!key || !state.comps[key]) { state.board.target = 1; state.board.text = 'Fazer boa campanha'; return; }
    const c = state.comps[key];
    const g = c.phases[0].groups.find(x => x.teams.includes(t.id));
    const ranked = g.teams.map(id => ({ id, s: FB.teamStrength(state, state.teams[id]) })).sort((a, b) => b.s - a.s);
    const exp = ranked.findIndex(x => x.id === t.id) + 1;
    let target, text;
    if (t.div === 5) {
      const n = g.teams.length;
      const cont = FB.confOf(t) === 'UEFA' ? 'Champions' : 'Libertadores';
      const q = (FB.confOf(t) === 'UEFA' ? QUOTAS.UCL : QUOTAS.LIB)[t.lg] || 2;
      target = exp === 1 ? 1 : exp <= q ? q : exp <= Math.round(n / 2) ? Math.round(n / 2) : n - 3;
      text = target === 1 ? `Ser campeão da ${c.short}` : target === q ? `Vaga na ${cont} (top ${q})`
        : target === Math.round(n / 2) ? 'Terminar na metade de cima' : `Não terminar entre os 3 últimos`;
    } else if (t.div === 0) {
      target = exp === 1 ? 1 : exp <= 4 ? 4 : exp <= 8 ? 6 : exp <= 12 ? 12 : 16;
      text = { 1: 'Ser campeão brasileiro', 4: 'Terminar no G4', 6: 'Vaga na Libertadores (G6)', 12: 'Vaga na Sul-Americana', 16: 'Evitar o rebaixamento' }[target];
    } else if (t.div === 1) {
      target = exp <= 6 ? 4 : exp <= 12 ? 10 : 16;
      text = { 4: 'Subir para a Série A (G4)', 10: 'Terminar na metade de cima', 16: 'Evitar o rebaixamento' }[target];
    } else if (t.div === 2) {
      target = exp <= 6 ? 8 : 16;
      text = target === 8 ? 'Classificar ao quadrangular de acesso (G8)' : 'Evitar o rebaixamento';
    } else {
      target = 4;
      text = 'Passar da fase de grupos (G4 do grupo)';
    }
    state.board.target = target;
    state.board.text = text;
  };

  FB.boardAfterMatch = (state, m) => {
    const c = state.comps[m.comp.key];
    if (c.kind !== 'liga' || state.fired) return;
    const u = m.user;
    const w = m.matchWinner();
    const mine = FB.teamStrength(state, state.teams[m.sides[u].tid]);
    const opp = FB.teamStrength(state, state.teams[m.sides[1 - u].tid]);
    const edge = clamp((mine - opp) / 4, -2, 2);
    let d = w === u ? 3 - edge * 0.5 : w === -1 ? -edge * 0.7 : -3 - edge;
    const st = FB.leagueStanding(state, state.userId);
    if (st && st.row.j >= 6) {
      if (st.pos > state.board.target + 3) d -= 1.5;
      if (st.pos <= state.board.target) d += 0.5;
    }
    state.board.conf = clamp(Math.round((state.board.conf + d) * 10) / 10, 0, 100);
  };

  FB.fire = state => {
    state.fired = true;
    state.contract = null;
    state.jobOffers = FB.jobOffers(state, false);
    const t = state.teams[state.userId];
    FB.msg(state, 'Você foi demitido', `A diretoria do ${t.name} perdeu a paciência e decidiu trocar o comando técnico.`, { from: 'Diretoria' });
    FB.news(state, 'noticia', `${t.name} demite ${state.coach}`, 'Pressionada pelos resultados, a diretoria anunciou a saída do treinador.', { team: t.id });
  };

  FB.jobOffers = (state, better) => {
    const cur = state.teams[state.userId];
    let pool;
    const str = t => FB.teamStrength(state, t);
    const playable = t => t.id !== cur.id && t.div !== 4 && FB.compKeyOf(t);
    if (better) {
      // Clubes um pouco mais fortes, de qualquer país.
      pool = state.teams.filter(t => playable(t) && str(t) > str(cur) + 1 && str(t) <= str(cur) + 8);
    } else {
      pool = state.teams.filter(t => playable(t) && str(t) <= str(cur) + 1);
      pool.sort((a, b) => str(a) - str(b));
      pool = pool.slice(Math.floor(pool.length / 3));
    }
    return shuffle(pool).slice(0, 3).map(t => t.id);
  };

  FB.takeJob = (state, tid) => {
    state.userId = tid;
    state.fired = false;
    state.jobOffers = null;
    state.board.conf = 55;
    const t = state.teams[tid];
    FB.fixLineup(state, t);
    FB.setObjective(state);
    FB.boardSetup(state);
    FB.newContract(state);
    FB.news(state, 'noticia', `${t.name} anuncia ${state.coach}`, `${state.coach} é o novo treinador do ${t.name}.`, { team: tid });
    FB.save(state);
  };

  FB.startCareer = (state, coach, teamId) => {
    state.coach = coach || 'Treinador';
    state.userId = teamId;
    const t = state.teams[teamId];
    t.formation = '4-4-2';
    t.lineup = FB.bestLineup(state, t);
    FB.setObjective(state);
    FB.msg(state, `Bem-vindo ao ${t.name}!`, `A diretoria apresentou ${state.coach} como novo treinador. Objetivo na ${FB.divName(t)}: ${state.board.text}.`, { from: 'Diretoria' });
    FB.boardSetup(state);
    FB.newContract(state);
    state.started = Date.now();
    FB.news(state, 'noticia', `${t.name} tem novo treinador`, `${state.coach} assume o ${t.name} para a temporada ${state.season}.`, { team: teamId });
    FB.news(state, 'atualizacao', `Começa a temporada ${state.season}`, 'Os estaduais abrem o calendário. A janela de transferências fica aberta até o início de abril.');
  };

  // ---------- Mensagens e dinheiro ----------

  FB.msg = (state, title, text, extra = {}) => {
    state.inbox.unshift({ id: state.nextMsg++, season: state.season, day: FB.today(state), title, text, ...extra });
    if (state.inbox.length > 50) state.inbox.length = 50;
  };

  FB.money = (state, tid, amount, key) => {
    state.teams[tid].cash += amount;
    if (tid === state.userId && key) {
      state.fin.week[key] = (state.fin.week[key] || 0) + amount;
      state.fin.season[key] = (state.fin.season[key] || 0) + amount;
    }
  };

  FB.scorers = (state, key, n = 15) =>
    Object.values(state.players)
      .filter(p => p.t != null && p.gl && p.gl[key] > 0)
      .sort((a, b) => b.gl[key] - a.gl[key] || a.j - b.j)
      .slice(0, n);

  // ---------- Mercado ----------

  FB.askPrice = (state, p) => {
    const t = state.teams[p.t];
    let k = FB.isKeyPlayer(state, p) ? 1.3 : 1.05;
    if (t.squad.length <= 20) k *= 1.5;
    if (p.sale) k *= 0.9;
    return Math.round(FB.calcValue(p) * k / 10000) * 10000;
  };

  FB.wageDemand = (state, p, toTid) => {
    const base = Math.max(p.sal, FB.calcSalary(p));
    const to = state.teams[toTid];
    const from = p.t != null ? state.teams[p.t] : null;
    const k = from && FB.econ(to).tv < FB.econ(from).tv * 0.7 ? 1.35 : 1.1;
    return Math.round(base * k / 1000) * 1000;
  };

  FB.transfer = (state, pid, toTid, fee, sal) => {
    const p = state.players[pid];
    const from = p.t;
    if (from != null) {
      const t = state.teams[from];
      t.squad = t.squad.filter(x => x !== pid);
      t.lineup = t.lineup.map(x => (x === pid ? null : x));
      FB.money(state, from, fee, 'vendas');
    } else {
      state.free = state.free.filter(x => x !== pid);
    }
    FB.money(state, toTid, -fee, 'compras');
    state.teams[toTid].squad.push(pid);
    p.t = toTid;
    p.sale = false;
    p.sal = sal ?? p.sal;
    p.mo = clamp(p.mo + 10, 10, 100);
  };

  // Proposta do usuário por um jogador de outro clube (ou livre).
  FB.offer = (state, pid, amount) => {
    const p = state.players[pid];
    const me = state.teams[state.userId];
    const sal = FB.wageDemand(state, p, me.id);
    if (p.loan) return { ok: false, msg: `${p.n} está emprestado e não pode ser negociado.` };
    if (me.squad.length >= FB.MAX_SQUAD) return { ok: false, msg: `Seu elenco já tem ${FB.MAX_SQUAD} jogadores.` };
    if (p.t == null) {
      const bonus = sal * 2;
      if (me.cash < bonus) return { ok: false, msg: 'Caixa insuficiente para as luvas.' };
      const ap = FB.boardApproves(state, bonus, sal);
      if (!ap.ok) return ap;
      FB.transfer(state, pid, me.id, 0, sal);
      FB.money(state, me.id, -bonus, 'compras');
      FB.boardSpend(state, bonus);
      FB.msg(state, 'Contratação', `${p.n} assinou com o clube. Luvas: ${FB.fmtMoney(bonus)}.`, { from: 'Mercado' });
      FB.news(state, 'mercado', `${me.name} contrata ${p.n}`, `O ${me.name} acertou com ${p.n}, que estava sem clube.`, { team: me.id });
      return { ok: true };
    }
    if (!FB.windowOpen(state)) return { ok: false, msg: `Janela de transferências fechada. ${FB.windowText(state)}.` };
    const seller = state.teams[p.t];
    if (amount > me.cash) return { ok: false, msg: 'Caixa insuficiente.' };
    if (seller.squad.length <= FB.MIN_SQUAD) return { ok: false, msg: `${seller.name} não vende: elenco curto.` };
    const ap = FB.boardApproves(state, amount, sal);
    if (!ap.ok) return ap;
    const ask = FB.askPrice(state, p);
    const ratio = amount / ask;
    if (ratio >= 1 || (ratio >= 0.9 && Math.random() < 0.4)) {
      FB.transfer(state, pid, me.id, amount, sal);
      FB.boardSpend(state, amount);
      FB.msg(state, 'Contratação', `${p.n} chegou do ${seller.name} por ${FB.fmtMoney(amount)}.`, { from: 'Mercado' });
      FB.news(state, 'mercado', `Fechado: ${p.n} no ${me.name}`, `O ${me.name} pagou ${FB.fmtMoney(amount)} ao ${seller.name} por ${p.n}.`, { team: me.id });
      return { ok: true };
    }
    return { ok: false, counter: ask, msg: `${seller.name} recusou. Pedem ${FB.fmtMoney(ask)}.` };
  };

  FB.release = (state, pid) => {
    const p = state.players[pid];
    const me = state.teams[state.userId];
    if (p.loan) return { ok: false, msg: 'Jogador emprestado: use "Devolver" na ficha dele.' };
    if (me.squad.length <= FB.MIN_SQUAD) return { ok: false, msg: `Mínimo de ${FB.MIN_SQUAD} jogadores no elenco.` };
    const fine = p.sal * 3;
    me.squad = me.squad.filter(x => x !== pid);
    me.lineup = me.lineup.map(x => (x === pid ? null : x));
    FB.money(state, me.id, -fine, 'salarios');
    p.t = null;
    p.sale = false;
    state.free.push(pid);
    FB.msg(state, 'Dispensa', `${p.n} foi dispensado. Multa rescisória: ${FB.fmtMoney(fine)}.`, { from: 'Mercado' });
    return { ok: true };
  };

  FB.answerOffer = (state, msgId, accept) => {
    const m = state.inbox.find(x => x.id === msgId);
    if (!m || !m.offer || m.offer.done) return { ok: false, msg: 'Proposta expirada.' };
    const p = state.players[m.offer.pid];
    const buyer = state.teams[m.offer.from];
    m.offer.done = true;
    if (!accept) { m.offer.result = 'Recusada'; p.mo = clamp(p.mo - 3, 10, 100); return { ok: true }; }
    const me = state.teams[state.userId];
    if (p.t !== me.id) { m.offer.result = 'Indisponível'; return { ok: false, msg: 'Jogador não está mais no clube.' }; }
    if (me.squad.length <= FB.MIN_SQUAD) { m.offer.done = false; return { ok: false, msg: `Mínimo de ${FB.MIN_SQUAD} jogadores no elenco.` }; }
    if (buyer.cash < m.offer.amount) { m.offer.result = 'Cancelada'; return { ok: false, msg: `${buyer.name} não tem mais dinheiro.` }; }
    FB.transfer(state, p.id, buyer.id, m.offer.amount, FB.wageDemand(state, p, buyer.id));
    FB.boardSale(state, m.offer.amount);
    m.offer.result = 'Aceita';
    FB.news(state, 'mercado', `${p.n} deixa o ${me.name}`, `${p.n} foi vendido ao ${buyer.name} por ${FB.fmtMoney(m.offer.amount)}.`, { team: buyer.id });
    return { ok: true };
  };

  // Compra feita por um clube da IA, respeitando uma reserva de caixa.
  FB.aiBuy = (state, t, target) => {
    const reserve = FB.econ(t).reserve;
    const budget = t.cash - reserve;
    if (budget <= 0 || t.squad.length >= FB.MAX_SQUAD - 2) return false;
    let p = target;
    if (!p) {
      const mine = t.squad.map(id => state.players[id]).sort((a, b) => b.ovr - a.ovr);
      const bar = mine[10] ? mine[10].ovr : 0;
      const cands = Object.values(state.players).filter(x => x.t != null && x.t !== t.id && x.t !== state.userId &&
        x.ovr > bar + 1 && x.ovr <= bar + 9 && x.age <= 30 && !x.inj && !x.loan && state.teams[x.t].squad.length > 22);
      if (!cands.length) return false;
      p = pick(cands);
    }
    if (p.t == null || p.loan || p.t === state.userId || p.t === t.id || state.teams[p.t].squad.length <= 22) return false;
    const fee = FB.askPrice(state, p);
    if (fee > budget) return false;
    const from = state.teams[p.t];
    FB.transfer(state, p.id, t.id, fee, FB.wageDemand(state, p, t.id));
    if (t.div <= 1 || from.div <= 1 || fee >= 6e7) {
      FB.news(state, 'mercado', `Fechado: ${p.n} no ${t.name}`, `O ${t.name} acertou a contratação de ${p.n}, ex-${from.name}, por ${FB.fmtMoney(fee)}.`, { team: t.id });
    }
    if (t.squad.length > 30) {
      const worst = t.squad.map(id => state.players[id]).sort((a, b) => a.ovr - b.ovr)[0];
      t.squad = t.squad.filter(x => x !== worst.id);
      t.lineup = t.lineup.map(x => (x === worst.id ? null : x));
      worst.t = null;
      state.free.push(worst.id);
    }
    return true;
  };

  FB.marketTick = state => {
    const me = state.teams[state.userId];
    for (const m of state.inbox) {
      if (m.offer && !m.offer.done && FB.today(state) - m.day >= 7) { m.offer.done = true; m.offer.result = 'Expirada'; }
    }
    if (FB.windowOpen(state)) {
      const buyers = state.teams.filter(t => t.id !== me.id && t.div !== 4 && t.squad.length < FB.MAX_SQUAD - 2);
      const mkOffer = (p, k) => {
        const amount = Math.round(FB.calcValue(p) * k / 10000) * 10000;
        const cands = buyers.filter(t => t.cash > amount * 1.5 && t.base >= p.ovr - 10);
        if (!cands.length) return;
        const b = pick(cands);
        FB.msg(state, `Proposta por ${p.n}`, `O ${b.name} oferece ${FB.fmtMoney(amount)} por ${p.n} (${FB.POS_NAME[p.pos]}, ${p.ovr}).`,
          { from: 'Mercado', offer: { pid: p.id, from: b.id, amount, done: false } });
      };
      const pending = new Set(state.inbox.filter(m => m.offer && !m.offer.done).map(m => m.offer.pid));
      for (const pid of me.squad) {
        const p = state.players[pid];
        if (p.sale && !p.loan && !pending.has(pid) && Math.random() < 0.35) mkOffer(p, rf(0.75, 1.15));
      }
      if (Math.random() < 0.08) {
        const cands = me.squad.map(id => state.players[id]).filter(p => !p.sale && !p.loan && !pending.has(p.id) && p.ovr >= me.base);
        if (cands.length) mkOffer(pick(cands), rf(1.1, 1.5));
      }
      for (const r of (state.rumors || []).slice()) {
        if (Math.random() < 0.12) {
          state.rumors = state.rumors.filter(x => x !== r);
          const p = state.players[r.pid];
          if (p && p.t != null && p.t !== r.to) FB.aiBuy(state, state.teams[r.to], p);
        }
      }
      // Clubes com caixa sobrando têm mais chance de ir ao mercado.
      const rich = state.teams.filter(t => t.id !== me.id && t.div !== 4 && t.cash > FB.econ(t).reserve * 2);
      for (const t of shuffle(rich).slice(0, 8)) FB.aiBuy(state, t);
    }
    for (const t of state.teams) {
      if (t.id === me.id || t.squad.length >= (t.div === 4 ? 16 : FB.MIN_SQUAD + 2) || !state.free.length) continue;
      const pid = pick(state.free);
      FB.transfer(state, pid, t.id, 0, FB.calcSalary(state.players[pid]));
    }
  };

  FB.setTicket = (state, v) => { state.teams[state.userId].ticket = clamp(Math.round(v), 5, 400); };

  FB.expandStadium = state => {
    const t = state.teams[state.userId];
    const cost = 5000 * FB.SEAT_COST;
    if (t.cash < cost) return { ok: false, msg: 'Caixa insuficiente para a obra.' };
    FB.money(state, t.id, -cost, 'obras');
    t.cap += 5000;
    FB.msg(state, 'Estádio ampliado', `O estádio agora comporta ${t.cap.toLocaleString('pt-BR')} torcedores.`, { from: 'Diretoria' });
    return { ok: true };
  };

  FB.SCOUT_COST = 30000;
  FB.scout = (state, pid) => {
    const p = state.players[pid];
    const me = state.teams[state.userId];
    if (p.sc) return { ok: true };
    if (me.cash < FB.SCOUT_COST) return { ok: false, msg: 'Caixa insuficiente para enviar o olheiro.' };
    FB.money(state, me.id, -FB.SCOUT_COST, 'olheiros');
    p.sc = true;
    return { ok: true };
  };
  FB.knowsPot = (state, p) => p.sc || p.t === state.userId;

  // Relatório do olheiro: compara o jogador com o time titular do usuário e com o preço.
  FB.scoutVerdict = (state, p) => {
    const me = state.teams[state.userId];
    const xi = me.squad.map(id => state.players[id]).filter(x => x.pos === p.pos).sort((a, b) => b.ovr - a.ovr);
    const need = { G: 1, Z: 2, L: 2, M: 3, A: 2 }[p.pos];
    const bar = xi[need - 1] ? xi[need - 1].ovr : 0;
    const lines = [];
    if (p.ovr >= bar + 3) lines.push(`Seria titular: supera os ${FB.POS_NAME[p.pos].toLowerCase()}s do elenco (referência ${bar}).`);
    else if (p.ovr >= bar - 2) lines.push('Brigaria por posição com os titulares.');
    else lines.push('Hoje seria reserva no seu time.');
    if (p.age <= 21 && p.pot - p.ovr >= 8) lines.push(`Jovem com margem grande de evolução (potencial ${p.pot}).`);
    else if (p.age >= 31) lines.push('Veterano: tende a cair de rendimento nas próximas temporadas.');
    const price = FB.calcValue(p);
    const worth = p.ovr >= bar + 3 || (p.age <= 21 && p.pot >= bar + 5);
    const grade = worth && price <= FB.budgetLeft(state) ? 'Contratar' : worth ? 'Bom, mas caro' : p.ovr >= bar - 2 ? 'Opção de elenco' : 'Não recomendado';
    return { grade, lines };
  };

  // Lista de observação.
  FB.toggleWatch = (state, pid) => {
    state.watch = state.watch || [];
    const on = !state.watch.includes(pid);
    state.watch = on ? [...state.watch, pid] : state.watch.filter(x => x !== pid);
    return on;
  };

  // Busca de talentos: o olheiro procura pelos critérios e traz os melhores, já observados.
  FB.SEARCH_COST = 80000;
  FB.scoutSearch = (state, { pos, maxAge, young }) => {
    const me = state.teams[state.userId];
    if (me.cash < FB.SEARCH_COST) return { ok: false, msg: 'Caixa insuficiente para a busca do olheiro.' };
    FB.money(state, me.id, -FB.SEARCH_COST, 'olheiros');
    const pool = Object.values(state.players).filter(p => p.t !== me.id && !p.loan && (!pos || p.pos === pos) && p.age <= (maxAge || 40) &&
      (p.t == null || state.teams[p.t].div !== 4 || p.ovr >= 60));
    const score = p => (young ? p.pot * 1.2 + p.ovr * 0.3 : p.ovr + p.pot * 0.15) - FB.calcValue(p) / Math.max(1, me.cash) * 6;
    const found = pool.sort((a, b) => score(b) - score(a)).slice(0, 6);
    for (const p of found) { p.sc = true; if (!(state.watch || []).includes(p.id)) FB.toggleWatch(state, p.id); }
    const lines = found.map(p => `• ${p.n} (${FB.POS_NAME[p.pos]}, ${p.age} anos) · ${p.t != null ? state.teams[p.t].name : 'sem clube'} · força ${p.ovr}, potencial ${p.pot}`);
    FB.msg(state, 'Relatório do olheiro', `Encontrei estes nomes e coloquei na sua lista de observação:\n${lines.join('\n')}`, { from: 'Olheiro' });
    return { ok: true, found };
  };

  // ---------- Empréstimos ----------
  // Emprestado, o jogador vai para o elenco do outro clube até o fim da temporada.
  // Quem fica com ele paga o salário combinado (loan.pay); na volta, o salário original é restaurado.

  FB.MAX_LOANS = 5;
  const moveTo = (state, p, tid) => {
    const from = state.teams[p.t];
    from.squad = from.squad.filter(x => x !== p.id);
    from.lineup = from.lineup.map(x => (x === p.id ? null : x));
    if (from.bench) from.bench = from.bench.filter(x => x !== p.id);
    state.teams[tid].squad.push(p.id);
    p.t = tid;
    p.sale = false;
  };

  // Condições para pegar emprestado: titulares do outro clube não são emprestados.
  FB.loanTerms = (state, p) => {
    if (p.t == null || p.t === state.userId || p.loan) return null;
    const owner = state.teams[p.t];
    if (owner.div === 4 && p.ovr >= 62) return null;
    if (FB.isKeyPlayer(state, p) && p.age > 21) return null;
    if (owner.squad.length <= FB.MIN_SQUAD + 2) return null;
    const share = p.age <= 21 ? 0.5 : 0.8; // o clube dono ajuda a pagar o salário
    return { fee: Math.round(FB.calcValue(p) * 0.04 / 10000) * 10000, pay: Math.round(p.sal * share / 1000) * 1000, share };
  };

  FB.loanIn = (state, pid) => {
    const p = state.players[pid];
    const me = state.teams[state.userId];
    const terms = FB.loanTerms(state, p);
    if (!terms) return { ok: false, msg: `O ${p.t != null ? state.teams[p.t].name : 'clube'} não empresta ${p.n}.` };
    if (!FB.windowOpen(state)) return { ok: false, msg: `Janela fechada. ${FB.windowText(state)}.` };
    if (me.squad.length >= FB.MAX_SQUAD) return { ok: false, msg: `Seu elenco já tem ${FB.MAX_SQUAD} jogadores.` };
    if (me.squad.filter(id => state.players[id].loan).length >= FB.MAX_LOANS) return { ok: false, msg: `Limite de ${FB.MAX_LOANS} emprestados no elenco.` };
    if (me.cash < terms.fee) return { ok: false, msg: 'Caixa insuficiente para a taxa de empréstimo.' };
    const ap = FB.boardApproves(state, terms.fee, terms.pay);
    if (!ap.ok) return ap;
    const owner = state.teams[p.t];
    FB.money(state, me.id, -terms.fee, 'compras');
    FB.money(state, owner.id, terms.fee, 'vendas');
    FB.boardSpend(state, terms.fee);
    p.loan = { from: owner.id, to: me.id, until: state.season, sal: p.sal };
    p.sal = terms.pay;
    moveTo(state, p, me.id);
    p.mo = clamp(p.mo + 8, 10, 100);
    FB.msg(state, 'Empréstimo fechado', `${p.n} chega emprestado pelo ${owner.name} até o fim de ${state.season}. Salário: ${FB.fmtMoney(terms.pay)}/mês.`, { from: 'Mercado' });
    FB.news(state, 'mercado', `${me.name} acerta empréstimo de ${p.n}`, `${p.n}, do ${owner.name}, vai defender o ${me.name} até o fim da temporada.`, { team: me.id });
    return { ok: true };
  };

  // Clubes interessados num jogador do usuário: de divisão igual ou menor e com vaga no elenco.
  FB.loanSuitors = (state, pid) => {
    const p = state.players[pid];
    const me = state.teams[state.userId];
    const cands = state.teams.filter(t => t.id !== me.id && t.div !== 4 && FB.compKeyOf(t) && t.squad.length < FB.MAX_SQUAD - 4 &&
      FB.teamStrength(state, t) <= Math.min(p.ovr + 6, FB.teamStrength(state, me)));
    return shuffle(cands).slice(0, 3).map(t => t.id);
  };

  FB.loanOut = (state, pid, tid) => {
    const p = state.players[pid];
    const me = state.teams[state.userId];
    if (p.t !== me.id || p.loan) return { ok: false, msg: 'Jogador indisponível para empréstimo.' };
    if (!FB.windowOpen(state)) return { ok: false, msg: `Janela fechada. ${FB.windowText(state)}.` };
    if (me.squad.length <= FB.MIN_SQUAD) return { ok: false, msg: `Mínimo de ${FB.MIN_SQUAD} jogadores no elenco.` };
    const to = state.teams[tid];
    p.loan = { from: me.id, to: tid, until: state.season, sal: p.sal };
    moveTo(state, p, tid); // o clube que recebe paga o salário integral
    FB.msg(state, 'Jogador emprestado', `${p.n} foi emprestado ao ${to.name} até o fim de ${state.season}. O salário fica por conta deles.`, { from: 'Mercado' });
    return { ok: true };
  };

  // Devolve antes do prazo um jogador que o usuário pegou emprestado.
  FB.loanReturn = (state, pid) => {
    const p = state.players[pid];
    if (!p.loan || p.loan.to !== state.userId) return { ok: false, msg: 'Jogador não está emprestado ao seu clube.' };
    const back = state.teams[p.loan.from];
    p.sal = p.loan.sal;
    moveTo(state, p, back.id);
    p.loan = null;
    return { ok: true, msg: `${p.n} voltou ao ${back.name}.` };
  };

  // Na virada da temporada, todos os emprestados voltam aos seus clubes.
  FB.endLoans = state => {
    const back = [];
    for (const p of Object.values(state.players)) {
      if (!p.loan) continue;
      const { from, to } = p.loan;
      p.sal = p.loan.sal;
      if (p.t === to && state.teams[from]) moveTo(state, p, from);
      if (from === state.userId || to === state.userId) back.push(p.n);
      p.loan = null;
    }
    return back;
  };
  FB.potLabel = pot => (pot >= 85 ? 'Craque' : pot >= 75 ? 'Muito alto' : pot >= 66 ? 'Alto' : pot >= 57 ? 'Médio' : 'Baixo');
  FB.avgRating = p => (p.j ? (p.rs || 0) / p.j : null);

  // ---------- Fim de temporada ----------

  FB.endSeason = state => {
    const T = state.teams;
    const user = T[state.userId];
    const C = state.comps;
    const st = FB.leagueStanding(state, user.id);
    const summary = {
      season: state.season, userPos: st ? st.pos : null, userDiv: user.div, userDivName: FB.divName(user), target: state.board.target, objective: state.board.text,
      champions: Object.values(C).filter(c => c.champion != null && (c.kind !== 'estadual' || c.teams.includes(user.id)))
        .map(c => ({ key: c.key, comp: c.name, tid: c.champion })),
      up: [], down: [], offers: [], retired: [], youth: [], prize: 0,
    };

    // Premiação das ligas (Série D só recebe por fase).
    ['A', 'B', 'C'].forEach((key, d) => {
      const rows = FB.groupTable(state, C[key].phases[0].groups[0]);
      rows.forEach((r, i) => {
        const prize = Math.round(FB.LEAGUE_PRIZE[d] * (1 - (i / rows.length) * 0.9) / 10000) * 10000;
        FB.money(state, r.id, prize, 'premios');
        if (r.id === user.id) summary.prize = prize;
      });
    });

    for (const c of Object.values(C)) {
      if (!c.key.startsWith('L-') || !FB.LEAGUES[c.country]) continue;
      const rows = FB.groupTable(state, c.phases[0].groups[0]);
      rows.forEach((r, i) => {
        const prize = Math.round(FB.LEAGUES[c.country].econ.prize / rows.length * 2 * (1 - (i / rows.length) * 0.9) / 10000) * 10000;
        FB.money(state, r.id, prize, 'premios');
        if (r.id === user.id) summary.prize = prize;
      });
    }

    // Acesso e rebaixamento
    const tA = FB.groupTable(state, C.A.phases[0].groups[0]).map(r => r.id);
    const tB = FB.groupTable(state, C.B.phases[0].groups[0]).map(r => r.id);
    const moves = [
      [tA.slice(-4), 1], [tB.slice(0, 4), 0], [tB.slice(-4), 2],
      [C.C.promoted || [], 1], [C.C.relegated || [], 3], [C.D.promoted || [], 2],
    ];
    for (const [ids, div] of moves) {
      for (const id of ids) {
        const from = T[id].div;
        if (div < from) summary.up.push(id); else summary.down.push(id);
        T[id].div = div;
        T[id].base += div < from ? 1.5 : -1.5;
        T[id].ticket = FB.econ(T[id]).ticket;
      }
    }

    // Vagas continentais e Supercopa
    const cbChamp = C.CB.champion;
    const lib = tA.slice(0, 6);
    lib.push(cbChamp != null && !lib.includes(cbChamp) ? cbChamp : tA[6]);
    const sul = tA.filter(id => !lib.includes(id)).slice(0, 6);
    state.qual = { LIB: lib, SUL: sul, SUP: [tA[0], cbChamp != null && cbChamp !== tA[0] ? cbChamp : tA[1]], ...FB.foreignQualifiers(state, true) };

    // Diretoria
    if (st && !state.fired) {
      const met = st.pos <= state.board.target;
      summary.met = met;
      summary.goals = FB.boardSeasonEnd(state, met);
      state.board.conf = clamp(state.board.conf + (met ? 25 : -(st.pos - state.board.target) * 5), 0, 100);
      if (state.board.conf <= 0) { summary.fired = true; FB.fire(state); }
      else if (met && Math.random() < 0.7) summary.offers = FB.jobOffers(state, true).slice(0, 2);
    }

    state.history.unshift({ season: state.season, team: user.id, div: summary.userDiv, lgName: summary.userDivName, pos: summary.userPos, titles: summary.champions.filter(c => c.tid === user.id).map(c => c.comp) });

    summary.loans = FB.endLoans(state);
    FB.developPlayers(state, summary);
    for (const t of shuffle(T.filter(t => t.id !== state.userId && t.div !== 4))) for (let k = 0; k < 3; k++) FB.aiBuy(state, t);

    state.season++;
    state.seasonOver = false;
    FB.refreshFreeAgents(state);
    FB.setupSeason(state);
    for (const t of T) {
      if (t.id !== state.userId) t.lineup = FB.bestLineup(state, t);
      else FB.fixLineup(state, t);
    }
    if (!state.fired) { FB.setObjective(state); FB.renewContract(state); }
    state.lastSummary = summary;
    state.lastMatch = null;
    if (state.fired) FB.msg(state, `Temporada ${state.season}`, 'Procure um novo clube para continuar.', { from: 'Diretoria' });
    else FB.boardSetup(state);
    FB.news(state, 'atualizacao', `Começa a temporada ${state.season}`, 'Os estaduais abrem o calendário. A janela de transferências fica aberta até o início de abril.');
    FB.save(state);
    return summary;
  };

  FB.developPlayers = (state, summary) => {
    for (const p of Object.values(state.players)) {
      p.age++;
      let d;
      if (p.age <= 21) d = ri(1, 5);
      else if (p.age <= 24) d = ri(0, 3);
      else if (p.age <= 28) d = ri(-1, 2);
      else if (p.age <= 31) d = ri(-3, 1);
      else d = ri(-6, -1);
      if (d > 0) d = p.ovr >= p.pot ? (Math.random() < 0.2 ? 1 : 0) : Math.min(d, p.pot - p.ovr);
      if (p.j >= 25 && p.age <= 23) d++;
      p.ovr = clamp(p.ovr + d, 30, 95);
      p.pot = Math.max(p.pot, p.ovr);
      p.gl = {}; p.j = 0; p.rs = 0; p.lastRt = null; p.yc = {}; p.sus = {}; p.en = 100; p.mo = 60;
      // Lesões atravessam a virada do ano: o prazo é contado no calendário novo.
      if (p.inj) { const left = Math.max(1, p.inj.until - 365); p.inj.start = 1; p.inj.until = left; }
      p.frag = null;
      if (p.t != null && p.sal < FB.calcSalary(p) * 0.7) p.sal = FB.calcSalary(p);
    }
    for (const p of Object.values(state.players)) {
      if (p.age < 34) continue;
      if (p.age >= 39 || Math.random() < 0.2 + (p.age - 34) * 0.22) {
        if (p.t === state.userId) summary.retired.push(p.n);
        if (p.t != null) {
          const t = state.teams[p.t];
          t.squad = t.squad.filter(x => x !== p.id);
          t.lineup = t.lineup.map(x => (x === p.id ? null : x));
        }
        state.free = state.free.filter(x => x !== p.id);
        delete state.players[p.id];
      }
    }
    for (const t of state.teams) {
      const small = t.div === 4;
      if (t.id === state.userId) {
        for (let k = 0; k < 2 && t.squad.length < FB.MAX_SQUAD; k++) summary.youth.push(FB.youth(state, t, pick(FB.POS.filter(x => x !== 'G'))).n);
        while (t.squad.length < FB.MIN_SQUAD) FB.youth(state, t, FB.neededPos(state, t));
        continue;
      }
      while (t.squad.length < (small ? 18 : 24)) FB.youth(state, t, FB.neededPos(state, t));
      while (t.squad.length > (small ? 22 : 30)) {
        const worst = t.squad.map(id => state.players[id]).sort((a, b) => a.ovr - b.ovr)[0];
        t.squad = t.squad.filter(x => x !== worst.id);
        worst.t = null;
        state.free.push(worst.id);
      }
    }
  };

  FB.neededPos = (state, t) => {
    const count = { G: 0, Z: 0, L: 0, M: 0, A: 0 };
    for (const id of t.squad) count[state.players[id].pos]++;
    return FB.POS.slice().sort((a, b) => count[a] / FB.SQUAD_TEMPLATE[a] - count[b] / FB.SQUAD_TEMPLATE[b])[0];
  };

  FB.youth = (state, t, pos) => {
    const p = FB.createPlayer(state, pos, t.base - 9, { age: ri(17, 19), team: t });
    p.pot = clamp(p.ovr + ri(8, 25), p.ovr, 95);
    p.sal = FB.calcSalary(p);
    p.t = t.id;
    t.squad.push(p.id);
    return p;
  };

  // Completa saves antigos com os campos novos.
  // Campos de jogador com valor padrão não vão para o save (o mundo tem mais de 10 mil jogadores) e voltam ao carregar.
  const P_DEFAULTS = { j: 0, rs: 0, inj: null, frag: null, sale: false, sc: false, lastRt: null };
  const P_OBJS = ['gl', 'yc', 'sus'];
  FB.slim = function (k, v) {
    if (this && this.pos && this.n !== undefined) {
      if (k in P_DEFAULTS && v === P_DEFAULTS[k]) return undefined;
      if (P_OBJS.includes(k) && v && typeof v === 'object' && !Object.keys(v).length) return undefined;
    }
    return v;
  };
  const restorePlayers = state => {
    for (const p of Object.values(state.players || {})) {
      for (const k in P_DEFAULTS) if (p[k] === undefined) p[k] = P_DEFAULTS[k];
      for (const k of P_OBJS) if (!p[k]) p[k] = {};
    }
  };

  FB.migrate = state => {
    if (!state) return state;
    restorePlayers(state);
    for (const m of state.inbox || []) if (!m.from) m.from = m.offer ? 'Mercado' : m.injury ? 'Departamento médico' : 'Clube';
    if (state.userId != null && !state.board.goals && !state.fired) FB.boardSetup(state, true);
    if (state.userId != null && !state.contract && !state.fired) FB.newContract(state);
    if (!state.world && state.teams) FB.addWorld(state);
    return state;
  };

  // Saves anteriores às ligas do mundo: os estrangeiros que já existem ganham liga e entram os clubes que faltam.
  // As ligas novas começam a ser disputadas na temporada seguinte.
  FB.addWorld = state => {
    const fict = state.pack === 'ficticio';
    const used = new Set();
    for (const L of FB.PACK_MUNDO.leagues) {
      for (const line of L.teams) {
        const c = FB.parseLine(line);
        const ex = state.teams.find(t => t.div === 5 && t.country === L.key && !used.has(t.id) &&
          (t.short === c.short || (t.keys || []).includes(FB.norm(c.name)) || (fict && t.city === c.city)));
        if (ex) { used.add(ex.id); ex.lg = L.key; ex.ticket = L.econ.ticket; continue; }
        const t = FB.addTeam(state, c, 5, fict, L.key);
        used.add(t.id);
        FB.makeSquad(state, t);
      }
    }
    for (const t of state.teams) if (t.div === 5 && !t.lg && FB.LEAGUES[t.country]) t.lg = t.country;
    state.world = 1;
  };

  // ---------- Persistência ----------
  // Até 3 carreiras. Cada save vai para o IndexedDB e, comprimido, para uma cópia reserva no localStorage:
  // no iPhone o Safari às vezes derruba a conexão do IndexedDB quando o app vai para segundo plano.
  // Ao abrir, vale a cópia mais recente. O resumo de cada carreira também fica no localStorage.

  FB.MAX_SLOTS = 3;
  FB.slot = null;
  const META_KEY = 'prancheta.slots';
  const BAK_KEY = n => 'prancheta.bak.' + n;
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  const lsDel = k => { try { localStorage.removeItem(k); } catch (e) { /* ignora */ } };

  // Uma operação travada não pode segurar o jogo: desiste depois de alguns segundos.
  const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('tempo esgotado')), ms))]);

  let dbP = null;
  const db = () => dbP || (dbP = timeout(new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') { rej(new Error('IndexedDB indisponível')); return; }
    const r = indexedDB.open('prancheta', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('saves');
    r.onsuccess = () => {
      const d = r.result;
      d.onclose = () => { dbP = null; };
      d.onversionchange = () => { d.close(); dbP = null; };
      res(d);
    };
    r.onerror = () => rej(r.error);
  }), 4000).catch(e => { dbP = null; if (e && e.message === 'tempo esgotado') idbStuck = true; throw e; }));
  // Se a conexão caiu, reabre e tenta mais uma vez. Se travou, o IndexedDB fica de lado até o app ser reaberto.
  let idbStuck = false;
  const idb = (mode, fn, retry = true) => (idbStuck ? Promise.reject(new Error('IndexedDB travado')) : db()).then(d => timeout(new Promise((res, rej) => {
    const tx = d.transaction('saves', mode);
    const req = fn(tx.objectStore('saves'));
    tx.oncomplete = () => res(req.result);
    tx.onerror = tx.onabort = () => rej(tx.error || new Error('transação abortada'));
  }), 4000)).catch(e => {
    if (idbStuck) throw e;
    if (e && e.message === 'tempo esgotado') { idbStuck = true; throw e; }
    if (dbP) dbP.then(d => { try { d.close(); } catch (x) { /* ignora */ } }, () => {});
    dbP = null;
    if (retry) return idb(mode, fn, false);
    throw e;
  });

  // Compressão gzip (base64) para a cópia reserva caber no localStorage.
  const canZip = typeof CompressionStream !== 'undefined' && typeof Response !== 'undefined';
  const zip = async str => {
    const buf = new Uint8Array(await new Response(new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const unzip = async b64 => {
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  };

  // Registros no IndexedDB: { t, raw } (saves antigos eram só o texto).
  const getIdb = n => idb('readonly', st => st.get(n)).then(v => (typeof v === 'string' ? { t: 0, raw: v } : v || null), () => null);
  const getBak = async n => {
    try {
      const b = JSON.parse(lsGet(BAK_KEY(n)));
      return b && b.z && canZip ? { t: b.t, raw: await unzip(b.z) } : null;
    } catch (e) { return null; }
  };

  FB.slots = () => { try { return JSON.parse(lsGet(META_KEY)) || {}; } catch (e) { return {}; } };
  const setMeta = (n, m) => {
    const all = FB.slots();
    if (m) all[n] = m; else delete all[n];
    lsSet(META_KEY, JSON.stringify(all));
  };
  FB.freeSlot = () => {
    const used = FB.slots();
    for (let n = 1; n <= FB.MAX_SLOTS; n++) if (!used[n]) return n;
    return null;
  };

  // Resumo mostrado no cartão da carreira.
  FB.slotMeta = state => {
    const t = state.teams[state.userId];
    const st = FB.leagueStanding(state, t.id);
    const lg = state.comps[FB.compKeyOf(t)];
    return {
      coach: state.coach, club: t.name, short: t.short, c1: t.c1, c2: t.c2, div: t.div, divName: FB.divName(t), season: state.season,
      round: lg ? lg.md : 0, rounds: lg ? lg.sched.length : 0, pos: st && st.row.j ? st.pos : null,
      fired: !!state.fired, started: state.started || null, updated: Date.now(),
    };
  };

  // Gravação em segundo plano. Se vários saves chegam seguidos, só o último de cada carreira é gravado.
  const jobs = new Map();
  let running = null;
  FB.onSaveError = null;
  const flush = async () => {
    while (jobs.size) {
      const [n, job] = jobs.entries().next().value;
      jobs.delete(n);
      let ok = false;
      // Primeiro a reserva local, que é rápida; depois o IndexedDB.
      if (canZip) {
        try { if (lsSet(BAK_KEY(n), JSON.stringify({ t: job.t, z: await zip(job.raw) }))) ok = true; } catch (e) { /* ignora */ }
      }
      try { await idb('readwrite', st => st.put({ t: job.t, raw: job.raw }, n)); ok = true; } catch (e) { /* fica a reserva */ }
      if (!ok && FB.onSaveError) FB.onSaveError();
    }
    running = null;
  };
  FB.save = state => {
    const n = FB.slot;
    if (n == null || !state || state.userId == null) return false;
    let raw;
    try { raw = JSON.stringify(state, FB.slim); } catch (e) { return false; }
    const meta = FB.slotMeta(state);
    setMeta(n, meta);
    jobs.set(n, { raw, t: meta.updated });
    if (!running) running = flush();
    return true;
  };
  FB.flush = () => running || Promise.resolve();

  // Abre a carreira pela cópia mais recente (IndexedDB ou reserva). Se uma estiver corrompida, tenta a outra.
  FB.loadSlot = async n => {
    await FB.flush();
    const [a, b] = await Promise.all([getIdb(n), getBak(n)]);
    const legacy = n === 1 ? lsGet(FB.SAVE_KEY) : null;
    const list = [a, b, legacy ? { t: -1, raw: legacy } : null].filter(Boolean).sort((x, y) => y.t - x.t);
    for (const c of list) {
      try { return FB.migrate(JSON.parse(c.raw)); } catch (e) { /* tenta a próxima */ }
    }
    return null;
  };
  FB.deleteSlot = async n => {
    setMeta(n, null);
    jobs.delete(n);
    lsDel(BAK_KEY(n));
    await idb('readwrite', st => st.delete(n)).catch(() => {});
  };

  // A carreira salva pela versão anterior (uma só, no localStorage) vira a carreira 1.
  FB.migrateLegacy = async () => {
    const raw = lsGet(FB.SAVE_KEY);
    if (!raw || FB.slots()[1]) return;
    let state;
    try { state = FB.migrate(JSON.parse(raw)); } catch (e) { return; }
    if (!state || state.userId == null) return;
    setMeta(1, FB.slotMeta(state));
    // Só apaga a cópia antiga depois de gravar no IndexedDB.
    try { await idb('readwrite', st => st.put({ t: 0, raw }, 1)); lsDel(FB.SAVE_KEY); } catch (e) { /* continua no localStorage */ }
  };

  FB.fmtMoney = v => {
    const neg = v < 0;
    const a = Math.abs(v);
    let s;
    if (a >= 1e9) s = (a / 1e9).toFixed(2).replace('.', ',') + ' bi';
    else if (a >= 1e6) s = (a / 1e6).toFixed(a >= 1e8 ? 0 : 1).replace('.', ',') + ' mi';
    else if (a >= 1e3) s = Math.round(a / 1e3) + ' mil';
    else s = String(Math.round(a));
    return (neg ? '-' : '') + 'R$ ' + s;
  };
})(window.FB);
