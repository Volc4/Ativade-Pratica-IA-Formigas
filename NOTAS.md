# Notas de trabalho — Colônia de Formigas

Arquivo de continuidade entre sessões. Ao final de cada sessão, atualizar
"Últimas mudanças" e "Próximos passos".

## Divisão (ver DIVISAO-ACO.md, o contrato combinado)
- Pessoa 1 — Núcleo: `aco.js`, `test.js` → feito.
- Pessoa 2 — Interface: `index.html`, `style.css`, `app.js` → feito.

## Estado (14/11/2026)
- Publicado: https://volc4.github.io/Ativade-Pratica-IA-Formigas/
- `test.js`: 6 de 6 casos aprovados (6.1 a 6.5).
- Interface testada no Edge: entradas inválidas bloqueiam a execução com
  mensagens claras; Reiniciar reproduz o histórico; nenhum erro de JavaScript.
- README completo: autores, links, instruções, parâmetros, bibliotecas
  (nenhuma) e resultados dos testes do núcleo e da interface.

## Decisões
- Gerador: Mulberry32, criado por engine a partir da semente.
- A roleta consome um sorteio mesmo quando há um só candidato.
- Melhor da iteração: em caso de empate, fica a primeira formiga. A melhor
  acumulada só troca por uma rota estritamente menor.
- A página abre com o exemplo de 8 vértices (o enunciado pede 5 a 12 no
  cenário inicial); a instância 6.1 fica no botão de exemplo.
- Espessura e cor das arestas são relativas ao maior τ da iteração exibida;
  quando a escala muda, a página mostra um aviso com os novos limites.

## Últimas mudanças
- 14/11/2026: link do repositório na página, cenário inicial com 8 vértices,
  README completado, contrato (DIVISAO-ACO.md) adicionado ao repositório.

## Próximos passos
- Entregar o link do GitHub Pages.
