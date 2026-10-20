'use strict';
// Prancheta FC — feed de notícias. Todo o conteúdo é gerado pelo jogo (ficção dentro da carreira).
(function (FB) {
  const { pick, ri, shuffle } = FB;

  FB.NEWS_CATS = {
    noticia: 'Notícia', mercado: 'Mercado', especulacao: 'Especulação', fofoca: 'Bastidores',
    curiosidade: 'Curiosidade', atualizacao: 'Atualização',
  };

  FB.news = (state, cat, title, text, extra = {}) => {
    state.news.unshift({ id: state.nextMsg++, day: FB.today(state), season: state.season, cat, title, text, ...extra });
    if (state.news.length > 220) state.news.length = 220;
  };

  // Bastidores leves e inofensivos — nada que possa ofender pessoas reais caso a base tenha nomes reais.
  const GOSSIP = [
    '{p} comemorou o aniversário com um churrasco para todo o elenco do {t}.',
    '{p} virou meme nas redes sociais depois de uma comemoração inusitada no treino.',
    '{p} contou que quase virou professor de matemática antes de seguir no futebol.',
    'Em vídeo, {p} aparece ensinando o filho a bater falta no quintal de casa.',
    '{p} gravou uma música com amigos de infância e a torcida do {t} adotou o refrão.',
    '{p} adotou um cachorro e deu ao pet o nome de um ídolo do {t}.',
    'A torcida do {t} elegeu {p} como o jogador mais bem vestido do elenco.',
    '{p} prometeu raspar o cabelo se marcar no próximo clássico.',
    '{p} pagou o almoço do elenco depois de perder uma aposta no treino de pênaltis.',
    '{p} visitou um hospital infantil e distribuiu camisas do {t}.',
    '{p} está fazendo faculdade a distância e diz que quer ser treinador no futuro.',
    'Companheiros revelam que {p} é o mais pontual do elenco do {t}: chega antes de todo mundo ao CT.',
    '{p} ganhou o torneio de videogame da concentração e cobra revanche dos colegas.',
    '{p} levou os pais para conhecer o estádio do {t} pela primeira vez.',
    'O cabelo novo de {p} dividiu opiniões no vestiário do {t}.',
  ];
  const RUMOR = [
    '{to} monitora a situação de {p}, do {from}.',
    'Empresário de {p} esteve no CT do {to} nesta semana.',
    '{p} agrada à comissão técnica do {to}, que estuda uma proposta ao {from}.',
    'Bastidores: {to} prepara oferta por {p} para a próxima janela.',
    '{p} pode deixar o {from}; {to} aparece como interessado.',
  ];

  // Chamado depois de cada data com os jogos disputados.
  FB.newsAfterDate = (state, matches) => {
    const T = id => state.teams[id];
    const str = id => FB.teamStrength(state, T(id));
    const notable = m => ['A', 'LIB', 'SUL', 'CB', 'SUP'].includes(m.comp.key) || m.user >= 0 || m.comp.final;
    for (const m of matches) {
      const [h, a] = m.sides;
      const comp = state.comps[m.comp.key];
      const margin = Math.abs(h.goals - a.goals);
      const w = m.winner();
      if (notable(m) && margin >= 4) {
        const [W, L] = h.goals > a.goals ? [h, a] : [a, h];
        FB.news(state, 'noticia', `Goleada: ${T(W.tid).name} ${W.goals} x ${L.goals} ${T(L.tid).name}`,
          `Pela ${comp.name}, o ${T(W.tid).name} não tomou conhecimento do ${T(L.tid).name}.`, { team: W.tid });
      } else if (notable(m) && w >= 0) {
        const W = m.sides[w], L = m.sides[1 - w];
        if (str(L.tid) - str(W.tid) >= 7) {
          FB.news(state, 'noticia', `Zebra na ${comp.short}!`,
            `O ${T(W.tid).name} surpreendeu e venceu o ${T(L.tid).name} por ${W.goals} x ${L.goals}.`, { team: W.tid });
        }
      }
      for (const s of m.sides) {
        const count = {};
        for (const sc of s.scorers) count[sc.pid] = (count[sc.pid] || 0) + 1;
        for (const [pid, n] of Object.entries(count)) {
          if (n >= 3 && (notable(m) || T(s.tid).div <= 1)) {
            FB.news(state, 'noticia', `Hat-trick de ${state.players[pid]?.n}`,
              `${state.players[pid]?.n} marcou ${n} vezes pelo ${T(s.tid).name} na ${comp.name}.`, { team: s.tid });
          }
        }
      }
    }

    // Liderança e artilharia da Série A a cada 5 rodadas.
    const A = state.comps.A;
    const playedA = A ? A.md : 0;
    if (A && matches.some(m => m.comp.key === 'A') && playedA % 5 === 0 && playedA > 0 && playedA < 38) {
      const tb = FB.groupTable(state, A.phases[0].groups[0]);
      const gap = tb[0].p - tb[1].p;
      FB.news(state, 'atualizacao', `Brasileirão: ${T(tb[0].id).name} lidera após ${playedA} rodadas`,
        gap > 0 ? `O ${T(tb[0].id).name} tem ${gap} ponto(s) de vantagem sobre o ${T(tb[1].id).name}.` : `${T(tb[0].id).name} e ${T(tb[1].id).name} estão empatados em pontos.`, { team: tb[0].id });
      const top = FB.scorers(state, 'A', 1)[0];
      if (top) FB.news(state, 'curiosidade', `${top.n} é o artilheiro do Brasileirão`, `${top.n}, do ${T(top.t).name}, soma ${top.gl.A} gols na Série A.`, { team: top.t });
    }

    // Treinadores da IA caem depois de sequências ruins.
    for (const t of state.teams) {
      if (t.id === state.userId || t.div > 1 || !t.form || t.form.length < 4) continue;
      if (t.form.slice(-4).every(f => f === 'D') && (t.sackCd || 0) < FB.today(state)) {
        t.sackCd = FB.today(state) + 60;
        for (const pid of t.squad) state.players[pid].mo = Math.min(100, state.players[pid].mo + 8);
        FB.news(state, 'noticia', `${t.name} demite o treinador`, `Após quatro derrotas seguidas, a diretoria do ${t.name} decidiu trocar o comando técnico.`, { team: t.id });
      }
    }

    if (Math.random() < 0.55) FB.gossip(state);
    if (Math.random() < 0.35) FB.curiosity(state);
    if (FB.windowOpen(state) && Math.random() < 0.6) FB.rumor(state);
  };

  FB.gossip = state => {
    const pool = state.teams.filter(t => t.div <= 1 || t.id === state.userId);
    const t = Math.random() < 0.3 ? state.teams[state.userId] : pick(pool);
    const p = state.players[pick(t.squad)];
    if (!p) return;
    FB.news(state, 'fofoca', 'Bastidores', pick(GOSSIP).replace('{p}', p.n).replace(/\{t\}/g, t.name), { team: t.id });
  };

  FB.curiosity = state => {
    const T = id => state.teams[id];
    const user = T(state.userId);
    const options = [];
    for (const t of state.teams) {
      if (!t.form || t.form.length < 6) continue;
      let un = 0;
      for (let i = t.form.length - 1; i >= 0 && t.form[i] !== 'D'; i--) un++;
      if (un >= 8 && (t.div <= 1 || t.id === user.id)) options.push(() => FB.news(state, 'curiosidade', `${t.name} está invicto há ${un} jogos`, `A última derrota do ${t.name} foi há ${un} partidas.`, { team: t.id }));
      let nw = 0;
      for (let i = t.form.length - 1; i >= 0 && t.form[i] !== 'V'; i--) nw++;
      if (nw >= 7 && (t.div <= 1 || t.id === user.id)) options.push(() => FB.news(state, 'curiosidade', `Jejum: ${t.name} não vence há ${nw} jogos`, `A pressão aumenta no ${t.name}, que não vence há ${nw} partidas.`, { team: t.id }));
    }
    const att = state.att || {};
    const best = Object.entries(att).filter(([id]) => T(+id).div === 0 && att[id].n >= 3)
      .map(([id, v]) => ({ id: +id, avg: v.sum / v.n })).sort((a, b) => b.avg - a.avg)[0];
    if (best) options.push(() => FB.news(state, 'curiosidade', `${T(best.id).name} tem o maior público médio`, `O ${T(best.id).name} leva em média ${Math.round(best.avg).toLocaleString('pt-BR')} torcedores por jogo em casa na temporada.`, { team: best.id }));
    if (state.youngest) {
      const p = state.players[state.youngest.pid];
      if (p) options.push(() => FB.news(state, 'curiosidade', 'Mais jovem a marcar', `${p.n}, do ${T(p.t ?? state.youngest.t).name}, é o jogador mais jovem a marcar na temporada, com ${state.youngest.age} anos.`));
    }
    const comps = ['A', 'B', FB.compKeyOf(user)].filter(Boolean);
    const key = pick(comps);
    const c = state.comps[key];
    if (c) {
      const g = c.stats || { goals: 0, games: 0 };
      if (g.games >= 20) options.push(() => FB.news(state, 'curiosidade', `Média de gols da ${c.short}`, `A ${c.name} tem média de ${(g.goals / g.games).toFixed(2).replace('.', ',')} gols por jogo até aqui.`));
    }
    if (options.length) pick(options)();
  };

  FB.rumor = state => {
    const buyers = state.teams.filter(t => t.div <= 1 && t.cash > 5e6);
    if (!buyers.length) return;
    const to = pick(buyers);
    const targets = Object.values(state.players).filter(p => p.t != null && p.t !== to.id && p.ovr >= to.base + 2 && p.ovr <= to.base + 12 && state.teams[p.t].div <= 3);
    if (!targets.length) return;
    const p = pick(targets);
    const from = state.teams[p.t];
    state.rumors = (state.rumors || []).filter(r => r.until > FB.today(state));
    state.rumors.push({ pid: p.id, to: to.id, until: FB.today(state) + 30 });
    FB.news(state, 'especulacao', `Especulação: ${p.n}`, pick(RUMOR).replace('{p}', p.n).replace('{to}', to.name).replace('{from}', from.name), { team: from.id });
  };
})(window.FB);
