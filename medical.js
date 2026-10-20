'use strict';
// Prancheta FC — departamento médico: tipos de lesão, prazos e tratamentos.
// Prazos baseados nas faixas usuais de afastamento no futebol profissional (em dias).
(function (FB) {
  const { ri, rf, clamp, weighted } = FB;

  // w = frequência relativa; play = dá para atuar no sacrifício; surgery: 'optional' | 'required'
  FB.INJURIES = {
    contusao: { name: 'Contusão (pancada)', area: 'coxa', min: 3, max: 10, w: 20, play: true },
    musc1: { name: 'Lesão muscular grau 1 na posterior da coxa', area: 'coxa', min: 10, max: 21, w: 18 },
    musc2: { name: 'Lesão muscular grau 2 na posterior da coxa', area: 'coxa', min: 21, max: 42, w: 9 },
    quadriceps: { name: 'Lesão muscular no quadríceps', area: 'coxa', min: 14, max: 35, w: 5 },
    musc3: { name: 'Ruptura muscular (grau 3)', area: 'coxa', min: 60, max: 90, w: 1.5, surgery: 'optional' },
    panturrilha: { name: 'Estiramento na panturrilha', area: 'perna', min: 10, max: 28, w: 7 },
    adutor: { name: 'Lesão no adutor da coxa', area: 'virilha', min: 14, max: 35, w: 6 },
    entorse1: { name: 'Entorse leve no tornozelo', area: 'tornozelo', min: 7, max: 21, w: 10, play: true },
    entorse2: { name: 'Entorse grave no tornozelo', area: 'tornozelo', min: 28, max: 56, w: 3 },
    lcm: { name: 'Lesão no ligamento colateral medial do joelho', area: 'joelho', min: 28, max: 56, w: 3 },
    menisco: { name: 'Lesão no menisco', area: 'joelho', min: 35, max: 70, w: 2, surgery: 'optional' },
    lca: { name: 'Ruptura do ligamento cruzado anterior', area: 'joelho', min: 200, max: 280, w: 0.9, surgery: 'required' },
    metatarso: { name: 'Fratura no 5º metatarso', area: 'pé', min: 60, max: 100, w: 1, surgery: 'optional' },
    clavicula: { name: 'Fratura na clavícula', area: 'ombro', min: 42, max: 70, w: 0.6 },
    ombro: { name: 'Luxação no ombro', area: 'ombro', min: 21, max: 42, w: 1, gk: 4 },
    aquiles: { name: 'Ruptura do tendão de Aquiles', area: 'tornozelo', min: 180, max: 260, w: 0.4, surgery: 'required' },
    concussao: { name: 'Concussão (protocolo de concussão)', area: 'cabeça', min: 7, max: 14, w: 2 },
    pubalgia: { name: 'Pubalgia', area: 'virilha', min: 21, max: 60, w: 2, play: true },
    tendinite: { name: 'Tendinite patelar', area: 'joelho', min: 14, max: 35, w: 2, play: true },
    costela: { name: 'Fratura de costela', area: 'tórax', min: 21, max: 42, w: 0.6 },
    nariz: { name: 'Fratura no nariz', area: 'rosto', min: 5, max: 14, w: 0.5, play: true },
  };

  // Lesões mais comuns fora de jogo (desgaste em treinos).
  const TRAINING_TYPES = ['musc1', 'musc2', 'panturrilha', 'adutor', 'quadriceps', 'pubalgia', 'tendinite', 'entorse1', 'contusao'];
  // Para onde uma lesão evolui se o jogador forçar.
  const WORSENS = { contusao: 'musc1', entorse1: 'entorse2', pubalgia: 'adutor', tendinite: 'menisco', nariz: 'nariz', musc1: 'musc2', musc2: 'musc3' };

  FB.TREATMENTS = {
    conservador: { name: 'Tratamento conservador', desc: 'Fisioterapia, gelo e fortalecimento progressivo. Prazo normal e menor risco de recaída.', mult: 1, cost: 0, relapse: 1 },
    intensivo: { name: 'Fisioterapia intensiva', desc: 'Dois períodos por dia, crioterapia e câmara hiperbárica. Volta cerca de 20% antes, mas aumenta o risco de recaída.', mult: 0.8, cost: 1, relapse: 1.8 },
    cirurgia: { name: 'Cirurgia', desc: 'Corrige a lesão de forma definitiva. Prazo previsível e recaída rara.', mult: 0.85, cost: 2, relapse: 0.7 },
    exterior: { name: 'Cirurgia com especialista no exterior', desc: 'Cirurgião de referência e reabilitação em centro especializado. Mais caro e um pouco mais rápido.', mult: 0.88, cost: 5, relapse: 0.6 },
    sacrificio: { name: 'Jogar no sacrifício (infiltração)', desc: 'Fica disponível já, mas rende menos, a recuperação anda mais devagar e pode piorar a cada jogo.', mult: 1.3, cost: 0.3, relapse: 1.5 },
  };

  // Custo base de tratamento por divisão (R$).
  const COST_BASE = [150000, 80000, 40000, 20000, 10000, 80000];

  FB.treatmentOptions = type => {
    const inj = FB.INJURIES[type];
    if (inj.surgery === 'required') return ['cirurgia', 'exterior'];
    const opts = ['conservador', 'intensivo'];
    if (inj.surgery === 'optional') opts.push('cirurgia');
    if (inj.play) opts.push('sacrificio');
    return opts;
  };

  FB.treatmentCost = (state, tid, treat) => Math.round(COST_BASE[state.teams[tid].div] * FB.TREATMENTS[treat].cost / 1000) * 1000;

  // Dias de afastamento para um tratamento. Conservador em lesão com cirurgia opcional demora mais.
  FB.treatmentDays = (p, treat) => {
    const inj = FB.INJURIES[p.inj.type];
    let m = FB.TREATMENTS[treat].mult;
    if (treat === 'conservador' && inj.surgery === 'optional') m = 1.25;
    if (treat === 'cirurgia' && inj.surgery === 'required') m = 1;
    return Math.max(2, Math.round(p.inj.days * m));
  };

  FB.rollInjuryType = (p, training) => {
    if (training) return FB.pick(TRAINING_TYPES);
    const types = Object.keys(FB.INJURIES);
    return weighted(types, t => FB.INJURIES[t].w * (p.pos === 'G' && FB.INJURIES[t].gk ? FB.INJURIES[t].gk : 1));
  };

  // Aplica uma lesão nova ao jogador.
  FB.injure = (state, p, type, opts = {}) => {
    const inj = FB.INJURIES[type];
    let days = ri(inj.min, inj.max);
    if (p.age >= 31) days = Math.round(days * 1.12);
    const today = FB.today(state);
    p.inj = { type, days, start: today, until: today + days, treat: null, play: false, chosen: false };
    const team = p.t != null ? state.teams[p.t] : null;
    // A IA escolhe o tratamento na hora; o usuário decide pela mensagem do departamento médico.
    if (!team || team.id !== state.userId) {
      const opts2 = FB.treatmentOptions(type);
      const treat = opts2.includes('intensivo') && team && team.div === 0 && FB.isKeyPlayer(state, p) ? 'intensivo' : opts2[0];
      FB.applyTreatment(state, p, treat, true);
    } else {
      FB.applyTreatment(state, p, FB.treatmentOptions(type)[0], true);
      p.inj.chosen = false;
      FB.msg(state, `Departamento médico: ${p.n}`,
        `Diagnóstico: ${inj.name}. Previsão inicial de ${FB.fmtDays(p.inj.until - today)} fora. Escolha o tratamento.`,
        { from: 'Departamento médico', injury: { pid: p.id } });
    }
    if (opts.news !== false) FB.injuryNews(state, p);
  };

  FB.applyTreatment = (state, p, treat, free) => {
    if (!p.inj) return { ok: false, msg: 'Jogador não está lesionado.' };
    const cost = free ? 0 : FB.treatmentCost(state, p.t, treat);
    const team = state.teams[p.t];
    if (cost && team.cash < cost) return { ok: false, msg: 'Caixa insuficiente para este tratamento.' };
    if (cost) FB.money(state, p.t, -cost, 'medico');
    p.inj.treat = treat;
    p.inj.play = treat === 'sacrificio';
    p.inj.until = p.inj.start + FB.treatmentDays(p, treat);
    p.inj.chosen = true;
    return { ok: true };
  };

  // Passagem do tempo para o departamento médico (chamado a cada data).
  FB.medicalTick = (state, fromDay, toDay) => {
    const gap = Math.max(1, toDay - fromDay);
    for (const p of Object.values(state.players)) {
      if (p.t == null) continue;
      if (p.inj && toDay >= p.inj.until) {
        const tr = FB.TREATMENTS[p.inj.treat || 'conservador'];
        p.frag = { until: toDay + 21, mult: tr.relapse };
        const wasUser = p.t === state.userId;
        const name = FB.INJURIES[p.inj.type].name;
        p.inj = null;
        if (wasUser) FB.news(state, 'atualizacao', `${p.n} está recuperado`, `${p.n} recebeu alta do departamento médico (${name.toLowerCase()}) e volta a ficar à disposição.`, { team: p.t });
        continue;
      }
      if (p.inj) continue;
      // Lesões em treino: raras, maiores com treino físico e jogadores em recuperação recente.
      const team = state.teams[p.t];
      const tr = team.id === state.userId ? team.training : 'equilibrado';
      let prob = 0.00011 * gap * ({ fisico: 1.6, tecnico: 1.2, descanso: 0.4 }[tr] || 1);
      if (p.frag && toDay <= p.frag.until) prob *= 2 * p.frag.mult;
      if (p.age >= 32) prob *= 1.3;
      if (Math.random() < prob) {
        FB.injure(state, p, FB.rollInjuryType(p, true), { news: true });
        if (team.id === state.userId) FB.news(state, 'atualizacao', `${p.n} se machuca no treino`, `${p.n} sentiu dores durante o treinamento e foi encaminhado para exames.`, { team: team.id });
      }
    }
  };

  // Quem atua no sacrifício pode agravar a lesão.
  FB.playedHurt = (state, p) => {
    if (!p.inj || !p.inj.play) return;
    p.inj.until += 2;
    if (Math.random() < 0.22) {
      const worse = WORSENS[p.inj.type] || 'musc2';
      const old = FB.INJURIES[p.inj.type].name;
      FB.injure(state, p, worse, { news: false });
      FB.news(state, 'atualizacao', `${p.n} agrava lesão`, `Depois de atuar no sacrifício, ${p.n} teve a ${old.toLowerCase()} agravada: agora é ${FB.INJURIES[worse].name.toLowerCase()}.`, { team: p.t });
    }
  };

  // Peso de cada jogador no sorteio de quem se lesiona: cansaço, recaída recente e idade.
  FB.injuryRisk = (p, en, today) => {
    let r = 1 + (100 - en) / 45;
    if (p.frag && p.frag.until >= today) r *= 1.8 * p.frag.mult;
    if (p.age >= 32) r *= 1.2;
    return r;
  };

  FB.fmtDays = d => {
    if (d <= 1) return '1 dia';
    if (d < 14) return `${d} dias`;
    if (d < 60) return `${Math.round(d / 7)} semanas`;
    return `${Math.round(d / 30)} meses`;
  };

  FB.injuryNews = (state, p) => {
    if (p.t == null) return;
    const t = state.teams[p.t];
    const important = t.id === state.userId || (t.div === 0 && FB.isKeyPlayer(state, p));
    if (!important) return;
    const left = p.inj.until - FB.today(state);
    FB.news(state, 'atualizacao', `${t.name}: ${p.n} lesionado`,
      `Exames confirmaram ${FB.INJURIES[p.inj.type].name.toLowerCase()}. Previsão de ${FB.fmtDays(left)} fora.`, { team: t.id });
  };
})(window.FB);
