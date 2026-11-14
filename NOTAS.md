# Notas de trabalho — Colônia de Formigas

Arquivo de continuidade entre sessões. Ao final de cada sessão, atualizar
"Últimas mudanças" e "Próximos passos".

## Divisão (ver DIVISAO-ACO.md, o contrato combinado)
- Pessoa 1 — Núcleo: `aco.js`, `test.js` → **feito**.
- Pessoa 2 — Interface: `index.html`, `style.css`, `app.js` → pendente.

## Estado do núcleo (14/11/2026)
- `aco.js` segue o contrato da seção 2 e expõe também `validateConfig`,
  `PISO_FEROMONIO` e `LIMITES` (são extras e não quebram o contrato).
- `test.js`: 6 de 6 casos aprovados (6.1 a 6.5). Os resultados estão no README.
- O Node não está instalado. Para rodar os testes, usar o Node embutido no VS Code:
  ```powershell
  $env:ELECTRON_RUN_AS_NODE=1; & "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe" test.js
  ```
  (se a saída vier cortada, redirecionar para um arquivo)

## Decisões
- Gerador: Mulberry32, criado por engine a partir da semente.
- A roleta consome um sorteio mesmo quando há um só candidato (mantém a
  sequência simples e determinística).
- Se todos os pesos ficarem nulos ou infinitos (não ocorre dentro dos limites),
  o sorteio vira uniforme.
- Melhor da iteração: em caso de empate, fica a primeira formiga. A melhor
  acumulada só troca por uma rota estritamente menor.

## Pendências
- README: nomes dos autores, links (Pages e repositório), partes da interface.

## Últimas mudanças
- 14/11/2026: núcleo e testes implementados; README com a parte do núcleo.

## Próximos passos
- Interface (Pessoa 2) e integração (seção 4 do contrato).
