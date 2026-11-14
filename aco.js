/*
 * Núcleo do simulador de colônia de formigas (Ant System).
 *
 * Este arquivo não toca no DOM. Ele roda no navegador (expõe window.ACO)
 * e no Node (module.exports), conforme o contrato em DIVISAO-ACO.md.
 *
 * Convenções:
 *  - vértices são identificados pelo índice 0..n-1 (o id é só texto);
 *  - uma rota começa e termina no depósito: [0, 1, 2, 3, 0];
 *  - rho é uma fração (50% -> 0.5);
 *  - tau[i][j] é simétrica e a diagonal é sempre 0;
 *  - todo sorteio usa o gerador com semente criado pelo engine.
 */
(function (root) {
  'use strict';

  const PISO_FEROMONIO = 1e-12;

  const LIMITES = Object.freeze({
    vertices: [4, 12],
    coordenada: [0, 1000],
    ants: [1, 100],
    iterations: [1, 200],
    alpha: [0, 5],
    beta: [0, 5],
    rho: [0, 0.9],
    tau0: [0.01, 100],
    Q: [0.01, 10000],
  });

  // ---------------------------------------------------------------------------
  // Gerador pseudoaleatório com semente
  // ---------------------------------------------------------------------------

  /** Mulberry32: devolve uma função rng() que gera números em [0, 1). */
  function mulberry32(seed) {
    if (!Number.isFinite(seed)) {
      throw new TypeError('A semente deve ser um número inteiro.');
    }
    let a = seed >>> 0;
    return function rng() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------------------
  // Funções puras
  // ---------------------------------------------------------------------------

  /** Matriz de distâncias euclidianas n×n (diagonal 0). */
  function distanceMatrix(vertices) {
    if (!Array.isArray(vertices) || vertices.length === 0) {
      throw new TypeError('A lista de vértices deve ser um array não vazio.');
    }
    const n = vertices.length;
    const dist = [];
    for (let i = 0; i < n; i += 1) {
      dist.push(new Array(n).fill(0));
    }
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const dx = vertices[i].x - vertices[j].x;
        const dy = vertices[i].y - vertices[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        dist[i][j] = d;
        dist[j][i] = d;
      }
    }
    return dist;
  }

  /** Soma das distâncias de todas as arestas da rota, incluindo o retorno. */
  function routeLength(route, dist) {
    let total = 0;
    for (let k = 0; k < route.length - 1; k += 1) {
      total += dist[route[k]][route[k + 1]];
    }
    return total;
  }

  /**
   * Rota válida: começa e termina no depósito e visita cada um dos outros
   * n-1 vértices exatamente uma vez.
   */
  function isValidRoute(route, n, depot) {
    if (!Array.isArray(route) || route.length !== n + 1) return false;
    if (route[0] !== depot || route[n] !== depot) return false;
    const vistos = new Set([depot]);
    for (let k = 1; k < n; k += 1) {
      const v = route[k];
      if (!Number.isInteger(v) || v < 0 || v >= n || vistos.has(v)) return false;
      vistos.add(v);
    }
    return vistos.size === n;
  }

  /**
   * Pesos w = tau^alpha · (1/d)^beta e probabilidades p = w / Σw, considerando
   * somente os vértices em `allowed` (ainda não visitados).
   */
  function choiceProbabilities(current, allowed, tau, dist, alpha, beta) {
    if (!Array.isArray(allowed) || allowed.length === 0) {
      throw new RangeError('Não há candidatos para escolher.');
    }
    const candidatos = allowed.map((vertex) => {
      const t = tau[current][vertex];
      const d = dist[current][vertex];
      if (!(d > 0)) {
        throw new RangeError(`Distância nula entre os vértices ${current} e ${vertex}.`);
      }
      const weight = Math.pow(t, alpha) * Math.pow(1 / d, beta);
      return { vertex, tau: t, dist: d, weight, prob: 0 };
    });

    const soma = candidatos.reduce((acc, c) => acc + c.weight, 0);
    if (soma > 0 && Number.isFinite(soma)) {
      for (const c of candidatos) c.prob = c.weight / soma;
    } else {
      // Proteção numérica: se todos os pesos ficarem nulos ou infinitos,
      // o sorteio passa a ser uniforme entre os candidatos.
      for (const c of candidatos) c.prob = 1 / candidatos.length;
    }
    return candidatos;
  }

  /**
   * Roleta: sorteia uma posição de `probs` com chance proporcional a prob.
   * Aceita um array de números ou de objetos { prob }.
   */
  function pickIndex(probs, rng) {
    if (!Array.isArray(probs) || probs.length === 0) {
      throw new RangeError('A lista de probabilidades está vazia.');
    }
    const valores = probs.map((p) => (typeof p === 'number' ? p : p.prob));
    const total = valores.reduce((acc, p) => acc + p, 0);
    const r = rng() * total;
    let acumulado = 0;
    let ultimoPositivo = -1;
    for (let k = 0; k < valores.length; k += 1) {
      if (valores[k] > 0) ultimoPositivo = k;
      acumulado += valores[k];
      if (r < acumulado) return k;
    }
    // Erros de arredondamento podem deixar r no limite superior.
    return ultimoPositivo >= 0 ? ultimoPositivo : valores.length - 1;
  }

  /**
   * Evaporação seguida do depósito de todas as formigas:
   *   tau_novo = (1 − rho)·tau_antigo + Σ Q/L_k   (para cada aresta usada por k)
   * A matriz devolvida é nova (a original não é alterada), simétrica, com
   * diagonal 0 e piso de 1e-12 fora da diagonal.
   */
  function updatePheromone(tau, routes, lengths, rho, Q) {
    const n = tau.length;
    if (routes.length !== lengths.length) {
      throw new RangeError('Cada rota precisa de um comprimento correspondente.');
    }

    const deposito = [];
    for (let i = 0; i < n; i += 1) deposito.push(new Array(n).fill(0));

    routes.forEach((route, k) => {
      const L = lengths[k];
      if (!(L > 0) || !Number.isFinite(L)) {
        throw new RangeError(`Comprimento inválido para a formiga ${k}.`);
      }
      const contribuicao = Q / L;
      const usadas = new Set();
      for (let s = 0; s < route.length - 1; s += 1) {
        const i = Math.min(route[s], route[s + 1]);
        const j = Math.max(route[s], route[s + 1]);
        if (i === j) continue;
        const chave = i * n + j;
        if (usadas.has(chave)) continue; // a mesma formiga não conta duas vezes
        usadas.add(chave);
        deposito[i][j] += contribuicao;
      }
    });

    const novo = [];
    for (let i = 0; i < n; i += 1) novo.push(new Array(n).fill(0));
    const edges = [];
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const before = tau[i][j];
        const afterEvap = (1 - rho) * before;
        const deposit = deposito[i][j];
        const after = Math.max(afterEvap + deposit, PISO_FEROMONIO);
        novo[i][j] = after;
        novo[j][i] = after;
        edges.push({ i, j, before, afterEvap, deposit, after });
      }
    }
    return { tau: novo, edges };
  }

  // ---------------------------------------------------------------------------
  // Validação da configuração (defesa; a interface valida antes)
  // ---------------------------------------------------------------------------

  function noIntervalo(valor, [min, max]) {
    return typeof valor === 'number' && Number.isFinite(valor) && valor >= min && valor <= max;
  }

  function ateDuasCasas(valor) {
    return Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-7;
  }

  /** Lança um Error com mensagem clara se a configuração for inválida. */
  function validateConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') {
      throw new TypeError('Configuração ausente.');
    }
    const { vertices } = cfg;
    if (!Array.isArray(vertices)) {
      throw new TypeError('Os vértices devem ser informados em uma lista.');
    }
    const [minV, maxV] = LIMITES.vertices;
    if (vertices.length < minV || vertices.length > maxV) {
      throw new RangeError(`São necessários entre ${minV} e ${maxV} vértices (recebidos ${vertices.length}).`);
    }

    const ids = new Set();
    const coordenadas = new Set();
    vertices.forEach((v, k) => {
      const rotulo = `Vértice ${k + 1}`;
      if (!v || typeof v.id !== 'string' || v.id.trim() === '') {
        throw new TypeError(`${rotulo}: o identificador não pode ficar vazio.`);
      }
      const id = v.id.trim();
      if (ids.has(id)) {
        throw new RangeError(`Identificador repetido: "${id}".`);
      }
      ids.add(id);
      for (const eixo of ['x', 'y']) {
        const valor = v[eixo];
        if (!noIntervalo(valor, LIMITES.coordenada)) {
          throw new RangeError(`Vértice "${id}": ${eixo} deve ser um número entre 0 e 1000.`);
        }
        if (!ateDuasCasas(valor)) {
          throw new RangeError(`Vértice "${id}": ${eixo} deve ter no máximo duas casas decimais.`);
        }
      }
      const chave = `${v.x}|${v.y}`;
      if (coordenadas.has(chave)) {
        throw new RangeError(`Coordenadas repetidas (${v.x}, ${v.y}): dois vértices no mesmo ponto teriam distância zero.`);
      }
      coordenadas.add(chave);
    });

    if (!Number.isInteger(cfg.depot) || cfg.depot < 0 || cfg.depot >= vertices.length) {
      throw new RangeError('O depósito deve ser um dos vértices cadastrados.');
    }

    const inteiros = [
      ['ants', 'Número de formigas'],
      ['iterations', 'Número de iterações'],
    ];
    for (const [campo, nome] of inteiros) {
      const [min, max] = LIMITES[campo];
      if (!Number.isInteger(cfg[campo]) || cfg[campo] < min || cfg[campo] > max) {
        throw new RangeError(`${nome} deve ser um inteiro entre ${min} e ${max}.`);
      }
    }

    const reais = [
      ['alpha', 'Influência do feromônio (α)', '0 e 5'],
      ['beta', 'Influência da distância (β)', '0 e 5'],
      ['rho', 'Taxa de evaporação (ρ)', '0 e 0,9 (0% a 90%)'],
      ['tau0', 'Feromônio inicial (τ₀)', '0,01 e 100'],
      ['Q', 'Constante de depósito (Q)', '0,01 e 10.000'],
    ];
    for (const [campo, nome, faixa] of reais) {
      if (!noIntervalo(cfg[campo], LIMITES[campo])) {
        throw new RangeError(`${nome} deve ser um número entre ${faixa}.`);
      }
    }

    if (!Number.isSafeInteger(cfg.seed)) {
      throw new RangeError('A semente aleatória deve ser um número inteiro.');
    }
  }

  // ---------------------------------------------------------------------------
  // Engine
  // ---------------------------------------------------------------------------

  function matrizInicial(n, tau0) {
    const tau = [];
    for (let i = 0; i < n; i += 1) {
      const linha = new Array(n).fill(tau0);
      linha[i] = 0;
      tau.push(linha);
    }
    return tau;
  }

  /** Constrói a rota de uma formiga usando a matriz `tau` congelada da iteração. */
  function construirRota(index, n, depot, tau, dist, alpha, beta, rng) {
    const route = [depot];
    const visitado = new Array(n).fill(false);
    visitado[depot] = true;
    const steps = [];
    let atual = depot;

    for (let passo = 1; passo < n; passo += 1) {
      const allowed = [];
      for (let v = 0; v < n; v += 1) if (!visitado[v]) allowed.push(v);
      const candidates = choiceProbabilities(atual, allowed, tau, dist, alpha, beta);
      const escolhido = candidates[pickIndex(candidates, rng)].vertex;
      steps.push({ current: atual, candidates, chosen: escolhido });
      visitado[escolhido] = true;
      route.push(escolhido);
      atual = escolhido;
    }

    route.push(depot); // retorno obrigatório ao depósito
    return { index, route, length: routeLength(route, dist), steps, returnTo: depot };
  }

  /** Cria um engine que executa o Ant System uma iteração por vez. */
  function createEngine(cfg) {
    validateConfig(cfg);

    const config = Object.freeze({
      ...cfg,
      vertices: Object.freeze(cfg.vertices.map((v) => Object.freeze({ id: v.id.trim(), x: v.x, y: v.y }))),
    });
    const n = config.vertices.length;
    const rng = mulberry32(config.seed);

    const engine = {
      config,
      iteration: 0,
      finished: false,
      dist: distanceMatrix(config.vertices),
      tau: matrizInicial(n, config.tau0),
      history: [],
      bestSoFar: null,
      last: null,

      step() {
        if (engine.finished) return null;

        // Todas as formigas usam a mesma matriz (a do fim da iteração anterior).
        const tauIteracao = engine.tau;
        const ants = [];
        for (let k = 0; k < config.ants; k += 1) {
          ants.push(construirRota(k, n, config.depot, tauIteracao, engine.dist, config.alpha, config.beta, rng));
        }

        // Só depois de todas completarem: evaporação + depósito.
        const atualizacao = updatePheromone(
          tauIteracao,
          ants.map((a) => a.route),
          ants.map((a) => a.length),
          config.rho,
          config.Q,
        );

        let melhor = ants[0];
        let soma = 0;
        for (const a of ants) {
          soma += a.length;
          if (a.length < melhor.length) melhor = a; // empate: fica a primeira
        }

        const iteration = engine.iteration + 1;
        if (engine.bestSoFar === null || melhor.length < engine.bestSoFar.length) {
          engine.bestSoFar = { route: melhor.route.slice(), length: melhor.length, iteration };
        }

        const valores = atualizacao.edges.map((e) => e.after);
        const registro = {
          iteration,
          bestRoute: melhor.route.slice(),
          bestLength: melhor.length,
          meanLength: soma / ants.length,
          bestSoFarLength: engine.bestSoFar.length,
          ants,
          pheromone: {
            edges: atualizacao.edges,
            min: Math.min(...valores),
            max: Math.max(...valores),
          },
        };

        engine.tau = atualizacao.tau;
        engine.iteration = iteration;
        engine.finished = iteration >= config.iterations;
        engine.history.push(registro);
        engine.last = registro;
        return registro;
      },
    };

    return engine;
  }

  const ACO = Object.freeze({
    PISO_FEROMONIO,
    LIMITES,
    mulberry32,
    distanceMatrix,
    routeLength,
    isValidRoute,
    choiceProbabilities,
    pickIndex,
    updatePheromone,
    validateConfig,
    createEngine,
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ACO;
  } else {
    root.ACO = ACO;
  }
})(typeof window !== 'undefined' ? window : globalThis);
