'use strict';
// Prancheta FC — importação e exportação de base de dados (clubes e jogadores reais).
// Aceita a planilha própria do jogo e o players.csv do projeto transfermarkt-datasets (licença CC0).
(function (FB) {
  const { clamp } = FB;

  FB.parseCSV = text => {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some(x => x.trim() !== '')) rows.push(row);
        row = [];
      } else cell += c;
    }
    row.push(cell);
    if (row.some(x => x.trim() !== '')) rows.push(row);
    if (!rows.length) return [];
    const head = rows[0].map(h => FB.norm(h).replace(/ /g, '_'));
    return rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
  };

  const POS_ALIASES = {
    G: ['g', 'gol', 'goleiro', 'gk', 'goalkeeper'],
    Z: ['z', 'zag', 'zagueiro', 'cb', 'defensor', 'centre back', 'center back', 'defender'],
    L: ['l', 'lat', 'lateral', 'ld', 'le', 'lb', 'rb', 'wb', 'ala', 'lateral direito', 'lateral esquerdo', 'left back', 'right back'],
    M: ['m', 'mei', 'meia', 'meio', 'meio campo', 'volante', 'cm', 'dm', 'am', 'cdm', 'cam', 'mid', 'midfield', 'midfielder',
      'meia ofensivo', 'meia central', 'defensive midfield', 'central midfield', 'attacking midfield', 'left midfield', 'right midfield'],
    A: ['a', 'ata', 'atacante', 'ponta', 'centroavante', 'st', 'cf', 'lw', 'rw', 'fw', 'forward', 'attack', 'ponta direita',
      'ponta esquerda', 'segundo atacante', 'centre forward', 'second striker', 'left winger', 'right winger'],
  };
  FB.parsePos = v => {
    const k = FB.norm(v);
    for (const [pos, list] of Object.entries(POS_ALIASES)) if (list.includes(k)) return pos;
    return null;
  };

  // "R$ 12,5 mi", "€ 3.5m", "800 mil", "1.200.000", "45k".
  FB.parseMoney = v => {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    let s = String(v).toLowerCase().replace(/r\$|€|\$|eur|brl/g, '').trim();
    let mult = 1;
    if (/(mi|mio|milh(ao|ão|oes|ões)|m)\.?$/.test(s) && !/mil$/.test(s)) mult = 1e6;
    else if (/(mil|k)\.?$/.test(s)) mult = 1e3;
    else if (/(bi|b)\.?$/.test(s)) mult = 1e9;
    s = s.replace(/[a-zãõ.]+$/g, '').trim();
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? null : Math.round(n * mult);
  };

  const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? null : n; };
  const field = (o, ...keys) => { for (const k of keys) if (o[k] != null && o[k] !== '') return o[k]; return null; };

  // Encontra o clube pelo nome ou sigla. Compara palavras, ignorando termos genéricos ("FC", "Clube", "Futebol"...):
  // um apelido casa quando todas as suas palavras aparecem no nome; vence o apelido mais específico.
  const STOP = new Set(['fc', 'ec', 'sc', 'ac', 'cr', 'se', 'fr', 'cf', 'ca', 'cd', 'club', 'clube', 'futebol', 'football', 'foot',
    'ball', 'esporte', 'esportivo', 'sociedade', 'esportiva', 'associacao', 'regatas', 'de', 'do', 'da', 'dos', 'e', 'the']);
  const words = s => FB.norm(s).split(' ').filter(w => w && !STOP.has(w));
  FB.findClub = (state, name) => {
    const n = FB.norm(name);
    if (!n) return null;
    const have = new Set(words(name));
    let best = null, bl = 0;
    for (const t of state.teams) {
      if (t.div === 4) continue;
      if (t.short.toLowerCase() === n) return t;
      for (const k of t.keys || []) {
        const kw = words(k);
        if (!kw.length || !kw.every(w => have.has(w))) continue;
        const len = kw.join(' ').length;
        if (len > bl) { best = t; bl = len; }
      }
    }
    return best;
  };

  const isTransfermarkt = rows => rows.length && 'current_club_name' in rows[0] && 'market_value_in_eur' in rows[0];

  // Converte linhas (formato próprio ou transfermarkt-datasets) para jogadores do jogo.
  FB.readPlayerRows = (state, rows) => {
    const out = [];
    const warnings = [];
    if (isTransfermarkt(rows)) {
      const maxSeason = rows.reduce((m, r) => Math.max(m, +r.last_season || 0), 0);
      const cache = new Map();
      for (const r of rows) {
        if (maxSeason && +r.last_season < maxSeason - 1) continue;
        if (!cache.has(r.current_club_name)) cache.set(r.current_club_name, FB.findClub(state, r.current_club_name));
        const club = cache.get(r.current_club_name);
        if (!club) continue;
        const birth = r.date_of_birth ? new Date(r.date_of_birth) : null;
        const age = birth && !isNaN(birth) ? state.season - birth.getFullYear() : 26;
        const pos = FB.parsePos(r.sub_position) || FB.parsePos(r.position);
        if (!pos || !r.name) continue;
        const eur = num(r.market_value_in_eur);
        const value = eur ? eur * FB.EUR_BRL : null;
        out.push({ name: r.name, team: club, pos, age, ovr: value ? FB.ovrFromValue(value, age) : null, pot: null, sal: null });
      }
      return { players: out, warnings, source: 'transfermarkt-datasets' };
    }
    rows.forEach((r, i) => {
      const name = field(r, 'nome', 'name', 'jogador');
      const clubName = field(r, 'clube', 'club', 'time', 'sigla');
      const pos = FB.parsePos(field(r, 'posicao', 'pos', 'position'));
      if (!name || !pos) { warnings.push(`Linha ${i + 2} ignorada (nome ou posição inválida).`); return; }
      const free = !clubName || /^(livre|sem clube|-)$/i.test(clubName);
      const team = free ? null : FB.findClub(state, clubName);
      if (!free && !team) { warnings.push(`${name}: clube "${clubName}" não encontrado.`); return; }
      const age = Math.round(num(field(r, 'idade', 'age')) ?? 26);
      const value = FB.parseMoney(field(r, 'valor', 'valor_de_mercado', 'value', 'market_value'));
      const ovr = num(field(r, 'forca', 'ovr', 'overall', 'habilidade'));
      out.push({
        name, team, pos, age,
        ovr: ovr != null ? clamp(Math.round(ovr), 30, 95) : value ? FB.ovrFromValue(value, age) : null,
        pot: num(field(r, 'potencial', 'pot', 'potential')),
        sal: FB.parseMoney(field(r, 'salario', 'salary', 'wage')),
      });
    });
    return { players: out, warnings, source: 'planilha' };
  };

  // Substitui os elencos gerados dos clubes encontrados pelos jogadores importados.
  FB.importPlayers = (state, rows) => {
    const { players, warnings, source } = FB.readPlayerRows(state, rows);
    const byTeam = new Map();
    const free = [];
    for (const r of players) {
      if (!r.team) { free.push(r); continue; }
      if (!byTeam.has(r.team.id)) byTeam.set(r.team.id, []);
      byTeam.get(r.team.id).push(r);
    }
    let count = 0;
    const touched = [];
    for (const [tid, list] of byTeam) {
      const t = state.teams[tid];
      if (list.length < 11) { warnings.push(`${t.name}: só ${list.length} jogador(es) na base — elenco gerado mantido.`); continue; }
      for (const pid of t.squad) delete state.players[pid];
      t.squad = [];
      for (const r of list.slice(0, FB.MAX_SQUAD)) {
        const p = FB.createPlayer(state, r.pos, t.base, { age: r.age });
        p.n = r.name;
        if (r.ovr != null) p.ovr = r.ovr;
        p.pot = clamp(Math.round(r.pot ?? (p.ovr + (p.age <= 21 ? FB.ri(5, 14) : p.age <= 24 ? FB.ri(1, 6) : 0))), p.ovr, 95);
        p.sal = r.sal || FB.calcSalary(p);
        p.t = t.id;
        t.squad.push(p.id);
        count++;
      }
      // Ajusta a força-base do clube à média dos titulares importados e completa posições vazias.
      const top = t.squad.map(id => state.players[id].ovr).sort((a, b) => b - a).slice(0, 16);
      t.base = top.reduce((s, v) => s + v, 0) / top.length;
      for (const pos of FB.POS) {
        const have = t.squad.filter(id => state.players[id].pos === pos).length;
        for (let k = have; k < (pos === 'G' ? 2 : 3); k++) FB.youth(state, t, pos);
      }
      t.lineup = FB.bestLineup(state, t);
      touched.push(t.name);
    }
    for (const r of free) {
      const p = FB.createPlayer(state, r.pos, 55, { age: r.age });
      p.n = r.name;
      if (r.ovr != null) p.ovr = r.ovr;
      p.pot = Math.max(p.ovr, p.pot);
      p.sal = r.sal || FB.calcSalary(p);
      state.free.push(p.id);
      count++;
    }
    return { count, clubs: touched, warnings, source };
  };

  // Atualiza dados dos clubes (nome, cores, estádio, torcida, caixa). Divisões só mudam se o formato continuar válido.
  FB.importClubs = (state, rows, allowDiv = true) => {
    const warnings = [];
    let n = 0;
    const before = state.teams.map(t => t.div);
    for (const [i, r] of rows.entries()) {
      const key = field(r, 'sigla', 'short') || field(r, 'nome', 'name', 'clube');
      const t = FB.findClub(state, key) || FB.findClub(state, field(r, 'nome', 'name', 'clube'));
      if (!t) { warnings.push(`Clube da linha ${i + 2} não encontrado no pacote: ${key}`); continue; }
      const name = field(r, 'nome', 'name', 'clube');
      if (name && name !== t.name) { t.name = name; t.keys.unshift(FB.norm(name)); }
      const sig = field(r, 'sigla', 'short');
      if (sig) t.short = sig.toUpperCase().slice(0, 3);
      for (const [k, cols] of [['city', ['cidade', 'city']], ['c1', ['cor1', 'c1']], ['c2', ['cor2', 'c2']]]) {
        const v = field(r, ...cols);
        if (v) t[k] = v;
      }
      const cap = num(field(r, 'capacidade', 'estadio', 'cap'));
      if (cap) t.cap = Math.round(cap);
      const fans = num(field(r, 'torcida', 'publico', 'fans'));
      if (fans) t.fans = Math.round(fans);
      const cash = FB.parseMoney(field(r, 'caixa', 'cash', 'orcamento'));
      if (cash != null) t.cash = cash;
      const titles = field(r, 'titulos', 'historico', 'titles');
      if (titles) t.titlesText = titles;
      const div = num(field(r, 'divisao', 'div', 'serie'));
      if (allowDiv && div != null && t.div <= 3) t.div = clamp(Math.round(div) - 1, 0, 3);
      n++;
    }
    const counts = [0, 1, 2, 3].map(d => state.teams.filter(t => t.div === d).length);
    if (counts[0] !== 20 || counts[1] !== 20 || counts[2] !== 20 || counts[3] !== 32) {
      state.teams.forEach((t, i) => { t.div = before[i]; });
      warnings.push(`Divisões mantidas: a base precisa de 20/20/20/32 clubes nas Séries A/B/C/D (veio ${counts.join('/')}).`);
    }
    return { count: n, warnings };
  };

  // Depois de importar, refaz o calendário com os elencos novos.
  FB.afterImport = state => {
    FB.initialQualifiers(state);
    FB.setupSeason(state);
  };

  FB.exportDB = state => ({
    clubs: state.teams.filter(t => t.div !== 4).map(t => ({
      nome: t.name, sigla: t.short, cidade: t.city, uf_pais: t.uf || t.country, cor1: t.c1, cor2: t.c2,
      divisao: t.div <= 3 ? t.div + 1 : 'exterior', capacidade: t.cap, torcida: t.fans, caixa: Math.round(t.cash), titulos: t.titlesText || '',
    })),
    players: Object.values(state.players).filter(p => p.t != null && state.teams[p.t].div !== 4).map(p => ({
      nome: p.n, clube: state.teams[p.t].short, posicao: p.pos, idade: p.age, forca: p.ovr, potencial: p.pot,
      valor: FB.calcValue(p), salario: p.sal,
    })),
  });

  FB.toCSV = rows => {
    if (!rows.length) return '';
    const head = Object.keys(rows[0]);
    const cell = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return '﻿' + [head.join(';')].concat(rows.map(r => head.map(h => cell(r[h])).join(';'))).join('\n');
  };
})(window.FB);
