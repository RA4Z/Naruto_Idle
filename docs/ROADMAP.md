# Desenvolvimento contínuo — Naruto Idle RPG

## Autorização e rotina

O usuário autorizou desenvolvimento contínuo nos resets naturais, mantendo aproximadamente 10% da cota de 5 horas e da cota semanal. Consultar o uso real antes e entre etapas. Não resgatar créditos de reset. Fazer commit e push de cada etapa validada em origin (RA4Z/Naruto_Idle). Não incluir alterações alheias: a exclusão pré-existente de DESIGN_DE_PROGRESSAO.md ainda não pertence a estes commits. Não contratar nem publicar infraestrutura sem nova autorização. Multiplayer local e seu desenvolvimento estão autorizados.

## Consumo da máquina

Pedido do usuário em 20/10/2026: uma tarefa pesada por vez. Não sobrepor build, extração e testes de navegador. Suites serializadas e apenas um Chromium; /arena permite dois clientes sem duas cenas Phaser. Manter essa restrição em todos os resets.

## Entregas verificadas

- [x] Organização de 312 modelos/variantes e 1.154 entradas de revisão com IDs estáveis.
- [x] 1.330 prévias de corpo inteiro e visualizador de animações no admin.
- [x] Lobby seguro na Vila da Folha, WASD/setas e clique com busca de caminho.
- [x] Navegação por MapInfo.map original: projeção isométrica e componente transitável principal.
- [x] Caminhada 96 unidades/s (antes 32), zoom 3.1 (antes 2.15).
- [x] Folha 10001, Floresta 10005, Treinamento 10006 e País das Ondas 10008, com viagens e retorno.
- [x] Seis inimigos por mapa de exploração, patrulha e respawn individual de 12 s.
- [x] Grupo opcional de até três convidados, vazio por padrão; sem duplicar um morador convidado.
- [x] /admin com senha inicial admin validada no servidor, cookie HttpOnly/SameSite e logout.
- [x] Telas administrativas: visão geral, personagens, mapas, efeitos, sons e todos os arquivos de runtime.

## Próximos blocos, nesta ordem

1. [ ] Refinar grupo e formação em repouso, navegação, escolha de alvo e perseguição dos inimigos. Testar longa duração, múltiplas voltas e todos os iniciais.
2. [x] Chakra (100 base), jutsu de 35 chakra, regeneração, cooldown de 1,2 s e lançamento manual; cura da Sakura preservada.
3. [x] Loot e mochila, quatro equipamentos, loja, slots weapon/armor/charm e bônus reais nos atributos; compras/equipamento e migração testados. Próximo: ampliar itens, consumíveis, receitas e raridades.
4. [x] Cinco missões persistentes de exploração/combate, recompensas únicas em XP/moedas e painel no lobby. Próximo: cadeias de missões e variedade de objetivos.
5. [x] Coleção separada do grupo, três iniciais disponíveis e recrutamento de modelos elegíveis por 60 moedas + 3 fragmentos. Próximo: progressão individual, afinidades e builds do grupo.
6. [x] Arena local de turnos sincronizados: servidor autoritativo, salas por chave, dois clientes independentes, chakra, cooldown, validação de turno, reconexão e expiração. Implementada com SSE e sessões HttpOnly, atributos nivelados e efeitos/vozes originais dos três iniciais. Modo Jornada também implementado: atributos compartilhados com PvE, slots validados e snapshot da build ao entrar; amistoso com save local. Acesso pela internet depende de hospedagem/configuração posterior.
7. [ ] Admin com itens, equipamentos, quests, salas da arena, diagnósticos e colisões sobrepostas no mapa.
8. [ ] Expandir mapas e NPCs incrementalmente, com entrada/saída, população e inspeção visual. Não basta trocar o fundo.
9. [ ] Nitidez: preservar pixels originais e testar densidade de tela, filtros e escala. Não afirmar detalhes ou super-resolução que não existem.

## Verificação

`npm test` (22 testes); `npm run test:server` (autenticação); `npm run build`; `node tools/world-admin-check.mjs` (lobby, velocidade, NPCs, grupo, quatro mapas, inimigos, combate, saves, celular e admin). Relatório: reports/world-admin-validation.json. A ferramenta __idle.advance acelera relógios Phaser e pode produzir uma interrupção de contexto no Chromium após várias viagens; para a regressão final de combate, usar tempo real conforme o script atual.

## Limites atuais

145 conjuntos de mapas originais identificados, quatro integrados. Os SWFs animados da camada intermediária permanecem preservados na origem, sem execução. Personagens adicionais ainda não têm todos os jutsus e vozes associados. A seleção inicial tem três protagonistas. A arena local nivelada está implementada; modo Jornada e revisão dos corpos indevidos nos iniciais estão concluídos; 530 ações em 403 modelos do acervo aguardam revisão incremental. A cota deve preservar a reserva solicitada; não reduzir testes para iniciar um bloco que não caiba nesta janela.

## Servidor e Git

Vite local em 127.0.0.1:5178 inclui a API administrativa. `npm start` serve a build e a API em 127.0.0.1:5180, configurável por HOST/PORT. A senha inicial solicitada é admin; NARUTO_ADMIN_PASSWORD permite alterá-la no servidor. Não existe senha embutida no bundle de interface.

Os assets de runtime somam aproximadamente 2,22 GB. Versionar binários usando Git LFS; manter node_modules, dist, assets-extraidos, cache do JPEXS e arquivos de ambiente fora do Git. A extração original de 8 GB permanece local e preservada.

Progressão validada também por `node tools/progression-check.mjs` e reports/progression-browser-validation.json: custos de compra/recrutamento, equipamento, chakra máximo, recompensa única, convite com formação visível e persistência após recarga. Admin ganhou a tela Itens e missões.

Validação de arena: `npm run test:server` (6 testes), `node tools/arena-check.mjs` (um Chromium, dois clientes /arena independentes). Relatório reports/arena-browser-validation.json. Admin agora inclui Salas da arena.


## Refinamento de combate — 20/10/2026

- [x] Modo Jornada da arena: nível, treinos e equipamentos alteram atributos reais; servidor deriva valores e valida slots/limites.
- [x] Naruto/Sasuke/Sakura exibidos sem Kid; pastas e IDs preservados.
- [x] Sombras externas não podem reutilizar bitmap local zero como corpo. Quinze ações dos iniciais e quatro ataques dos inimigos de exploração corrigidos.
- [x] Timelines deduplicadas, origens por ação e janela de preparação sem fuga pelo cenário. Clone original do Rasengan é temporário e intencional.
- [ ] Continuar revisão explícita em lotes pequenos, a partir de reports/external-symbol-audit.json. Restam 530 ações/403 modelos do acervo, nem todos usados no combate atual.
- [ ] Publicação Vercel adiada pelo usuário; não solicitar login nem ativar configuração enquanto o assunto não for retomado.

Validações adicionais: 9 testes de servidor/deploy, 5 testes Python de decodificação/namespace/janelas, 22 testes de domínio e navegador combat-refinement-check.mjs, um único personagem/cena por vez. Estimativas de memória dos cinco atlas revisados por inicial caíram de 52–68 MiB para 2–5 MiB; não é uma medição da memória total do processo.
