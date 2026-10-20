# Prancheta FC

Jogo de gerência de futebol para celular, com o Brasil no centro e o mundo em volta, inspirado no **Brasfoot** (rapidez, calendário cheio,
mercado) e no **Football Manager** (tática, treino, preleção, departamento médico, notas). Roda no navegador
e pode ser instalado como app (PWA), funcionando offline.

> O nome "FootBoss" já pertence a outro jogo. "Prancheta FC" não apareceu em buscas como jogo existente,
> mas confira o registro no INPI antes de publicar. Para trocar o nome, edite `FB.APP_NAME` em `data.js`,
> o `<title>` do `index.html` e o `manifest.json`.

## Como jogar

Abra o `index.html` por um servidor web (GitHub Pages, por exemplo, ou `python3 -m http.server`
na pasta do projeto). No celular, use "Adicionar à tela inicial".

## Calendário brasileiro

Temporada de janeiro a dezembro, com datas reais (sábados para o Brasileirão e quartas para as copas):

| Competição | Formato no jogo |
| --- | --- |
| **Estaduais** (Paulistão, Carioca, Mineiro, Gauchão…) | 8 clubes por estado, turno único + semifinal e final. Clubes do interior completam a tabela. Jan–mar. |
| **Supercopa do Brasil** | Campeão brasileiro × campeão da Copa do Brasil, jogo único em campo neutro. |
| **Série A** | 20 clubes, pontos corridos (38 rodadas). G6 vai à Libertadores, 7º–12º à Sul-Americana, 4 caem. |
| **Série B** | 20 clubes, pontos corridos. 4 sobem e 4 caem. |
| **Série C** | 20 clubes: turno único, os 8 primeiros vão a dois quadrangulares (2 de cada sobem) e final. 4 caem. |
| **Série D** | 32 clubes em 4 grupos, depois mata-mata; os vencedores das quartas sobem. |
| **Copa do Brasil** | 64 clubes (A, B, C e 4 da D). Duas fases em jogo único (o menor manda), depois ida e volta até a final. |
| **Libertadores** e **Sul-Americana** | 32 clubes cada (brasileiros + sul-americanos), 8 grupos de 4, mata-mata de ida e volta, final única. |

Os cartões e suspensões são contados por competição. As janelas de transferência abrem do início do ano até o
começo do Brasileirão e em julho; jogadores livres podem ser contratados a qualquer momento.

## Ligas do mundo

Além do Brasil, todas estas ligas são jogáveis: dá para começar a carreira nelas e receber propostas de clubes de lá.

| Continente | Ligas |
| --- | --- |
| América do Sul | Argentina (30 clubes, turno único), Uruguai, Paraguai, Chile, Colômbia, Equador, Peru, Bolívia e Venezuela |
| Europa | Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Liga Portugal e Eredivisie (composição 2025/26) |

- As ligas estrangeiras são de pontos corridos e jogam aos domingos ao longo do ano; por enquanto só há a primeira divisão de
  cada país (sem acesso nem rebaixamento lá fora). Nas ligas sul-americanas a composição de 2026 é aproximada.
- **Libertadores e Sul-Americana** passam a ter vagas por país, pela tabela de cada liga (Argentina 6, Colômbia, Uruguai,
  Paraguai, Chile e Equador 3, Peru 2, Bolívia e Venezuela 1, além dos brasileiros).
- **Liga dos Campeões e Liga Europa**: 32 clubes cada, com vagas pelas ligas europeias, grupos e mata-mata.
- Cada liga tem a própria economia (TV, patrocínio, ingresso e premiação); os jogadores gerados têm nomes do país do clube.
- Carreiras antigas recebem os clubes novos ao abrir; as ligas novas começam na temporada seguinte.
- Quando seu time não joga, *Avançar* simula as datas seguintes até o próximo jogo.

## Carreiras e painel

- Até **3 carreiras salvas** ao mesmo tempo. A tela inicial mostra cada uma num cartão (clube, divisão, temporada,
  rodada e posição) com os botões *Continuar* e *Apagar*. Os saves ficam no IndexedDB do navegador; a carreira da
  versão anterior é migrada sozinha.
- Ao assumir um clube, a **apresentação** mostra o seu contrato (salário e duração) e as metas da diretoria. O contrato
  é renovado na virada do ano, com aumento quando a diretoria está satisfeita.
- O **painel** traz o próximo jogo (casa/fora, força dos dois times e dificuldade), o craque da última partida, uma dica
  do auxiliar técnico e a confiança da diretoria.
- Navegação: *Painel, Elenco, Mensagens, Mercado* e *Mais* (calendário, notícias, tática, treino, médico, finanças,
  estádio, diretoria, competições, sala de troféus, carreira e configurações).

## Tática com e sem bola

Além da formação de quando o time ataca, dá para escolher uma forma **sem a bola** (por exemplo, 4-3-3 atacando e
5-4-1 defendendo). A defesa fica mais fechada, mas a transição custa um pouco de controle do meio e de ataque.
Os adversários mais fracos também se fecham assim, e o foco pelos lados/meio é comparado com a forma defensiva deles.

## Lances decisivos

Em alguns lances de perigo o jogo para e você escolhe a jogada: **contra-ataque** (chutar, driblar o goleiro ou tocar),
**falta** (direto, cruzar ou jogada ensaiada), **pênalti** (canto ou meio) e **defesa** (fazer a falta, dar o bote ou
recuar). A descrição da situação dá a pista da melhor escolha; o resultado ainda depende da qualidade dos jogadores.
Dá para desligar em *Mais → Configurações*.

## Olheiros e empréstimos

- **Lista de observação** (☆ Observar na ficha) e **relatório do olheiro** com recomendação: contratar, bom mas caro,
  opção de elenco ou não recomendado.
- **Buscar talentos**: o olheiro procura por posição e perfil (pronto para jogar ou jovens até 21) e traz os 6 melhores.
- **Empréstimos** até o fim da temporada: pegue jogadores que não são titulares em outros clubes (o dono ajuda a pagar o
  salário) e empreste os seus para ganharem minutos. Todos voltam na virada do ano.

## Antes de cada jogo

Ao tocar em **Jogar**, abre a tela de pré-jogo:
- **Adversário**: força, esquema habitual, fase, destaques, desfalques e o relatório do auxiliar técnico, com
  dicas baseadas no confronto (por exemplo, "eles jogam sem laterais: ataque pelos lados").
- **Escalação**: titulares no campo, botões *Melhor time* e *Rodar cansados*, capitão e os **12 relacionados**
  do banco. Só quem está no banco pode entrar durante a partida.
- **Tática**: formação, postura, pressão, ritmo, linha defensiva, foco do ataque e estilo de passe. Cada escolha
  tem efeito na simulação e interage com o estilo do adversário (contra-ataque contra linha adiantada,
  jogadas pelos lados contra times sem laterais etc.).
- **Preleção**: motivar, cobrar a vitória, tirar a pressão ou foco no adversário. O efeito depende de quem é o
  favorito e do moral do elenco.

## Rodízio do elenco

Em *Elenco → Tática* dá para ligar o **rodízio automático** (o auxiliar poupa quem estiver abaixo da energia
mínima escolhida) e definir a **prioridade de cada competição**: principal, normal ou *poupar titulares*.

## Diretoria e e-mails

- No começo de cada temporada a diretoria envia as **metas**: posição na liga, metas no estadual, na Copa do
  Brasil e nas competições continentais, teto da folha salarial, caixa positivo e minutos para a base.
- Há um **orçamento para contratações** e um **teto salarial**: compras acima disso não são aprovadas. Vendas
  liberam metade do valor para novas contratações, e dá para pedir mais verba uma vez por temporada.
- **E-mails** da diretoria (relatório mensal, metas cumpridas ou não, ultimato), do departamento médico, do
  auxiliar técnico, do mercado e da torcida.

## Lesões e departamento médico

- Cerca de 20 tipos de lesão com frequência e tempo de recuperação baseados no futebol profissional: contusão
  (3–10 dias), lesão muscular grau 1/2/3 na coxa (10–21 / 21–42 / 60–90 dias), entorses, ligamento colateral,
  menisco, **ruptura do LCA (7–9 meses)**, tendão de Aquiles, fraturas, pubalgia, concussão (protocolo de 7–14 dias) etc.
- O risco aumenta com cansaço, idade e recaída recente. Também há lesões em treinos.
- **Na partida, quando um jogador seu se machuca, o jogo fica parado até você fazer a substituição.**
  Sem trocas disponíveis, o time fica com um a menos.
- Depois do jogo, o departamento médico manda o diagnóstico e você escolhe o tratamento:
  conservador, fisioterapia intensiva (volta antes e com mais risco de recaída), cirurgia (obrigatória para
  LCA e Aquiles, opcional para menisco, metatarso e ruptura muscular), cirurgia com especialista no exterior,
  ou jogar no sacrifício com infiltração (em contusões, entorses leves, pubalgia, tendinite e fratura no nariz).
  Quem joga no sacrifício rende menos e pode agravar a lesão.

## Notícias

A aba **Notícias** traz notícias de jogos (goleadas, zebras, hat-tricks, campeões), mercado (contratações
fechadas), especulações (algumas se confirmam), bastidores leves, curiosidades (invencibilidade, jejum,
público, artilharia) e atualizações (lesões, sorteios, classificados). Tudo é gerado pelo jogo. Os bastidores
são inofensivos de propósito, porque a base pode ter nomes de pessoas reais.

## Clubes e jogadores reais

**Clubes:** o pacote `pack-brasil.js` traz os clubes reais das Séries A, B e C de 2026, um grupo de 32 clubes
para a Série D e 53 clubes sul-americanos (com cores, cidade, estádio e torcida aproximados). A Série D real tem
64 clubes, então aqui ela é uma versão reduzida. Também há o modo **clubes fictícios**.

**Jogadores:** os elencos vêm gerados. Para usar jogadores reais, na tela de escolha do clube toque em
**Importar elencos reais**. Durante a carreira, use *Mais → Configurações → Atualizar elencos*. O jogo aceita:

1. **Sua planilha** `jogadores.csv` (separada por `;` ou `,`):
   `nome; clube; posicao; idade; forca; potencial; valor; salario`
   - `clube`: nome ou sigla (Flamengo, FLA, "CR Flamengo"…); vazio ou `livre` = sem clube.
   - `posicao`: G, Z, L, M, A ou por extenso ("goleiro", "volante", "ponta", "ST", "CB"…).
   - Sem `forca` e `potencial`, eles são calculados pelo `valor` de mercado ("R$ 12,5 mi", "€ 3m", "800 mil") e pela idade.
2. **players.csv do projeto [transfermarkt-datasets](https://github.com/dcaribou/transfermarkt-datasets)**,
   uma base aberta (licença CC0) também publicada no Kaggle.
3. **clubes.csv**: `nome; sigla; cidade; cor1; cor2; divisao; capacidade; torcida; caixa; titulos` para
   corrigir dados dos clubes. Antes de começar a carreira, também dá para mudar as divisões, desde que o total
   continue 20/20/20/32.

Em *Mais → Configurações → Exportar base (CSV)* você baixa a base atual no mesmo formato, para editar e reimportar.

### Gerador de elencos reais

`tools/gerar-elencos.js` monta o `jogadores.csv` a partir do transfermarkt-datasets, com força e potencial calculados por:

- **Força:** valor de mercado e idade (jovens valem mais pelo que podem ser; veteranos perdem valor mais rápido que
  qualidade), com ajuste pelos minutos jogados nos últimos 12 meses.
- **Potencial:** margem pela idade (até 18 anos, ~14 pontos; aos 25, ~1), mais a tendência do valor no último ano,
  o valor máximo da carreira e se o jovem já é titular. O cálculo é determinístico: o mesmo jogador sempre recebe a mesma nota.

Pelo celular: no GitHub, abra **Actions → Gerar elencos reais → Run workflow**. Ao terminar, baixe o artefato
`elencos-reais` (zip com `jogadores.csv` e `relatorio.txt`), descompacte no app Arquivos e importe o `jogadores.csv` no jogo.
O relatório mostra quantos clubes de cada divisão ganharam elenco real. No computador:
`node tools/gerar-elencos.js <pasta-com-os-csv> <pasta-de-saida>`.

O arquivo gerado tem nomes de pessoas reais e **não é commitado** no repositório.

Nomes, escudos e marcas de clubes e jogadores reais pertencem aos donos. Use bases reais só para uso pessoal.

## Arquivos

| Arquivo | Conteúdo |
| --- | --- |
| `data.js` | Utilitários, nomes, formações, estaduais e cidades do interior |
| `pack-brasil.js` | Clubes reais do Brasil 2026 |
| `pack-mundo.js` | Ligas da América do Sul e da Europa (clubes, economia e vagas) |
| `engine.js` | Competições, calendário, partida, tática, finanças, mercado, temporada e save |
| `board.js` | Metas da diretoria, orçamento, teto salarial, e-mails e contrato do treinador |
| `medical.js` | Lesões, tratamentos e recuperação |
| `news.js` | Feed de notícias |
| `importer.js` | Importação e exportação de base (CSV/JSON, transfermarkt-datasets) e fórmula de força/potencial |
| `tools/gerar-elencos.js` | Gerador do arquivo de elencos reais (roda no GitHub Actions ou no computador) |
| `ui.js`, `app.css` | Interface mobile |
| `sw.js`, `manifest.json` | PWA e modo offline |
