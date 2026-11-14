# Colônia de Formigas — divisão de trabalho (Núcleo × Interface)

A ideia é separar o projeto em duas camadas que só se falam pelo **contrato** da seção 2. Quem faz o núcleo não toca em HTML; quem faz a interface não calcula nada de formiga.

## 1. Quem faz o quê

| | **Pessoa 1 — Núcleo** | **Pessoa 2 — Interface** |
|---|---|---|
| Arquivos | `aco.js`, `test.js` | `index.html`, `style.css`, `app.js` |
| Algoritmo | Ant System completo: distâncias, pesos `w = τ^α·(1/d)^β`, probabilidades, sorteio por roleta, construção das rotas, evaporação + depósito (soma de todas as formigas, matriz simétrica, piso 1e-12, diagonal sem feromônio), melhor da iteração e acumulada, PRNG com semente | — |
| Dados para transparência | Registrar, por formiga, cada passo (vértice atual, candidatos, probabilidades, escolhido, retorno), comprimento da rota e, por aresta, "anterior → após evaporação → depósito → final" | Mostrar esses registros em painéis expansíveis |
| Campos e validação | Lançar erro claro se receber configuração inválida (defesa) | Todos os campos da seção 3: vértices (4 a 12, x/y entre 0 e 1000, até 2 casas, sem ids repetidos nem coordenadas repetidas), depósito, formigas 1–100, iterações 1–200, α e β 0–5, ρ 0–90%, τ₀ 0,01–100, Q 0,01–10.000, semente; bloquear vazios e inválidos |
| Controles | `engine.step()` | Executar, Pausar, Avançar uma iteração, Reiniciar (recria o engine com a semente); alteração exige reinício |
| Grafo (obrigatório) | — | Vértices com identificação e depósito destacado; arestas com espessura/cor/rótulo proporcionais ao feromônio; legenda; consulta de distância e feromônio por clique/hover; destaque da melhor rota; aviso quando a escala visual mudar |
| Métricas e histórico | Fornece os números | Iteração atual, menor da iteração, média, melhor acumulada ("ainda não calculada" na iteração 0, nunca zero), tabela ou gráfico |
| Testes (seção 6) | 6.1 a 6.4 e a comparação β=0 × β=2 da 6.5, com as saídas no README | Entradas inválidas da 6.5 (coordenadas duplicadas, ids repetidos, <4 vértices, campos vazios, fora do intervalo) |
| README | Descrição do algoritmo e resultados dos testes | Instruções de uso, parâmetros, bibliotecas, autores, links; publicação no GitHub Pages |

Pelos critérios da atividade, o núcleo cobre a Correção (0,40) e os Testes (0,20); a interface cobre a Representação visual (0,10) e a Interface e entrega (0,15); a Transparência (0,15) é dos dois (um gera os dados, o outro exibe).

## 2. Contrato (não mudar sem avisar o outro)

Tudo roda no navegador e no Node: `aco.js` termina exportando `window.ACO` (navegador) ou `module.exports` (Node), igual ao `ga.js` do outro trabalho.

**Convenções**
- Vértices são identificados por **índice** `0..n-1`, na ordem da tabela. O `id` ("A", "B"…) é só texto para exibição.
- Uma rota é um array de índices que começa e termina no depósito: `[0, 1, 2, 3, 0]`.
- `rho` entra como **fração** (a interface converte 50% → `0.5`).
- Matriz de feromônio `tau[i][j]`: simétrica, diagonal 0.
- Nenhuma função da interface sorteia nada: **todo** sorteio é do núcleo (a velocidade da animação nunca altera o resultado).

**Configuração**
```js
const cfg = {
  vertices: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 3, y: 0 }, { id: 'C', x: 3, y: 4 }, { id: 'D', x: 0, y: 4 }],
  depot: 0,
  ants: 10, iterations: 30,
  alpha: 1, beta: 2,
  rho: 0.5, tau0: 1, Q: 14,
  seed: 42
};
```

**Funções puras (usadas nos testes controlados da seção 6)**
```js
ACO.distanceMatrix(vertices)                      // -> number[n][n]
ACO.routeLength(route, dist)                      // -> number
ACO.isValidRoute(route, n, depot)                 // -> boolean (sem repetição, começa e termina no depósito)
ACO.choiceProbabilities(current, allowed, tau, dist, alpha, beta)
                                                  // -> [{ vertex, tau, dist, weight, prob }]  (allowed = índices ainda não visitados)
ACO.pickIndex(probs, rng)                         // roleta; retorna a posição escolhida em probs
ACO.updatePheromone(tau, routes, lengths, rho, Q) // -> { tau: novaMatriz, edges: [{ i, j, before, afterEvap, deposit, after }] }  (i < j)
ACO.mulberry32(seed)                              // -> rng() em [0,1)
```

**Engine**
```js
const engine = ACO.createEngine(cfg);

engine.iteration     // 0..cfg.iterations
engine.finished      // iteration >= cfg.iterations
engine.tau           // matriz atual (inicia com tau0 fora da diagonal)
engine.dist          // matriz de distâncias
engine.history       // um registro por iteração CONCLUÍDA (30 após 30 iterações)
engine.bestSoFar     // { route, length, iteration } ou null enquanto iteration === 0
engine.last          // registro da última iteração (null na iteração 0)
engine.step()        // executa UMA iteração completa e devolve o registro; se finished, devolve null
```

**Registro de uma iteração**
```js
{
  iteration: 1,
  bestRoute: [0,1,2,3,0], bestLength: 14,   // melhor da iteração (empate: primeira formiga)
  meanLength: 15.2,                         // média das formigas
  bestSoFarLength: 14,                      // melhor acumulada até aqui
  ants: [{
    index: 0, route: [0,1,2,3,0], length: 14,
    steps: [{ current: 0, candidates: [{ vertex, tau, dist, weight, prob }, ...], chosen: 1 }, ...],
    returnTo: 0                             // retorno obrigatório ao depósito
  }],
  pheromone: { edges: [{ i, j, before, afterEvap, deposit, after }], min, max }
}
```

## 3. Testes de aceitação do contrato (o núcleo roda, a interface confere)

Instância 6.1: A(0,0), B(3,0), C(3,4), D(0,4), depósito A.

| Chamada | Resultado esperado |
|---|---|
| `routeLength([0,1,2,3,0], dist)` | 14 (e as outras 5 rotas: 16, 18, 16, 18, 14) |
| `choiceProbabilities(0, [1,2,3], tau=1, dist, 1, 2)` | pesos 1/9, 1/25, 1/16; probs ≈ 0,520156 / 0,187256 / 0,292588 |
| `choiceProbabilities(1, [2,3], …)` | ≈ 0,609756 e 0,390244 |
| mesmas, com α=0 ou β=0 | probabilidades iguais entre os candidatos; com um só candidato, prob = 1 |
| `updatePheromone` (τ₀=1, ρ=0,5, Q=14, 1 formiga, rota `[0,1,2,3,0]`) | perímetro 1,5; diagonais 0,5; segunda iteração: 1,75 e 0,25 |
| mesma rota com 2 formigas | perímetro 2,5; diagonais 0,5 |
| ρ = 0 | evaporação não reduz o feromônio |
| `createEngine` com 6.4 (10 formigas, 30 iterações, α=1, β=2, ρ=0,5, τ₀=1, Q=14, semente 42) | 30 registros; `bestSoFarLength` nunca aumenta; comprimentos só 14, 16 ou 18; mesma semente reproduz o histórico |

Tolerância para decimais: 0,000001.

## 4. Ordem de trabalho sugerida

1. **Juntos (15 min):** ler este contrato e corrigir o que não agradar. Depois de combinado, ele só muda com aviso.
2. **Pessoa 1, primeira entrega (rápida):** um `aco.js` "de mentira" com as mesmas assinaturas, devolvendo dados fixos ou aleatórios plausíveis. Assim a interface pode começar a desenhar o grafo desde o primeiro dia.
3. **Em paralelo:** cada um só edita os próprios arquivos (sem conflito no Git). Núcleo: algoritmo + `test.js`. Interface: campos, grafo, controles, logs.
4. **Integração:** troca o `aco.js` de mentira pelo real, roda `node test.js` e o teste manual da interface (iteração 0, Avançar, Executar/Pausar/Retomar, entradas inválidas).
5. **Fechamento:** o README (cada um escreve a sua parte), o link do repositório visível na página e a publicação no GitHub Pages.
