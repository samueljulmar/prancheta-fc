'use strict';
// Prancheta FC — diretoria: metas internas, orçamento, teto salarial e e-mails.
(function (FB) {
  const { clamp } = FB;

  const STATUS = { andamento: 'Em andamento', cumprido: 'Cumprido', falhou: 'Não cumprido' };
  FB.GOAL_STATUS = STATUS;

  const diretoria = (state, title, text, extra = {}) => FB.msg(state, title, text, { from: 'Diretoria', ...extra });

  // Até onde o clube chegou numa competição: índice da última fase em que esteve.
  FB.reachedPhase = (comp, tid) => {
    let r = -1;
    comp.phases.forEach((P, i) => {
      const inIt = P.t === 'ko' ? P.ties.some(t => t.a === tid || t.b === tid) : P.groups.some(g => g.teams.includes(tid));
      if (inIt) r = i;
    });
    return r;
  };

  // Ainda vivo na competição?
  FB.aliveIn = (comp, tid) => {
    if (comp.champion != null) return comp.champion === tid;
    const P = comp.phases[comp.phases.length - 1];
    if (!P) return false;
    if (P.t === 'ko') return P.ties.some(t => (t.a === tid || t.b === tid) && (t.w == null || t.w === tid));
    return P.groups.some(g => g.teams.includes(tid));
  };

  const phaseLabel = (comp, ph) => (ph >= comp.phaseNames.length ? 'o título' : comp.phaseNames[ph].toLowerCase());

  // Metas da temporada, conforme o tamanho do clube em cada competição.
  FB.boardSetup = (state, silent) => {
    const t = state.teams[state.userId];
    const str = FB.teamStrength(state, t);
    const goals = [];
    if (FB.compKeyOf(t) && state.comps[FB.compKeyOf(t)]) goals.push({ k: 'liga', comp: FB.compKeyOf(t), text: state.board.text, w: 25, status: 'andamento' });

    for (const c of Object.values(state.comps)) {
      if (!c.teams.includes(t.id) || c.kind === 'liga' || !FB.aliveIn(c, t.id)) continue;
      const rank = c.teams.map(id => ({ id, s: FB.teamStrength(state, state.teams[id]) })).sort((a, b) => b.s - a.s).findIndex(x => x.id === t.id);
      const share = rank / c.teams.length;
      let target;
      if (c.kind === 'estadual') target = rank === 0 ? 3 : share < 0.5 ? 1 : 0; // 3 = título
      else if (c.key === 'CB') target = share < 0.1 ? 4 : share < 0.3 ? 3 : share < 0.6 ? 2 : 1;
      else if (c.kind === 'continental') target = share < 0.15 ? 3 : share < 0.4 ? 2 : 1;
      else continue; // Supercopa é bônus
      const champ = target >= c.phaseNames.length;
      const ph = phaseLabel(c, target);
      const text = c.kind === 'estadual' && target === 0 ? `${c.name}: fazer boa campanha`
        : champ ? `${c.name}: ser campeão` : `${c.name}: chegar ${/^(oitavas|quartas)/.test(ph) ? 'às' : 'à'} ${ph}`;
      goals.push({ k: 'copa', comp: c.key, target, text, w: c.kind === 'estadual' ? 6 : c.kind === 'continental' ? 10 : 8, status: 'andamento' });
    }

    const payroll = FB.payroll(state, t);
    const cap = Math.round(payroll * 1.12 / 10000) * 10000;
    goals.push({ k: 'folha', cap, text: `Manter a folha salarial abaixo de ${FB.fmtMoney(cap)}/mês`, w: 5, status: 'andamento' });
    goals.push({ k: 'caixa', text: 'Fechar a temporada com caixa positivo', w: 6, status: 'andamento' });
    if (t.div <= 2 || t.div === 5) goals.push({ k: 'base', n: 2, text: 'Dar oportunidades à base: 2 jogadores de até 21 anos com 10+ jogos', w: 4, status: 'andamento' });

    const budget = Math.max(0, Math.round(t.cash * (str >= 72 ? 0.55 : 0.45) / 10000) * 10000);
    state.board.goals = goals;
    state.board.budget = budget;
    state.board.spent = 0;
    state.board.wageCap = cap;
    state.board.lastMonth = null;
    state.board.askedMore = false;
    if (!silent) {
      diretoria(state, `Metas da diretoria para ${state.season}`,
        `${goals.map(g => '• ' + g.text).join('\n')}\nOrçamento para contratações: ${FB.fmtMoney(budget)}. Teto da folha salarial: ${FB.fmtMoney(cap)}/mês.`);
    }
  };

  FB.budgetLeft = state => Math.max(0, (state.board.budget || 0) - (state.board.spent || 0));

  // Confere se uma contratação cabe no orçamento e no teto salarial.
  FB.boardApproves = (state, fee, newSalary, outSalary = 0) => {
    if (!state.board.goals) return { ok: true };
    if (fee > FB.budgetLeft(state)) return { ok: false, msg: `A diretoria não aprovou: o orçamento restante é ${FB.fmtMoney(FB.budgetLeft(state))}.` };
    const payroll = FB.payroll(state, state.teams[state.userId]) - outSalary + newSalary;
    if (state.board.wageCap && payroll > state.board.wageCap * 1.05) {
      return { ok: false, msg: `A diretoria não aprovou: a folha passaria do teto de ${FB.fmtMoney(state.board.wageCap)}/mês.` };
    }
    return { ok: true };
  };

  // Vendas liberam metade do valor para novas contratações.
  FB.boardSale = (state, fee) => { if (state.board.goals) state.board.budget = (state.board.budget || 0) + Math.round(fee * 0.5); };
  FB.boardSpend = (state, fee) => { if (state.board.goals) state.board.spent = (state.board.spent || 0) + fee; };

  FB.askBudget = state => {
    const t = state.teams[state.userId];
    if (state.board.askedMore) return { ok: false, msg: 'A diretoria já respondeu ao seu pedido nesta temporada.' };
    state.board.askedMore = true;
    if (state.board.conf >= 65 && t.cash > (state.board.budget || 0) * 1.5) {
      const extra = Math.round((state.board.budget || t.cash * 0.2) * 0.3 / 10000) * 10000;
      state.board.budget += extra;
      state.board.conf = clamp(state.board.conf - 2, 0, 100);
      diretoria(state, 'Pedido de reforços aprovado', `Pelo bom trabalho, liberamos mais ${FB.fmtMoney(extra)} para contratações. Esperamos retorno em campo.`);
      return { ok: true, msg: `Verba extra de ${FB.fmtMoney(extra)} aprovada!` };
    }
    state.board.conf = clamp(state.board.conf - 1, 0, 100);
    diretoria(state, 'Pedido de reforços negado', state.board.conf < 65
      ? 'Antes de pedir mais dinheiro, precisamos ver resultados.' : 'As finanças do clube não permitem novos gastos agora.');
    return { ok: false, msg: 'A diretoria negou o pedido.' };
  };

  // Avalia metas de copa quando uma fase termina.
  FB.boardCompUpdate = (state, comp) => {
    const goals = state.board.goals;
    if (!goals) return;
    const tid = state.userId;
    for (const g of goals) {
      if (g.k !== 'copa' || g.comp !== comp.key || g.status !== 'andamento') continue;
      const reached = comp.champion === tid ? comp.phaseNames.length : FB.reachedPhase(comp, tid);
      const alive = FB.aliveIn(comp, tid);
      if (reached >= g.target && (g.target > 0 || comp.champion != null || !alive)) {
        g.status = 'cumprido';
        state.board.conf = clamp(state.board.conf + Math.round(g.w / 2), 0, 100);
        diretoria(state, 'Meta cumprida', `Parabéns: "${g.text}". A diretoria reconhece o trabalho.`);
      } else if (!alive) {
        g.status = 'falhou';
        state.board.conf = clamp(state.board.conf - g.w, 0, 100);
        diretoria(state, 'Meta não cumprida', `A eliminação frustrou a diretoria: "${g.text}" não foi alcançado.`);
      }
    }
  };

  // Fecha as metas restantes no fim da temporada; devolve a lista avaliada.
  FB.boardSeasonEnd = (state, leagueMet) => {
    const goals = state.board.goals || [];
    const t = state.teams[state.userId];
    for (const g of goals) {
      if (g.status !== 'andamento') continue;
      let met;
      if (g.k === 'liga') met = leagueMet;
      else if (g.k === 'folha') met = FB.payroll(state, t) <= g.cap * 1.05;
      else if (g.k === 'caixa') met = t.cash > 0;
      else if (g.k === 'base') met = t.squad.map(id => state.players[id]).filter(p => p.age <= 22 && p.j >= 10).length >= g.n;
      else if (g.k === 'copa') met = FB.reachedPhase(state.comps[g.comp], t.id) >= g.target;
      g.status = met ? 'cumprido' : 'falhou';
      if (g.k !== 'liga') state.board.conf = clamp(state.board.conf + (met ? Math.round(g.w / 2) : -g.w), 0, 100);
    }
    return goals.map(g => ({ text: g.text, status: g.status }));
  };

  const MOOD = c => (c >= 80 ? 'A diretoria está muito satisfeita com o seu trabalho.'
    : c >= 60 ? 'A diretoria confia no seu trabalho.'
      : c >= 40 ? 'A diretoria está atenta e espera evolução.'
        : c >= 25 ? 'A diretoria está insatisfeita. Os próximos jogos serão decisivos.'
          : 'ULTIMATO: a diretoria avalia a sua permanência no cargo.');

  // Relatório mensal (chamado na virada de mês).
  FB.boardMonthly = (state, month) => {
    if (!state.board.goals || state.fired || state.board.lastMonth === month) return;
    state.board.lastMonth = month;
    const t = state.teams[state.userId];
    const st = FB.leagueStanding(state, t.id);
    const payroll = FB.payroll(state, t);
    const lines = [];
    if (st && st.row.j) lines.push(`${state.comps[st.key].short}: ${st.pos}º lugar. Meta: ${state.board.text}.`);
    const open = state.board.goals.filter(g => g.status === 'andamento' && g.k === 'copa');
    if (open.length) lines.push('Em disputa: ' + open.map(g => state.comps[g.comp].short).join(', ') + '.');
    lines.push(`Caixa: ${FB.fmtMoney(t.cash)} · Folha: ${FB.fmtMoney(payroll)}/mês${payroll > state.board.wageCap ? ' (acima do teto!)' : ''}.`);
    lines.push(`Orçamento restante para contratações: ${FB.fmtMoney(FB.budgetLeft(state))}.`);
    lines.push(MOOD(state.board.conf));
    const names = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    diretoria(state, `Relatório de ${names[month % 12]}`, lines.join('\n'));
    if (payroll > state.board.wageCap * 1.05) state.board.conf = clamp(state.board.conf - 2, 0, 100);
  };

  // E-mails da torcida e da imprensa depois dos jogos do usuário.
  FB.fanMail = (state, m) => {
    const t = state.teams[state.userId];
    const form = t.form.slice(-4);
    const w = m.matchWinner();
    const [h, a] = m.sides;
    const margin = Math.abs(h.goals - a.goals);
    if (form.length === 4 && form.every(f => f === 'D') && !(t.lastProtest > FB.today(state) - 20)) {
      t.lastProtest = FB.today(state);
      FB.msg(state, 'Protesto da torcida', 'Torcedores protestaram no CT após a sequência de derrotas. A organizada cobra "raça" e mudanças no time.', { from: 'Torcida' });
      state.board.conf = clamp(state.board.conf - 2, 0, 100);
    } else if (w === m.user && margin >= 3 && state.teams[m.sides[1 - m.user].tid].div !== 4 && FB.teamStrength(state, state.teams[m.sides[1 - m.user].tid]) >= FB.teamStrength(state, t) - 6) {
      FB.msg(state, 'Torcida em festa', `A goleada sobre o ${state.teams[m.sides[1 - m.user].tid].name} empolgou a torcida. A procura por ingressos para o próximo jogo em casa aumentou.`, { from: 'Torcida' });
      t.fans = Math.round(t.fans * 1.01);
    }
  };
  // ---------- Contrato do treinador ----------

  // Salário mensal conforme a divisão e o tamanho do clube.
  const coachSalary = state => {
    const t = state.teams[state.userId];
    const base = Math.max(15000, Math.round(FB.econ(t).tv * 0.04));
    const k = clamp(0.7 + (FB.teamStrength(state, t) - 55) / 50, 0.5, 1.6);
    return Math.round(base * k / 1000) * 1000;
  };

  FB.newContract = state => {
    const t = state.teams[state.userId];
    const years = t.div <= 1 || FB.econ(t).tv >= 2e6 ? 2 : 1;
    state.contract = { club: t.id, sal: coachSalary(state), from: state.season, until: state.season + years - 1 };
  };

  // Na virada do ano, renova o contrato vencido. Com a diretoria satisfeita, vem aumento.
  FB.renewContract = state => {
    const c = state.contract;
    if (!c || c.club !== state.userId) { FB.newContract(state); return; }
    if (c.until >= state.season) return;
    const conf = state.board.conf;
    const raise = conf >= 75 ? 1.2 : conf >= 50 ? 1.1 : 1;
    const years = conf >= 75 ? 2 : 1;
    c.sal = Math.max(Math.round(c.sal * raise / 1000) * 1000, coachSalary(state));
    c.until = state.season + years - 1;
    diretoria(state, 'Contrato renovado',
      `A diretoria renovou o seu contrato até o fim de ${c.until}. Salário mensal: ${FB.fmtMoney(c.sal)}${raise > 1 ? ' (com aumento)' : ''}.`);
  };

  // Resumo da última partida do usuário, com o melhor jogador em campo do time.
  FB.matchRecap = (state, m, day) => {
    const side = m.sides[m.user];
    const w = m.matchWinner();
    let best = null;
    for (const pid of side.played) {
      const p = state.players[pid];
      if (p && p.lastRt != null && (!best || p.lastRt > best.lastRt)) best = p;
    }
    return {
      day, label: FB.compLabel(state, m), h: m.sides[0].tid, a: m.sides[1].tid, hg: m.sides[0].goals, ag: m.sides[1].goals,
      res: w === -1 ? 'E' : w === m.user ? 'V' : 'D',
      best: best ? { pid: best.id, rt: best.lastRt, goals: side.scorers.filter(x => x.pid === best.id).length } : null,
    };
  };
})(window.FB);
