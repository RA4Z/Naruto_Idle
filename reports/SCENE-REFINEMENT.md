# Revisão de cenário, escala e câmera — 19/10/2026

Problemas confirmados: a rota anterior atravessava o telhado do prédio redondo; o alvo era deslocado arbitrariamente 65 unidades para a direita ao iniciar a luta; o tamanho fixo 0,75 não considerava as proporções diferentes dos rigs; o modo FIT encolhia o canvas em janelas estreitas e deixava faixas vazias quando o diário crescia.

Correções: rota nova sobre a rua superior, com polígono independente auditado visualmente e margem de seis unidades para os pés; o deslocamento é validado contra esse limite. Alvos e combates permanecem nos pontos da rua. A próxima posição de encontro muda para a perna de retorno nas extremidades, evitando uma sequência infinita de encontros no mesmo ponto.

Escala: altura de referência de 45 unidades de mundo, aproximadamente 44% menor que o antigo Naruto parado (80,25). Cada personagem tem uma escala fixa por rig de exploração/combate, calculada a partir da postura neutra; não existe mudança de tamanho conforme a posição Y, distância ou quadro. A corrida original é agachada e muda a silhueta naturalmente. Não se esticam quadros individualmente. Sombra e barras menores reforçam o contato com o chão.

Câmera: zoom fixo 2,15 em vez de 1,35. Canvas RESIZE ocupa o espaço real, com escala de pixels consistente em desktop, janela estreita e celular. Diário com rolagem independente no desktop. Fundo recomposto em 3072×3072 a partir dos 144 blocos originais; geometria lógica mantida em 1000×1000.

Validação: testes geométricos amostram todos os segmentos e rejeitam telhados e jardim; teste no navegador percorre 120 segundos simulados por inicial, incluindo ida/volta, encontros, recompensas e posições dos pés. Zoom e escala de rig são conferidos em todas as amostras. Capturas visuais são feitas depois de recarregar e executar quadros reais; o avanço acelerado testa lógica e não simula as linhas do tempo do renderer. Consultar scene-validation.json, viewport-validation.json e capturas *-street-review.png. Fluxos normais de combate, salvamento, pausa, derrota e offline também foram verificados por browser-check.mjs e browser-edge-check.mjs.

Limites: o polígono cobre somente o trecho auditado da rua superior. Não é uma recuperação da colisão original nem uma liberação de exploração do mapa inteiro. O cenário ainda é um fundo composto; camadas animadas/oclusão geral não foram reconstruídas, e habilidades externas continuam parciais. Novas rotas exigem auditoria visual e novos testes de limites.
