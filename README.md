# Colônia de Formigas — rota de entregas

Simulador do **Ant System** para encontrar uma rota que sai do depósito, visita cada ponto de entrega uma única vez e volta ao depósito, com a menor distância total possível. Roda inteiro no navegador com HTML, CSS e JavaScript puro, sem servidor de aplicação.

- Aplicação (GitHub Pages): https://volc4.github.io/Ativade-Pratica-IA-Formigas/
- Repositório: https://github.com/Volc4/Ativade-Pratica-IA-Formigas

## Autores

- Luidge De Sousa Carvalho
- Samuel Lucas Alves Matos

## Instruções de uso

**Abrir.** Acesse o link do GitHub Pages; não há login nem instalação. Para rodar localmente, basta abrir o `index.html` no navegador: os scripts são carregados de forma clássica, sem módulos, então não é preciso servidor. Os testes do núcleo rodam com `node test.js`.

**Configurar.**
1. A página abre com um cenário de 8 vértices. Os botões **Instância 6.1 (4 vértices)** e **8 vértices** carregam os exemplos prontos.
2. Na tabela de vértices, edite o identificador e as coordenadas x e y. **+ Adicionar vértice** cria uma linha (até 12) e **✕** remove uma (mínimo de 4).
3. Marque na primeira coluna qual vértice é o **depósito**.
4. Preencha os parâmetros. ρ é digitado em porcentagem. Vírgula e ponto são aceitos como separador decimal, mas não use separador de milhar: digite `10000`, não `10.000` (o campo Q recusa esse formato para evitar que vire 10).
5. Campos inválidos ficam destacados em vermelho e a lista de erros aparece abaixo dos parâmetros. Enquanto houver erro, a execução fica bloqueada.

**Executar.**
- **Reiniciar** cria a simulação com os campos atuais: limpa o histórico, volta todas as arestas para τ₀ e restabelece a semente. Qualquer alteração nos campos exige clicar em Reiniciar.
- **Executar** roda as iterações em sequência; **Pausar** interrompe preservando o estado; **Executar** de novo retoma de onde parou.
- **Avançar uma iteração** executa exatamente uma iteração e continua pausado.
- O controle **Intervalo entre iterações** só muda a velocidade da exibição: todos os sorteios ficam no núcleo, então o resultado é o mesmo em qualquer velocidade.

**Acompanhar.**
- Os cartões mostram a iteração atual, o menor comprimento da iteração, a média das formigas e a melhor distância acumulada. Na iteração 0, aparecem como "ainda não calculada".
- No grafo, a espessura e a cor de cada aresta acompanham o feromônio. O valor numérico de τ aparece sobre a aresta, e a melhor rota acumulada fica em laranja, com setas indicando o sentido. Passe o mouse ou clique em uma aresta para ver a distância, o feromônio e a atualização da iteração (antes, após evaporação, depósito). Quando a escala visual muda entre iterações, um aviso informa os novos limites.
- O controle **Iteração exibida** e as linhas da tabela do histórico permitem voltar a qualquer iteração já concluída.
- Em **Detalhes da iteração exibida**, os painéis expansíveis mostram, para cada formiga, cada passo: vértice atual, candidatos com τ, d, w e p, vértice escolhido, retorno ao depósito e comprimento. Mostram também, para cada aresta, o feromônio anterior, após evaporação, o depósito total e o final.

## Parâmetros

| Campo | Intervalo | Observação |
|---|---|---|
| Vértices | 4 a 12; x e y entre 0 e 1000, até 2 casas | ids únicos, sem coordenadas repetidas |
| Depósito | um dos vértices | |
| Formigas | inteiro de 1 a 100 | |
| Iterações | inteiro de 1 a 200 | |
| α (feromônio) | 0 a 5 | com 0, o feromônio não influencia |
| β (distância) | 0 a 5 | com 0, a distância não influencia |
| ρ (evaporação) | 0% a 90% | o núcleo recebe a fração (50% → 0,5) |
| τ₀ (feromônio inicial) | 0,01 a 100 | |
| Q (depósito) | 0,01 a 10.000 | cada formiga deposita Q/L |
| Semente | inteiro | reproduz todos os sorteios |

## Bibliotecas auxiliares

Nenhuma. O núcleo e a interface usam apenas HTML, CSS e JavaScript do próprio navegador.
- O gerador pseudoaleatório com semente (Mulberry32) foi escrito no próprio `aco.js`.
- O grafo e o gráfico do histórico são desenhados em SVG diretamente pelo `app.js`.
- A página não carrega nenhum arquivo externo (CDN).

## Descrição da solução (núcleo)

O arquivo `aco.js` contém todo o algoritmo e não acessa a página. No navegador ele fica disponível como `window.ACO`; no Node, como `require('./aco.js')`.

**Representação.** Os vértices são identificados pelo índice (0 a n−1), na ordem da tabela. Uma rota é a lista de índices visitados, começando e terminando no depósito, por exemplo `[0, 1, 2, 3, 0]`. As distâncias são euclidianas e ficam em uma matriz n×n calculada uma vez no início. O feromônio fica em outra matriz, simétrica, com diagonal 0.

**Construção das rotas.** No início, todas as arestas recebem τ₀. Em cada iteração, cada formiga parte do depósito. Em cada passo, para cada vértice j ainda não visitado, o núcleo calcula o peso

  w(i,j) = τ(i,j)^α × (1/d(i,j))^β

e a probabilidade p(i,j) = w(i,j) / Σ w(i,u), em que a soma inclui só os vértices ainda não visitados. O próximo vértice é sorteado por roleta: um número entre 0 e 1 vindo do gerador com semente cai em uma das faixas acumuladas das probabilidades. Assim, qualquer candidato pode ser escolhido, não só o de maior peso. Depois de visitar todos, a formiga volta obrigatoriamente ao depósito.

**Atualização do feromônio.** Todas as formigas de uma iteração usam a mesma matriz, a do fim da iteração anterior. Só depois que todas terminam é aplicado

  τ_novo(i,j) = (1 − ρ) × τ_antigo(i,j) + Σ Q / L_k

somando a contribuição de cada formiga k que passou pela aresta, inclusive a de retorno ao depósito. Cada aresta é guardada uma vez (i < j) e copiada para τ(j,i), então a mesma formiga nunca conta duas vezes na mesma aresta. Depois da atualização, cada aresta fica com no mínimo 10⁻¹² de feromônio. A diagonal continua 0.

**Melhor solução.** O núcleo guarda a melhor rota de cada iteração (em caso de empate, a da primeira formiga) e a melhor de toda a execução. A melhor acumulada só é trocada por uma rota estritamente mais curta, então nunca aumenta.

**Dados para a transparência.** `engine.step()` executa uma iteração e devolve um registro com:
- cada formiga: a rota, o comprimento e cada passo (vértice atual, candidatos com τ, d, w e p, vértice escolhido) e o retorno ao depósito;
- cada aresta: feromônio anterior, valor após a evaporação, depósito total e valor final;
- o menor comprimento da iteração, a média das formigas e a melhor acumulada.

**Reprodutibilidade.** Cada engine cria o seu gerador a partir da semente, e todos os sorteios passam por ele. Reiniciar com a mesma configuração refaz exatamente o mesmo histórico. A interface nunca sorteia nada, então a velocidade da animação ou uma pausa não alteram o resultado.

**Validação.** `createEngine` recusa configurações inválidas com uma mensagem clara (ex.: "Coordenadas repetidas (3, 4): dois vértices no mesmo ponto teriam distância zero."). É uma proteção extra: a interface já valida os campos antes.

### API

```js
ACO.distanceMatrix(vertices)                       // matriz n×n
ACO.routeLength(route, dist)                       // comprimento total
ACO.isValidRoute(route, n, depot)                  // true/false
ACO.choiceProbabilities(atual, permitidos, tau, dist, alpha, beta)
                                                   // [{ vertex, tau, dist, weight, prob }]
ACO.pickIndex(probs, rng)                          // roleta
ACO.updatePheromone(tau, rotas, comprimentos, rho, Q)
                                                   // { tau, edges: [{ i, j, before, afterEvap, deposit, after }] }
ACO.mulberry32(seed)                               // gerador rng() em [0, 1)
ACO.validateConfig(cfg)                            // lança erro se inválida
const engine = ACO.createEngine(cfg)               // iteration, finished, tau, dist, history, bestSoFar, last, step()
```

## Testes de validação

Os testes de 6.1 a 6.5 estão em `test.js` e rodam com `node test.js`. Os valores decimais são comparados com tolerância absoluta de 0,000001. Resultado: **6 de 6 casos aprovados**.

### 6.1 Instância de referência

Entrada: A(0,0), B(3,0), C(3,4), D(0,4), depósito A.

| Rota | Esperado | Obtido |
|---|---|---|
| A → B → C → D → A | 14 | 14 |
| A → B → D → C → A | 16 | 16 |
| A → C → B → D → A | 18 | 18 |
| A → C → D → B → A | 16 | 16 |
| A → D → B → C → A | 18 | 18 |
| A → D → C → B → A | 14 | 14 |

As distâncias obtidas foram AB = 3, AC = 5, AD = 4, BC = 4, BD = 5 e CD = 3, com diagonal 0. `isValidRoute` rejeitou rotas incompletas, com vértice repetido, que não começam no depósito ou que não retornam a ele.
**Conclusão:** distâncias e comprimentos corretos.

### 6.2 Probabilidades de escolha

Parâmetros: τ = 1 em todas as arestas, α = 1, β = 2.

| Situação | Esperado | Obtido |
|---|---|---|
| Em A: p(B), p(C), p(D) | 0,520156 / 0,187256 / 0,292588 | 0,520156 / 0,187256 / 0,292588 (soma 1) |
| Em B (candidatos C e D): p(C), p(D) | 0,609756 / 0,390244 | 0,609756 / 0,390244 |
| α = 0 e β = 0, com τ e d diferentes | 1/3 para cada | 1/3 para cada |
| Um só candidato | 1 | 1 |

Em 100.000 sorteios pela roleta a partir de A, as frequências foram B = 0,5189, C = 0,1872 e D = 0,2939, próximas das probabilidades. Nenhum candidato ficou de fora.
**Conclusão:** pesos, probabilidades e sorteio proporcional corretos. A escolha não é gulosa.

### 6.3 Evaporação e depósito

Parâmetros: τ₀ = 1, ρ = 0,5, Q = 14, rota forçada A → B → C → D → A (L = 14).

| Aresta | Anterior | Após evaporação | Depósito | Final |
|---|---|---|---|---|
| AB | 1 | 0,5 | 1 | 1,5 |
| AC | 1 | 0,5 | 0 | 0,5 |
| AD | 1 | 0,5 | 1 | 1,5 |
| BC | 1 | 0,5 | 1 | 1,5 |
| BD | 1 | 0,5 | 0 | 0,5 |
| CD | 1 | 0,5 | 1 | 1,5 |

- 2ª iteração com a mesma rota: perímetro 1,75 e diagonais 0,25 (esperado: 1,75 e 0,25).
- Duas formigas na mesma rota, uma iteração: perímetro 2,5 e diagonais 0,5 (esperado: 2,5 e 0,5).
- ρ = 0: o valor após a evaporação é igual ao anterior. Perímetro 2 e diagonais 1, então nenhuma aresta diminuiu.
- Piso: partindo de τ = 10⁻¹³ com depósito desprezível, nenhuma aresta ficou abaixo de 10⁻¹².

A matriz continuou simétrica e com diagonal 0.
**Conclusão:** evaporação, soma dos depósitos (incluindo a aresta de retorno D → A) e piso numérico corretos.

### 6.4 Execução completa e reprodutibilidade

Parâmetros: instância 6.1, depósito A, 10 formigas, 30 iterações, α = 1, β = 2, ρ = 50%, τ₀ = 1, Q = 14, semente 42.

| Iteração | Menor da iteração | Média das formigas | Melhor acumulada |
|---|---|---|---|
| 0 | — | — | ainda não calculada |
| 1 | 14 | 15 | 14 |
| 2 | 14 | 15 | 14 |
| 3 | 14 | 14,4 | 14 |
| 4 | 14 | 14,6 | 14 |
| 5 | 14 | 14,2 | 14 |
| 10 | 14 | 14 | 14 |
| 20 | 14 | 14 | 14 |
| 30 | 14 | 14 | 14 |

Melhor rota: **A → B → C → D → A, comprimento 14**, encontrada na iteração 1.

- Foram gerados 30 registros, um por iteração concluída, e `step()` devolve `null` depois do fim.
- Todas as 300 rotas são válidas e têm comprimento 14, 16 ou 18.
- A melhor acumulada nunca aumentou.
- Uma segunda execução com a mesma semente reproduziu exatamente o histórico (rotas de todas as formigas, comprimentos e médias) e a matriz final de feromônio.

A média cai de 15 para 14 a partir da iteração 10: o feromônio se concentra no perímetro e todas as formigas passam a escolher a rota ótima.
**Conclusão:** execução correta e reprodutível.

### 6.5 Efeito de β

Parâmetros: os mesmos da 6.4, variando β e a semente.

| β | Semente 1 | 2 | 3 | 4 | 5 | Média da melhor final | Atingiram 14 |
|---|---|---|---|---|---|---|---|
| 0 | 14 | 14 | 14 | 14 | 14 | 14 | 5 de 5 |
| 2 | 14 | 14 | 14 | 14 | 14 | 14 | 5 de 5 |

**Interpretação.** Nesta instância não houve diferença na melhor distância final. Com 4 vértices existem só 3 rotas distintas (cada uma em dois sentidos). Mesmo com β = 0, quando a escolha é praticamente aleatória no começo, a chance de uma formiga montar a rota ótima é 1/3, e com 10 formigas por iteração o ótimo aparece quase sempre já na primeira. O efeito de β (preferir vértices próximos) deve aparecer em instâncias maiores, onde o número de rotas cresce muito e a busca aleatória deixa de bastar. Na 6.4, com β = 2, a heurística da distância também se nota na média: as formigas convergem para o perímetro em poucas iterações.

### 6.5 Entradas inválidas (núcleo)

`createEngine` recusou todos os casos abaixo, cada um com a mensagem mostrada:

| Caso | Mensagem |
|---|---|
| Coordenadas duplicadas | Coordenadas repetidas (3, 4): dois vértices no mesmo ponto teriam distância zero. |
| Identificadores repetidos | Identificador repetido: "A". |
| Menos de quatro vértices | São necessários entre 4 e 12 vértices (recebidos 3). |
| Identificador vazio | Vértice 4: o identificador não pode ficar vazio. |
| Coordenada fora de 0–1000 / com 3 casas | y deve ser um número entre 0 e 1000 / deve ter no máximo duas casas decimais. |
| Formigas 0 ou 2,5; iterações 201 | deve ser um inteiro entre 1 e 100 / entre 1 e 200. |
| α = 6, β = −1, ρ = 0,95, τ₀ = 0, Q = 10.001 | mensagem com o intervalo permitido de cada campo. |
| Campo vazio (NaN) ou ausente | mensagem com o intervalo permitido do campo. |
| Semente 1,5 | A semente aleatória deve ser um número inteiro. |

### 6.5 Entradas inválidas (interface)

O teste partiu da instância 6.1, com uma entrada inválida por vez, seguida de um clique em **Reiniciar**. Foi feito no Microsoft Edge (preenchendo os campos por script, como um usuário faria). Em todos os casos a mensagem abaixo apareceu na caixa de erros, o campo ficou destacado e os botões **Executar** e **Avançar** ficaram desabilitados.

| Entrada | Mensagem exibida |
|---|---|
| D com as mesmas coordenadas de C (3, 4) | Coordenadas repetidas (3, 4) nos vértices "C" e "D". |
| Identificador de D trocado para "A" | Identificador repetido: "A". |
| Identificador vazio | Vértice 4: o identificador não pode ficar vazio. |
| x de B vazio | Vértice "B": x está vazio. |
| x de B = 1001 | Vértice "B": x deve estar entre 0 e 1000. |
| y de D = 4,123 | Vértice "D": y deve ter no máximo duas casas decimais. |
| y de B = "abc" | Vértice "B": y deve ser um número. |
| Formigas vazio | Formigas: o campo está vazio. |
| Formigas = 0 | Formigas: o valor deve estar entre 1 e 100. |
| Formigas = 2,5 | Formigas: digite um número inteiro (1 e 100). |
| Iterações = 201 | Iterações: o valor deve estar entre 1 e 200. |
| α = 6 | α: o valor deve estar entre 0 e 5. |
| β = −1 | β: o valor deve estar entre 0 e 5. |
| ρ = 95% | ρ (%): o valor deve estar entre 0 e 90. |
| τ₀ = 0 | τ₀: o valor deve estar entre 0,01 e 100. |
| Q = 10.001 | Q: o valor deve estar entre 0,01 e 10.000. |
| Semente = 1,5 | Semente: digite um número inteiro. |

- **Menos de quatro vértices:** com 4 vértices, todos os botões de remover ficam desabilitados, então não é possível ficar com menos de 4.
- **Vértice novo sem coordenadas:** um vértice adicionado entra com x e y vazios e bloqueia a execução ("Vértice "E": x está vazio.") até ser preenchido.
- **Outros comportamentos verificados na interface:**
  - a página abre com 8 vértices, na iteração 0, com "ainda não calculada";
  - na instância 6.1, 30 cliques em Avançar produziram 30 linhas no histórico (mais a iteração 0) e a rota A → B → C → D → A = 14;
  - Reiniciar e repetir as 30 iterações reproduziu a tabela idêntica;
  - com ρ = 0%, a coluna "Após evaporação" ficou igual à coluna "Antes" em todas as arestas.

**Conclusão:** entradas inválidas impedem a execução e geram mensagens claras.
