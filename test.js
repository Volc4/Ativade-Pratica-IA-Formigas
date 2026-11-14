/*
 * Testes de validação do núcleo (seção 6 do enunciado).
 * Executar com:  node test.js
 * Sai com código 1 se algum caso falhar.
 */
'use strict';

const ACO = require('./aco.js');

const TOL = 1e-6;
const NOMES = ['A', 'B', 'C', 'D'];
const VERTICES_61 = [
  { id: 'A', x: 0, y: 0 },
  { id: 'B', x: 3, y: 0 },
  { id: 'C', x: 3, y: 4 },
  { id: 'D', x: 0, y: 4 },
];
const CFG_64 = {
  vertices: VERTICES_61,
  depot: 0,
  ants: 10,
  iterations: 30,
  alpha: 1,
  beta: 2,
  rho: 0.5,
  tau0: 1,
  Q: 14,
  seed: 42,
};

let aprovados = 0;
let reprovados = 0;

function caso(nome, fn) {
  console.log(`\n## ${nome}`);
  try {
    fn();
    aprovados += 1;
    console.log('   -> OK');
  } catch (erro) {
    reprovados += 1;
    console.log(`   -> FALHOU: ${erro.message}`);
  }
}

function perto(obtido, esperado, rotulo) {
  if (Math.abs(obtido - esperado) > TOL) {
    throw new Error(`${rotulo}: esperado ${esperado}, obtido ${obtido}`);
  }
}

function exigir(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}

function nomeRota(rota) {
  return rota.map((v) => NOMES[v] ?? v).join(' → ');
}

function nomeAresta(i, j) {
  return `${NOMES[i]}${NOMES[j]}`;
}

function matrizUniforme(n, valor) {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : valor)));
}

function fmt(x, casas = 6) {
  return Number(x.toFixed(casas)).toString();
}

const dist = ACO.distanceMatrix(VERTICES_61);

// ---------------------------------------------------------------------------
caso('6.1 Instância de referência e cálculo das rotas', () => {
  const pares = [[0, 1, 3], [0, 2, 5], [0, 3, 4], [1, 2, 4], [1, 3, 5], [2, 3, 3]];
  for (const [i, j, d] of pares) {
    perto(dist[i][j], d, `d(${nomeAresta(i, j)})`);
    perto(dist[j][i], d, `d(${nomeAresta(j, i)})`);
  }
  for (let i = 0; i < 4; i += 1) perto(dist[i][i], 0, `d(${NOMES[i]},${NOMES[i]})`);
  console.log('   Distâncias: AB=3, AC=5, AD=4, BC=4, BD=5, CD=3; diagonal 0.');

  const rotas = [
    [[0, 1, 2, 3, 0], 14],
    [[0, 1, 3, 2, 0], 16],
    [[0, 2, 1, 3, 0], 18],
    [[0, 2, 3, 1, 0], 16],
    [[0, 3, 1, 2, 0], 18],
    [[0, 3, 2, 1, 0], 14],
  ];
  for (const [rota, L] of rotas) {
    const obtido = ACO.routeLength(rota, dist);
    perto(obtido, L, nomeRota(rota));
    exigir(ACO.isValidRoute(rota, 4, 0), `${nomeRota(rota)} deveria ser válida`);
    console.log(`   ${nomeRota(rota)}: ${fmt(obtido)}`);
  }

  const invalidas = [
    [0, 1, 2, 0], // incompleta
    [0, 1, 1, 3, 0], // repete B
    [1, 0, 2, 3, 1], // não começa no depósito
    [0, 1, 2, 3], // não retorna
  ];
  for (const rota of invalidas) {
    exigir(!ACO.isValidRoute(rota, 4, 0), `${nomeRota(rota)} deveria ser inválida`);
  }
  console.log('   Rotas incompletas, com repetição ou sem retorno: rejeitadas.');
});

// ---------------------------------------------------------------------------
caso('6.2 Probabilidades de escolha', () => {
  const tau = matrizUniforme(4, 1);

  const a = ACO.choiceProbabilities(0, [1, 2, 3], tau, dist, 1, 2);
  perto(a[0].weight, 1 / 9, 'w(A,B)');
  perto(a[1].weight, 1 / 25, 'w(A,C)');
  perto(a[2].weight, 1 / 16, 'w(A,D)');
  perto(a[0].prob, 400 / 769, 'p(A,B)');
  perto(a[1].prob, 144 / 769, 'p(A,C)');
  perto(a[2].prob, 225 / 769, 'p(A,D)');
  perto(a.reduce((s, c) => s + c.prob, 0), 1, 'soma em A');
  console.log(`   Em A (α=1, β=2): p(B)=${fmt(a[0].prob)}, p(C)=${fmt(a[1].prob)}, p(D)=${fmt(a[2].prob)}`);

  const b = ACO.choiceProbabilities(1, [2, 3], tau, dist, 1, 2);
  exigir(b.length === 2 && b[0].vertex === 2 && b[1].vertex === 3, 'em B, só C e D são candidatos');
  perto(b[0].prob, 25 / 41, 'p(B,C)');
  perto(b[1].prob, 16 / 41, 'p(B,D)');
  console.log(`   Em B: p(C)=${fmt(b[0].prob)}, p(D)=${fmt(b[1].prob)}`);

  // α = 0 com feromônios diferentes e β = 0 com distâncias diferentes.
  const tauDesigual = matrizUniforme(4, 1);
  tauDesigual[0][1] = tauDesigual[1][0] = 7;
  tauDesigual[0][2] = tauDesigual[2][0] = 0.2;
  const semAlphaBeta = ACO.choiceProbabilities(0, [1, 2, 3], tauDesigual, dist, 0, 0);
  for (const c of semAlphaBeta) perto(c.prob, 1 / 3, `α=β=0, p(${NOMES[c.vertex]})`);
  const soBeta0 = ACO.choiceProbabilities(0, [1, 2, 3], tau, dist, 1, 0);
  for (const c of soBeta0) perto(c.prob, 1 / 3, `β=0 com τ igual, p(${NOMES[c.vertex]})`);
  console.log('   α=0 e β=0 (com τ e d diferentes): 1/3 para cada candidato.');
  console.log('   β=0 com τ igual em todas as arestas: 1/3 para cada candidato.');

  const unico = ACO.choiceProbabilities(2, [3], tauDesigual, dist, 1, 2);
  perto(unico[0].prob, 1, 'candidato único');
  console.log('   Um só candidato: probabilidade 1.');

  // A roleta sorteia todos os candidatos, não só o de maior peso.
  const rng = ACO.mulberry32(123);
  const contagem = [0, 0, 0];
  const N = 100000;
  for (let k = 0; k < N; k += 1) contagem[ACO.pickIndex(a, rng)] += 1;
  for (let k = 0; k < 3; k += 1) {
    exigir(contagem[k] > 0, `o candidato ${NOMES[a[k].vertex]} nunca foi sorteado`);
    exigir(Math.abs(contagem[k] / N - a[k].prob) < 0.01, `frequência de ${NOMES[a[k].vertex]} longe de p`);
  }
  console.log(`   Roleta em ${N} sorteios: B=${fmt(contagem[0] / N, 4)}, C=${fmt(contagem[1] / N, 4)}, D=${fmt(contagem[2] / N, 4)}`);
});

// ---------------------------------------------------------------------------
caso('6.3 Evaporação e depósito', () => {
  const rota = [0, 1, 2, 3, 0];
  const L = ACO.routeLength(rota, dist);
  const perimetro = new Set(['01', '12', '23', '03']);

  const it1 = ACO.updatePheromone(matrizUniforme(4, 1), [rota], [L], 0.5, 14);
  console.log('   1ª iteração (1 formiga, rota A → B → C → D → A, L=14):');
  for (const e of it1.edges) {
    perto(e.before, 1, `${nomeAresta(e.i, e.j)} anterior`);
    perto(e.afterEvap, 0.5, `${nomeAresta(e.i, e.j)} após evaporação`);
    const noPerimetro = perimetro.has(`${e.i}${e.j}`);
    perto(e.deposit, noPerimetro ? 1 : 0, `${nomeAresta(e.i, e.j)} depósito`);
    perto(e.after, noPerimetro ? 1.5 : 0.5, `${nomeAresta(e.i, e.j)} final`);
    console.log(`     ${nomeAresta(e.i, e.j)}: anterior ${fmt(e.before)}; após evaporação ${fmt(e.afterEvap)}; depósito ${fmt(e.deposit)}; final ${fmt(e.after)}`);
  }
  for (let i = 0; i < 4; i += 1) {
    exigir(it1.tau[i][i] === 0, 'a diagonal deve continuar 0');
    for (let j = 0; j < 4; j += 1) exigir(it1.tau[i][j] === it1.tau[j][i], 'a matriz deve ser simétrica');
  }

  const it2 = ACO.updatePheromone(it1.tau, [rota], [L], 0.5, 14);
  for (const e of it2.edges) {
    perto(e.after, perimetro.has(`${e.i}${e.j}`) ? 1.75 : 0.25, `${nomeAresta(e.i, e.j)} na 2ª iteração`);
  }
  console.log('   2ª iteração: perímetro 1,75; diagonais 0,25.');

  const duas = ACO.updatePheromone(matrizUniforme(4, 1), [rota, rota], [L, L], 0.5, 14);
  for (const e of duas.edges) {
    perto(e.after, perimetro.has(`${e.i}${e.j}`) ? 2.5 : 0.5, `${nomeAresta(e.i, e.j)} com 2 formigas`);
  }
  console.log('   2 formigas na mesma rota: perímetro 2,5; diagonais 0,5.');

  const semEvap = ACO.updatePheromone(matrizUniforme(4, 1), [rota], [L], 0, 14);
  for (const e of semEvap.edges) {
    perto(e.afterEvap, e.before, `ρ=0, ${nomeAresta(e.i, e.j)} após evaporação`);
    exigir(e.after >= e.before, `ρ=0 reduziu ${nomeAresta(e.i, e.j)}`);
  }
  console.log('   ρ = 0: a evaporação não reduz nenhuma aresta (perímetro 2, diagonais 1).');

  const piso = ACO.updatePheromone(matrizUniforme(4, 1e-13), [rota], [L], 0.9, 1e-30);
  for (const e of piso.edges) exigir(e.after >= ACO.PISO_FEROMONIO, 'piso de 1e-12 não aplicado');
  console.log('   Piso numérico: nenhuma aresta abaixo de 1e-12.');
});

// ---------------------------------------------------------------------------
caso('6.4 Execução completa e reprodutibilidade', () => {
  const engine = ACO.createEngine(CFG_64);
  exigir(engine.iteration === 0 && engine.bestSoFar === null && engine.last === null, 'estado inicial incorreto');
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 4; j += 1) exigir(engine.tau[i][j] === (i === j ? 0 : 1), 'τ inicial deve ser τ₀ fora da diagonal');
  }
  console.log('   Iteração 0: τ = 1 em todas as arestas, sem rota (melhor = ainda não calculada).');

  let anterior = Infinity;
  while (!engine.finished) {
    const r = engine.step();
    exigir(r.bestSoFarLength <= anterior, `a melhor acumulada aumentou na iteração ${r.iteration}`);
    anterior = r.bestSoFarLength;
    for (const ant of r.ants) {
      exigir(ACO.isValidRoute(ant.route, 4, 0), `rota inválida na iteração ${r.iteration}`);
      exigir([14, 16, 18].some((L) => Math.abs(ant.length - L) < TOL), `comprimento ${ant.length} impossível`);
      exigir(ant.steps.length === 3 && ant.returnTo === 0, 'registro de passos incompleto');
    }
  }
  exigir(engine.step() === null, 'step() após o fim deve devolver null');
  exigir(engine.history.length === 30, `esperados 30 registros, obtidos ${engine.history.length}`);

  console.log('   Iter | menor da iteração | média      | melhor acumulada');
  for (const r of engine.history) {
    if (r.iteration <= 5 || r.iteration % 5 === 0) {
      console.log(`   ${String(r.iteration).padStart(4)} | ${fmt(r.bestLength, 2).padStart(17)} | ${fmt(r.meanLength, 2).padStart(10)} | ${fmt(r.bestSoFarLength, 2)}`);
    }
  }
  console.log(`   Melhor rota: ${nomeRota(engine.bestSoFar.route)} = ${fmt(engine.bestSoFar.length)} (iteração ${engine.bestSoFar.iteration})`);

  const repeticao = ACO.createEngine(CFG_64);
  while (!repeticao.finished) repeticao.step();
  const resumo = (e) => JSON.stringify(e.history.map((r) => [r.bestRoute, r.bestLength, r.meanLength, r.ants.map((a) => a.route)]));
  exigir(resumo(repeticao) === resumo(engine), 'mesma semente não reproduziu o histórico');
  exigir(JSON.stringify(repeticao.tau) === JSON.stringify(engine.tau), 'feromônio final diferente com a mesma semente');
  console.log('   Mesma semente e mesmos parâmetros: histórico e feromônio final idênticos.');
});

// ---------------------------------------------------------------------------
caso('6.5 Efeito de β (β = 0 × β = 2, sementes 1 a 5)', () => {
  console.log('   β | semente | melhor final | rota');
  for (const beta of [0, 2]) {
    const finais = [];
    for (const seed of [1, 2, 3, 4, 5]) {
      const engine = ACO.createEngine({ ...CFG_64, beta, seed });
      while (!engine.finished) engine.step();
      finais.push(engine.bestSoFar.length);
      console.log(`   ${beta} | ${seed}       | ${fmt(engine.bestSoFar.length, 2).padStart(12)} | ${nomeRota(engine.bestSoFar.route)}`);
    }
    const media = finais.reduce((s, x) => s + x, 0) / finais.length;
    const otimos = finais.filter((x) => Math.abs(x - 14) < TOL).length;
    console.log(`   => β=${beta}: média da melhor distância final ${fmt(media, 2)}; ${otimos} de 5 execuções atingiram 14.`);
  }
});

// ---------------------------------------------------------------------------
caso('6.5 Configurações inválidas são rejeitadas pelo núcleo', () => {
  const invalidas = [
    ['coordenadas duplicadas', { vertices: [...VERTICES_61.slice(0, 3), { id: 'D', x: 3, y: 4 }] }],
    ['identificadores repetidos', { vertices: [...VERTICES_61.slice(0, 3), { id: 'A', x: 0, y: 4 }] }],
    ['menos de quatro vértices', { vertices: VERTICES_61.slice(0, 3) }],
    ['identificador vazio', { vertices: [...VERTICES_61.slice(0, 3), { id: ' ', x: 0, y: 4 }] }],
    ['coordenada fora de 0–1000', { vertices: [...VERTICES_61.slice(0, 3), { id: 'D', x: 0, y: 1001 }] }],
    ['coordenada com 3 casas', { vertices: [...VERTICES_61.slice(0, 3), { id: 'D', x: 0, y: 4.123 }] }],
    ['depósito inexistente', { depot: 9 }],
    ['0 formigas', { ants: 0 }],
    ['formigas não inteiras', { ants: 2.5 }],
    ['201 iterações', { iterations: 201 }],
    ['α = 6', { alpha: 6 }],
    ['β negativo', { beta: -1 }],
    ['ρ = 95%', { rho: 0.95 }],
    ['τ₀ = 0', { tau0: 0 }],
    ['Q acima de 10.000', { Q: 10001 }],
    ['campo vazio (NaN)', { alpha: Number.NaN }],
    ['campo ausente', { Q: undefined }],
    ['semente não inteira', { seed: 1.5 }],
  ];
  for (const [nome, alteracao] of invalidas) {
    let mensagem = null;
    try {
      ACO.createEngine({ ...CFG_64, ...alteracao });
    } catch (erro) {
      mensagem = erro.message;
    }
    exigir(mensagem !== null, `"${nome}" deveria ser rejeitada`);
    console.log(`   ${nome}: ${mensagem}`);
  }
});

console.log(`\n${aprovados} de ${aprovados + reprovados} casos aprovados.`);
if (reprovados > 0) process.exitCode = 1;
