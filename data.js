'use strict';
// Prancheta FC — dados base: utilitários, nomes, formações e estaduais.
(function (FB) {
  FB.ri = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  FB.rf = (a, b) => Math.random() * (b - a) + a;
  FB.pick = arr => arr[Math.floor(Math.random() * arr.length)];
  FB.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  FB.gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2;
  FB.shuffle = arr => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  FB.weighted = (items, weightOf) => {
    const total = items.reduce((s, it) => s + weightOf(it), 0);
    let x = Math.random() * total;
    for (const it of items) {
      x -= weightOf(it);
      if (x <= 0) return it;
    }
    return items[items.length - 1];
  };

  FB.APP_NAME = 'Prancheta FC';
  FB.DIV_NAMES = ['Série A', 'Série B', 'Série C', 'Série D', 'Estadual', 'Exterior'];

  // Nome de cada estadual.
  FB.UF_COMP = {
    SP: 'Paulistão', RJ: 'Carioca', MG: 'Mineiro', RS: 'Gauchão', PR: 'Paranaense', SC: 'Catarinense',
    BA: 'Baiano', PE: 'Pernambucano', CE: 'Cearense', GO: 'Goiano', PA: 'Paraense', AM: 'Amazonense',
    AL: 'Alagoano', SE: 'Sergipano', PB: 'Paraibano', MA: 'Maranhense', RN: 'Potiguar', PI: 'Piauiense',
    MT: 'Mato-Grossense', MS: 'Sul-Mato-Grossense', DF: 'Candangão', ES: 'Capixaba',
  };

  // Cidades usadas para os clubes do interior que completam os estaduais.
  FB.UF_CITIES = {
    SP: ['Sorocaba', 'Jundiaí', 'Piracicaba', 'Bauru', 'Marília', 'Franca', 'Presidente Prudente', 'Taubaté'],
    RJ: ['Nova Iguaçu', 'Macaé', 'Campos', 'Cabo Frio', 'Petrópolis', 'Resende', 'Niterói', 'Madureira'],
    MG: ['Uberaba', 'Juiz de Fora', 'Montes Claros', 'Varginha', 'Pouso Alegre', 'Patos de Minas', 'Divinópolis', 'Governador Valadares'],
    RS: ['Santa Maria', 'Novo Hamburgo', 'Passo Fundo', 'Santa Cruz do Sul', 'Lajeado', 'Bagé', 'Canoas', 'Gravataí'],
    PR: ['Foz do Iguaçu', 'Toledo', 'Paranaguá', 'Guarapuava', 'Apucarana', 'Arapongas', 'Campo Mourão', 'Umuarama'],
    SC: ['Blumenau', 'Lages', 'Tubarão', 'Concórdia', 'Jaraguá do Sul', 'Rio do Sul', 'Camboriú', 'São Bento do Sul'],
    BA: ['Feira de Santana', 'Vitória da Conquista', 'Ilhéus', 'Itabuna', 'Barreiras', 'Camaçari', 'Jequié', 'Alagoinhas'],
    PE: ['Caruaru', 'Petrolina', 'Salgueiro', 'Garanhuns', 'Vitória de Santo Antão', 'Serra Talhada', 'Belo Jardim', 'Afogados'],
    CE: ['Juazeiro do Norte', 'Sobral', 'Crato', 'Iguatu', 'Maracanaú', 'Caucaia', 'Horizonte', 'Itapipoca'],
    GO: ['Rio Verde', 'Catalão', 'Itumbiara', 'Trindade', 'Jataí', 'Luziânia', 'Inhumas', 'Morrinhos'],
    PA: ['Castanhal', 'Santarém', 'Paragominas', 'Altamira', 'Ananindeua', 'Bragança', 'Cametá', 'Parauapebas'],
    AM: ['Parintins', 'Itacoatiara', 'Manacapuru', 'Tefé', 'Coari', 'Humaitá', 'Maués', 'Iranduba'],
    AL: ['Arapiraca', 'Penedo', 'Palmeira dos Índios', 'Rio Largo', 'União dos Palmares', 'Coruripe', 'Delmiro Gouveia', 'Marechal Deodoro'],
    SE: ['Lagarto', 'Estância', 'Propriá', 'Tobias Barreto', 'Simão Dias', 'Socorro', 'Boquim', 'Neópolis'],
    PB: ['Patos', 'Sousa', 'Cajazeiras', 'Guarabira', 'Santa Rita', 'Bayeux', 'Pombal', 'Monteiro'],
    MA: ['Imperatriz', 'Caxias', 'Timon', 'Bacabal', 'Codó', 'Balsas', 'Santa Inês', 'Pinheiro'],
    RN: ['Mossoró', 'Parnamirim', 'Caicó', 'Currais Novos', 'Macaíba', 'Açu', 'Pau dos Ferros', 'São Gonçalo'],
    PI: ['Parnaíba', 'Picos', 'Piripiri', 'Floriano', 'Campo Maior', 'Oeiras', 'Barras', 'Esperantina'],
    MT: ['Rondonópolis', 'Sinop', 'Várzea Grande', 'Primavera do Leste', 'Sorriso', 'Lucas do Rio Verde', 'Tangará da Serra', 'Cáceres'],
    MS: ['Dourados', 'Três Lagoas', 'Corumbá', 'Ponta Porã', 'Naviraí', 'Aquidauana', 'Nova Andradina', 'Coxim'],
    DF: ['Ceilândia', 'Sobradinho', 'Planaltina', 'Samambaia', 'Santa Maria', 'Recanto das Emas', 'Paranoá', 'Guará'],
    ES: ['Vitória', 'Vila Velha', 'Serra', 'Linhares', 'Colatina', 'Cachoeiro', 'São Mateus', 'Guarapari'],
  };

  FB.CLUB_PREFIX = ['Esporte Clube', 'Atlético', 'União', 'Sport Club', 'Associação Atlética', 'Grêmio Esportivo',
    'Sociedade Esportiva', 'Independente', 'Operário', 'Ferroviário', 'Real', 'Clube Atlético'];
  FB.FOREIGN_PREFIX = { ARG: 'Club Atlético', URU: 'Club', PAR: 'Club', CHI: 'Deportes', COL: 'Deportivo', ECU: 'Sociedad Deportiva', PER: 'Club', BOL: 'Club', VEN: 'Deportivo' };
  FB.COUNTRY = { BRA: 'Brasil', ARG: 'Argentina', URU: 'Uruguai', PAR: 'Paraguai', CHI: 'Chile', COL: 'Colômbia', ECU: 'Equador', PER: 'Peru', BOL: 'Bolívia', VEN: 'Venezuela' };
  FB.PALETTE = ['#c62828', '#1565c0', '#2e7d32', '#111111', '#6a1b9a', '#ef6c00', '#00838f', '#f2c500', '#7a0026', '#455a64'];

  FB.FIRST = ['Lucas', 'Gabriel', 'Matheus', 'Pedro', 'Rafael', 'Bruno', 'Felipe', 'Gustavo', 'Thiago', 'Diego',
    'André', 'Rodrigo', 'Leonardo', 'Vinícius', 'Caio', 'João', 'Marcos', 'Eduardo', 'Daniel', 'Henrique', 'Igor',
    'Murilo', 'Renan', 'Vitor', 'Wesley', 'Alisson', 'Everton', 'Jonathan', 'Kaique', 'Luan', 'Maicon', 'Nathan',
    'Otávio', 'Patrick', 'Ramon', 'Samuel', 'Tiago', 'Wallace', 'Yuri', 'Carlos', 'Fábio', 'Hugo', 'Jefferson',
    'Luiz', 'Paulo', 'Ricardo', 'Sérgio', 'Alan', 'Breno', 'Davi', 'Emerson', 'Fernando', 'Guilherme', 'Heitor',
    'Ivan', 'Júlio', 'Kauã', 'Leandro', 'Marcelo', 'Nicolas', 'Pablo', 'Rogério', 'Robson', 'Talles', 'Wagner',
    'Anderson', 'Cristian', 'Douglas', 'Elias', 'Fabrício', 'Geovane', 'Jean', 'Léo', 'Márcio', 'Nilton', 'Enzo',
    'Arthur', 'Bernardo', 'Raul', 'Rian', 'Erick', 'Ítalo', 'Jhonatan', 'Weverton', 'Cauê'];
  FB.LAST = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento',
    'Carvalho', 'Araújo', 'Ribeiro', 'Gomes', 'Martins', 'Rocha', 'Barbosa', 'Melo', 'Cardoso', 'Teixeira', 'Moreira',
    'Correia', 'Mendes', 'Nunes', 'Ramos', 'Freitas', 'Vieira', 'Monteiro', 'Batista', 'Pinto', 'Moura', 'Cavalcanti',
    'Dias', 'Castro', 'Campos', 'Fonseca', 'Andrade', 'Reis', 'Machado', 'Farias', 'Lopes', 'Sales', 'Prado', 'Brito',
    'Queiroz', 'Tavares', 'Bezerra', 'Peixoto', 'Aguiar', 'Siqueira', 'Xavier', 'Bastos', 'Leite', 'Paiva', 'Duarte',
    'Fontes', 'Matos', 'Viana', 'Coelho', 'Sampaio', 'Guimarães', 'Arruda', 'Bittencourt', 'Lacerda', 'Pacheco'];
  FB.NICK = ['Tutu', 'Didico', 'Fumaça', 'Canhoto', 'Toninho', 'Zezinho', 'Lelê', 'Bilu', 'Pipoca', 'Chiquinho',
    'Teco', 'Cacau', 'Gringo', 'Baianinho', 'Tatu', 'Mineirinho', 'Russo', 'Sabiá', 'Pirulito', 'Bozó', 'Jajá',
    'Neto Paraíba', 'Tinga Jr.', 'Bolota', 'Magrão', 'Xodó', 'Dedé', 'Cuca Jr.', 'Kiko', 'Nino', 'Pepeu', 'Vavá Neto'];

  const L = str => str.split(',');
  FB.NAME_POOLS = {
    br: { first: FB.FIRST, last: FB.LAST },
    es: {
      first: L('Juan,Matías,Santiago,Nicolás,Facundo,Agustín,Lautaro,Franco,Gonzalo,Joaquín,Tomás,Federico,Emiliano,Ezequiel,Leandro,Maximiliano,Rodrigo,Sebastián,Diego,Alejandro,Andrés,Carlos,Cristian,Brian,Kevin,Jonathan,Luis,Jorge,Miguel,Héctor,Wilmar,Jhon,Yerson,Duván,Edinson,Darwin,Fabián,Ángel,Iván,Hernán,Ramiro,Thiago,Valentín,Bruno,Mauricio,Esteban,Óscar,Ricardo,Raúl,Germán'),
      last: L('González,Rodríguez,Fernández,López,Martínez,García,Pérez,Sánchez,Romero,Díaz,Álvarez,Torres,Ruiz,Ramírez,Flores,Acosta,Benítez,Medina,Herrera,Suárez,Aguirre,Gutiérrez,Rojas,Molina,Castro,Ortiz,Silva,Núñez,Vargas,Cabrera,Ríos,Morales,Giménez,Sosa,Ledesma,Paredes,Cáceres,Valdez,Quintero,Mosquera,Palacios,Cuesta,Zapata,Arango,Carrillo,Vera,Villalba,Escobar,Domínguez,Peralta'),
    },
    esp: {
      first: L('Álvaro,Pablo,Sergio,Javier,Daniel,Adrián,Marcos,Iker,Unai,Mikel,Asier,Jon,Raúl,Carlos,Alejandro,David,Rubén,Jesús,Fernando,Óscar,Hugo,Martín,Mario,Víctor,Jorge,Íñigo,Aitor,Dani,Gerard,Pau,Marc,Jordi,Eric,Nico,Borja,Ander,Rodrigo,Iván,Samuel,Diego'),
      last: L('García,Fernández,González,Rodríguez,López,Martínez,Sánchez,Pérez,Gómez,Martín,Jiménez,Ruiz,Hernández,Díaz,Moreno,Muñoz,Álvarez,Romero,Navarro,Torres,Domínguez,Gil,Vázquez,Serrano,Ramos,Blanco,Molina,Morales,Ortega,Delgado,Castro,Ortiz,Rubio,Marín,Sanz,Iglesias,Medina,Garrido,Cortés,Castillo,Etxeberria,Aguirre,Zubeldia,Puig,Vidal,Soler,Ferrer'),
    },
    en: {
      first: L('James,Jack,Harry,Oliver,George,Charlie,Thomas,William,Jacob,Alfie,Joshua,Daniel,Ben,Luke,Callum,Ryan,Lewis,Kyle,Jordan,Jamie,Reece,Mason,Declan,Aaron,Conor,Liam,Ethan,Joe,Sam,Max,Harvey,Lucas,Noah,Tyler,Dominic'),
      last: L('Smith,Jones,Taylor,Brown,Williams,Wilson,Johnson,Davies,Robinson,Wright,Thompson,Evans,Walker,White,Roberts,Green,Hall,Wood,Jackson,Clarke,Hughes,Edwards,Turner,Hill,Cooper,Ward,Morris,Moore,Parker,Bennett,Harris,Lewis,King,Baker,Carter,Mitchell,Palmer,Barnes,Rice,Shaw'),
    },
    it: {
      first: L('Lorenzo,Alessandro,Matteo,Andrea,Francesco,Federico,Davide,Riccardo,Marco,Luca,Simone,Giacomo,Nicolò,Gianluca,Stefano,Antonio,Giovanni,Leonardo,Tommaso,Filippo,Daniele,Pietro,Manuel,Fabio,Mattia,Samuele,Emanuele,Christian,Alberto,Salvatore'),
      last: L('Rossi,Russo,Ferrari,Esposito,Bianchi,Romano,Colombo,Ricci,Marino,Greco,Bruno,Gallo,Conti,De Luca,Mancini,Costa,Giordano,Rizzo,Lombardi,Moretti,Barbieri,Fontana,Santoro,Mariani,Rinaldi,Caruso,Ferrara,Galli,Martini,Leone,Longo,Gentile,Martinelli,Vitale,Lombardo,Serra,Coppola,De Santis,Bellini,Pellegrini'),
    },
    de: {
      first: L('Lukas,Leon,Jonas,Niklas,Felix,Maximilian,Julian,Tim,Jan,Florian,Tobias,Moritz,Kai,Leroy,Marco,Kevin,Timo,Mats,Thomas,Manuel,Sebastian,Philipp,Benjamin,Robin,David,Lennart,Joshua,Nico,Matthias,Paul,Luca,Finn,Jonathan,Elias,Noah'),
      last: L('Müller,Schmidt,Schneider,Fischer,Weber,Meyer,Wagner,Becker,Schulz,Hoffmann,Koch,Richter,Klein,Wolf,Schröder,Neumann,Schwarz,Zimmermann,Braun,Krüger,Hofmann,Hartmann,Lange,Werner,Krause,Lehmann,Köhler,Maier,Kaiser,Fuchs,Brandt,Vogel,Keller,Roth,Beck,Lorenz,Baumann,Franke,Albrecht,Winkler'),
    },
    fr: {
      first: L('Lucas,Hugo,Théo,Nathan,Louis,Enzo,Mathis,Antoine,Kylian,Ousmane,Moussa,Mamadou,Ibrahima,Youssouf,Adrien,Benjamin,Clément,Maxime,Jules,Baptiste,Florian,Kevin,Rayan,Wesley,Jordan,Aurélien,Randal,Mattéo,Bastien,Warren'),
      last: L('Martin,Bernard,Dubois,Thomas,Robert,Richard,Petit,Durand,Leroy,Moreau,Simon,Laurent,Lefebvre,Michel,Garcia,David,Bertrand,Roux,Vincent,Fournier,Morel,Girard,André,Mercier,Dupont,Lambert,Bonnet,François,Diallo,Traoré,Koné,Camara,Sissoko,Mendy,Diop,Touré,Kanté,Cissé,Gueye,Fofana'),
    },
    pt: {
      first: L('João,Rúben,Diogo,Bernardo,Gonçalo,Rafael,Tiago,André,Nuno,Pedro,Francisco,Ricardo,Rui,Bruno,Vítor,Miguel,Duarte,Tomás,Martim,Hugo,Fábio,Renato,Sérgio,Luís,Henrique'),
      last: L('Silva,Santos,Ferreira,Pereira,Oliveira,Costa,Rodrigues,Martins,Jesus,Sousa,Fernandes,Gonçalves,Gomes,Lopes,Marques,Alves,Almeida,Ribeiro,Pinto,Carvalho,Teixeira,Moreira,Correia,Mendes,Nunes,Soares,Vieira,Monteiro,Cardoso,Rocha,Neves,Coelho,Cruz,Cunha,Pires,Ramos,Reis,Simões,Antunes,Matos'),
    },
    nl: {
      first: L('Daan,Sem,Lucas,Milan,Levi,Luuk,Jesse,Thijs,Bram,Ruben,Tim,Stijn,Jasper,Wout,Joey,Kenneth,Teun,Jens,Bart,Davy,Matthijs,Ryan,Sven,Koen,Mats,Noa,Quinten,Calvin,Justin,Owen'),
      last: L('de Jong,Jansen,de Vries,van den Berg,van Dijk,Bakker,Janssen,Visser,Smit,Meijer,de Boer,Mulder,de Groot,Bos,Vos,Peters,Hendriks,van Leeuwen,Dekker,Brouwer,de Wit,Dijkstra,Smits,de Graaf,van der Meer,Kok,Jacobs,de Haan,Vermeulen,van den Heuvel'),
    },
  };
  FB.COUNTRY_POOL = { BRA: 'br', ENG: 'en', ESP: 'esp', ITA: 'it', GER: 'de', FRA: 'fr', POR: 'pt', NED: 'nl' };
  // Elencos europeus têm muitos estrangeiros; os sul-americanos, alguns.
  const MIX = { br: 0.05, es: 0.08 };

  FB.randomName = (country = 'BRA') => {
    let pool = FB.COUNTRY_POOL[country] || 'es';
    if (Math.random() < (MIX[pool] ?? 0.35)) pool = FB.pick(Object.keys(FB.NAME_POOLS));
    if (pool === 'br' && Math.random() < 0.18) return FB.pick(FB.NICK);
    const P = FB.NAME_POOLS[pool];
    return FB.pick(P.first) + ' ' + FB.pick(P.last);
  };

  FB.POS = ['G', 'Z', 'L', 'M', 'A'];
  FB.POS_NAME = { G: 'Goleiro', Z: 'Zagueiro', L: 'Lateral', M: 'Meio-campo', A: 'Atacante' };
  FB.POS_ROW = { G: 0, Z: 1, L: 1, M: 2, A: 3 };
  FB.SQUAD_TEMPLATE = { G: 3, Z: 6, L: 4, M: 7, A: 5 };
  FB.SMALL_TEMPLATE = { G: 2, Z: 4, L: 3, M: 5, A: 4 };

  // Quantidade por setor (o goleiro é implícito).
  FB.FORMATIONS = {
    '4-4-2': { Z: 2, L: 2, M: 4, A: 2 },
    '4-3-3': { Z: 2, L: 2, M: 3, A: 3 },
    '4-5-1': { Z: 2, L: 2, M: 5, A: 1 },
    '3-5-2': { Z: 3, L: 0, M: 5, A: 2 },
    '3-4-3': { Z: 3, L: 0, M: 4, A: 3 },
    '5-3-2': { Z: 3, L: 2, M: 3, A: 2 },
    '5-4-1': { Z: 3, L: 2, M: 4, A: 1 },
  };

  // Ordem dos slots: G, lateral esq., zagueiros, lateral dir., meias, atacantes.
  FB.slotsOf = formation => {
    const f = FB.FORMATIONS[formation];
    const s = ['G'];
    const lat = f.L / 2;
    for (let i = 0; i < lat; i++) s.push('L');
    for (let i = 0; i < f.Z; i++) s.push('Z');
    for (let i = 0; i < lat; i++) s.push('L');
    for (let i = 0; i < f.M; i++) s.push('M');
    for (let i = 0; i < f.A; i++) s.push('A');
    return s;
  };

  FB.POSTURES = { defensivo: 'Defensivo', equilibrado: 'Equilibrado', ofensivo: 'Ofensivo' };
})(window.FB = window.FB || {});
