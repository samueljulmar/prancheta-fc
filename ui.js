'use strict';
// Prancheta FC — interface mobile.
(function (FB) {
  const app = document.getElementById('app');
  const validSave = s => s && s.v === 2 && s.userId != null && Array.isArray(s.dates);
  let S = null;

  const ui = {
    tab: 'inicio', elenco: 'escalacao', sort: 'pos', comp: null, compPh: null, compRound: null, compView: 'tabela',
    mkt: { mode: 'transf', pos: '', afford: false, q: '' }, newsCat: '', newsMine: false, setup: null, live: null,
    welcome: false, tipOff: null, mailFrom: '',
  };

  // ---------- Utilitários ----------

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = FB.fmtMoney;
  const T = id => S.teams[id];
  const P = id => S.players[id];
  const me = () => S.teams[S.userId];
  const date = (day, wd = true) => FB.fmtDate(S, day, wd);

  const badge = (t, size = 34) =>
    `<span class="badge" style="--c1:${esc(t.c1)};--c2:${esc(t.c2)};--s:${size}px">${esc(t.short)}</span>`;
  const posTag = pos => `<span class="pos ${pos}">${pos}</span>`;
  const enBar = (en, w) => `<div class="bar ${en < 50 ? 'bad' : en < 75 ? 'warn' : ''}" ${w ? `style="width:${w}px"` : ''}><i style="width:${en}%"></i></div>`;
  const moIcon = mo => (mo >= 75 ? '😃' : mo >= 50 ? '🙂' : mo >= 30 ? '😐' : '😞');
  const stars = s => {
    const n = FB.clamp(Math.round((s - 45) / 7), 1, 5);
    return `<span class="stars"><b>${'★'.repeat(n)}</b>${'★'.repeat(5 - n)}</span>`;
  };
  const susTotal = p => Object.values(p.sus || {}).reduce((a, b) => a + b, 0);
  const daysLeft = p => (p.inj ? Math.max(0, p.inj.until - FB.today(S)) : 0);
  const statusTags = p => {
    let s = '';
    if (p.inj) s += `<span class="tag red">${p.inj.play ? '💉' : '🩹'} ${FB.fmtDays(daysLeft(p))}</span>`;
    if (susTotal(p)) s += `<span class="tag red">🟥 susp.</span>`;
    if (p.sale) s += `<span class="tag gold">À venda</span>`;
    if (p.loan) s += `<span class="tag blue">${p.loan.from === S.userId ? 'Emprestado' : 'Por empréstimo'}</span>`;
    return s ? `<span class="tags">${s}</span>` : '';
  };
  const rerender = () => { if (ui.pre) renderPrematch(); else render(); };
  const SENDER_ICON = { Diretoria: '🏛️', 'Departamento médico': '🩺', 'Auxiliar técnico': '📋', Mercado: '💼', Torcida: '📣', Olheiro: '🔭', Clube: '✉️' };
  const tacSeg = (team, k, label, opts, act = 'tac') => `
    <div class="tac-row"><span class="muted small">${label}</span>
      <div class="seg" style="margin:0">${Object.entries(opts).map(([v, l]) => `<button class="${FB.tac(team, k) === v ? 'on' : ''}" data-act="${act}" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div></div>`;
  const tacticsHtml = (team, act = 'tac') =>
    tacSeg(team, 'posture', 'Postura', FB.POSTURES, act) +
    tacSeg(team, 'press', 'Pressão', { baixa: 'Baixa', media: 'Média', alta: 'Alta' }, act) +
    Object.entries(FB.TACTICS).map(([k, d]) => tacSeg(team, k, d.label, d.opts, act)).join('');
  // Formação sem a bola ("Igual" usa a mesma de quando o time ataca).
  const defSeg = (cur, att, act) => `<p class="muted small" style="margin:10px 0 6px">Sem a bola</p>
    <div class="seg">${[['', 'Igual'], ...Object.keys(FB.FORMATIONS).filter(f => f !== att).map(f => [f, f])].map(([v, l]) =>
      `<button class="${(cur && cur !== att ? cur : '') === v ? 'on' : ''}" data-act="${act}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const formHtml = list => `<span class="form">${list.map(f => `<i class="${f}">${f}</i>`).join('')}</span>`;

  function toast(text, ms = 2600) {
    document.querySelectorAll('.toast').forEach(x => x.remove());
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  function download(name, text, type = 'application/json') {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---------- Folha inferior ----------

  let sheetRender = null;
  function openSheet(render, opts = {}) {
    closeSheet();
    sheetRender = render;
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.id = 'sheet';
    ov.innerHTML = `<div class="sheet"><div class="grab"></div><div id="sheet-body"></div></div>`;
    ov.addEventListener('click', e => { if (e.target === ov && !opts.modal) closeSheet(); });
    document.body.appendChild(ov);
    refreshSheet();
  }
  function refreshSheet() {
    const b = document.getElementById('sheet-body');
    if (b && sheetRender) b.innerHTML = sheetRender();
  }
  function closeSheet() {
    document.getElementById('sheet')?.remove();
    sheetRender = null;
  }
  function confirmSheet(title, text, yesLabel, onYes, danger) {
    A['confirm-yes'] = () => { closeSheet(); onYes(); };
    openSheet(() => `
      <h2>${esc(title)}</h2><p class="muted">${esc(text)}</p>
      <div class="btns"><button class="btn" data-act="close">Cancelar</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" data-act="confirm-yes">${esc(yesLabel)}</button></div>`);
  }

  // ---------- Ícones ----------

  const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICON = {
    inicio: svg('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
    elenco: svg('<path d="M8 3 3 6l2 5 2-1v11h10V10l2 1 2-5-5-3a4 4 0 0 1-8 0z"/>'),
    mensagens: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
    mercado: svg('<path d="M7 7h13l-3 3M17 17H4l3-3"/>'),
    mais: svg('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'),
    play: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
  };
  const TABS = [['inicio', 'Painel'], ['elenco', 'Elenco'], ['mensagens', 'Mensagens'], ['mercado', 'Mercado'], ['mais', 'Mais']];

  // ---------- Render principal ----------

  function render() {
    if (!S) { app.innerHTML = ui.setup ? renderSetup() : renderSplash(); return; }
    if (ui.welcome) { app.innerHTML = renderWelcome(); return; }
    const t = me();
    const unread = ui.tab === 'mensagens' ? 0 : S.inbox.filter(m => !m.read).length;
    const pending = S.inbox.some(m => (m.offer && !m.offer.done) || (m.injury && P(m.injury.pid)?.inj && !P(m.injury.pid).inj.chosen));
    const sec = SECTIONS[ui.tab];
    const navOn = k => (k === 'mais' ? !!sec : ui.tab === k);
    const f = !S.fired && !S.seasonOver ? FB.userFixture(S) : null;
    app.innerHTML = `
      <header class="top">
        ${badge(t, 36)}
        <div class="club"><b>${esc(S.coach)}</b><small>${esc(t.name)} · ${date(FB.today(S))}/${S.season}</small></div>
        ${S.fired || S.seasonOver ? `<div class="cash ${t.cash < 0 ? 'neg' : ''}">${money(t.cash)}</div>`
          : `<button class="btn sm primary" data-act="play">${f ? 'Jogar' : 'Avançar'} ▶</button>`}
      </header>
      <main>${sec ? `<div class="view-title"><button class="btn sm" data-act="more">←</button><b>${sec[0]}</b></div>${sec[1]()}` : VIEWS[ui.tab]()}</main>
      <nav class="nav">${TABS.map(([k, label]) => `
        <button class="${navOn(k) ? 'on' : ''}" data-act="${k === 'mais' ? 'more' : 'tab'}" data-v="${k}">${ICON[k]}${label}
        ${k === 'mensagens' && unread ? `<span class="count">${unread > 9 ? '9+' : unread}</span>` : k === 'mensagens' && pending ? '<span class="dot"></span>' : ''}</button>`).join('')}
      </nav>`;
    markRead();
  }

  // ---------- Início / novo jogo ----------

  function slotCard(n, m) {
    const t = { c1: m.c1, c2: m.c2, short: m.short };
    const started = m.started ? new Date(m.started).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
    return `<div class="card career">
      <div class="row">${badge(t, 46)}<div class="grow"><b class="ellipsis" style="display:block;font-size:17px">${esc(m.club)}</b>
        <div class="muted small ellipsis">${FB.DIV_NAMES[m.div]} · ${esc(m.coach)}</div></div></div>
      <div class="chips">
        <span class="chip">📅 Temporada ${m.season}</span>
        ${m.rounds ? `<span class="chip">⚽ Rodada ${m.round}/${m.rounds}</span>` : ''}
        ${m.fired ? '<span class="chip red">Sem clube</span>' : m.pos ? `<span class="chip ${m.pos <= 3 ? 'gold' : ''}">🏆 ${m.pos}º lugar</span>` : ''}
      </div>
      ${started ? `<p class="muted small" style="margin:0 0 10px">Iniciada em ${esc(started)}</p>` : ''}
      <div class="row"><button class="btn primary grow" data-act="slot-play" data-v="${n}">▶ Continuar</button>
        <button class="btn danger icon" data-act="slot-del" data-v="${n}" aria-label="Apagar carreira">🗑</button></div>
    </div>`;
  }

  function renderSplash() {
    const slots = FB.slots();
    const used = Object.keys(slots).map(Number).sort((a, b) => a - b);
    const free = FB.freeSlot() != null;
    return `
      <div class="splash">
        <div class="logo">Prancheta<span> FC</span></div>
        <div class="tagline">Assuma um clube brasileiro: estaduais, Brasileirão das Séries A a D, Copa do Brasil, Libertadores e Sul-Americana.</div>
        ${used.length ? `<div class="row between" style="margin:8px 2px 10px"><b style="font-size:18px">Suas carreiras</b>
          <span class="muted small">${used.length} de ${FB.MAX_SLOTS}</span></div>
          ${used.map(n => slotCard(n, slots[n])).join('')}` : ''}
        ${free ? `
          <button class="btn ${used.length ? '' : 'primary'} big block" data-act="new-game" data-v="real">Nova carreira — clubes reais</button>
          <button class="btn block" data-act="new-game" data-v="ficticio">Nova carreira — clubes fictícios</button>
          <button class="btn block" data-act="import-open" data-v="save">Carregar save (.json)</button>`
        : `<p class="muted small center">Limite de ${FB.MAX_SLOTS} carreiras atingido. Apague uma para começar outra.</p>`}
        <p class="muted small center" style="margin-top:24px">Os clubes reais vêm com elencos gerados. Para usar os jogadores reais, importe uma base na tela de escolha do clube.</p>
      </div>`;
  }

  // Apresentação ao assumir um clube: contrato e metas da diretoria.
  const GOAL_ICON = { liga: '🎯', copa: '🏆', folha: '💰', caixa: '🏦', base: '🌱' };

  function renderWelcome() {
    const t = me();
    const c = S.contract;
    const years = c ? c.until - c.from + 1 : 1;
    return `
      <div class="welcome">
        <div class="w-head">${badge(t, 72)}
          <div class="w-brand">PRANCHETA FC</div>
          <h1>${esc(t.name)}</h1>
          <p class="muted" style="margin:0">Bem-vindo, <b style="color:var(--text)">${esc(S.coach)}</b></p></div>
        ${c ? `<div class="card"><h3>📋 Seu contrato</h3>
          <div class="row between" style="padding:4px 0"><span class="muted">Salário mensal</span><b class="pos-green" style="font-size:20px">${money(c.sal)}</b></div>
          <div class="row between" style="padding:4px 0"><span class="muted">Duração</span><b>${years} temporada${years > 1 ? 's' : ''}</b></div>
          <div class="row between" style="padding:4px 0"><span class="muted">Contrato até</span><b>Temporada ${c.until}</b></div></div>` : ''}
        <div class="card"><h3>Metas da diretoria</h3>
          ${(S.board.goals || []).map(g => `<div class="goal"><span class="goal-ico">${GOAL_ICON[g.k] || '•'}</span><span>${esc(g.text)}</span></div>`).join('')}</div>
        <div class="card"><h3>Recursos</h3>
          <div class="row between small" style="padding:3px 0"><span class="muted">Caixa do clube</span><b>${money(t.cash)}</b></div>
          <div class="row between small" style="padding:3px 0"><span class="muted">Orçamento para contratações</span><b>${money(FB.budgetLeft(S))}</b></div>
          <div class="row between small" style="padding:3px 0"><span class="muted">Teto da folha salarial</span><b>${money(S.board.wageCap || 0)}/mês</b></div></div>
      </div>
      <div class="bottom-cta"><button class="btn primary big block" data-act="welcome-done">Começar o trabalho</button></div>`;
  }

  function renderSetup() {
    const st = ui.setup;
    const W = st.world;
    const teams = W.teams.filter(t => t.div === st.div)
      .map(t => ({ t, s: FB.teamStrength(W, t) })).sort((a, b) => b.s - a.s);
    return `
      <div style="padding:calc(16px + var(--safe-t)) 16px calc(100px + var(--safe-b))">
        <div class="row between" style="margin-bottom:14px">
          <button class="btn sm" data-act="setup-back">← Voltar</button>
          <button class="btn sm" data-act="import-open" data-v="setup">⬆ Importar elencos reais</button>
        </div>
        <h2 style="margin:0 0 4px">Escolha seu clube</h2>
        <p class="muted small" style="margin:0 0 14px">${W.pack === 'ficticio' ? 'Clubes fictícios.' : 'Clubes reais, temporada ' + W.season + '.'} ${st.imported ? '<b>' + esc(st.imported) + '</b>' : 'Elencos gerados.'}</p>
        <label class="field"><span>Nome do treinador</span>
          <input id="coach" maxlength="30" value="${esc(st.coach)}" placeholder="Seu nome" autocomplete="off"></label>
        <div class="seg fill">${[0, 1, 2, 3].map(i => `<button class="${st.div === i ? 'on' : ''}" data-act="setup-div" data-v="${i}">${FB.DIV_NAMES[i].replace('Série ', 'Série ')}</button>`).join('')}</div>
        <div class="list">${teams.map(({ t, s }) => `
          <button class="item ${st.sel === t.id ? 'me' : ''}" data-act="setup-pick" data-id="${t.id}">
            ${badge(t)}
            <div class="grow"><div class="name ellipsis">${esc(t.name)}</div>
              <div class="meta">${esc(t.city)}/${esc(t.uf)} · Caixa ${money(t.cash)}</div></div>
            <div class="small">${stars(s)}</div>
          </button>`).join('')}
        </div>
      </div>
      <div class="bottom-cta">
        <button class="btn primary big block" data-act="setup-start" ${st.sel == null ? 'disabled' : ''}>
          ${st.sel == null ? 'Selecione um clube' : 'Assumir o ' + esc(W.teams[st.sel].name)}</button>
      </div>`;
  }

  // ---------- Importação ----------

  // mode: 'setup' (antes de começar), 'game' (durante a carreira) ou 'save'.
  function openImport(mode) {
    ui.importMode = mode;
    openSheet(() => mode === 'save' ? `
      <h2>Carregar save</h2>
      <p class="muted small">Escolha um arquivo .json exportado em Clube → Dados → Exportar save.</p>
      <label class="btn primary block" style="margin:12px 0">Escolher arquivo<input type="file" id="db-file" accept=".json,application/json" hidden></label>` : `
      <h2>Elencos reais</h2>
      <p class="muted small">Você pode carregar três tipos de arquivo (pode selecionar mais de um):</p>
      <div class="list small">
        <div class="msg"><b>jogadores.csv</b><p>Sua planilha: <code>nome; clube; posicao; idade; forca; potencial; valor; salario</code>. O clube pode ser o nome ou a sigla. Sem <i>forca</i>, ela vem do valor de mercado ("R$ 12,5 mi", "€ 3m").</p></div>
        <div class="msg"><b>players.csv do transfermarkt-datasets</b><p>Base aberta (licença CC0) do projeto transfermarkt-datasets, disponível no GitHub e no Kaggle. Os jogadores são ligados aos clubes do jogo pelo nome do clube atual; o valor em euros vira força.</p></div>
        <div class="msg"><b>clubes.csv</b><p>Atualiza nome, cores, estádio, torcida e caixa${mode === 'setup' ? ' e, se o total fechar em 20/20/20/32, as divisões' : ''}.</p></div>
      </div>
      <label class="btn primary block" style="margin:12px 0 8px">Escolher arquivo(s)
        <input type="file" id="db-file" accept=".csv,.json,text/csv,application/json" multiple hidden></label>
      <button class="btn block" data-act="template">Baixar planilhas modelo (base atual)</button>
      ${mode === 'game' ? '<p class="muted small">Durante a carreira, os elencos são trocados na hora (inclusive o seu). As divisões não mudam no meio da temporada.</p>' : ''}`);
    document.getElementById('db-file').addEventListener('change', e => handleFiles([...e.target.files]));
  }

  async function handleFiles(files) {
    if (!files.length) return;
    const mode = ui.importMode;
    let clubs = null, players = null;
    try {
      for (const f of files) {
        const text = await f.text();
        if (/\.json$/i.test(f.name) || /^\s*[{[]/.test(text)) {
          const j = JSON.parse(text);
          if (j.calendar || j.dates) {
            closeSheet();
            if (!validSave(j)) { toast('Save de uma versão antiga ou inválido.', 3500); return; }
            confirmSheet('Carregar save', `Carregar a carreira de ${j.coach || 'treinador'} (${j.season})? O jogo atual será substituído.`, 'Carregar', () => {
              const n = FB.freeSlot();
              if (n == null) { toast(`Limite de ${FB.MAX_SLOTS} carreiras atingido.`); return; }
              enterSlot(n, j); FB.save(S); toast('Save carregado!');
            });
            return;
          }
          clubs = j.clubs || j.clubes || clubs;
          players = j.players || j.jogadores || players;
        } else {
          const rows = FB.parseCSV(text);
          const keys = rows.length ? Object.keys(rows[0]) : [];
          if (keys.some(k => ['posicao', 'pos', 'position', 'sub_position'].includes(k))) players = rows;
          else clubs = rows;
        }
      }
    } catch (e) {
      toast('Não consegui ler o arquivo: ' + e.message, 4000);
      return;
    }
    const world = mode === 'setup' ? ui.setup.world : S;
    const report = [];
    if (clubs) {
      const r = FB.importClubs(world, clubs, mode === 'setup');
      report.push(`${r.count} clube(s) atualizados.`, ...r.warnings);
    }
    let summary = '';
    if (players) {
      const r = FB.importPlayers(world, players);
      summary = `${r.count} jogadores (${r.source}) em ${r.clubs.length} clube(s).`;
      report.push(summary, ...r.warnings.slice(0, 40));
      if (r.clubs.length) report.push('Clubes atualizados: ' + r.clubs.join(', '));
    }
    if (mode === 'setup') {
      FB.afterImport(world);
      ui.setup.imported = summary || 'Clubes atualizados.';
    } else {
      FB.fixLineup(S, me());
      FB.news(S, 'atualizacao', 'Base de dados atualizada', summary || 'Dados dos clubes atualizados.');
      FB.save(S);
    }
    closeSheet();
    render();
    openSheet(() => `<h2>Importação concluída</h2>
      <div class="list">${report.map(w => `<div class="msg"><p>${esc(w)}</p></div>`).join('')}</div>
      <button class="btn primary block" data-act="close">OK</button>`);
  }

  // ---------- Início ----------

  function viewInicio() {
    const t = me();
    let html = '';

    if (S.fired) {
      const offers = S.jobOffers || [];
      html += `<div class="card"><h3>Você foi demitido</h3>
        <p class="muted small" style="margin-top:0">Escolha um novo clube para continuar sua carreira.</p>
        <div class="list">${offers.map(id => `
          <button class="item" data-act="take-job" data-id="${id}">${badge(T(id))}
            <div class="grow"><div class="name">${esc(T(id).name)}</div><div class="meta">${FB.DIV_NAMES[T(id).div]}</div></div>
            <span class="btn sm primary">Aceitar</span></button>`).join('')}</div>
        <button class="btn danger block" data-act="slot-del" data-v="${FB.slot}">Encerrar carreira</button></div>`;
      return html + mailPreview();
    }

    if (S.seasonOver) {
      const st = FB.leagueStanding(S, t.id);
      html += `<div class="card next"><div class="comp">Temporada ${S.season} encerrada</div>
        ${st ? `<p style="margin:0 0 14px">Você terminou em <b>${st.pos}º</b> na ${FB.DIV_NAMES[t.div]}.</p>` : ''}
        <button class="btn primary big block" data-act="end-season">Ver balanço e iniciar ${S.season + 1}</button></div>`;
      return html + mailPreview();
    }

    html += nextMatchCard() + lastMatchCard() + tipCard() + boardCard();

    const st = FB.leagueStanding(S, t.id);
    html += `<div class="card"><h3>Situação</h3><div class="stat-grid">
      ${st ? `<div class="stat"><small>${esc(S.comps[st.key].short)}${st.group ? ' · ' + esc(st.group) : ''}</small><b>${st.row.j ? st.pos + 'º' : '–'}</b> <span class="muted small">${st.row.p} pts</span></div>` : ''}
      <div class="stat"><small>Caixa</small><b class="${t.cash < 0 ? 'pos-red' : ''}">${money(t.cash)}</b></div>
    </div>
    ${t.form.length ? `<div class="row between" style="margin-top:12px"><span class="muted small">Últimos jogos</span>${formHtml(t.form.slice(-5))}</div>` : ''}
    <div class="row between" style="margin-top:8px"><span class="muted small">Mercado</span><span class="small ${FB.windowOpen(S) ? 'pos-green' : 'muted'}">${FB.windowText(S)}</span></div>
    </div>`;

    const f = FB.userFixture(S);
    const list = FB.upcoming(S, t.id, 6).filter(x => !(f && x.di === S.di)).slice(0, 4);
    if (list.length) {
      html += `<div class="card"><div class="row between" style="margin-bottom:6px"><h3 style="margin:0">Próximos jogos</h3>
        <button class="btn sm" data-act="tab" data-v="calendario">Calendário</button></div>${list.map(upcomingRow).join('')}</div>`;
    }

    const injured = t.squad.map(P).filter(p => p.inj);
    if (injured.length) {
      html += `<div class="card"><h3>Departamento médico</h3>${injured.map(p => `
        <button class="item" style="padding:6px 0;min-height:0;border:0" data-act="player" data-id="${p.id}">${posTag(p.pos)}
          <div class="grow"><div class="name ellipsis small">${esc(p.n)}</div><div class="meta">${esc(FB.INJURIES[p.inj.type].name)}</div></div>
          <span class="small ${p.inj.chosen ? 'muted' : 'pos-gold'}">${p.inj.chosen ? 'volta ' + date(p.inj.until, false) : 'definir tratamento'}</span></button>`).join('')}</div>`;
    }
    return html + mailPreview() + newsPreview();
  }

  const upcomingRow = x => {
    const t = me();
    return `<div class="row small" style="padding:6px 0;align-items:flex-start">
      <span class="muted" style="width:86px;flex:0 0 auto">${esc(date(x.day))}</span>
      <div class="grow"><div class="ellipsis">${x.f ? (x.f.h === t.id ? 'vs ' + esc(T(x.f.a).name) + ' (C)' : '@ ' + esc(T(x.f.h).name) + ' (F)') : '—'}</div>
      <div class="muted ellipsis" style="font-size:11.5px">${esc(x.label)}</div></div></div>`;
  };

  // Dificuldade do jogo pela diferença de força, com o mando de campo.
  function difficulty(f) {
    const t = me();
    const opp = T(f.h === t.id ? f.a : f.h);
    const d = FB.teamStrength(S, opp) - FB.lineupStrength(S, t) + (f.comp.neutral ? 0 : f.h === t.id ? -2 : 2);
    if (d <= -6) return ['Fácil', 'green'];
    if (d <= -2) return ['Favorável', 'green'];
    if (d < 2) return ['Equilibrado', 'blue'];
    if (d < 6) return ['Difícil', 'gold'];
    return ['Muito difícil', 'red'];
  }

  function nextMatchCard() {
    const t = me();
    const f = FB.userFixture(S);
    const today = FB.today(S);
    if (!f) {
      const comps = [...new Set(S.dates[S.di].slots.map(s => S.comps[s.key].kind === 'estadual' ? 'Estaduais' : S.comps[s.key].short))].join(', ');
      return `<div class="card next"><div class="comp">${esc(date(today))} · ${esc(comps)}</div>
        <p class="muted" style="margin:0 0 14px">Seu time não joga nesta data.</p>
        <button class="btn primary big block" data-act="play">Avançar ▶</button></div>`;
    }
    const c = S.comps[f.comp.key];
    const home = f.h === t.id;
    const [diff, cls] = difficulty(f);
    const ovr = id => Math.round(id === t.id ? FB.lineupStrength(S, t) : FB.teamStrength(S, T(id)));
    const side = id => `<div class="side">${badge(T(id), 54)}<b>${esc(T(id).name)}</b>
      <span class="ovr-tag">OVR <b>${ovr(id)}</b></span></div>`;
    const aggTxt = f.comp.decisive && f.comp.leg === 1 ? `<p class="small muted center" style="margin:-4px 0 10px">Ida: ${T(f.a).short} ${f.comp.aggA} x ${f.comp.aggH} ${T(f.h).short}</p>` : '';
    return `<div class="card next">
      <div class="row between" style="margin-bottom:4px"><span class="pill">${esc(c.name)}</span>
        <span class="muted small">${f.comp.neutral ? '🏟️ Neutro' : home ? '🏠 Casa' : '✈️ Fora'}</span></div>
      <div class="muted small">${esc(date(today))} · ${esc(FB.compLabel(S, f).replace(c.name + ' · ', ''))}</div>
      <div class="vs">${side(f.h)}
        <div class="x">VS<span class="diff ${cls}">${diff}</span></div>
        ${side(f.a)}</div>
      ${aggTxt}
      <div class="btns"><button class="btn" data-act="tab" data-v="elenco">Escalação</button>
      <button class="btn primary big" style="flex:2" data-act="play">▶ Jogar partida</button></div>
    </div>`;
  }

  function lastMatchCard() {
    const L = S.lastMatch;
    if (!L || !L.best || !P(L.best.pid)) return '';
    const p = P(L.best.pid);
    const mine = L.h === S.userId;
    const word = { V: 'Vitória', E: 'Empate', D: 'Derrota' }[L.res];
    return `<div class="card"><h3>⭐ Craque da última partida</h3>
      <button class="item" style="border:0;padding:0;min-height:0" data-act="player" data-id="${p.id}">
        <span class="star-ico">⭐</span>
        <div class="grow"><div class="name ellipsis">${esc(p.n)}</div>
          <div class="meta">Nota ${L.best.rt.toFixed(1).replace('.', ',')}${L.best.goals ? ` · ${L.best.goals} gol${L.best.goals > 1 ? 's' : ''}` : ''}</div></div>
        <div style="text-align:right"><b class="res-${L.res}">${mine ? L.hg : L.ag}–${mine ? L.ag : L.hg}</b>
          <div class="small res-${L.res}">${word}</div></div></button>
      <p class="muted small" style="margin:8px 0 0">${esc(L.label)} · ${mine ? 'vs ' + esc(T(L.a).name) : '@ ' + esc(T(L.h).name)}</p></div>`;
  }

  // Dica do auxiliar técnico: primeiro os problemas urgentes, depois observações que se alternam a cada data.
  function assistantTip() {
    const t = me();
    const squad = t.squad.map(P);
    const untreated = squad.find(p => p.inj && !p.inj.chosen);
    if (untreated) return { icon: '🩺', title: 'Lesão sem tratamento', text: `${untreated.n} está lesionado e aguarda a sua decisão.`, hint: 'Abra a ficha dele e escolha o tratamento.', act: `data-act="player" data-id="${untreated.id}"` };
    if (t.cash < 0) return { icon: '🏦', title: 'Caixa negativo', text: `O clube está com ${money(t.cash)} em caixa.`, hint: 'Venda jogadores ou reduza a folha salarial.' };
    const tired = t.lineup.filter(id => id != null && P(id).en < 70).map(P);
    if (tired.length >= 2) return { icon: '🔋', title: 'Titulares cansados', text: `${tired.length} titulares estão abaixo de 70% de energia: ${tired.slice(0, 3).map(p => p.n.split(' ')[0]).join(', ')}.`, hint: 'Use "Rodar cansados" na escalação.', act: 'data-act="tab" data-v="elenco"' };
    if (S.board.wageCap && FB.payroll(S, t) > S.board.wageCap) return { icon: '💰', title: 'Folha acima do teto', text: `A folha está em ${money(FB.payroll(S, t))}/mês; o teto é ${money(S.board.wageCap)}.`, hint: 'A diretoria perde confiança todo mês até a folha baixar.' };

    const opts = [];
    const goals = p => Object.values(p.gl || {}).reduce((a, b) => a + b, 0);
    const top = squad.slice().sort((a, b) => goals(b) - goals(a))[0];
    if (top && goals(top) >= 3) opts.push({ icon: '🔥', title: 'Jogador em destaque', text: `${top.n} tem ${goals(top)} gols na temporada. OVR ${top.ovr}.`, hint: 'Mantenha-o como titular e monte o time em volta dele.', act: `data-act="player" data-id="${top.id}"` });
    const sad = squad.filter(p => p.mo < 35);
    if (sad.length) opts.push({ icon: '😞', title: 'Moral baixo', text: `${sad.length} jogador(es) estão desanimados: ${sad.slice(0, 3).map(p => p.n.split(' ')[0]).join(', ')}.`, hint: 'Dê minutos a eles ou use a preleção para motivar o grupo.' });
    const young = squad.filter(p => p.age <= 20 && !t.lineup.includes(p.id) && FB.knowsPot(S, p) && p.pot >= p.ovr + 10).sort((a, b) => b.pot - a.pot)[0];
    if (young) opts.push({ icon: '🌱', title: 'Promessa no elenco', text: `${young.n} (${young.age} anos) tem potencial ${young.pot}.`, hint: 'Jogando, os jovens evoluem mais rápido.', act: `data-act="player" data-id="${young.id}"` });
    if (FB.windowOpen(S) && FB.budgetLeft(S) > 0) opts.push({ icon: '💼', title: 'Janela aberta', text: `Há ${money(FB.budgetLeft(S))} de orçamento para contratações.`, hint: 'Procure reforços no Mercado.', act: 'data-act="tab" data-v="mercado"' });
    const weak = FB.POS.map(pos => ({ pos, n: squad.filter(p => p.pos === pos && !p.inj).length })).find(x => x.n < { G: 2, Z: 4, L: 3, M: 5, A: 3 }[x.pos]);
    if (weak) opts.push({ icon: '📋', title: 'Elenco curto', text: `Só ${weak.n} ${FB.POS_NAME[weak.pos].toLowerCase()}(s) disponível(is).`, hint: 'Considere contratar alguém para essa posição.', act: 'data-act="tab" data-v="mercado"' });
    return opts.length ? opts[S.di % opts.length] : null;
  }

  function tipCard() {
    if (ui.tipOff === S.di) return '';
    const tip = assistantTip();
    if (!tip) return '';
    return `<div class="card tip"><button class="tip-x" data-act="tip-off" aria-label="Fechar">×</button>
      <div class="tip-head">${tip.icon} Auxiliar técnico</div>
      <b>${esc(tip.title)}</b><p class="muted small" style="margin:4px 0 6px">${esc(tip.text)}</p>
      <p class="small pos-gold" style="margin:0">💡 ${esc(tip.hint)}</p>
      ${tip.act ? `<button class="btn sm" style="margin-top:10px" ${tip.act}>Ver</button>` : ''}</div>`;
  }

  const MOOD_TAG = c => (c >= 75 ? ['Confiante', 'green'] : c >= 50 ? ['Satisfeita', 'blue'] : c >= 30 ? ['Preocupada', 'gold'] : ['Insatisfeita', 'red']);

  function boardCard() {
    const conf = Math.round(S.board.conf);
    const [mood, cls] = MOOD_TAG(conf);
    const main = (S.board.goals || []).find(g => g.k === 'liga');
    return `<div class="card"><h3>Confiança da diretoria</h3>
      <div class="row" style="gap:12px"><b class="big-num">${conf}%</b><span class="tag ${cls}">${mood}</span></div>
      <div class="bar ${conf < 30 ? 'bad' : conf < 50 ? 'warn' : ''}" style="margin:8px 0 12px"><i style="width:${conf}%"></i></div>
      ${main ? `<div class="muted small">Meta principal</div><div class="row between" style="gap:8px"><b>${esc(main.text)}</b>
        <span class="tag ${main.status === 'cumprido' ? 'green' : main.status === 'falhou' ? 'red' : ''}" style="flex:0 0 auto">${FB.GOAL_STATUS[main.status]}</span></div>` : ''}
      <div class="row between small" style="margin-top:10px"><span class="muted">Orçamento p/ contratações</span><b>${money(FB.budgetLeft(S))}</b></div>
      <div class="btns" style="margin-top:12px"><button class="btn sm" data-act="tab" data-v="diretoria">Metas</button>
        <button class="btn sm" data-act="ask-budget" ${S.board.askedMore ? 'disabled' : ''}>+ Pedir verba</button></div></div>`;
  }

  function mailItem(m) {
    let extra = '';
    if (m.offer) {
      extra = m.offer.done ? `<span class="tag ${m.offer.result === 'Aceita' ? 'green' : ''}">${esc(m.offer.result || '')}</span>`
        : `<div class="btns"><button class="btn sm danger" data-act="offer-no" data-id="${m.id}">Recusar</button>
           <button class="btn sm primary" data-act="offer-yes" data-id="${m.id}">Aceitar</button></div>`;
    }
    if (m.injury) {
      const p = P(m.injury.pid);
      if (p && p.inj && !p.inj.chosen && p.t === S.userId) extra = `<div class="btns"><button class="btn sm primary" data-act="treat-open" data-id="${p.id}">Escolher tratamento</button></div>`;
    }
    return `<div class="msg ${m.read ? '' : 'unread'}"><div class="row" style="gap:6px;margin-bottom:2px"><span class="tag">${SENDER_ICON[m.from] || '✉️'} ${esc(m.from || 'Clube')}</span>
      <span class="muted small grow" style="text-align:right">${m.season === S.season ? esc(date(m.day, false)) : m.season}</span></div>
      <b>${esc(m.title)}</b><p class="pre">${esc(m.text)}</p>${extra}</div>`;
  }

  function viewMensagens() {
    const senders = [...new Set(S.inbox.map(m => m.from || 'Clube'))];
    if (ui.mailFrom && !senders.includes(ui.mailFrom)) ui.mailFrom = '';
    const list = S.inbox.filter(m => !ui.mailFrom || m.from === ui.mailFrom);
    return `<div class="seg">${[['', 'Todos'], ...senders.map(x => [x, x])].map(([k, l]) => `<button class="${(ui.mailFrom || '') === k ? 'on' : ''}" data-act="mail-from" data-v="${esc(k)}">${k ? SENDER_ICON[k] || '✉️' : ''} ${esc(l)}</button>`).join('')}</div>
      <div class="list">${list.map(mailItem).join('') || '<div class="empty">Nenhuma mensagem.</div>'}</div>`;
  }

  // As mensagens só contam como lidas depois de exibidas.
  function markRead() {
    if (ui.tab !== 'mensagens' || !S.inbox.some(m => !m.read)) return;
    S.inbox.forEach(m => { m.read = true; });
    FB.save(S);
  }

  function mailPreview() {
    const unread = S.inbox.filter(m => !m.read);
    if (!unread.length) return '';
    return `<div class="card" style="padding:0"><div class="row between" style="padding:14px 14px 0"><h3 style="margin:0">Mensagens <span class="tag red">${unread.length} nova(s)</span></h3>
      <button class="btn sm" data-act="tab" data-v="mensagens">Abrir</button></div>${unread.slice(0, 3).map(mailItem).join('')}</div>`;
  }

  function newsPreview() {
    const list = S.news.slice(0, 3);
    if (!list.length) return '';
    return `<div class="card" style="padding:0"><div class="row between" style="padding:14px 14px 0"><h3 style="margin:0">Últimas notícias</h3>
      <button class="btn sm" data-act="tab" data-v="noticias">Ver todas</button></div>${list.map(newsItem).join('')}</div>`;
  }

  // ---------- Elenco ----------

  function viewElenco() {
    const tabs = [['escalacao', 'Escalação'], ['tatica', 'Tática'], ['jogadores', 'Jogadores'], ['medico', 'Médico'], ['treino', 'Treino']];
    const seg = `<div class="seg fill">${tabs.map(([k, l]) => `<button class="${ui.elenco === k ? 'on' : ''}" data-act="elenco" data-v="${k}">${l}</button>`).join('')}</div>`;
    if (ui.elenco === 'jogadores') return seg + playersHtml();
    if (ui.elenco === 'treino') return seg + trainingHtml();
    if (ui.elenco === 'medico') return seg + medicalHtml();
    if (ui.elenco === 'tatica') return seg + tacticTabHtml();
    return seg + lineupHtml();
  }

  function pitchHtml(team, lineup, formation, opts = {}) {
    const slots = FB.slotsOf(formation);
    const rows = [[], [], [], []];
    slots.forEach((pos, i) => rows[FB.POS_ROW[pos]].push(i));
    const slot = i => {
      const pid = lineup[i];
      const p = pid != null ? P(pid) : null;
      const en = p ? Math.round(opts.en ? opts.en[pid] : p.en) : 0;
      const bad = p && (opts.hurt ? opts.hurt.has(pid) : (p.inj && !p.inj.play) || susTotal(p));
      const off = p && FB.posFactor(slots[i], p.pos) < 1;
      const first = p ? p.n.split(' ')[0] : '';
      return `<button class="slot ${off ? 'off' : ''}" data-act="${opts.act || 'slot'}" data-i="${i}">
        <span class="shirt ${p ? '' : 'empty'}" style="--c1:${team.c1};--c2:${team.c2}">${p ? p.ovr : slots[i]}${bad ? '<span class="warn">⚠️</span>' : ''}</span>
        <span class="nm">${p ? esc(first.length > 3 ? first : p.n) : FB.POS_NAME[slots[i]]}</span>
        ${p ? `<span class="en">${enBar(en)}</span>` : ''}</button>`;
    };
    return `<div class="pitch">${rows.filter(r => r.length).map(r => `<div class="line">${r.map(slot).join('')}</div>`).join('')}</div>`;
  }

  function lineupHtml() {
    const t = me();
    if (t.lineup.length !== FB.slotsOf(t.formation).length) FB.fixLineup(S, t);
    const bench = t.squad.filter(id => !t.lineup.includes(id)).map(P).sort((a, b) => FB.POS.indexOf(a.pos) - FB.POS.indexOf(b.pos) || b.ovr - a.ovr);
    const f = FB.userFixture(S);
    const key = f ? f.comp.key : null;
    const issues = t.lineup.filter(id => id == null || !FB.available(P(id), key) || P(id).inj).length;
    return `
      <div class="card" style="padding:12px">
        <p class="muted small" style="margin:0 0 6px">Com a bola</p>
        <div class="seg">${Object.keys(FB.FORMATIONS).map(fm => `<button class="${t.formation === fm ? 'on' : ''}" data-act="formation" data-v="${fm}">${fm}</button>`).join('')}</div>
        ${defSeg(t.formationDef, t.formation, 'formation-def')}
        <p class="muted small" style="margin:0">Postura, pressão, ritmo e demais instruções ficam na aba <b>Tática</b>.</p>
      </div>
      ${issues ? `<div class="card small" style="border-color:var(--orange)">⚠️ ${issues} posição(ões) com jogador lesionado, suspenso${key ? ' na ' + esc(S.comps[key].short) : ''} ou vazia. Toque para trocar ou use <b>Escalar automaticamente</b>.</div>` : ''}
      ${pitchHtml(t, t.lineup, t.formation)}
      <div class="btns" style="margin-bottom:12px"><button class="btn" data-act="auto-lineup">⚡ Escalar automaticamente</button>
        <button class="btn" data-act="auto-lineup" data-v="rot">🔄 Rodar cansados</button></div>
      ${benchHtml(t, key)}`;
  }

  // Banco de reservas (relacionados) e lista de quem fica de fora.
  function benchHtml(t, key) {
    if (!t.bench || !t.bench.length) t.bench = FB.autoBench(S, t, t.lineup, key);
    t.bench = t.bench.filter(id => t.squad.includes(id) && !t.lineup.includes(id));
    const others = t.squad.filter(id => !t.lineup.includes(id)).map(P)
      .sort((a, b) => (t.bench.includes(b.id) - t.bench.includes(a.id)) || FB.POS.indexOf(a.pos) - FB.POS.indexOf(b.pos) || b.ovr - a.ovr);
    const row = p => {
      const on = t.bench.includes(p.id);
      const out = !FB.available(p, key) || (p.inj && !p.inj.play);
      return `<div class="item ${on ? 'me' : ''}">${posTag(p.pos)}
        <button class="grow plain" data-act="player" data-id="${p.id}"><div class="name ellipsis">${esc(p.n)}${statusTags(p)}</div>
          <div class="meta">${p.age} anos · ${moIcon(p.mo)} · energia ${Math.round(p.en)}%</div></button>
        <div class="ovr">${p.ovr}</div>
        <button class="btn sm ${on ? 'primary' : ''}" data-act="bench-toggle" data-id="${p.id}" ${out && !on ? 'disabled' : ''}>${on ? 'No banco' : 'Relacionar'}</button></div>`;
    };
    return `<div class="row between" style="margin:4px 2px 8px"><b>Banco de reservas (${t.bench.length}/${FB.MAX_BENCH})</b>
        <button class="btn sm" data-act="auto-bench">Auto</button></div>
      <p class="muted small" style="margin:-4px 2px 8px">Só quem está no banco pode entrar durante o jogo. Força titular: ${FB.lineupStrength(S, t).toFixed(1)}</p>
      <div class="list">${others.map(row).join('')}</div>`;
  }

  // Aba Tática: estilo de jogo, capitão, rodízio e prioridade por competição.
  function tacticTabHtml() {
    const t = me();
    const rot = t.rotation || { auto: false, min: 65 };
    const comps = compOrder();
    const capOpts = t.lineup.filter(id => id != null).map(P).sort((a, b) => b.ovr - a.ovr);
    return `<div class="card"><h3>Estilo de jogo</h3>${tacticsHtml(t)}
        <p class="muted small" style="margin:8px 0 0">Dica: contra-ataque rende contra quem joga adiantado; pelos lados funciona contra times sem laterais (3-5-2, 3-4-3). Ritmo acelerado e linha alta cansam mais.</p></div>
      <div class="card"><h3>Capitão</h3>
        <select class="select" id="captain-select"><option value="">Sem capitão definido</option>
          ${capOpts.map(p => `<option value="${p.id}" ${t.captain === p.id ? 'selected' : ''}>${esc(p.n)} (${p.pos}, ${p.ovr})</option>`).join('')}</select>
        <p class="muted small" style="margin:6px 0 0">Um capitão em campo e com boa moral dá um pequeno ganho ao time.</p></div>
      <div class="card"><h3>Rodízio do elenco</h3>
        <div class="row between"><span>Rodízio automático</span><button class="btn sm ${rot.auto ? 'primary' : ''}" data-act="rot-toggle">${rot.auto ? 'Ligado' : 'Desligado'}</button></div>
        <p class="muted small">Ligado, o auxiliar monta o time antes de cada jogo, poupando quem estiver abaixo da energia mínima.</p>
        <div class="row between"><span class="small">Energia mínima</span>
          <div class="seg" style="margin:0">${[55, 65, 75].map(v => `<button class="${(rot.min || 65) === v ? 'on' : ''}" data-act="rot-min" data-v="${v}">${v}%</button>`).join('')}</div></div>
        <h3 style="margin-top:14px">Prioridade por competição</h3>
        ${comps.map(c => `<div class="tac-row"><span class="muted small">${esc(c.short)}</span>
          <div class="seg" style="margin:0">${[['principal', 'Principal'], ['normal', 'Normal'], ['poupar', 'Poupar titulares']].map(([k, l]) =>
            `<button class="${((t.prio || {})[c.key] || 'normal') === k ? 'on' : ''}" data-act="prio" data-k="${c.key}" data-v="${k}">${l}</button>`).join('')}</div></div>`).join('')}
        <p class="muted small" style="margin:6px 0 0">"Poupar titulares" faz o rodízio automático e o botão 🔄 preferirem os reservas nessa competição.</p></div>`;
  }

  function playerRow(p, opts = {}) {
    const t = p.t != null ? T(p.t) : null;
    const right = opts.price != null
      ? `<div style="text-align:right"><div class="ovr">${p.ovr}</div><div class="meta small">${money(opts.price)}</div></div>`
      : `<div class="ovr">${p.ovr}</div>`;
    return `<button class="item" data-act="${opts.act || 'player'}" data-id="${p.id}">
      ${posTag(p.pos)}
      <div class="grow"><div class="name ellipsis">${esc(p.n)}${statusTags(p)}</div>
        <div class="meta">${p.age} anos${opts.team && t ? ' · ' + esc(t.short) : opts.team ? ' · Livre' : ''}${opts.noEn ? '' : ' · ' + moIcon(p.mo)}</div>
        ${opts.noEn ? '' : `<div style="margin-top:4px;width:90px">${enBar(p.en)}</div>`}</div>
      ${right}</button>`;
  }

  function playersHtml() {
    const t = me();
    const sorters = {
      pos: (a, b) => FB.POS.indexOf(a.pos) - FB.POS.indexOf(b.pos) || b.ovr - a.ovr,
      ovr: (a, b) => b.ovr - a.ovr,
      idade: (a, b) => a.age - b.age,
      energia: (a, b) => a.en - b.en,
      gols: (a, b) => FB.goals(b) - FB.goals(a),
    };
    const list = t.squad.map(P).sort(sorters[ui.sort]);
    return `
      <div class="seg">${Object.keys(sorters).map(k => `<button class="${ui.sort === k ? 'on' : ''}" data-act="sort" data-v="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
      <p class="muted small" style="margin:0 2px 8px">${list.length} jogadores · Folha ${money(FB.payroll(S, t))}/mês</p>
      <div class="list">${list.map(p => playerRow(p)).join('')}</div>`;
  }

  function medicalHtml() {
    const t = me();
    const injured = t.squad.map(P).filter(p => p.inj).sort((a, b) => daysLeft(b) - daysLeft(a));
    const fragile = t.squad.map(P).filter(p => !p.inj && p.frag && p.frag.until >= FB.today(S));
    return `
      <p class="muted small" style="margin:0 2px 10px">Prazos estimados pelo departamento médico. Tratamentos mais agressivos aceleram a volta, mas aumentam o risco de recaída nas semanas seguintes.</p>
      ${injured.length ? `<div class="list">${injured.map(p => `
        <button class="item" data-act="player" data-id="${p.id}">${posTag(p.pos)}
          <div class="grow"><div class="name ellipsis">${esc(p.n)}</div>
            <div class="meta">${esc(FB.INJURIES[p.inj.type].name)}</div>
            <div class="meta">${p.inj.chosen ? esc(FB.TREATMENTS[p.inj.treat].name) : '<span class="pos-gold">Tratamento a definir</span>'}</div></div>
          <div style="text-align:right"><b>${FB.fmtDays(daysLeft(p))}</b><div class="meta">${p.inj.play ? 'disponível' : 'volta ' + date(p.inj.until, false)}</div></div></button>`).join('')}</div>`
        : '<div class="empty">Nenhum jogador no departamento médico. 💪</div>'}
      ${fragile.length ? `<div class="card small"><h3>Em transição física</h3>${fragile.map(p => `<div class="row between" style="padding:3px 0"><span>${esc(p.n)}</span><span class="muted">risco maior até ${date(p.frag.until, false)}</span></div>`).join('')}</div>` : ''}`;
  }

  function trainingHtml() {
    const t = me();
    const cur = t.training || 'equilibrado';
    return `<p class="muted small" style="margin:0 2px 10px">O foco do treino vale para os dias entre um jogo e outro.</p>
      <div class="list">${Object.entries(FB.TRAININGS).map(([k, v]) => `
        <button class="item ${cur === k ? 'me' : ''}" data-act="training" data-v="${k}">
          <div class="grow"><div class="name">${v.name}</div><div class="meta">${v.desc}</div></div>
          ${cur === k ? '<span class="tag green">Ativo</span>' : ''}</button>`).join('')}</div>
      <div class="card small muted">Com jogos a cada 3 ou 4 dias, use <b>Descanso</b> ou <b>Físico</b>. Nas semanas livres, <b>Técnico</b> acelera a evolução dos jovens.</div>`;
  }

  // ---------- Ficha do jogador ----------

  function openPlayer(pid) { ui.counter = null; openSheet(() => playerSheet(pid)); }

  function treatmentHtml(p) {
    const opts = FB.treatmentOptions(p.inj.type);
    const today = FB.today(S);
    return `<div class="list">${opts.map(k => {
      const tr = FB.TREATMENTS[k];
      const cost = FB.treatmentCost(S, p.t, k);
      const days = FB.treatmentDays(p, k);
      return `<button class="item ${p.inj.treat === k && p.inj.chosen ? 'me' : ''}" data-act="treat" data-id="${p.id}" data-v="${k}" ${p.inj.chosen ? 'disabled' : ''}>
        <div class="grow"><div class="name">${tr.name}</div><div class="meta">${tr.desc}</div></div>
        <div style="text-align:right;flex:0 0 auto"><b class="small">${k === 'sacrificio' ? 'joga já' : 'volta ' + date(p.inj.start + days, false)}</b>
        <div class="meta">${cost ? money(cost) : 'sem custo'}</div></div></button>`;
    }).join('')}</div>${p.inj.chosen ? '' : `<p class="muted small">Hoje é ${date(today, false)}. A escolha não pode ser alterada depois.</p>`}`;
  }

  function playerSheet(pid) {
    const p = P(pid);
    if (!p) return '<p>Jogador não encontrado.</p>';
    const mine = p.t === S.userId;
    const team = p.t != null ? T(p.t) : null;
    const value = FB.calcValue(p);
    const knows = FB.knowsPot(S, p);
    const avg = FB.avgRating(p);
    const sus = Object.entries(p.sus || {}).filter(([, n]) => n > 0).map(([k, n]) => `${n} jogo(s) na ${S.comps[k] ? S.comps[k].short : k}`);
    let actions = '';
    const loanFromMe = p.loan && p.loan.from === S.userId;
    const loanTag = p.loan ? `<p class="small" style="margin:0 0 10px"><span class="tag blue">Empréstimo</span> ${loanFromMe
      ? `Emprestado ao ${esc(T(p.loan.to).name)} até o fim de ${p.loan.until}.` : `Do ${esc(T(p.loan.from).name)} até o fim de ${p.loan.until}.`}</p>` : '';
    if (mine && p.loan) {
      actions = `<button class="btn block" data-act="loan-return" data-id="${p.id}">Devolver ao ${esc(T(p.loan.from).name)}</button>`;
    } else if (mine) {
      actions = `<div class="btns">
        <button class="btn" data-act="toggle-sale" data-id="${p.id}">${p.sale ? 'Tirar da lista de venda' : 'Colocar à venda'}</button>
        <button class="btn danger" data-act="release" data-id="${p.id}">Dispensar</button></div>
        <button class="btn block" style="margin-top:8px" data-act="loan-out-open" data-id="${p.id}">↗ Emprestar</button>`;
    } else if (loanFromMe) {
      actions = '';
    } else if (!S.fired) {
      const sal = FB.wageDemand(S, p, S.userId);
      if (!team) {
        actions = `<p class="muted small">Jogador livre. Pede salário de <b>${money(sal)}/mês</b> e luvas de <b>${money(sal * 2)}</b>.</p>
          <button class="btn primary block" data-act="sign-free" data-id="${p.id}">Contratar</button>`;
      } else if (!FB.windowOpen(S)) {
        actions = `<p class="muted small">🔒 Janela de transferências fechada. ${FB.windowText(S)}.</p>`;
      } else {
        const opts = [0.85, 1, 1.2, 1.4].map(k => Math.round(value * k / 10000) * 10000);
        actions = `<p class="muted small">Proposta ao ${esc(team.name)} · salário pedido ${money(sal)}/mês</p>
          <div class="btns">${opts.map(v => `<button class="btn sm" data-act="bid" data-id="${p.id}" data-v="${v}" ${v > me().cash ? 'disabled' : ''}>${money(v)}</button>`).join('')}</div>
          ${ui.counter && ui.counter.pid === p.id ? `<button class="btn primary block" style="margin-top:8px" data-act="bid" data-id="${p.id}" data-v="${ui.counter.v}" ${ui.counter.v > me().cash ? 'disabled' : ''}>Pagar o pedido: ${money(ui.counter.v)}</button>` : ''}`;
      }
      const terms = team && FB.loanTerms(S, p);
      if (terms && FB.windowOpen(S)) actions += `<button class="btn block" style="margin-top:8px" data-act="loan-in" data-id="${p.id}">↙ Pedir emprestado · taxa ${money(terms.fee)}, salário ${money(terms.pay)}/mês</button>`;
      if (!knows) actions += `<button class="btn block" style="margin-top:8px" data-act="scout" data-id="${p.id}">🔎 Enviar olheiro (${money(FB.SCOUT_COST)})</button>`;
      const watched = (S.watch || []).includes(p.id);
      actions += `<button class="btn block ${watched ? 'primary' : ''}" style="margin-top:8px" data-act="watch" data-id="${p.id}">${watched ? '★ Na lista de observação' : '☆ Observar'}</button>`;
    }
    let report = '';
    if (!mine && !loanFromMe && FB.knowsPot(S, p) && !S.fired) {
      const v = FB.scoutVerdict(S, p);
      const cls = { Contratar: 'green', 'Bom, mas caro': 'gold', 'Opção de elenco': 'blue' }[v.grade] || 'red';
      report = `<div class="card"><h3>🔭 Relatório do olheiro</h3><p style="margin:0 0 6px"><span class="tag ${cls}">${v.grade}</span></p>
        ${v.lines.map(l => `<p class="small" style="margin:3px 0">• ${esc(l)}</p>`).join('')}</div>`;
    }
    const goalsBy = Object.entries(p.gl || {}).filter(([, g]) => g).map(([k, g]) => `${g} ${S.comps[k] ? S.comps[k].short : k}`).join(' · ');
    return `
      <div class="row" style="margin-bottom:10px">${posTag(p.pos)}<div class="grow"><h2 class="ellipsis">${esc(p.n)}</h2>
        <div class="muted small">${FB.POS_NAME[p.pos]} · ${p.age} anos · ${team ? esc(team.name) : 'Sem clube'}</div></div>
        <div class="ovr" style="font-size:28px">${p.ovr}</div></div>
      ${p.inj ? `<div class="card" style="border-color:var(--red)"><h3>🩹 ${esc(FB.INJURIES[p.inj.type].name)}</h3>
        <p class="small" style="margin:0 0 8px">${p.inj.play ? 'Atuando no sacrifício' : `Previsão de retorno: <b>${date(p.inj.until)}</b> (${FB.fmtDays(daysLeft(p))})`}${p.inj.chosen ? ' · ' + esc(FB.TREATMENTS[p.inj.treat].name) : ''}</p>
        ${mine ? treatmentHtml(p) : ''}</div>` : ''}
      ${sus.length ? `<p class="small pos-red" style="margin:0 0 10px">🟥 Suspenso: ${esc(sus.join(', '))}</p>` : ''}
      ${loanTag}
      <div class="stat-grid" style="margin-bottom:14px">
        <div class="stat"><small>Potencial</small><b>${knows ? p.pot : '?'}</b> <span class="small muted">${knows ? FB.potLabel(p.pot) : 'Observe para saber'}</span></div>
        <div class="stat"><small>Valor de mercado</small><b>${money(value)}</b></div>
        <div class="stat"><small>Energia</small><b>${Math.round(p.en)}%</b>${enBar(p.en)}</div>
        <div class="stat"><small>Moral</small><b>${moIcon(p.mo)} ${Math.round(p.mo)}</b></div>
        <div class="stat"><small>Salário</small><b>${money(p.sal)}</b><span class="small muted">/mês</span></div>
        <div class="stat"><small>Temporada</small><b>${p.j}</b> <span class="small muted">jogos · ${FB.goals(p)} gols</span></div>
        <div class="stat"><small>Nota média</small><b>${avg ? avg.toFixed(1) : '–'}</b> <span class="small muted">${p.lastRt ? 'última ' + p.lastRt.toFixed(1) : ''}</span></div>
        <div class="stat"><small>Gols por competição</small><span class="small">${esc(goalsBy) || '–'}</span></div>
      </div>
      ${report}${actions}`;
  }

  // ---------- Jogos (competições) ----------

  function compOrder() {
    const t = me();
    const mine = Object.values(S.comps).filter(c => c.teams.includes(t.id));
    const rank = c => ({ liga: 0, estadual: 1, copa: 2, continental: 3 }[c.kind] ?? 4);
    mine.sort((a, b) => rank(a) - rank(b));
    return mine;
  }

  function viewJogos() {
    const mine = compOrder();
    if (!ui.comp || !S.comps[ui.comp]) ui.comp = mine[0] ? mine[0].key : 'A';
    const c = S.comps[ui.comp];
    const others = Object.values(S.comps).filter(x => !mine.includes(x));
    let html = `<div class="seg">${mine.map(x => `<button class="${x.key === ui.comp ? 'on' : ''}" data-act="comp" data-v="${x.key}">${esc(x.short)}</button>`).join('')}
      <button class="${ui.comp === '__gal' ? 'on' : ''}" data-act="comp" data-v="__gal">🏆 Galeria</button></div>
      <div class="row" style="margin-bottom:12px"><label class="field grow" style="margin:0"><select id="comp-select" class="select">
        <option value="">Outras competições…</option>
        ${others.map(x => `<option value="${x.key}" ${x.key === ui.comp ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
      </select></label></div>`;
    if (ui.comp === '__gal') return html + galleryHtml();
    html += `<div class="row between" style="margin:0 2px 8px"><b>${esc(c.name)} ${S.season}</b>${c.champion != null ? `<span class="small">🏆 ${esc(T(c.champion).name)}</span>` : ''}</div>`;
    const phases = c.phases;
    if (ui.compPh == null || !phases[ui.compPh]) ui.compPh = phases.length - 1;
    if (phases.length > 1) {
      html += `<div class="seg">${phases.map((ph, i) => `<button class="${i === ui.compPh ? 'on' : ''}" data-act="comp-ph" data-v="${i}">${esc(ph.name)}</button>`).join('')}</div>`;
    }
    const P0 = phases[ui.compPh];
    html += `<div class="seg fill">${[['tabela', P0.t === 'rr' ? 'Classificação' : 'Confrontos'], ['jogos', 'Rodadas'], ['art', 'Artilharia']].map(([k, l]) => `<button class="${ui.compView === k ? 'on' : ''}" data-act="comp-view" data-v="${k}">${l}</button>`).join('')}</div>`;
    if (ui.compView === 'art') return html + scorersHtml(c);
    if (ui.compView === 'jogos' && P0.t === 'rr') return html + roundsHtml(c, P0);
    if (P0.t === 'ko') return html + tiesHtml(c, P0);
    return html + P0.groups.map(g => groupHtml(c, P0, g)).join('') + legendHtml(c, ui.compPh) + calendarHtml(c);
  }

  function legendHtml(c, ph) {
    const L = {
      A: '🟨 Campeão · 🟩 G6 Libertadores · 🟦 Sul-Americana · 🟥 Rebaixamento (4)',
      B: '🟩 Acesso (G4) · 🟥 Rebaixamento (4)',
      C: ph === 0 ? '🟩 Quadrangulares (G8) · 🟥 Rebaixamento (4)' : '🟩 Acesso: 2 primeiros de cada grupo',
      D: '🟩 Mata-mata: 4 primeiros de cada grupo',
      CONT: '🟩 Oitavas: 2 primeiros de cada grupo',
      EST: '🟩 Semifinal: 4 primeiros',
    };
    const txt = L[c.key] || L[c.fmt];
    return txt ? `<p class="muted small" style="margin:-4px 2px 14px">${txt}</p>` : '';
  }

  function rowClass(c, ph, i, n) {
    if (c.key === 'A') return i === 0 ? 'champ' : i < 6 ? 'up' : i < 12 ? 'sula' : i >= n - 4 ? 'down' : '';
    if (c.key === 'B') return i < 4 ? 'up' : i >= n - 4 ? 'down' : '';
    if (c.key === 'C') return ph === 0 ? (i < 8 ? 'up' : i >= n - 4 ? 'down' : '') : i < 2 ? 'up' : '';
    if (c.fmt === 'D' || c.fmt === 'EST') return i < 4 ? 'up' : '';
    if (c.fmt === 'CONT') return i < 2 ? 'up' : '';
    return '';
  }

  function groupHtml(c, P0, g) {
    const rows = FB.groupTable(S, g);
    return `${g.name ? `<h4 class="sub">${esc(g.name)}</h4>` : ''}<div class="list"><table class="tbl"><thead><tr><th>#</th><th class="team">Clube</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr class="${r.id === S.userId ? 'me' : ''} ${rowClass(c, ui.compPh, i, rows.length)}"><td class="rank">${i + 1}</td>
        <td class="team"><div>${badge(T(r.id), 22)}<span>${esc(T(r.id).name)}</span></div></td>
        <td class="p">${r.p}</td><td>${r.j}</td><td>${r.v}</td><td>${r.e}</td><td>${r.d}</td><td>${r.gp - r.gc}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  function roundsHtml(c, P0) {
    const nR = P0.groups[0].fixtures.length;
    const lastPlayed = (() => { let r = 0; P0.groups[0].results.forEach((rd, i) => { if (rd.every(x => x)) r = i; }); return r; })();
    const r = FB.clamp(ui.compRound ?? lastPlayed, 0, nR - 1);
    const dayOf = (() => {
      const k = c.sched.findIndex(s => s.ph === ui.compPh && s.r === r);
      const d = S.dates.find(dt => dt.slots.some(s => s.key === c.key && s.k === k));
      return d ? date(d.day) : '';
    })();
    return `<div class="row between" style="margin:0 2px 8px">
        <button class="btn sm" data-act="comp-round" data-v="${r - 1}" ${r <= 0 ? 'disabled' : ''}>◀</button>
        <div class="center"><b>${r + 1}ª rodada</b><div class="muted small">${esc(dayOf)}</div></div>
        <button class="btn sm" data-act="comp-round" data-v="${r + 1}" ${r >= nR - 1 ? 'disabled' : ''}>▶</button></div>
      ${P0.groups.map(g => `${g.name ? `<h4 class="sub">${esc(g.name)}</h4>` : ''}<div class="list">${g.fixtures[r].map(([h, a], i) => resultRow(h, a, g.results[r][i])).join('')}</div>`).join('')}`;
  }

  function tiesHtml(c, P0) {
    return `<div class="list">${P0.ties.map(t => {
      const [ga, gb] = FB.tieAgg(t);
      const legs = t.res.map((r, leg) => {
        if (!r) return '';
        const home = P0.legs === 1 || leg === 1 ? t.a : t.b;
        const away = home === t.a ? t.b : t.a;
        return `<span>${T(home).short} ${r.hg} x ${r.ag} ${T(away).short}</span>`;
      }).filter(Boolean).join(' · ');
      const mine = t.a === S.userId || t.b === S.userId;
      return `<div class="tie ${mine ? 'me' : ''}">
        <div class="tie-row ${t.w === t.b ? 'win' : ''}">${badge(T(t.b), 22)}<span class="grow ellipsis">${esc(T(t.b).name)}</span><b>${t.res.some(x => x) ? gb : ''}</b></div>
        <div class="tie-row ${t.w === t.a ? 'win' : ''}">${badge(T(t.a), 22)}<span class="grow ellipsis">${esc(T(t.a).name)}</span><b>${t.res.some(x => x) ? ga : ''}</b></div>
        ${legs || t.pens ? `<div class="meta small">${legs}${t.pens ? ` · pênaltis ${t.pens[1]} x ${t.pens[0]}` : ''}</div>` : `<div class="meta small">${P0.legs === 2 ? 'Ida e volta · decide em casa: ' + esc(T(t.a).short) : P0.neutral ? 'Jogo único em campo neutro' : 'Jogo único no campo do ' + esc(T(t.a).short)}</div>`}
      </div>`;
    }).join('')}</div>`;
  }

  function calendarHtml(c) {
    const next = S.dates.slice(S.di).find(d => d.slots.some(s => s.key === c.key));
    if (!next || c.fmt === 'LEAGUE') return '';
    return `<p class="muted small" style="margin:0 2px">Próxima data: ${esc(date(next.day))}</p>`;
  }

  function resultRow(h, a, res, pens) {
    const mine = h === S.userId || a === S.userId;
    return `<div class="res ${mine ? 'me' : ''}">
      <div class="h"><span>${esc(T(h).name)}</span>${badge(T(h), 22)}</div>
      <div class="sc">${res && res.hg != null ? `${res.hg} × ${res.ag}` : '–'}${pens ? `<span class="pen">pên. ${pens[0]}-${pens[1]}</span>` : ''}</div>
      <div class="a">${badge(T(a), 22)}<span>${esc(T(a).name)}</span></div></div>`;
  }

  function scorersHtml(c) {
    const list = FB.scorers(S, c.key, 20);
    if (!list.length) return `<div class="empty">Nenhum gol marcado ainda.</div>`;
    return `<div class="list">${list.map((p, i) => `
      <button class="item ${p.t === S.userId ? 'me' : ''}" data-act="player" data-id="${p.id}">
        <b style="width:22px">${i + 1}</b>${badge(T(p.t), 24)}
        <div class="grow"><div class="name ellipsis">${esc(p.n)}</div><div class="meta">${esc(T(p.t).name)}</div></div>
        <div class="ovr">${p.gl[c.key]}</div></button>`).join('')}</div>`;
  }

  function galleryHtml() {
    const t = me();
    const titles = Object.entries(t.titles || {}).filter(([, n]) => n);
    const names = { A: 'Série A', B: 'Série B', C: 'Série C', D: 'Série D', CB: 'Copa do Brasil', LIB: 'Libertadores', SUL: 'Sul-Americana', SUP: 'Supercopa' };
    const big = S.champions.filter(c => !c.key.startsWith('E-') || T(c.tid).uf === t.uf);
    return `<div class="card"><h3>Sala de troféus · ${esc(t.name)}</h3>
        ${titles.length ? titles.map(([k, n]) => `<div class="row between small" style="padding:3px 0"><span>${esc(names[k] || FB.UF_COMP[k.slice(2)] || k)}</span><b>${n}×</b></div>`).join('') : '<p class="muted small" style="margin:0">Nenhum título conquistado no jogo ainda.</p>'}
        ${t.titlesText ? `<p class="muted small">Histórico real: ${esc(t.titlesText)}</p>` : ''}</div>
      ${big.length ? `<div class="list">${big.slice(0, 60).map(c => `<div class="item">${badge(T(c.tid), 26)}
        <div class="grow"><div class="name ellipsis">${esc(T(c.tid).name)}</div><div class="meta">${esc(c.comp)} ${c.season}</div></div></div>`).join('')}</div>` : '<div class="empty">Os campeões aparecem aqui ao fim de cada competição.</div>'}`;
  }

  // ---------- Mercado ----------

  function viewMercado() {
    const m = ui.mkt;
    const t = me();
    let html = `<div class="card small row between" style="padding:10px 14px"><span>${FB.windowOpen(S) ? '🟢' : '🔒'} ${FB.windowText(S)}</span><span class="muted">Livres: sempre</span></div>
      <div class="seg">${[['transf', 'Transferências'], ['livres', 'Livres'], ['emprestimo', 'Empréstimos'], ['observados', '★ Observados'], ['venda', 'À venda']].map(([k, l]) =>
      `<button class="${m.mode === k ? 'on' : ''}" data-act="mkt-mode" data-v="${k}">${l}</button>`).join('')}</div>`;
    if (m.mode === 'observados') {
      const list = (S.watch || []).map(P).filter(p => p && p.t !== S.userId);
      return html + `<button class="btn primary block" style="margin-bottom:12px" data-act="search-open">🔭 Buscar talentos (${money(FB.SEARCH_COST)})</button>` +
        (list.length ? `<div class="list">${list.map(p => playerRow(p, { team: true, noEn: true, price: p.t == null ? FB.wageDemand(S, p, S.userId) * 2 : FB.calcValue(p) })).join('')}</div>`
          : `<div class="empty">Nenhum jogador observado.<br>Toque em ☆ Observar na ficha de um jogador ou peça uma busca ao olheiro.</div>`);
    }
    if (m.mode === 'emprestimo') {
      const mineLoans = Object.values(S.players).filter(p => p.loan && (p.loan.from === S.userId || p.loan.to === S.userId));
      html += mineLoans.length ? `<div class="card" style="padding:0"><h3 style="padding:14px 14px 0">Seus empréstimos</h3><div class="list" style="margin:0">${mineLoans.map(p => playerRow(p, { team: true, noEn: true })).join('')}</div></div>` : '';
    }
    if (m.mode === 'venda') {
      const list = t.squad.map(P).filter(p => p.sale);
      return html + (list.length ? `<div class="list">${list.map(p => playerRow(p, { price: FB.calcValue(p) })).join('')}</div>`
        : `<div class="empty">Nenhum jogador seu está à venda.<br>Abra a ficha de um jogador no Elenco para listá-lo.</div>`);
    }
    html += `<div class="seg">${[['', 'Todos'], ...FB.POS.map(p => [p, FB.POS_NAME[p]])].map(([k, l]) =>
      `<button class="${m.pos === k ? 'on' : ''}" data-act="mkt-pos" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="row" style="margin-bottom:10px">
        <label class="field grow" style="margin:0"><input id="mkt-q" placeholder="Buscar nome ou clube" value="${esc(m.q)}" autocomplete="off"></label>
        <button class="btn sm ${m.afford ? 'primary' : ''}" data-act="mkt-afford" style="min-height:48px">Cabe no caixa</button>
      </div>`;
    const q = FB.norm(m.q);
    let pool;
    if (m.mode === 'livres') pool = S.free.map(P);
    else if (m.mode === 'emprestimo') pool = Object.values(S.players).filter(p => p.t != null && p.t !== S.userId && FB.loanTerms(S, p));
    else pool = Object.values(S.players).filter(p => p.t != null && p.t !== S.userId && T(p.t).div !== 4 && !p.loan);
    pool = pool.filter(p => (!m.pos || p.pos === m.pos) &&
      (!q || FB.norm(p.n).includes(q) || (p.t != null && (FB.norm(T(p.t).name).includes(q) || T(p.t).short.toLowerCase() === q))));
    const price = p => (p.t == null ? FB.wageDemand(S, p, S.userId) * 2 : m.mode === 'emprestimo' ? FB.loanTerms(S, p).fee : FB.calcValue(p));
    if (m.afford) pool = pool.filter(p => price(p) <= t.cash);
    pool.sort((a, b) => b.ovr - a.ovr || a.age - b.age);
    const shown = pool.slice(0, 80);
    return html + (shown.length
      ? `<p class="muted small" style="margin:0 2px 8px">${pool.length} jogador(es)${pool.length > 80 ? ' · mostrando 80' : ''}${m.mode === 'livres' ? ' · preço = luvas' : m.mode === 'emprestimo' ? ' · preço = taxa de empréstimo' : ''}</p>
         <div class="list">${shown.map(p => playerRow(p, { team: true, noEn: true, price: price(p) })).join('')}</div>`
      : '<div class="empty">Nenhum jogador encontrado.</div>');
  }

  // ---------- Notícias ----------

  const CAT_CLASS = { noticia: 'blue', mercado: 'green', especulacao: 'gold', fofoca: '', curiosidade: 'purple', atualizacao: 'red' };

  function newsItem(n) {
    const t = n.team != null ? S.teams[n.team] : null;
    return `<div class="news">
      <div class="row" style="gap:8px;margin-bottom:4px">${t ? badge(t, 18) : ''}<span class="tag ${CAT_CLASS[n.cat] || ''}">${FB.NEWS_CATS[n.cat] || n.cat}</span>
      <span class="muted small grow" style="text-align:right">${n.season === S.season ? esc(date(n.day, false)) : n.season}</span></div>
      <b>${esc(n.title)}</b><p>${esc(n.text)}</p></div>`;
  }

  function viewNoticias() {
    const list = S.news.filter(n => (!ui.newsCat || n.cat === ui.newsCat) && (!ui.newsMine || n.team === S.userId));
    return `<div class="seg">${[['', 'Tudo'], ...Object.entries(FB.NEWS_CATS)].map(([k, l]) => `<button class="${ui.newsCat === k ? 'on' : ''}" data-act="news-cat" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="row between" style="margin:0 2px 10px"><span class="muted small">${list.length} notícia(s)</span>
        <button class="btn sm ${ui.newsMine ? 'primary' : ''}" data-act="news-mine">Só meu clube</button></div>
      ${list.length ? `<div class="list">${list.slice(0, 100).map(newsItem).join('')}</div>` : '<div class="empty">Nada por aqui ainda. As notícias chegam a cada rodada.</div>'}
      <p class="muted small center">Notícias, especulações e bastidores são gerados pelo jogo — é ficção dentro da sua carreira.</p>`;
  }

  // ---------- Clube ----------

  function clubCards() {
    const t = me();
    const f = S.fin.last || {};
    const sf = S.fin.season || {};
    const LABELS = { bilheteria: 'Bilheteria', patrocinio: 'Patrocínio', tv: 'Direitos de TV', premios: 'Premiações', vendas: 'Vendas de jogadores',
      salarios: 'Salários', manutencao: 'Manutenção do estádio', compras: 'Contratações', obras: 'Obras', olheiros: 'Olheiros', medico: 'Departamento médico' };
    const finRows = obj => Object.entries(obj).filter(([, v]) => v).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
      `<div class="row between small" style="padding:4px 0"><span class="muted">${LABELS[k] || k}</span><b class="${v < 0 ? 'pos-red' : 'pos-green'}">${money(v)}</b></div>`).join('') || '<p class="muted small">Sem movimentação.</p>';
    const total = o => Object.values(o).reduce((s, v) => s + v, 0);
    const opp = FB.userFixture(S);
    const estAtt = FB.attendance(S, t.id, opp ? (opp.h === t.id ? opp.a : opp.h) : t.id, opp ? opp.comp : null);
    const lg = S.fin.lastGate;
    return {
      financas: `<div class="card"><h3>Finanças</h3>
        <div class="stat-grid" style="margin-bottom:10px">
          <div class="stat"><small>Caixa</small><b class="${t.cash < 0 ? 'pos-red' : ''}">${money(t.cash)}</b></div>
          <div class="stat"><small>Folha salarial</small><b>${money(FB.payroll(S, t))}</b><span class="small muted">/mês</span></div>
        </div>
        <p class="muted small" style="margin:0 0 6px">Salários, TV e patrocínio entram na virada de cada mês. Bilheteria a cada jogo em casa.</p>
        <details><summary class="small" style="padding:6px 0">Última data: <b class="${total(f) < 0 ? 'pos-red' : 'pos-green'}">${money(total(f))}</b></summary>${finRows(f)}</details>
        <details><summary class="small" style="padding:6px 0">Temporada: <b class="${total(sf) < 0 ? 'pos-red' : 'pos-green'}">${money(total(sf))}</b></summary>${finRows(sf)}</details>
        ${t.cash < 0 ? '<p class="small pos-red">Caixa negativo! Venda jogadores ou reduza a folha.</p>' : ''}
      </div>`,
      estadio: `<div class="card"><h3>Estádio</h3>
        <div class="row between"><span>Capacidade</span><b>${t.cap.toLocaleString('pt-BR')}</b></div>
        <div class="row between" style="margin-top:4px"><span>Torcida (público potencial)</span><b>${t.fans.toLocaleString('pt-BR')}</b></div>
        ${lg ? `<div class="row between small muted" style="margin-top:4px"><span>Último jogo em casa</span><span>${lg.att.toLocaleString('pt-BR')} pagantes · ${money(lg.income)}</span></div>` : ''}
        <div class="row between" style="margin-top:12px"><span>Ingresso</span>
          <div class="stepper"><button class="btn" data-act="ticket" data-v="-5">−</button><b>R$ ${t.ticket}</b><button class="btn" data-act="ticket" data-v="5">+</button></div></div>
        <p class="muted small">Público estimado: ~${estAtt.toLocaleString('pt-BR')} (${Math.round(estAtt / t.cap * 100)}% do estádio) · Referência da divisão: R$ ${FB.REF_TICKET[t.div]}</p>
        <button class="btn block" data-act="expand" ${t.cash < 5000 * FB.SEAT_COST ? 'disabled' : ''}>Ampliar +5.000 lugares (${money(5000 * FB.SEAT_COST)})</button>
      </div>`,
      diretoria: `<div class="card"><h3>Diretoria</h3>
        <div class="row"><span class="small grow">Confiança no treinador</span><b class="small">${Math.round(S.board.conf)}%</b></div>
        <div class="bar" style="margin:6px 0 12px"><i style="width:${S.board.conf}%"></i></div>
        <b class="small">Metas da temporada</b>
        ${(S.board.goals || []).map(g => `<div class="row between small" style="padding:5px 0;gap:8px"><span>${esc(g.text)}</span>
          <span class="tag ${g.status === 'cumprido' ? 'green' : g.status === 'falhou' ? 'red' : ''}" style="flex:0 0 auto">${FB.GOAL_STATUS[g.status]}</span></div>`).join('')}
        <div class="stat-grid" style="margin-top:10px">
          <div class="stat"><small>Orçamento p/ contratações</small><b>${money(FB.budgetLeft(S))}</b></div>
          <div class="stat"><small>Teto da folha</small><b>${money(S.board.wageCap || 0)}</b><span class="small muted">/mês</span></div>
        </div>
        <button class="btn block" style="margin-top:10px" data-act="ask-budget" ${S.board.askedMore ? 'disabled' : ''}>${S.board.askedMore ? 'Pedido de verba já feito nesta temporada' : '💰 Pedir mais verba à diretoria'}</button>
      </div>`,
      carreira: `${contractCard()}<div class="card"><h3>Carreira de ${esc(S.coach)}</h3>${S.history.length ? S.history.map(h => `
        <div class="row between small" style="padding:4px 0"><span>${h.season} · ${esc(T(h.team).name)}</span>
        <span>${h.pos ? h.pos + 'º ' : ''}${FB.DIV_NAMES[h.div]}${h.titles && h.titles.length ? ' · 🏆 ' + esc(h.titles.join(', ')) : ''}</span></div>`).join('') : '<p class="muted small" style="margin:0">Primeira temporada.</p>'}</div>`,
      config: `<div class="card"><h3>Partidas</h3>
        <div class="row between"><span>Velocidade padrão</span>
          <div class="seg" style="margin:0">${[1, 2, 4].map(v => `<button class="${S.settings.speed === v ? 'on' : ''}" data-act="speed-default" data-v="${v}">${v}x</button>`).join('')}</div></div>
        <div class="row between" style="margin-top:8px"><span>Pausar no intervalo</span>
          <button class="btn sm ${S.settings.htPause ? 'primary' : ''}" data-act="ht-toggle">${S.settings.htPause ? 'Sim' : 'Não'}</button></div>
        <div class="row between" style="margin-top:8px"><span>Lances decisivos</span>
          <button class="btn sm ${S.settings.moments !== false ? 'primary' : ''}" data-act="moments-toggle">${S.settings.moments !== false ? 'Sim' : 'Não'}</button></div>
        <p class="muted small" style="margin:6px 0 0">Nos lances decisivos o jogo para e você escolhe a jogada: contra-ataque, falta, pênalti ou defesa.</p>
      </div>
      <div class="card"><h3>Dados</h3>
        <div class="btns" style="margin-bottom:8px">
          <button class="btn" data-act="export-save">Exportar save</button>
          <button class="btn" data-act="template">Exportar base (CSV)</button></div>
        <button class="btn block" data-act="import-open" data-v="game">Atualizar elencos (importar)</button>
        <button class="btn block" style="margin-top:8px" data-act="exit">Trocar de carreira</button>
        <button class="btn danger block" style="margin-top:8px" data-act="slot-del" data-v="${FB.slot}">Apagar esta carreira</button>
      </div>`,
    };
  }

  function contractCard() {
    const c = S.contract;
    if (!c) return '';
    return `<div class="card"><h3>📋 Contrato</h3>
      <div class="row between small" style="padding:3px 0"><span class="muted">Clube</span><b>${esc(T(c.club).name)}</b></div>
      <div class="row between small" style="padding:3px 0"><span class="muted">Salário mensal</span><b class="pos-green">${money(c.sal)}</b></div>
      <div class="row between small" style="padding:3px 0"><span class="muted">Contrato até</span><b>Temporada ${c.until}</b></div></div>`;
  }

  // Seções abertas pelo menu "Mais".
  const SECTIONS = {
    calendario: ['Calendário', () => calendarView()],
    noticias: ['Notícias', () => viewNoticias()],
    jogos: ['Competições', () => viewJogos()],
    financas: ['Finanças', () => clubCards().financas],
    estadio: ['Estádio', () => clubCards().estadio],
    diretoria: ['Diretoria', () => clubCards().diretoria],
    carreira: ['Carreira', () => clubCards().carreira],
    config: ['Configurações', () => clubCards().config],
  };

  function calendarView() {
    const list = FB.upcoming(S, S.userId, 80);
    return list.length ? `<div class="card">${list.map(upcomingRow).join('')}</div>`
      : '<div class="empty">Nenhum jogo marcado até o fim da temporada.</div>';
  }

  const MORE = [
    ['Hoje', [['calendario', '📅', 'Calendário'], ['noticias', '📰', 'Notícias']]],
    ['Clube', [['elenco:tatica', '♟️', 'Tática'], ['elenco:treino', '🏋️', 'Treino'], ['elenco:medico', '🩺', 'Médico'],
      ['financas', '💵', 'Finanças'], ['estadio', '🏟️', 'Estádio'], ['diretoria', '🏛️', 'Diretoria']]],
    ['Mundo', [['jogos', '🏆', 'Competições'], ['jogos:__gal', '🥇', 'Sala de troféus']]],
    ['Você', [['carreira', '👔', 'Carreira'], ['config', '⚙️', 'Configurações'], ['exit', '🔁', 'Trocar de carreira']]],
  ];

  function openMore() {
    openSheet(() => MORE.map(([sec, items]) => `<div class="more-sec">${sec}</div>
      <div class="more-grid">${items.map(([k, ico, label]) => `<button class="more-item" data-act="more-go" data-v="${k}"><span>${ico}</span>${label}</button>`).join('')}</div>`).join(''));
  }

  const VIEWS = { inicio: viewInicio, elenco: viewElenco, mensagens: viewMensagens, mercado: viewMercado };

  // ---------- Pré-jogo ----------

  const TALKS = {
    motivar: ['🔥 Motivar o grupo', 'Funciona melhor quando somos zebra ou o time está para baixo.'],
    cobrar: ['😤 Cobrar a vitória', 'Bom quando somos favoritos; arriscado com o moral baixo.'],
    tranquilo: ['🧘 Tirar a pressão', 'Ajuda times nervosos ou contra adversários mais fortes.'],
    respeito: ['🎯 Foco total no adversário', 'Evita o salto alto quando somos muito favoritos.'],
    nenhuma: ['🤐 Sem preleção', 'Deixar o grupo à vontade.'],
  };

  function openPrematch() {
    const f = FB.userFixture(S);
    if (!f) { startDate(); return; }
    const t = me();
    const prio = (t.prio || {})[f.comp.key] || 'normal';
    if (t.rotation && t.rotation.auto) {
      t.lineup = FB.bestLineup(S, t, f.comp.key, t.formation, { min: t.rotation.min || 65, rest: prio === 'poupar' });
      t.bench = FB.autoBench(S, t, t.lineup, f.comp.key);
    }
    const notes = FB.fixLineup(S, t, f.comp.key);
    t.bench = (t.bench || []).filter(id => FB.available(P(id), f.comp.key) && !P(id).inj && !t.lineup.includes(id));
    if (!t.bench.length) t.bench = FB.autoBench(S, t, t.lineup, f.comp.key);
    ui.pre = { f, tab: 'adv', talk: null };
    renderPrematch();
    if (notes.length) toast(notes.map(c => `${P(c.out).n} fora` + (c.in != null ? ` → ${P(c.in).n}` : '')).join(' · '), 4500);
  }

  function renderPrematch() {
    const pre = ui.pre;
    if (!pre) return;
    const f = pre.f;
    const t = me();
    const opp = T(f.h === t.id ? f.a : f.h);
    let el = document.getElementById('prematch');
    if (!el) {
      el = document.createElement('div');
      el.id = 'prematch';
      el.className = 'live';
      document.body.appendChild(el);
    }
    const scroll = el.querySelector('.pre-body')?.scrollTop || 0;
    const tabs = [['adv', 'Adversário'], ['escalacao', 'Escalação'], ['tatica', 'Tática'], ['prelecao', 'Preleção']];
    let body = '';
    if (pre.tab === 'adv') body = prematchOpp(t, opp, f);
    else if (pre.tab === 'escalacao') body = prematchLineup(t, f);
    else if (pre.tab === 'tatica') body = `<div class="card"><h3>Formação</h3><p class="muted small" style="margin:0 0 6px">Com a bola</p><div class="seg">${Object.keys(FB.FORMATIONS).map(fm => `<button class="${t.formation === fm ? 'on' : ''}" data-act="formation" data-v="${fm}">${fm}</button>`).join('')}</div>
      ${defSeg(t.formationDef, t.formation, 'formation-def')}
      <p class="muted small" style="margin:0">Uma forma diferente sem a bola fecha melhor a defesa, mas a transição custa um pouco de controle do meio.</p></div>
      <div class="card"><h3>Estratégia para o jogo</h3>${tacticsHtml(t)}</div>
      <div class="card"><h3>Auxiliar técnico</h3>${FB.scoutReport(S, t.id, opp.id).map(x => `<p class="small" style="margin:4px 0">• ${esc(x)}</p>`).join('')}</div>`;
    else body = `<p class="muted small" style="margin:0 2px 10px">O que você diz ao elenco antes de entrar em campo?</p>
      <div class="list">${Object.entries(TALKS).map(([k, [n, d]]) => `<button class="item ${pre.talk === k ? 'me' : ''}" data-act="pre-talk" data-v="${k}">
        <div class="grow"><div class="name">${n}</div><div class="meta">${d}</div></div>${pre.talk === k ? '<span class="tag green">Escolhida</span>' : ''}</button>`).join('')}</div>`;
    const issues = t.lineup.filter(id => id == null || !FB.available(P(id), f.comp.key) || (P(id).inj && !P(id).inj.play)).length;
    el.innerHTML = `
      <div class="board" style="padding-bottom:8px">
        <div class="comp">${esc(date(FB.today(S)))} · ${esc(FB.compLabel(S, f))}</div>
        <div class="score" style="margin:8px 0 4px">
          <div class="side">${badge(T(f.h), 40)}<b>${esc(T(f.h).name)}</b></div>
          <div class="x" style="font-size:18px;color:var(--muted);font-weight:800">×</div>
          <div class="side">${badge(T(f.a), 40)}<b>${esc(T(f.a).name)}</b></div>
        </div>
        <div class="seg fill" style="margin:8px 0 0">${tabs.map(([k, l]) => `<button class="${pre.tab === k ? 'on' : ''}" data-act="pre-tab" data-v="${k}">${l}</button>`).join('')}</div>
      </div>
      <div class="pre-body">${issues ? `<div class="card small" style="border-color:var(--orange)">⚠️ ${issues} vaga(s) na escalação com problema. Confira na aba Escalação.</div>` : ''}${body}</div>
      <div class="controls" style="grid-template-columns:1fr 2fr">
        <button class="btn" data-act="pre-close">Voltar</button>
        <button class="btn primary" data-act="pre-start">${pre.talk ? '' : '(sem preleção) '}Iniciar partida ▶</button>
      </div>`;
    el.querySelector('.pre-body').scrollTop = scroll;
  }

  function prematchOpp(t, opp, f) {
    const st = FB.leagueStanding(S, opp.id);
    const key = opp.squad.map(P).filter(p => !p.inj).sort((a, b) => b.ovr - a.ovr).slice(0, 4);
    const out = opp.squad.map(P).filter(p => p.inj && !p.inj.play);
    return `<div class="card"><h3>${esc(opp.name)}</h3>
        <div class="stat-grid">
          <div class="stat"><small>Força</small><b>${FB.teamStrength(S, opp).toFixed(0)}</b> ${stars(FB.teamStrength(S, opp))}</div>
          <div class="stat"><small>Nós</small><b>${FB.teamStrength(S, t).toFixed(0)}</b> ${stars(FB.teamStrength(S, t))}</div>
          <div class="stat"><small>Esquema habitual</small><b>${opp.formation}</b></div>
          <div class="stat"><small>${st ? esc(S.comps[st.key].short) : esc(FB.DIV_NAMES[opp.div])}</small><b>${st && st.row.j ? st.pos + 'º' : '–'}</b> <span class="small muted">${opp.country !== 'BRA' ? FB.COUNTRY[opp.country] : ''}</span></div>
        </div>
        ${opp.form && opp.form.length ? `<div class="row between" style="margin-top:10px"><span class="muted small">Últimos jogos</span>${formHtml(opp.form.slice(-5))}</div>` : ''}</div>
      <div class="card"><h3>Destaques</h3>${key.map(p => `<div class="row" style="padding:4px 0">${posTag(p.pos)}<span class="grow small">${esc(p.n)}</span><b>${p.ovr}</b></div>`).join('')}
        ${out.length ? `<p class="small pos-red" style="margin:8px 0 0">Desfalques: ${out.map(p => esc(p.n)).join(', ')}</p>` : ''}</div>
      <div class="card"><h3>Relatório do auxiliar</h3>${FB.scoutReport(S, t.id, opp.id).map(x => `<p class="small" style="margin:4px 0">• ${esc(x)}</p>`).join('')}</div>`;
  }

  function prematchLineup(t, f) {
    const tired = t.lineup.filter(id => id != null && P(id).en < 70).map(P);
    const capOpts = t.lineup.filter(id => id != null).map(P).sort((a, b) => b.ovr - a.ovr);
    return `<div class="seg">${Object.keys(FB.FORMATIONS).map(fm => `<button class="${t.formation === fm ? 'on' : ''}" data-act="formation" data-v="${fm}">${fm}</button>`).join('')}</div>
      ${tired.length ? `<div class="card small" style="border-color:var(--orange)">🔋 Cansados: ${tired.map(p => `${esc(p.n)} (${Math.round(p.en)}%)`).join(', ')}</div>` : ''}
      ${pitchHtml(t, t.lineup, t.formation)}
      <div class="btns" style="margin-bottom:12px"><button class="btn" data-act="auto-lineup">⚡ Melhor time</button>
        <button class="btn" data-act="auto-lineup" data-v="rot">🔄 Rodar cansados</button></div>
      <div class="card"><h3>Capitão</h3><select class="select" id="captain-select"><option value="">Sem capitão definido</option>
        ${capOpts.map(p => `<option value="${p.id}" ${t.captain === p.id ? 'selected' : ''}>${esc(p.n)} (${p.pos}, ${p.ovr})</option>`).join('')}</select></div>
      ${benchHtml(t, f.comp.key)}`;
  }

  // ---------- Partida ao vivo ----------

  const SPEED_MS = { 1: 650, 2: 300, 4: 110 };
  const EV_ICON = { goal: '⚽', yellow: '🟨', red: '🟥', injury: '🚑', sub: '🔁', chance: '·', ht: '⏸', end: '🏁', pens: '🎯', talk: '🗣️', sys: '⚠️' };

  function startDate(talk) {
    if (S.fired || S.seasonOver) return;
    const day = FB.startDate(S, { manual: true });
    if (!day.userMatch) { showRoundResults(FB.finishDate(S, day)); return; }
    ui.live = { day, m: day.userMatch, speed: S.settings.speed, paused: false, shown: 0, timer: null };
    day.userMatch.interactive = S.settings.moments !== false;
    if (talk && talk !== 'nenhuma') day.userMatch.preTalk(day.userMatch.user, talk);
    renderLive();
    if (day.notes.length) toast(day.notes.join(' · '), 4500);
    tickLoop();
  }

  function renderLive() {
    const L = ui.live;
    const m = L.m;
    const [h, a] = m.sides;
    let el = document.getElementById('live');
    if (!el) {
      el = document.createElement('div');
      el.id = 'live';
      el.className = 'live';
      document.body.appendChild(el);
    }
    const agg = m.comp.decisive && m.comp.leg === 1;
    el.innerHTML = `
      <div class="board">
        <div class="comp">${esc(FB.compLabel(S, { comp: m.comp }))}</div>
        <div class="score">
          <div class="side">${badge(T(h.tid), 48)}<b>${esc(T(h.tid).name)}</b></div>
          <div><div class="goals" id="lv-score">${h.goals} × ${a.goals}</div><div class="clock" id="lv-clock">${m.minute}'</div></div>
          <div class="side">${badge(T(a.tid), 48)}<b>${esc(T(a.tid).name)}</b></div>
        </div>
        ${agg ? `<div class="comp" id="lv-agg"></div>` : ''}
        <div class="progress"><i id="lv-prog" style="width:${m.minute / 90 * 100}%"></i></div>
      </div>
      <div class="feed" id="lv-feed"></div>
      <div class="controls" id="lv-ctrl"></div>`;
    L.shown = 0;
    updateLive();
  }

  function liveControls() {
    const L = ui.live;
    if (L.m.done) return `<button class="btn primary big" style="grid-column:span 4" data-act="live-finish">Continuar</button>`;
    const u = L.m.sides[L.m.user];
    return `
      <button class="btn" data-act="live-pause" aria-label="${L.paused ? 'Continuar' : 'Pausar'}">${L.paused ? ICON.play : ICON.pause}</button>
      <button class="btn" data-act="live-speed">${L.speed === 'end' ? '⏭' : L.speed + 'x'}</button>
      <button class="btn" data-act="live-subs">🔁 ${FB.MAX_SUBS - u.subs}</button>
      <button class="btn" data-act="live-tactic">Tática</button>`;
  }

  function updateLive() {
    const L = ui.live;
    if (!L) return;
    const m = L.m;
    const [h, a] = m.sides;
    const sc = document.getElementById('lv-score');
    if (!sc) return;
    const prev = sc.textContent;
    sc.textContent = `${h.goals} × ${a.goals}`;
    if (prev !== sc.textContent) { sc.classList.remove('flash'); void sc.offsetWidth; sc.classList.add('flash'); }
    document.getElementById('lv-clock').textContent = m.done ? 'Fim' : m.pending ? 'Parado' : m.minute === 45 ? 'Intervalo' : m.minute + "'";
    document.getElementById('lv-prog').style.width = Math.min(100, m.minute / 90 * 100) + '%';
    const agg = document.getElementById('lv-agg');
    if (agg) agg.textContent = `Agregado: ${h.goals + m.comp.aggH} x ${a.goals + m.comp.aggA}`;
    const feed = document.getElementById('lv-feed');
    const u = m.user;
    for (; L.shown < m.events.length; L.shown++) {
      const e = m.events[L.shown];
      const div = document.createElement('div');
      const sys = e.type === 'ht' || e.type === 'end' || e.type === 'pens';
      div.className = `ev ${e.type} ${sys ? 'sys' : ''} ${e.side == null ? '' : e.side === u ? 'mine' : 'theirs'}`;
      const team = e.side != null ? `<span class="badge" style="--c1:${T(m.sides[e.side].tid).c1};--c2:${T(m.sides[e.side].tid).c2};--s:16px;font-size:0"></span> ` : '';
      div.innerHTML = `<span class="m">${e.m}'</span><span class="ic">${EV_ICON[e.type] || ''}</span><span class="grow">${team}${esc(e.text)}</span>`;
      feed.prepend(div);
    }
    document.getElementById('lv-ctrl').innerHTML = liveControls();
  }

  function tickLoop() {
    const L = ui.live;
    if (!L) return;
    clearTimeout(L.timer);
    if (L.m.pending) { openForcedSub(); return; }
    if (L.m.moment) { openMoment(); return; }
    if (L.paused || L.m.done) { updateLive(); return; }
    if (L.speed === 'end') {
      while (!L.m.done) {
        const before = L.m.events.length;
        L.m.step();
        if (interrupt(before)) return;
      }
      updateLive();
      return;
    }
    const before = L.m.events.length;
    L.m.step();
    updateLive();
    if (interrupt(before)) return;
    L.timer = setTimeout(tickLoop, SPEED_MS[L.speed]);
  }

  // Para a partida quando o usuário precisa decidir algo.
  function interrupt(before) {
    const L = ui.live;
    const m = L.m;
    if (m.pending) { updateLive(); openForcedSub(); return true; }
    if (m.moment) { updateLive(); openMoment(); return true; }
    if (m.events.slice(before).some(e => e.type === 'ht') && S.settings.htPause) {
      L.paused = true;
      updateLive();
      openTeamTalk();
      return true;
    }
    return false;
  }

  function openMoment() {
    const m = ui.live.m;
    const M = m.moment;
    if (!M) return;
    const D = FB.MOMENTS[M.kind];
    const mine = M.side === m.user;
    openSheet(() => `<div class="moment-head ${mine ? '' : 'def'}">⚡ ${D.title} <span>${M.m}'</span></div>
      <p style="margin:6px 0 12px">${esc(M.text)}</p>
      <div class="list">${Object.entries(D.opts).filter(([k]) => k !== 'tocar' || M.mate != null).map(([k, [label, desc]]) => `
        <button class="item" data-act="moment" data-v="${k}"><div class="grow"><div class="name">${label}</div><div class="meta">${desc}</div></div></button>`).join('')}</div>`, { modal: true });
  }

  // Lesão: o jogo só volta depois da substituição.
  function openForcedSub() {
    const m = ui.live.m;
    const pd = m.pending;
    if (!pd) return;
    ui.live.paused = true;
    updateLive();
    openSheet(() => {
      const s = m.sides[pd.side];
      const pos = FB.slotsOf(s.formation)[pd.slot];
      const bench = s.bench.map(P).sort((a, b) => FB.effective(b, pos, s.en[b.id]) - FB.effective(a, pos, s.en[a.id]));
      return `<h2>🚑 ${esc(P(pd.pid).n)} não pode continuar</h2>
        <p class="muted small">O jogo está parado. Escolha quem entra no lugar dele (${FB.POS_NAME[pos]}). O departamento médico dará o diagnóstico depois da partida.</p>
        <div class="list">${bench.map(p => `
          <button class="item" data-act="sub-forced" data-id="${p.id}">${posTag(p.pos)}
            <div class="grow"><div class="name">${esc(p.n)}</div><div style="width:90px;margin-top:4px">${enBar(s.en[p.id])}</div></div>
            <div class="ovr">${p.ovr}</div></button>`).join('')}</div>`;
    }, { modal: true });
  }

  function openTeamTalk() {
    const m = ui.live.m;
    const [h, a] = m.sides;
    openSheet(() => `
      <h2>Intervalo · ${esc(T(h.tid).short)} ${h.goals} × ${a.goals} ${esc(T(a.tid).short)}</h2>
      <p class="muted small">O que você diz ao time no vestiário?</p>
      <div class="list">
        <button class="item" data-act="talk" data-v="elogiar"><div class="grow"><div class="name">👏 Elogiar</div><div class="meta">Funciona quando o time está bem.</div></div></button>
        <button class="item" data-act="talk" data-v="cobrar"><div class="grow"><div class="name">😤 Cobrar mais empenho</div><div class="meta">Pode acordar um time que está perdendo.</div></div></button>
        <button class="item" data-act="talk" data-v="calma"><div class="grow"><div class="name">🧘 Pedir calma</div><div class="meta">Efeito pequeno, sem riscos.</div></div></button>
      </div>
      <div class="btns"><button class="btn" data-act="live-subs-from-ht">🔁 Substituições</button><button class="btn" data-act="live-tactic">Tática</button></div>`, { modal: true });
  }

  function openSubs() {
    ui.subOut = null;
    openSheet(() => {
      const m = ui.live.m;
      const s = m.sides[m.user];
      const slots = FB.slotsOf(s.formation);
      if (!m.canSub(s)) return `<h2>Substituições</h2><p class="muted">Sem substituições disponíveis.</p><button class="btn block" data-act="close-resume">Voltar ao jogo</button>`;
      if (ui.subOut == null) {
        return `<h2>Quem sai? <span class="muted small">(${FB.MAX_SUBS - s.subs} restantes)</span></h2>
          <div class="list">${s.lineup.map((pid, i) => pid == null ? '' : `
            <button class="item" data-act="sub-out" data-i="${i}">${posTag(slots[i])}
              <div class="grow"><div class="name">${esc(P(pid).n)} ${s.yellow[pid] ? '<span class="tag gold">🟨</span>' : ''}</div>
              <div style="width:90px;margin-top:4px">${enBar(s.en[pid])}</div></div><div class="ovr">${P(pid).ovr}</div></button>`).join('')}</div>
          <button class="btn block" data-act="close-resume">Voltar ao jogo</button>`;
      }
      const pos = slots[ui.subOut];
      const bench = s.bench.map(P).sort((a, b) => FB.effective(b, pos, s.en[b.id]) - FB.effective(a, pos, s.en[a.id]));
      return `<h2>Quem entra? <span class="muted small">no lugar de ${esc(P(s.lineup[ui.subOut]).n)} (${pos})</span></h2>
        <div class="list">${bench.map(p => `
          <button class="item" data-act="sub-in" data-id="${p.id}">${posTag(p.pos)}
            <div class="grow"><div class="name">${esc(p.n)}</div><div style="width:90px;margin-top:4px">${enBar(s.en[p.id])}</div></div>
            <div class="ovr">${p.ovr}</div></button>`).join('')}</div>
        <div class="btns"><button class="btn" data-act="sub-back">← Trocar quem sai</button>
        <button class="btn" data-act="close-resume">Voltar ao jogo</button></div>`;
    }, { modal: true });
  }

  function openLiveTactic() {
    openSheet(() => {
      const m = ui.live.m;
      const s = m.sides[m.user];
      return `<h2>Tática</h2>
        <p class="muted small" style="margin:8px 0 6px">Formação</p>
        <div class="seg">${Object.keys(FB.FORMATIONS).map(f => `<button class="${s.formation === f ? 'on' : ''}" data-act="live-formation" data-v="${f}">${f}</button>`).join('')}</div>
        ${defSeg(s.formationDef, s.formation, 'live-formation-def')}
        <p class="muted small" style="margin:8px 0 6px">Postura</p>
        <div class="seg fill">${Object.entries(FB.POSTURES).map(([k, l]) => `<button class="${s.posture === k ? 'on' : ''}" data-act="live-posture" data-v="${k}">${l}</button>`).join('')}</div>
        <p class="muted small" style="margin:8px 0 6px">Pressão</p>
        <div class="seg fill">${[['baixa', 'Baixa'], ['media', 'Média'], ['alta', 'Alta']].map(([k, l]) => `<button class="${s.press === k ? 'on' : ''}" data-act="live-press" data-v="${k}">${l}</button>`).join('')}</div>
        ${pitchHtml(T(s.tid), s.lineup, s.formation, { en: s.en, hurt: s.hurt, act: 'noop' })}
        <button class="btn primary block" data-act="close-resume">Voltar ao jogo</button>`;
    }, { modal: true });
  }

  function finishLive() {
    const L = ui.live;
    clearTimeout(L.timer);
    const s = L.m.sides[L.m.user];
    me().posture = s.posture;
    me().press = s.press;
    const res = FB.finishDate(S, L.day);
    ui.live = null;
    document.getElementById('live')?.remove();
    showRoundResults(res);
  }

  function showRoundResults(res) {
    render();
    const um = res.userMatch;
    const ref = um ? um.comp : null;
    const div = me().div;
    let list;
    if (ref) list = res.matches.filter(m => m.comp.key === ref.key && m.comp.ph === ref.ph && (ref.g == null || m.comp.g === ref.g));
    else list = res.matches.filter(m => m.comp.key === FB.leagueKey(div) || m.comp.key === 'A');
    const others = list.filter(m => m !== um);
    openSheet(() => {
      let head;
      if (um) {
        const w = um.matchWinner();
        const tw = um.winner();
        let word = w === -1 ? 'Empate' : w === um.user ? 'Vitória!' : 'Derrota';
        if (um.comp.decisive) word += tw === um.user ? ' · Classificado!' : ' · Eliminado';
        if (um.comp.decisive && um.comp.final) word = tw === um.user ? '🏆 CAMPEÃO!' : 'Vice-campeão';
        const [h, a] = um.sides;
        const goals = side => side.scorers.map(sc => `${esc(P(sc.pid)?.n || '?')} ${sc.m}'`).join(', ');
        const hurt = um.sides[um.user].hurt.size;
        head = `<h2>${word}</h2>
          <div class="list">${resultRow(h.tid, a.tid, { hg: h.goals, ag: a.goals }, um.pens)}</div>
          ${h.scorers.length || a.scorers.length ? `<p class="small muted" style="margin-top:-4px">⚽ ${[goals(h), goals(a)].filter(Boolean).join(' · ')}</p>` : ''}
          ${hurt ? `<p class="small pos-red">🚑 ${hurt} jogador(es) lesionado(s): veja o diagnóstico em Mensagens.</p>` : ''}`;
      } else head = `<h2>Data concluída</h2><p class="muted small">Seu time não jogou. Veja os resultados.</p>`;
      const lbl = others[0] ? FB.compLabel(S, others[0]) : '';
      return `${head}
        ${others.length ? `<p class="muted small" style="margin:12px 0 6px">${esc(lbl)}</p>
        <div class="list">${others.slice(0, 20).map(m => resultRow(m.sides[0].tid, m.sides[1].tid, { hg: m.sides[0].goals, ag: m.sides[1].goals }, m.pens)).join('')}</div>` : ''}
        <button class="btn primary block big" data-act="close">OK</button>`;
    });
  }

  // ---------- Fim de temporada ----------

  function showSeasonSummary(sm) {
    openSheet(() => {
      const t = me();
      return `<h2>Balanço ${sm.season}</h2>
        <div class="card" style="margin-top:10px">
          ${sm.userPos ? `<p style="margin:0">Você terminou em <b>${sm.userPos}º</b> na ${FB.DIV_NAMES[sm.userDiv]}.</p>` : ''}
          ${sm.met != null ? `<p class="small ${sm.met ? 'pos-green' : 'pos-red'}" style="margin:6px 0 0">Objetivo "${esc(sm.objective)}": ${sm.met ? 'cumprido ✔' : 'não cumprido ✘'}</p>` : ''}
          <p class="small muted" style="margin:6px 0 0">Premiação da liga: ${money(sm.prize || 0)}</p>
          ${sm.up.includes(S.userId) ? '<p class="pos-green" style="margin:8px 0 0"><b>⬆ ACESSO CONQUISTADO!</b></p>' : ''}
          ${sm.down.includes(S.userId) ? '<p class="pos-red" style="margin:8px 0 0"><b>⬇ Rebaixado.</b></p>' : ''}
        </div>
        <div class="card"><h3>Campeões ${sm.season}</h3>
          ${sm.champions.map(c => `<div class="row" style="padding:4px 0">${badge(T(c.tid), 24)}<span class="grow ellipsis">${esc(T(c.tid).name)}</span><span class="muted small">${esc(c.comp)}</span></div>`).join('')}
        </div>
        ${sm.goals && sm.goals.length ? `<div class="card"><h3>Metas da diretoria</h3>${sm.goals.map(g => `<div class="row between small" style="padding:4px 0;gap:8px"><span>${esc(g.text)}</span><span class="tag ${g.status === 'cumprido' ? 'green' : 'red'}">${FB.GOAL_STATUS[g.status]}</span></div>`).join('')}</div>` : ''}
        ${sm.retired.length ? `<div class="card small"><h3>Aposentadorias</h3>${sm.retired.map(esc).join(', ')}</div>` : ''}
        ${sm.youth.length ? `<div class="card small"><h3>Subiram da base</h3>${sm.youth.map(esc).join(', ')}</div>` : ''}
        ${sm.offers.length ? `<div class="card"><h3>Propostas de emprego</h3>${sm.offers.map(id => `
          <div class="row" style="padding:6px 0">${badge(T(id), 28)}<div class="grow"><b>${esc(T(id).name)}</b><div class="muted small">${FB.DIV_NAMES[T(id).div]}</div></div>
          <button class="btn sm" data-act="take-job" data-id="${id}">Aceitar</button></div>`).join('')}</div>` : ''}
        <p class="muted small">Temporada ${S.season}: ${esc(t.name)} na ${FB.DIV_NAMES[t.div]}. ${S.fired ? '' : 'Objetivo: ' + esc(S.board.text) + '.'}</p>
        <button class="btn primary block big" data-act="close">Começar ${S.season}</button>`;
    });
  }

  // ---------- Ações ----------

  function enterSlot(n, state) {
    FB.slot = n;
    S = state;
    Object.assign(ui, { setup: null, welcome: false, tab: 'inicio', elenco: 'escalacao', comp: null, compPh: null, compRound: null, mailFrom: '', tipOff: null });
    render();
    window.scrollTo(0, 0);
  }

  const A = {
    close: () => { closeSheet(); render(); },
    noop: () => {},
    tab: d => { ui.tab = d.v; ui.compRound = null; render(); window.scrollTo(0, 0); },
    'new-game': d => {
      if (FB.freeSlot() == null) { toast(`Limite de ${FB.MAX_SLOTS} carreiras atingido.`); return; }
      ui.setup = { world: FB.createWorld({ pack: d.v }), div: 0, sel: null, coach: '' };
      render();
    },
    'setup-back': () => { ui.setup = null; render(); },
    'slot-play': async d => {
      const n = +d.v;
      const st = await FB.loadSlot(n);
      if (!validSave(st)) { toast('Não consegui abrir esta carreira.', 3500); return; }
      enterSlot(n, st);
    },
    'slot-del': d => {
      const n = +d.v;
      const m = FB.slots()[n];
      confirmSheet('Apagar carreira', `Apagar a carreira${m ? ` de ${m.coach} no ${m.club}` : ''}? Não dá para desfazer.`, 'Apagar', () => {
        FB.deleteSlot(n);
        if (FB.slot === n) { S = null; FB.slot = null; }
        render();
        toast('Carreira apagada.');
      }, true);
    },
    exit: () => { if (S) FB.save(S); closeSheet(); S = null; FB.slot = null; ui.welcome = false; render(); window.scrollTo(0, 0); },
    'welcome-done': () => { ui.welcome = false; render(); window.scrollTo(0, 0); },
    more: () => openMore(),
    'more-go': d => {
      closeSheet();
      if (d.v === 'exit') { A.exit(); return; }
      const [k, sub] = d.v.split(':');
      if (k === 'elenco') ui.elenco = sub;
      if (k === 'jogos') { ui.comp = sub || null; ui.compPh = null; ui.compRound = null; }
      ui.tab = k;
      render();
      window.scrollTo(0, 0);
    },
    'tip-off': () => { ui.tipOff = S.di; render(); },
    'setup-div': d => { ui.setup.coach = document.getElementById('coach').value; ui.setup.div = +d.v; ui.setup.sel = null; render(); },
    'setup-pick': d => { ui.setup.coach = document.getElementById('coach').value; ui.setup.sel = +d.id; render(); },
    'setup-start': () => {
      const st = ui.setup;
      const coach = document.getElementById('coach').value.trim() || 'Treinador';
      const n = FB.freeSlot();
      if (n == null) { toast(`Limite de ${FB.MAX_SLOTS} carreiras atingido.`); return; }
      FB.startCareer(st.world, coach, st.sel);
      enterSlot(n, st.world);
      FB.save(S);
      ui.welcome = true;
      render();
    },
    'import-open': d => openImport(d.v),
    template: () => {
      const W = S || (ui.setup && ui.setup.world) || FB.createWorld();
      const db = FB.exportDB(W);
      download('clubes.csv', FB.toCSV(db.clubs), 'text/csv');
      setTimeout(() => download('jogadores.csv', FB.toCSV(db.players), 'text/csv'), 400);
    },
    'export-save': () => download(`prancheta-${S.season}-${me().short}.json`, JSON.stringify(S)),

    play: () => openPrematch(),
    'pre-tab': d => { ui.pre.tab = d.v; renderPrematch(); document.querySelector('#prematch .pre-body').scrollTop = 0; },
    'pre-talk': d => { ui.pre.talk = d.v; renderPrematch(); },
    'pre-close': () => { ui.pre = null; document.getElementById('prematch')?.remove(); FB.save(S); render(); },
    'pre-start': () => {
      const talk = ui.pre.talk;
      ui.pre = null;
      document.getElementById('prematch')?.remove();
      FB.save(S);
      startDate(talk);
    },
    tac: d => { me()[d.k] = d.v; FB.save(S); rerender(); },
    'bench-toggle': d => {
      const t = me();
      const id = +d.id;
      t.bench = t.bench || [];
      if (t.bench.includes(id)) t.bench = t.bench.filter(x => x !== id);
      else if (t.bench.length >= FB.MAX_BENCH) { toast(`O banco já tem ${FB.MAX_BENCH} jogadores.`); return; }
      else t.bench.push(id);
      FB.save(S); rerender();
    },
    'auto-bench': () => { const t = me(); const f = FB.userFixture(S); t.bench = FB.autoBench(S, t, t.lineup, f ? f.comp.key : null); FB.save(S); rerender(); },
    'rot-toggle': () => { const t = me(); t.rotation = { min: 65, ...(t.rotation || {}) }; t.rotation.auto = !t.rotation.auto; FB.save(S); render(); },
    'rot-min': d => { const t = me(); t.rotation = { auto: false, ...(t.rotation || {}), min: +d.v }; FB.save(S); render(); },
    prio: d => { const t = me(); t.prio = t.prio || {}; t.prio[d.k] = d.v; FB.save(S); render(); },
    'mail-from': d => { ui.mailFrom = d.v; render(); },
    'ask-budget': () => { const r = FB.askBudget(S); FB.save(S); render(); toast(r.msg, 3500); },
    'end-season': () => { const sm = FB.endSeason(S); ui.comp = null; render(); showSeasonSummary(sm); },
    'take-job': d => { FB.takeJob(S, +d.id); closeSheet(); ui.tab = 'inicio'; ui.comp = null; ui.welcome = true; render(); window.scrollTo(0, 0); },
    'offer-yes': d => { const r = FB.answerOffer(S, +d.id, true); FB.save(S); render(); toast(r.ok ? 'Venda concluída!' : r.msg); },
    'offer-no': d => { FB.answerOffer(S, +d.id, false); FB.save(S); render(); },
    'treat-open': d => openPlayer(+d.id),
    treat: d => {
      const r = FB.applyTreatment(S, P(+d.id), d.v);
      if (!r.ok) { toast(r.msg); return; }
      FB.save(S);
      refreshSheet();
      render();
      toast(`Tratamento definido: ${FB.TREATMENTS[d.v].name}`);
    },

    elenco: d => { ui.elenco = d.v; render(); },
    sort: d => { ui.sort = d.v; render(); },
    player: d => openPlayer(+d.id),
    formation: d => { const t = me(); FB.reassign(S, t, d.v); if (t.formationDef === d.v) t.formationDef = null; FB.save(S); rerender(); },
    'formation-def': d => { me().formationDef = d.v || null; FB.save(S); rerender(); },
    training: d => { me().training = d.v; FB.save(S); render(); toast(`Treino: ${FB.TRAININGS[d.v].name}`); },
    'auto-lineup': d => {
      const t = me();
      const f = FB.userFixture(S);
      const key = f ? f.comp.key : null;
      const rot = d.v === 'rot';
      t.lineup = FB.bestLineup(S, t, key, t.formation, rot ? { min: (t.rotation && t.rotation.min) || 70, rest: ((t.prio || {})[key]) === 'poupar' } : {});
      t.bench = FB.autoBench(S, t, t.lineup, key);
      FB.save(S); rerender(); toast(rot ? 'Rodízio feito: cansados no banco.' : 'Melhor time escalado!');
    },
    slot: d => {
      const i = +d.i;
      const t = me();
      const pos = FB.slotsOf(t.formation)[i];
      const f = FB.userFixture(S);
      const key = f ? f.comp.key : null;
      ui.slotSel = i;
      openSheet(() => {
        const cur = t.lineup[i];
        const ok = p => FB.available(p, key) && !(p.inj && !p.inj.play);
        const list = t.squad.map(P).sort((a, b) => (ok(b) - ok(a)) || FB.effective(b, pos) - FB.effective(a, pos));
        return `<h2>${FB.POS_NAME[pos]}</h2><p class="muted small">Toque para escalar. Jogadores fora de posição rendem menos.</p>
          <div class="list">${list.map(p => {
            const inXI = t.lineup.includes(p.id);
            return `<button class="item ${p.id === cur ? 'me' : ''}" data-act="slot-pick" data-id="${p.id}">${posTag(p.pos)}
              <div class="grow"><div class="name ellipsis">${esc(p.n)}${statusTags(p)} ${inXI && p.id !== cur ? '<span class="tag blue">Titular</span>' : ''}</div>
              <div class="meta">Rende ${Math.round(FB.effective(p, pos))} aqui · ${moIcon(p.mo)}</div>
              <div style="width:90px;margin-top:4px">${enBar(p.en)}</div></div>
              <div class="ovr">${p.ovr}</div></button>`;
          }).join('')}</div>
          ${cur != null ? `<button class="btn block" data-act="player" data-id="${cur}">Ver ficha de ${esc(P(cur).n)}</button>` : ''}`;
      });
    },
    'slot-pick': d => {
      const t = me();
      const pid = +d.id;
      const i = ui.slotSel;
      const j = t.lineup.indexOf(pid);
      if (j >= 0) t.lineup[j] = t.lineup[i];
      t.lineup[i] = pid;
      if (t.bench) t.bench = t.bench.filter(x => x !== pid);
      FB.save(S);
      closeSheet();
      rerender();
    },
    'toggle-sale': d => { const p = P(+d.id); p.sale = !p.sale; FB.save(S); refreshSheet(); render(); toast(p.sale ? 'Jogador listado para venda.' : 'Retirado da lista.'); },
    release: d => {
      const p = P(+d.id);
      confirmSheet('Dispensar jogador', `Dispensar ${p.n}? A multa rescisória é ${money(p.sal * 3)}.`, 'Dispensar', () => {
        const r = FB.release(S, p.id); FB.save(S); render(); toast(r.ok ? `${p.n} dispensado.` : r.msg);
      }, true);
    },
    bid: d => {
      const r = FB.offer(S, +d.id, +d.v);
      if (r.ok) { ui.counter = null; FB.save(S); closeSheet(); render(); toast('Contratação concluída! ✍️'); return; }
      ui.counter = r.counter ? { pid: +d.id, v: r.counter } : null;
      refreshSheet();
      toast(r.msg, 3200);
    },
    'sign-free': d => {
      const r = FB.offer(S, +d.id, 0);
      if (r.ok) { FB.save(S); closeSheet(); render(); toast('Contratado! ✍️'); } else toast(r.msg);
    },
    scout: d => { const r = FB.scout(S, +d.id); FB.save(S); refreshSheet(); render(); if (!r.ok) toast(r.msg); },

    comp: d => { ui.comp = d.v; ui.compPh = null; ui.compRound = null; ui.compView = 'tabela'; render(); },
    'comp-ph': d => { ui.compPh = +d.v; ui.compRound = null; render(); },
    'comp-view': d => { ui.compView = d.v; render(); },
    'comp-round': d => { ui.compRound = +d.v; render(); },

    'mkt-mode': d => { ui.mkt.mode = d.v; render(); },
    watch: d => { const on = FB.toggleWatch(S, +d.id); FB.save(S); refreshSheet(); render(); toast(on ? 'Adicionado à lista de observação.' : 'Removido da lista.'); },
    'search-open': () => {
      ui.search = ui.search || { pos: '', young: false };
      openSheet(() => `<h2>Buscar talentos</h2>
        <p class="muted small">O olheiro procura em todas as divisões e no exterior, e os 6 melhores entram na sua lista já com relatório.</p>
        <p class="muted small" style="margin:10px 0 6px">Posição</p>
        <div class="seg">${[['', 'Qualquer'], ...FB.POS.map(p => [p, FB.POS_NAME[p]])].map(([k, l]) => `<button class="${ui.search.pos === k ? 'on' : ''}" data-act="search-pos" data-v="${k}">${l}</button>`).join('')}</div>
        <p class="muted small" style="margin:10px 0 6px">Perfil</p>
        <div class="seg fill"><button class="${!ui.search.young ? 'on' : ''}" data-act="search-young" data-v="">Pronto para jogar</button>
          <button class="${ui.search.young ? 'on' : ''}" data-act="search-young" data-v="1">Jovens (até 21)</button></div>
        <button class="btn primary block" data-act="search-go" ${me().cash < FB.SEARCH_COST ? 'disabled' : ''}>Enviar o olheiro · ${money(FB.SEARCH_COST)}</button>`);
    },
    'search-pos': d => { ui.search.pos = d.v; refreshSheet(); },
    'search-young': d => { ui.search.young = !!d.v; refreshSheet(); },
    'search-go': () => {
      const r = FB.scoutSearch(S, { pos: ui.search.pos, young: ui.search.young, maxAge: ui.search.young ? 21 : 40 });
      if (!r.ok) { toast(r.msg); return; }
      FB.save(S); closeSheet(); ui.mkt.mode = 'observados'; render(); toast(`O olheiro encontrou ${r.found.length} jogador(es).`);
    },
    'loan-in': d => {
      const p = P(+d.id);
      const terms = FB.loanTerms(S, p);
      if (!terms) { toast('Empréstimo indisponível.'); return; }
      confirmSheet('Pedir emprestado', `${p.n} até o fim de ${S.season}. Taxa de ${money(terms.fee)} e salário de ${money(terms.pay)}/mês (o ${T(p.t).name} paga o resto).`, 'Fechar empréstimo', () => {
        const r = FB.loanIn(S, p.id);
        if (r.ok) { FB.save(S); render(); toast(`${p.n} chegou por empréstimo!`); } else toast(r.msg, 3500);
      });
    },
    'loan-out-open': d => {
      const p = P(+d.id);
      if (!FB.windowOpen(S)) { toast(`Janela fechada. ${FB.windowText(S)}.`); return; }
      const clubs = FB.loanSuitors(S, p.id);
      openSheet(() => `<h2>Emprestar ${esc(p.n)}</h2>
        <p class="muted small">Até o fim de ${S.season}. O clube que recebe paga o salário inteiro, e ele ganha minutos para evoluir.</p>
        <div class="list">${clubs.map(id => `<button class="item" data-act="loan-out" data-id="${p.id}" data-v="${id}">${badge(T(id))}
          <div class="grow"><div class="name ellipsis">${esc(T(id).name)}</div><div class="meta">${FB.DIV_NAMES[T(id).div]}</div></div>
          <span class="btn sm">Emprestar</span></button>`).join('') || '<div class="empty">Nenhum clube interessado agora.</div>'}</div>
        <button class="btn block" data-act="close">Cancelar</button>`);
    },
    'loan-out': d => {
      const r = FB.loanOut(S, +d.id, +d.v);
      if (!r.ok) { toast(r.msg); return; }
      FB.save(S); closeSheet(); render(); toast('Empréstimo fechado.');
    },
    'loan-return': d => { const r = FB.loanReturn(S, +d.id); if (r.ok) { FB.save(S); closeSheet(); render(); } toast(r.msg); },
    'mkt-pos': d => { ui.mkt.pos = d.v; render(); },
    'mkt-afford': () => { ui.mkt.afford = !ui.mkt.afford; render(); },

    'news-cat': d => { ui.newsCat = d.v; render(); },
    'news-mine': () => { ui.newsMine = !ui.newsMine; render(); },

    ticket: d => { FB.setTicket(S, me().ticket + +d.v); FB.save(S); render(); },
    expand: () => confirmSheet('Ampliar estádio', `Investir ${money(5000 * FB.SEAT_COST)} em 5.000 novos lugares?`, 'Ampliar', () => {
      const r = FB.expandStadium(S); FB.save(S); render(); toast(r.ok ? 'Obra concluída!' : r.msg);
    }),
    'speed-default': d => { S.settings.speed = +d.v; FB.save(S); render(); },
    'ht-toggle': () => { S.settings.htPause = !S.settings.htPause; FB.save(S); render(); },
    'moments-toggle': () => { S.settings.moments = S.settings.moments === false; FB.save(S); render(); },

    // Partida
    'live-pause': () => { const L = ui.live; L.paused = !L.paused; tickLoop(); updateLive(); },
    'live-speed': () => {
      const L = ui.live;
      const order = [1, 2, 4, 'end'];
      L.speed = order[(order.indexOf(L.speed) + 1) % order.length];
      updateLive();
      if (!L.paused) tickLoop();
    },
    'live-subs': () => { ui.live.paused = true; clearTimeout(ui.live.timer); updateLive(); openSubs(); },
    'live-subs-from-ht': () => openSubs(),
    'live-tactic': () => { ui.live.paused = true; clearTimeout(ui.live.timer); updateLive(); openLiveTactic(); },
    'close-resume': () => { closeSheet(); ui.live.paused = false; tickLoop(); },
    'sub-out': d => { ui.subOut = +d.i; refreshSheet(); },
    'sub-back': () => { ui.subOut = null; refreshSheet(); },
    'sub-in': d => {
      const m = ui.live.m;
      m.sub(m.user, ui.subOut, +d.id);
      ui.subOut = null;
      updateLive();
      refreshSheet();
    },
    'sub-forced': d => {
      const m = ui.live.m;
      const pd = m.pending;
      if (!pd || !m.sub(pd.side, pd.slot, +d.id)) return;
      closeSheet();
      ui.live.paused = false;
      updateLive();
      tickLoop();
    },
    talk: d => { const m = ui.live.m; m.teamTalk(m.user, d.v); closeSheet(); ui.live.paused = false; tickLoop(); },
    'live-formation': d => {
      const m = ui.live.m;
      const s = m.sides[m.user];
      if (s.formationDef === s.formation) s.formationDef = d.v;
      // Com expulsões, sobram vagas vazias na nova formação.
      s.lineup = FB.fillSlots(S, d.v, s.lineup.filter(x => x != null).map(P));
      s.formation = d.v;
      refreshSheet();
    },
    'live-posture': d => { const m = ui.live.m; m.sides[m.user].posture = d.v; refreshSheet(); },
    'live-press': d => { const m = ui.live.m; m.sides[m.user].press = d.v; refreshSheet(); },
    'live-finish': () => finishLive(),
    'live-formation-def': d => { const m = ui.live.m; const s = m.sides[m.user]; s.formationDef = d.v || s.formation; refreshSheet(); },
    moment: d => {
      const L = ui.live;
      const r = L.m.resolveMoment(d.v);
      closeSheet();
      updateLive();
      if (r) toast(r.goal ? '⚽ ' + r.text : r.text, 3000);
      if (!L.paused) tickLoop();
    },
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = A[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el.dataset, el); }
  });

  document.addEventListener('change', e => {
    if (e.target.id === 'comp-select' && e.target.value) A.comp({ v: e.target.value });
    if (e.target.id === 'captain-select') { me().captain = e.target.value ? +e.target.value : null; FB.save(S); toast('Capitão definido.'); }
  });

  document.addEventListener('input', e => {
    if (e.target.id === 'mkt-q') {
      ui.mkt.q = e.target.value;
      clearTimeout(ui.qTimer);
      ui.qTimer = setTimeout(() => {
        const pos = e.target.selectionStart;
        render();
        const inp = document.getElementById('mkt-q');
        if (inp) { inp.focus(); inp.setSelectionRange(pos, pos); }
      }, 250);
    }
  });

  window.addEventListener('pagehide', () => { if (S && !ui.live) FB.save(S); });

  FB.onSaveError = () => toast('Não foi possível salvar o jogo. Verifique o espaço livre do aparelho.', 4000);
  FB.migrateLegacy().then(render);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})(window.FB);
