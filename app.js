/*
 * Interface do simulador de colônia de formigas.
 *
 * Esta camada só lê campos, chama window.ACO e desenha resultados.
 * Nenhum sorteio nem cálculo do algoritmo acontece aqui (ver DIVISAO-ACO.md).
 */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const ACO = window.ACO;
  const $ = (id) => document.getElementById(id);

  // ---------------------------------------------------------------------------
  // Exemplos
  // ---------------------------------------------------------------------------

  const PRESETS = {
    ref: {
      vertices: [
        { id: 'A', x: '0', y: '0' },
        { id: 'B', x: '3', y: '0' },
        { id: 'C', x: '3', y: '4' },
        { id: 'D', x: '0', y: '4' },
      ],
      depot: 0,
      params: { ants: '10', iterations: '30', alpha: '1', beta: '2', rho: '50', tau0: '1', Q: '14', seed: '42' },
    },
    oito: {
      vertices: [
        { id: 'A', x: '50', y: '50' },
        { id: 'B', x: '300', y: '80' },
        { id: 'C', x: '520', y: '150' },
        { id: 'D', x: '650', y: '400' },
        { id: 'E', x: '480', y: '600' },
        { id: 'F', x: '250', y: '520' },
        { id: 'G', x: '80', y: '420' },
        { id: 'H', x: '300', y: '300' },
      ],
      depot: 0,
      params: { ants: '20', iterations: '50', alpha: '1', beta: '3', rho: '50', tau0: '1', Q: '2000', seed: '42' },
    },
  };

  const PARAM_KEYS = ['ants', 'iterations', 'alpha', 'beta', 'rho', 'tau0', 'Q', 'seed'];

  // ---------------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------------

  const form = { rows: [], depot: 0 };
  const state = {
    engine: null,
    dirty: false,
    running: false,
    timer: null,
    view: 0,
    selected: null, // { tipo: 'aresta', i, j } | { tipo: 'vertice', i }
    hover: null,
    lastScale: null,
  };

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------

  function el(nome, attrs, texto) {
    const e = document.createElementNS(NS, nome);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  function html(nome, attrs, texto) {
    const e = document.createElement(nome);
    for (const k in attrs || {}) {
      if (k === 'class') e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  function fmt(x) {
    if (typeof x !== 'number' || !Number.isFinite(x)) return '–';
    if (x === 0) return '0';
    const a = Math.abs(x);
    if (a < 0.001 || a >= 1e7) return x.toExponential(3).replace('.', ',');
    return x.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
  }

  function nome(i) {
    return state.engine.config.vertices[i].id;
  }

  function rotaTexto(route) {
    return route.map(nome).join(' → ');
  }

  function limpar(no) {
    while (no.firstChild) no.removeChild(no.firstChild);
  }

  // ---------------------------------------------------------------------------
  // Tabela de vértices (campos)
  // ---------------------------------------------------------------------------

  function proximoId() {
    const usados = new Set(form.rows.map((r) => r.id.trim()));
    for (let c = 65; c <= 90; c += 1) {
      const id = String.fromCharCode(c);
      if (!usados.has(id)) return id;
    }
    return `V${form.rows.length + 1}`;
  }

  function desenharLinhas() {
    const corpo = document.querySelector('#tab-vertices tbody');
    limpar(corpo);
    form.rows.forEach((r, i) => {
      const tr = html('tr');

      const tdDep = html('td');
      const radio = html('input', { type: 'radio', name: 'deposito', 'aria-label': `Depósito: vértice ${i + 1}` });
      radio.checked = form.depot === i;
      radio.addEventListener('change', () => {
        form.depot = i;
        aoEditar();
      });
      tdDep.appendChild(radio);
      tr.appendChild(tdDep);

      for (const campo of ['id', 'x', 'y']) {
        const td = html('td');
        const inp = html('input', {
          type: 'text',
          'data-key': `v${i}.${campo}`,
          'aria-label': `Vértice ${i + 1}: ${campo}`,
          autocomplete: 'off',
          inputmode: campo === 'id' ? 'text' : 'decimal',
        });
        inp.value = r[campo];
        inp.addEventListener('input', () => {
          r[campo] = inp.value;
          aoEditar();
        });
        td.appendChild(inp);
        tr.appendChild(td);
      }

      const tdRem = html('td');
      const rem = html('button', { type: 'button', class: 'btn-rem', 'aria-label': `Remover vértice ${i + 1}`, title: 'Remover vértice' }, '✕');
      rem.disabled = form.rows.length <= 4;
      rem.addEventListener('click', () => {
        form.rows.splice(i, 1);
        if (form.depot === i) form.depot = 0;
        else if (form.depot > i) form.depot -= 1;
        desenharLinhas();
        aoEditar();
      });
      tdRem.appendChild(rem);
      tr.appendChild(tdRem);
      corpo.appendChild(tr);
    });
    $('btn-add').disabled = form.rows.length >= 12;
  }

  function carregarFormulario(p) {
    form.rows = p.vertices.map((v) => ({ id: v.id, x: v.x, y: v.y }));
    form.depot = p.depot;
    for (const k of PARAM_KEYS) $(`p-${k}`).value = p.params[k];
    desenharLinhas();
  }

  // ---------------------------------------------------------------------------
  // Leitura e validação dos campos
  // ---------------------------------------------------------------------------

  const RE_NUM = /^-?\d+(\.\d+)?$/;
  const RE_INT = /^-?\d+$/;

  function lerFormulario() {
    const erros = [];
    const erro = (chave, msg) => erros.push({ chave, msg });

    const n = form.rows.length;
    if (n < 4 || n > 12) erro('vertices', `São necessários entre 4 e 12 vértices (há ${n}).`);

    const ids = new Set();
    const coords = new Map();
    const vertices = [];

    form.rows.forEach((r, i) => {
      const id = r.id.trim();
      const rotulo = id || `Vértice ${i + 1}`;
      if (id === '') erro(`v${i}.id`, `Vértice ${i + 1}: o identificador não pode ficar vazio.`);
      else if (ids.has(id)) erro(`v${i}.id`, `Identificador repetido: "${id}".`);
      else ids.add(id);

      const val = {};
      for (const eixo of ['x', 'y']) {
        const chave = `v${i}.${eixo}`;
        const bruto = r[eixo].trim();
        if (bruto === '') {
          erro(chave, `Vértice "${rotulo}": ${eixo} está vazio.`);
          continue;
        }
        const s = bruto.replace(',', '.');
        if (!RE_NUM.test(s)) {
          erro(chave, `Vértice "${rotulo}": ${eixo} deve ser um número.`);
          continue;
        }
        const casas = (s.split('.')[1] || '').length;
        const v = Number(s);
        if (v < 0 || v > 1000) {
          erro(chave, `Vértice "${rotulo}": ${eixo} deve estar entre 0 e 1000.`);
        } else if (casas > 2) {
          erro(chave, `Vértice "${rotulo}": ${eixo} deve ter no máximo duas casas decimais.`);
        } else {
          val[eixo] = v;
        }
      }

      if ('x' in val && 'y' in val) {
        const k = `${val.x}|${val.y}`;
        if (coords.has(k)) {
          erro(`v${i}.x`, `Coordenadas repetidas (${val.x}, ${val.y}) nos vértices "${coords.get(k)}" e "${rotulo}".`);
          erro(`v${i}.y`, '');
        } else {
          coords.set(k, rotulo);
        }
        vertices.push({ id, x: val.x, y: val.y });
      }
    });

    if (!(form.depot >= 0 && form.depot < n)) erro('vertices', 'Escolha um vértice como depósito.');

    const cfg = { vertices, depot: form.depot };

    function numero(chave, rotulo, min, max, faixa, inteiro, avisaMilhar) {
      const bruto = $(`p-${chave}`).value.trim();
      if (bruto === '') {
        erro(chave, `${rotulo}: o campo está vazio.`);
        return NaN;
      }
      if (avisaMilhar && /^[1-9]\d{0,2}\.\d{3}$/.test(bruto)) {
        erro(chave, `${rotulo}: ponto seguido de 3 dígitos é ambíguo. Para milhares, digite sem separador (ex.: 10000); para decimais, use vírgula (ex.: 1,5).`);
        return NaN;
      }
      const s = bruto.replace(',', '.');
      if (!(inteiro ? RE_INT : RE_NUM).test(s)) {
        erro(chave, `${rotulo}: ${inteiro ? 'digite um número inteiro' : 'digite um número'} (${faixa}).`);
        return NaN;
      }
      const v = Number(s);
      if (v < min || v > max) {
        erro(chave, `${rotulo}: o valor deve estar entre ${faixa}.`);
        return NaN;
      }
      return v;
    }

    cfg.ants = numero('ants', 'Formigas', 1, 100, '1 e 100', true);
    cfg.iterations = numero('iterations', 'Iterações', 1, 200, '1 e 200', true);
    cfg.alpha = numero('alpha', 'α', 0, 5, '0 e 5', false);
    cfg.beta = numero('beta', 'β', 0, 5, '0 e 5', false);
    const rhoPct = numero('rho', 'ρ (%)', 0, 90, '0 e 90', false);
    cfg.rho = rhoPct / 100;
    cfg.tau0 = numero('tau0', 'τ₀', 0.01, 100, '0,01 e 100', false);
    cfg.Q = numero('Q', 'Q', 0.01, 10000, '0,01 e 10.000', false, true);

    const sBruto = $('p-seed').value.trim();
    if (sBruto === '') erro('seed', 'Semente: o campo está vazio.');
    else if (!RE_INT.test(sBruto) || !Number.isSafeInteger(Number(sBruto))) erro('seed', 'Semente: digite um número inteiro.');
    else cfg.seed = Number(sBruto);

    if (erros.length === 0) {
      try {
        ACO.validateConfig(cfg);
      } catch (e) {
        erro('vertices', e.message);
      }
    }
    return { cfg, erros, ok: erros.length === 0 };
  }

  function mostrarErros(erros) {
    const chaves = new Set(erros.map((e) => e.chave));
    document.querySelectorAll('[data-key]').forEach((inp) => {
      inp.classList.toggle('invalid', chaves.has(inp.getAttribute('data-key')));
    });
    const caixa = $('erros');
    const msgs = erros.map((e) => e.msg).filter(Boolean);
    limpar(caixa);
    if (msgs.length === 0) {
      caixa.hidden = true;
      return;
    }
    caixa.appendChild(html('strong', {}, 'Corrija antes de continuar:'));
    const ul = html('ul');
    msgs.forEach((m) => ul.appendChild(html('li', {}, m)));
    caixa.appendChild(ul);
    caixa.hidden = false;
  }

  // ---------------------------------------------------------------------------
  // Controles
  // ---------------------------------------------------------------------------

  function atrasoMs() {
    return Number($('sl-speed').value);
  }

  function pausar() {
    state.running = false;
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    atualizarControles();
  }

  function aoEditar() {
    state.dirty = true;
    pausar();
    mostrarErros(lerFormulario().erros);
    atualizarControles();
  }

  function atualizarControles() {
    const eng = state.engine;
    const liberado = !!eng && !state.dirty && !eng.finished;
    $('btn-run').disabled = !(liberado && !state.running);
    $('btn-pause').disabled = !state.running;
    $('btn-step').disabled = !(liberado && !state.running);
    $('aviso-pendente').hidden = !state.dirty;
    $('btn-add').disabled = form.rows.length >= 12;

    const status = $('status');
    if (!eng) status.textContent = '';
    else if (state.dirty) status.textContent = 'Aguardando reinício com os novos campos.';
    else if (eng.finished) {
      status.textContent = `Execução concluída em ${eng.iteration} iterações. Melhor rota: ${rotaTexto(eng.bestSoFar.route)} (comprimento ${fmt(eng.bestSoFar.length)}), encontrada na iteração ${eng.bestSoFar.iteration}.`;
    } else if (state.running) status.textContent = 'Executando…';
    else if (eng.iteration === 0) status.textContent = 'Pronto. Clique em Executar ou Avançar uma iteração.';
    else status.textContent = 'Pausado.';
  }

  function reiniciar() {
    pausar();
    const r = lerFormulario();
    mostrarErros(r.erros);
    if (!r.ok) {
      state.dirty = true;
      atualizarControles();
      return;
    }
    try {
      state.engine = ACO.createEngine(r.cfg);
    } catch (e) {
      mostrarErros([{ chave: 'vertices', msg: e.message }]);
      return;
    }
    state.dirty = false;
    state.view = 0;
    state.selected = null;
    state.hover = null;
    state.lastScale = null;
    renderizarTudo();
  }

  function avancar() {
    const eng = state.engine;
    if (!eng || state.dirty || eng.finished) return;
    eng.step();
    state.view = eng.iteration;
    renderizarTudo();
  }

  function executar() {
    if (state.running || !state.engine || state.dirty || state.engine.finished) return;
    state.running = true;
    atualizarControles();
    (function laco() {
      if (!state.running) return;
      avancar();
      if (state.engine.finished) {
        state.running = false;
        atualizarControles();
        return;
      }
      state.timer = setTimeout(laco, atrasoMs());
    })();
  }

  // ---------------------------------------------------------------------------
  // Dados da iteração exibida
  // ---------------------------------------------------------------------------

  function registroExibido() {
    return state.view > 0 ? state.engine.history[state.view - 1] : null;
  }

  /** Feromônio de cada aresta (i<j) na iteração exibida. */
  function feromonioExibido() {
    const eng = state.engine;
    const n = eng.config.vertices.length;
    const tau = new Map();
    const rec = registroExibido();
    if (!rec) {
      for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) tau.set(i * n + j, eng.config.tau0);
    } else {
      for (const e of rec.pheromone.edges) tau.set(e.i * n + e.j, e.after);
    }
    let min = Infinity;
    let max = -Infinity;
    for (const v of tau.values()) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return { tau, min, max, n };
  }

  /** Melhor rota acumulada até a iteração exibida (troca só se estritamente menor). */
  function melhorAte(v) {
    let melhor = null;
    for (let k = 0; k < v; k += 1) {
      const r = state.engine.history[k];
      if (melhor === null || r.bestLength < melhor.length) {
        melhor = { route: r.bestRoute, length: r.bestLength, iteration: r.iteration };
      }
    }
    return melhor;
  }

  // ---------------------------------------------------------------------------
  // Métricas
  // ---------------------------------------------------------------------------

  function desenharMetricas() {
    const eng = state.engine;
    const total = eng.config.iterations;
    const rec = registroExibido();
    $('m-iter').textContent = `${state.view} / ${total}`;
    const nd = 'ainda não calculada';
    if (!rec) {
      $('m-best').textContent = nd;
      $('m-mean').textContent = nd;
      $('m-acc').textContent = nd;
      $('m-route').textContent = nd;
    } else {
      const acc = melhorAte(state.view);
      $('m-best').textContent = fmt(rec.bestLength);
      $('m-mean').textContent = fmt(rec.meanLength);
      $('m-acc').textContent = fmt(rec.bestSoFarLength);
      $('m-route').textContent = `${rotaTexto(acc.route)} (comprimento ${fmt(acc.length)}, iteração ${acc.iteration})`;
    }
    const sl = $('sl-view');
    sl.max = String(eng.iteration);
    sl.value = String(state.view);
    $('out-view').textContent = String(state.view);
  }

  // ---------------------------------------------------------------------------
  // Grafo
  // ---------------------------------------------------------------------------

  function desenharGrafo() {
    const eng = state.engine;
    const vs = eng.config.vertices;
    const depot = eng.config.depot;
    const svg = $('grafo');
    limpar(svg);

    const W = 640;
    const H = 640;
    const margem = 60;
    const xs = vs.map((v) => v.x);
    const ys = vs.map((v) => v.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const faixa = Math.max(maxX - minX, maxY - minY) || 1;
    const esc = (W - 2 * margem) / faixa;
    const offX = (W - esc * (maxX - minX)) / 2;
    const offY = (H - esc * (maxY - minY)) / 2;
    const pos = vs.map((v) => ({ x: offX + (v.x - minX) * esc, y: H - offY - (v.y - minY) * esc }));

    const { tau, min, max, n } = feromonioExibido();

    // Aviso de mudança de escala visual
    const aviso = $('aviso-escala');
    const anterior = state.lastScale;
    state.lastScale = { min, max };
    const mudou = anterior && (Math.abs(anterior.max - max) > 1e-9 * Math.max(1, anterior.max) || Math.abs(anterior.min - min) > 1e-9 * Math.max(1, anterior.min));
    if (mudou) {
      aviso.textContent = `A escala visual mudou: espessura e cor agora são relativas a τ entre ${fmt(min)} e ${fmt(max)} (antes: ${fmt(anterior.min)} a ${fmt(anterior.max)}).`;
      aviso.hidden = false;
    } else {
      aviso.hidden = true;
    }
    $('lg-min').textContent = fmt(min);
    $('lg-max').textContent = fmt(max);

    // Arestas
    const gArestas = el('g');
    const gHit = el('g');
    const mostrarRotulos = $('chk-labels').checked;
    const gRotulos = el('g');
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const t = tau.get(i * n + j);
        const prop = max > 0 ? t / max : 0;
        const largura = 0.8 + 5.2 * prop;
        const luz = 78 - 48 * prop;
        gArestas.appendChild(el('line', {
          x1: pos[i].x, y1: pos[i].y, x2: pos[j].x, y2: pos[j].y,
          stroke: `hsl(212, 62%, ${luz}%)`, 'stroke-width': largura, 'stroke-linecap': 'round',
        }));
        if (mostrarRotulos) {
          gRotulos.appendChild(el('text', {
            x: (pos[i].x + pos[j].x) / 2, y: (pos[i].y + pos[j].y) / 2, 'text-anchor': 'middle', class: 'edge-label',
          }, fmt(t)));
        }
        const hit = el('line', { x1: pos[i].x, y1: pos[i].y, x2: pos[j].x, y2: pos[j].y, class: 'edge-hit' });
        hit.addEventListener('mouseenter', () => { state.hover = { tipo: 'aresta', i, j }; desenharInfo(); });
        hit.addEventListener('mouseleave', () => { state.hover = null; desenharInfo(); });
        hit.addEventListener('click', () => { state.selected = { tipo: 'aresta', i, j }; desenharInfo(); desenharSelecao(); });
        gHit.appendChild(hit);
      }
    }
    svg.appendChild(gArestas);

    // Melhor rota acumulada
    const melhor = melhorAte(state.view);
    if (melhor) {
      const gRota = el('g');
      for (let k = 0; k < melhor.route.length - 1; k += 1) {
        const a = pos[melhor.route[k]];
        const b = pos[melhor.route[k + 1]];
        gRota.appendChild(el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#e8590c', 'stroke-width': 3, 'stroke-linecap': 'round' }));
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const cx = a.x + (b.x - a.x) * 0.58;
        const cy = a.y + (b.y - a.y) * 0.58;
        const p = (d, off) => `${cx + Math.cos(ang) * d - Math.sin(ang) * off},${cy + Math.sin(ang) * d + Math.cos(ang) * off}`;
        gRota.appendChild(el('polygon', { points: `${p(9, 0)} ${p(-6, 6)} ${p(-6, -6)}`, fill: '#e8590c' }));
      }
      svg.appendChild(gRota);
    }

    svg.appendChild(gRotulos);

    const gSel = el('g', { id: 'g-sel' });
    svg.appendChild(gSel);

    // Vértices
    const gV = el('g');
    vs.forEach((v, i) => {
      const dep = i === depot;
      const c = el('circle', {
        cx: pos[i].x, cy: pos[i].y, r: 17, class: 'v-circ',
        fill: dep ? '#1f2933' : '#ffffff', stroke: dep ? '#e8590c' : '#1f2933', 'stroke-width': dep ? 4 : 2,
      });
      c.addEventListener('mouseenter', () => { state.hover = { tipo: 'vertice', i }; desenharInfo(); });
      c.addEventListener('mouseleave', () => { state.hover = null; desenharInfo(); });
      c.addEventListener('click', () => { state.selected = { tipo: 'vertice', i }; desenharInfo(); desenharSelecao(); });
      gV.appendChild(c);
      gV.appendChild(el('text', { x: pos[i].x, y: pos[i].y, class: 'v-label', fill: dep ? '#ffffff' : '#1f2933' }, v.id.length > 4 ? `${v.id.slice(0, 3)}…` : v.id));
    });
    svg.appendChild(gHit); // áreas de clique das arestas ficam ABAIXO dos vértices
    svg.appendChild(gV);

    state.pos = pos;
    desenharSelecao();
  }

  function desenharSelecao() {
    const g = $('g-sel');
    if (!g || !state.pos) return;
    limpar(g);
    const s = state.selected;
    if (s && s.tipo === 'aresta') {
      const a = state.pos[s.i];
      const b = state.pos[s.j];
      g.appendChild(el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'edge-sel' }));
    } else if (s && s.tipo === 'vertice') {
      const a = state.pos[s.i];
      g.appendChild(el('circle', { cx: a.x, cy: a.y, r: 23, fill: 'none', stroke: '#111', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }));
    }
  }

  function desenharInfo() {
    const eng = state.engine;
    const caixa = $('info');
    limpar(caixa);
    const alvo = state.hover || state.selected;
    if (!alvo) {
      caixa.textContent = 'Passe o mouse ou clique em uma aresta ou vértice para ver distância e feromônio.';
      return;
    }
    const n = eng.config.vertices.length;
    const dl = html('dl');
    const linha = (k, v) => { dl.appendChild(html('dt', {}, k)); dl.appendChild(html('dd', {}, v)); };
    if (alvo.tipo === 'aresta') {
      const { i, j } = alvo;
      caixa.appendChild(html('strong', {}, `Aresta ${nome(i)} – ${nome(j)}`));
      linha('Distância', fmt(eng.dist[i][j]));
      const rec = registroExibido();
      if (!rec) {
        linha('Feromônio τ', `${fmt(eng.config.tau0)} (inicial, iteração 0)`);
      } else {
        const e = rec.pheromone.edges.find((x) => x.i === i && x.j === j);
        linha('Feromônio τ', `${fmt(e.after)} (fim da iteração ${rec.iteration})`);
        linha('Antes', fmt(e.before));
        linha('Após evaporação', fmt(e.afterEvap));
        linha('Depósito', fmt(e.deposit));
      }
    } else {
      const v = eng.config.vertices[alvo.i];
      caixa.appendChild(html('strong', {}, `Vértice ${v.id}${alvo.i === eng.config.depot ? ' (depósito)' : ''}`));
      linha('Posição', `(${fmt(v.x)}, ${fmt(v.y)})`);
      if (n > 1) {
        let perto = -1;
        for (let k = 0; k < n; k += 1) if (k !== alvo.i && (perto < 0 || eng.dist[alvo.i][k] < eng.dist[alvo.i][perto])) perto = k;
        linha('Mais próximo', `${nome(perto)} (distância ${fmt(eng.dist[alvo.i][perto])})`);
      }
    }
    caixa.appendChild(dl);
  }

  // ---------------------------------------------------------------------------
  // Histórico: gráfico e tabela
  // ---------------------------------------------------------------------------

  function desenharGrafico() {
    const eng = state.engine;
    const svg = $('grafico');
    limpar(svg);
    const W = 640;
    const H = 280;
    const m = { l: 56, r: 16, t: 44, b: 38 };
    const hist = eng.history;
    const total = eng.config.iterations;

    svg.appendChild(el('text', { x: m.l, y: 16, 'font-size': 12, fill: '#5b6775' }, 'Comprimento da rota por iteração'));

    if (hist.length === 0) {
      svg.appendChild(el('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', fill: '#5b6775', 'font-size': 13 }, 'O gráfico aparece depois da primeira iteração.'));
      return;
    }

    const series = [
      { nome: 'Menor da iteração', cor: '#2f9e44', valores: hist.map((r) => r.bestLength) },
      { nome: 'Média', cor: '#868e96', valores: hist.map((r) => r.meanLength) },
      { nome: 'Melhor acumulada', cor: '#e8590c', valores: hist.map((r) => r.bestSoFarLength) },
    ];
    let lo = Infinity;
    let hi = -Infinity;
    series.forEach((s) => s.valores.forEach((v) => { lo = Math.min(lo, v); hi = Math.max(hi, v); }));
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.08;
    lo -= pad; hi += pad;

    const X = (it) => m.l + (total <= 1 ? 0 : ((it - 1) / (total - 1)) * (W - m.l - m.r));
    const Y = (v) => H - m.b - ((v - lo) / (hi - lo)) * (H - m.t - m.b);

    for (let k = 0; k <= 4; k += 1) {
      const v = lo + ((hi - lo) * k) / 4;
      svg.appendChild(el('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), stroke: '#e3e8ee' }));
      svg.appendChild(el('text', { x: m.l - 6, y: Y(v) + 4, 'text-anchor': 'end', 'font-size': 10, fill: '#5b6775' }, fmt(Math.round(v * 100) / 100)));
    }
    const passo = Math.max(1, Math.ceil(total / 10));
    for (let it = 1; it <= total; it += 1) {
      if (it === 1 || it % passo === 0 || it === total) {
        svg.appendChild(el('text', { x: X(it), y: H - m.b + 14, 'text-anchor': 'middle', 'font-size': 10, fill: '#5b6775' }, String(it)));
      }
    }
    svg.appendChild(el('text', { x: (m.l + W - m.r) / 2, y: H - 6, 'text-anchor': 'middle', 'font-size': 11, fill: '#5b6775' }, 'Iteração'));

    if (state.view > 0) {
      svg.appendChild(el('line', { x1: X(state.view), x2: X(state.view), y1: m.t, y2: H - m.b, stroke: '#1b4f8f', 'stroke-dasharray': '4 3' }));
    }

    series.forEach((s) => {
      const pts = s.valores.map((v, k) => `${X(k + 1)},${Y(v)}`).join(' ');
      svg.appendChild(el('polyline', { points: pts, fill: 'none', stroke: s.cor, 'stroke-width': 2 }));
      if (s.valores.length === 1) svg.appendChild(el('circle', { cx: X(1), cy: Y(s.valores[0]), r: 3, fill: s.cor }));
    });

    let lx = m.l;
    series.forEach((s) => {
      svg.appendChild(el('line', { x1: lx, x2: lx + 18, y1: 29, y2: 29, stroke: s.cor, 'stroke-width': 3 }));
      svg.appendChild(el('text', { x: lx + 22, y: 33, 'font-size': 11, fill: '#243b53' }, s.nome));
      lx += 22 + s.nome.length * 6 + 14;
    });
  }

  function desenharTabela() {
    const eng = state.engine;
    const corpo = document.querySelector('#tab-hist tbody');
    limpar(corpo);
    const nd = 'ainda não calculada';

    const linha = (iter, a, b, c) => {
      const tr = html('tr', { class: 'clicavel' + (state.view === iter ? ' atual' : '') });
      [String(iter), a, b, c].forEach((t) => tr.appendChild(html('td', {}, t)));
      tr.addEventListener('click', () => { state.view = iter; renderizarTudo(); });
      corpo.appendChild(tr);
    };
    linha(0, '—', '—', nd);
    eng.history.forEach((r) => linha(r.iteration, fmt(r.bestLength), fmt(r.meanLength), fmt(r.bestSoFarLength)));
  }

  // ---------------------------------------------------------------------------
  // Transparência: formigas e feromônio
  // ---------------------------------------------------------------------------

  function tabelaFormiga(ant, cfg, dist) {
    const t = html('table', { class: 'tab' });
    const cab = html('thead');
    const trc = html('tr');
    ['Passo', 'Vértice atual', 'Candidato', 'τ', 'd', 'w = τ^α · (1/d)^β', 'p = w / Σw', 'Escolhido'].forEach((h) => trc.appendChild(html('th', {}, h)));
    cab.appendChild(trc);
    t.appendChild(cab);
    const corpo = html('tbody');
    ant.steps.forEach((s, k) => {
      s.candidates.forEach((c, idx) => {
        const escolhido = c.vertex === s.chosen;
        const tr = html('tr', escolhido ? { class: 'escolha-linha' } : {});
        if (idx === 0) {
          const td1 = html('td', { rowspan: String(s.candidates.length) }, String(k + 1));
          const td2 = html('td', { rowspan: String(s.candidates.length) }, nome(s.current));
          tr.appendChild(td1);
          tr.appendChild(td2);
        }
        tr.appendChild(html('td', {}, nome(c.vertex)));
        tr.appendChild(html('td', {}, fmt(c.tau)));
        tr.appendChild(html('td', {}, fmt(c.dist)));
        tr.appendChild(html('td', {}, fmt(c.weight)));
        tr.appendChild(html('td', {}, `${fmt(c.prob * 100)}%`));
        tr.appendChild(html('td', { class: 'escolhido' }, escolhido ? '✓' : ''));
        corpo.appendChild(tr);
      });
    });
    const ultimo = ant.route[ant.route.length - 2];
    const trf = html('tr');
    const tdf = html('td', { colspan: '8' }, `Retorno obrigatório ao depósito: ${nome(ultimo)} → ${nome(ant.returnTo)} (d = ${fmt(dist[ultimo][ant.returnTo])}). Comprimento total da rota: ${fmt(ant.length)}.`);
    tdf.style.textAlign = 'left';
    trf.appendChild(tdf);
    corpo.appendChild(trf);
    t.appendChild(corpo);
    return t;
  }

  function desenharDetalhes() {
    const eng = state.engine;
    const cfg = eng.config;
    const raiz = $('detalhes');
    limpar(raiz);
    const rec = registroExibido();

    if (!rec) {
      raiz.appendChild(html('p', {}, `Iteração 0: ainda não há formigas nem rotas. Todas as arestas começam com τ₀ = ${fmt(cfg.tau0)}. Use Avançar ou Executar para começar.`));
      return;
    }

    const f = html('p', { class: 'formula' });
    f.innerHTML = 'Escolha: <code>w(i,j) = τ(i,j)<sup>α</sup> · (1/d(i,j))<sup>β</sup></code>, <code>p = w / Σw</code> entre os vértices ainda não visitados. ' +
      'Atualização: <code>τ_novo = (1 − ρ) · τ_antigo + Σ Q / L</code>. ' +
      `Parâmetros desta execução: α = ${fmt(cfg.alpha)}, β = ${fmt(cfg.beta)}, ρ = ${fmt(cfg.rho * 100)}%, Q = ${fmt(cfg.Q)}.`;
    raiz.appendChild(f);

    let idxMelhor = 0;
    rec.ants.forEach((a, k) => { if (a.length < rec.ants[idxMelhor].length) idxMelhor = k; });
    raiz.appendChild(html('p', {}, `Iteração ${rec.iteration}: a melhor formiga foi a #${idxMelhor + 1}, com rota ${rotaTexto(rec.bestRoute)} e comprimento ${fmt(rec.bestLength)}. Média das ${rec.ants.length} formigas: ${fmt(rec.meanLength)}.`));

    // Formigas (conteúdo montado só ao abrir)
    const dFormigas = html('details');
    dFormigas.appendChild(html('summary', {}, `Formigas (${rec.ants.length}): rota e escolhas passo a passo`));
    const cont = html('div', { class: 'conteudo' });
    rec.ants.forEach((ant, k) => {
      const d = html('details');
      d.appendChild(html('summary', {}, `Formiga ${k + 1}: ${rotaTexto(ant.route)} — comprimento ${fmt(ant.length)}`));
      const corpo = html('div', { class: 'conteudo' });
      d.appendChild(corpo);
      d.addEventListener('toggle', () => {
        if (d.open && !corpo.firstChild) corpo.appendChild(tabelaFormiga(ant, cfg, eng.dist));
      });
      cont.appendChild(d);
    });
    dFormigas.appendChild(cont);
    raiz.appendChild(dFormigas);

    // Feromônio por aresta
    const dFer = html('details');
    dFer.appendChild(html('summary', {}, 'Feromônio por aresta: antes → após evaporação → depósito → final'));
    const c2 = html('div', { class: 'conteudo' });
    const t = html('table', { class: 'tab' });
    const cab = html('thead');
    const trc = html('tr');
    ['Aresta', 'Distância', 'Antes', 'Após evaporação', 'Depósito (Σ Q/L)', 'Final'].forEach((h) => trc.appendChild(html('th', {}, h)));
    cab.appendChild(trc);
    t.appendChild(cab);
    const corpo = html('tbody');
    rec.pheromone.edges.forEach((e) => {
      const tr = html('tr');
      tr.appendChild(html('td', {}, `${nome(e.i)} – ${nome(e.j)}`));
      [eng.dist[e.i][e.j], e.before, e.afterEvap, e.deposit, e.after].forEach((v) => tr.appendChild(html('td', {}, fmt(v))));
      corpo.appendChild(tr);
    });
    t.appendChild(corpo);
    c2.appendChild(t);
    c2.appendChild(html('p', { class: 'nota' }, `Feromônio mínimo: ${fmt(rec.pheromone.min)}; máximo: ${fmt(rec.pheromone.max)}.`));
    dFer.appendChild(c2);
    raiz.appendChild(dFer);
  }

  // ---------------------------------------------------------------------------
  // Render geral
  // ---------------------------------------------------------------------------

  function renderizarTudo() {
    desenharMetricas();
    desenharGrafo();
    desenharInfo();
    desenharGrafico();
    desenharTabela();
    desenharDetalhes();
    atualizarControles();
  }

  // ---------------------------------------------------------------------------
  // Inicialização
  // ---------------------------------------------------------------------------

  function iniciar() {
    $('btn-run').addEventListener('click', executar);
    $('btn-pause').addEventListener('click', pausar);
    $('btn-step').addEventListener('click', avancar);
    $('btn-reset').addEventListener('click', reiniciar);
    $('btn-add').addEventListener('click', () => {
      if (form.rows.length >= 12) return;
      form.rows.push({ id: proximoId(), x: '', y: '' });
      desenharLinhas();
      aoEditar();
    });
    $('btn-preset-ref').addEventListener('click', () => { carregarFormulario(PRESETS.ref); reiniciar(); });
    $('btn-preset-8').addEventListener('click', () => { carregarFormulario(PRESETS.oito); reiniciar(); });

    PARAM_KEYS.forEach((k) => $(`p-${k}`).addEventListener('input', aoEditar));

    $('sl-speed').addEventListener('input', () => { $('out-speed').textContent = `${atrasoMs()} ms`; });
    $('sl-view').addEventListener('input', () => {
      if (!state.engine) return;
      state.view = Number($('sl-view').value);
      renderizarTudo();
    });
    $('chk-labels').addEventListener('change', () => { if (state.engine) desenharGrafo(); });

    carregarFormulario(PRESETS.oito); // o enunciado pede um cenário inicial de 5 a 12 vértices
    reiniciar();
  }

  iniciar();
})();
