# Desenvolvimento contínuo — Naruto Idle RPG

## Autorização e rotina

O usuário autorizou desenvolvimento contínuo nos resets naturais, mantendo aproximadamente 10% da cota de 5 horas e da cota semanal. Consultar o uso real antes e entre etapas. Não resgatar créditos de reset. Fazer commit e push de cada etapa validada em origin (RA4Z/Naruto_Idle). Não incluir alterações alheias: a exclusão pré-existente de DESIGN_DE_PROGRESSAO.md ainda não pertence a estes commits. Não contratar nem publicar infraestrutura sem nova autorização. Multiplayer local e seu desenvolvimento estão autorizados.

## Consumo da máquina

Pedido do usuário em 20/10/2026: uma tarefa pesada por vez. Não sobrepor build, extração e testes de navegador. Suites serializadas e apenas um Chromium; /arena permite dois clientes sem duas cenas Phaser. Manter essa restrição em todos os resets.

- [x] Lote de música/ambiente original de cinco cenas: 11 MP3 com hashes, streaming limitado, preferências, pausa/limpeza, admin e suporte a byte ranges testados. Demais 225 caminhos MP3 e pacotes SWF ainda pendentes.

- [x] 30008 Profundezas da Floresta da Folha e 300131 Ponte Tenchi: oito destinos, 137 conjuntos restantes, seis inimigos/viagem/loot/save testados. Sete mapas com áudio original vinculado; fade de dois segundos da floresta implementado. Ver reports/world-expansion-30008-300131.json.

- [x] Seis sons UI/resultados originais integrados, voz limitada, pausa/mute e eventos reais testados; save aceita todos os oito mapas visitados em vez de rejeitar o quinto.
- [ ] Próximos lotes: até quatro mapas por lote, sempre UM MAPA POR VEZ; sons/efeitos e demais categorias continuam em lotes pequenos separados.

## Recuperação atual do acervo

- [x] Inventário do CDN: 57.496 arquivos físicos, hashes retomáveis, 75 extras e duplicatas preservadas; outras raízes históricas seguem pendentes.
- [x] Auditar os 145 conjuntos de mapas, inclusive referências virtuais do XML frontal.
- [x] Recuperar e integrar as máscaras frontais nativas de 10001/10005/10006/10008, preservando alpha e navegação; WebGL reutiliza fundo, Canvas tem fallback.
- [ ] Recuperar SWFs intermediários, transformações e objetos com ordenação de profundidade própria. A máscara global não encerra esse item.
- [ ] Integrar os 137 mapas restantes por lotes com viagens, navegação, população, encontros, saves e validação visual.
- [x] Primeiro lote de loading original: 6/14/22, ciclo funcional, integridade dos JPEGs e falha opcional testados.
- [ ] Integrar as outras 195 artes e ampliar os vínculos de jutsus/áudio/conteúdo sem reativar party. As 71 dicas originais estão em revisão, sem anunciar mecânicas inexistentes.

- [x] Costa Verde 10007 e A Floresta da Morte 10009 com navegação, população móvel, combate, recompensas, save/reload e retorno. Seis mapas integrados; região principal 2 da Costa validada.

Relatórios: original-inventory-summary.json, original-map-audit.json, native-foreground-recovery.json e respectivas validações de pixels/navegador. Novos scripts não sobrescrevem bruto e não executam ActionScript.

## Entregas verificadas

- [x] Site na Vercel funcionando no navegador, confirmado pelo usuário em 20/10/2026; publicação/imagens removidas das pendências.
- [x] Menu sem motor Phaser antecipado; lobby carrega só o essencial, com tela de progresso, retry/cancelamento e áudio sob demanda.

- [x] Minijanela pelo botão no jogo: Document PiP em contexto seguro com suporte, fallback interno arrastável/redimensionável no HTTP LAN; mesma partida, controles compactos, retorno sem recarga e caçada testada com outra aba aberta.

- [x] Organização de 312 modelos/variantes e 1.154 entradas de revisão com IDs estáveis.
- [x] 1.330 prévias de corpo inteiro e visualizador de animações no admin.
- [x] Lobby seguro na Vila da Folha, WASD/setas e clique com busca de caminho.
- [x] Navegação por MapInfo.map original: projeção isométrica e componente transitável principal.
- [x] Movimento derivado da velocidade individual (Naruto inicial: 96 unidades/s); zoom 3.1.
- [x] Folha 10001, Floresta 10005, Treinamento 10006 e País das Ondas 10008, com viagens e retorno.
- [x] Seis inimigos por mapa de exploração, patrulha e respawn individual de 12 s.
- [x] Troca entre personagens possuídos fora de combate, preservando nível, XP, treinos e equipamento de cada um. Grupo desativado e adiado por pedido do usuário.
- [x] Sasuke inicial azul/branco (11000211); versão preta (11000201) reservada para o futuro, com migração do progresso antigo.
- [x] /admin com senha inicial admin validada no servidor, cookie HttpOnly/SameSite e logout.
- [x] Telas administrativas: visão geral, personagens, mapas, efeitos, sons e todos os arquivos de runtime.

## Próximos blocos, nesta ordem

**Ordem corrigida pelo usuário para a retomada de 20/10 às 20h20 (Brasília):**

- [ ] Primeiro extrair, organizar e integrar TODO o restante disponível: mapas e camadas/objetos, personagens/animações, jutsus/efeitos, sons, músicas, interface e demais recursos. Implementar o uso correto no jogo, com lotes pequenos, testes e dependências registradas; cópia ou catálogo isolado não bastam.
- [ ] Durante a recuperação, registrar as ligações originais, zonas e coordenadas de chegada encontradas, sem inventar conexões entre os mapas atuais.
- [ ] APÓS a etapa prioritária de recuperação/integração, implementar portais/zonas de transição com os destinos corretos e chegada transitável específica; validar ida/volta, loading/retry, ciclos, clique/WASD, combate, câmera e save/reload.

**Retomada no computador com os originais:** seguir integralmente [Extração e integração dos originais](EXTRACAO_E_INTEGRACAO_ORIGINAIS.md). O pedido abrange modularidade/profundidade dos mapas, todos os demais mapas e o restante de personagens, modelos, efeitos, áudio, interface e conteúdos encontrados. Extração e catálogo não bastam: implementar o suporte, integrar ao jogo, organizar e testar cada lote. Manter acompanhamento de todos os recursos e dependências, preservando grupo adiado e variantes reservadas.

1. [ ] Refinar navegação, escolha de alvo e perseguição dos inimigos. Grupo, formação e combate em equipe foram adiados para o futuro por pedido do usuário.
2. [x] Chakra individual, jutsu de 35 chakra, regeneração, cooldown de 1,2 s e lançamento manual; cura da Sakura preservada e derivada dos atributos.
3. [x] Loot e mochila, quatro equipamentos, loja, slots weapon/armor/charm e bônus reais nos atributos; compras/equipamento e migração testados. Próximo: ampliar itens, consumíveis, receitas e raridades.
4. [x] Cinco missões persistentes de exploração/combate, recompensas únicas em XP/moedas e painel no lobby. Próximo: cadeias de missões e variedade de objetivos.
5. [x] Coleção com três iniciais e recrutamento de modelos elegíveis por 60 moedas + 3 fragmentos. É possível jogar com personagens possuídos, com nível/XP/treinos/equipamento próprios. Só o personagem controlado ganha XP online/offline; arena usa a build do ninja selecionado. Próximo: balanceamento e jutsus dos recrutas adicionais. Grupo e afinidades ficam para o futuro.
6. [x] Arena local de turnos sincronizados: servidor autoritativo, salas por chave, dois clientes independentes, chakra, cooldown, validação de turno, reconexão e expiração. Implementada com SSE e sessões HttpOnly, atributos nivelados e efeitos/vozes originais dos três iniciais. Modo Jornada também implementado: atributos compartilhados com PvE, slots validados e snapshot da build ao entrar; amistoso com save local. Acesso pela internet depende de hospedagem/configuração posterior.
7. [ ] Admin com itens, equipamentos, quests, salas da arena, diagnósticos e colisões sobrepostas no mapa.
8. [ ] Expandir mapas e NPCs incrementalmente, com entrada/saída, população e inspeção visual. Não basta trocar o fundo.
9. [ ] Nitidez: preservar pixels originais e testar densidade de tela, filtros e escala. Não afirmar detalhes ou super-resolução que não existem.
10. [ ] Ampliar a integração do loading original: 3/198 artes já funcionam no jogo; 71 dicas catalogadas para revisão. Acervo disponível nesta máquina, com originais preservados.
11. [x] Integrar os atlas SP_skill1/SP_skill2 do Sasuke azul 11000211 já regenerados do original nesta máquina. A mitigação provisória do outro computador fica histórica; rendererRevision identifica a correção real da namespace externa. Dependências externas ainda não resolvidas permanecem explícitas.
12. [ ] No computador com o acervo, inventariar todos os arquivos e dependências, recuperar camadas/objetos modulares e integrar os mapas restantes com navegação, profundidade, população, entradas e saídas. Seguir as etapas 1–2 e os critérios visuais do roteiro, sem reativar recortes opacos do chão.
13. [ ] Extrair, organizar e implementar os demais personagens/modelos, ações, jutsus, efeitos, sons, interface, itens, missões e demais recursos encontrados, com uso real no jogo. Atualizar catálogos, revisões, scripts reproduzíveis e relatórios por ID; testar em lotes e registrar todas as dependências ainda pendentes. Seguir as etapas 3–6 do roteiro.

## Verificação

Integração entre computadores: as validações anteriores abaixo são históricas. A resolução preserva os atlas reais já reparados do Sasuke azul, o novo admin e os sistemas de progressão/carregamento/minijanela. Evidência atual em reports/merge-validation.json.

Skills do Sasuke 11000211: cópia indevida evitada com mapeamento provisório para animações limpas do mesmo modelo; reconstrução fiel permanece pendente do SWF. `tools/sasuke-skill-check.mjs` validou ambas as prévias no admin, indicação da substituição, Chidori com efeito e vitória sem carregar os dois atlases defeituosos. `tests/sasuke-skill-assets.test.mjs` verifica mapeamentos, metadados e hashes dos originais preservados. Passaram 14 testes de servidor/assets e typecheck. Evidências em reports/sasuke-skill-browser-validation.json e reports/sasuke-skill-fallback.json.

Seleção de personagem: `tools/character-progress-check.mjs` validou migração, treino individual, troca para o Sasuke 11000211, movimento, jutsu, vitórias sem XP para os inativos, recarga, volta ao Naruto com equipamento e build individual da arena. `tools/character-selection-check.mjs` validou Sasuke no Novo jogo, recrutamento seguido de controle de Hinata, ausência de NPC duplicado, bloqueio durante combate e falha de spritesheet com save preservado e retry. Relatórios em `reports/character-progress-validation.json` e `reports/character-selection-validation.json`. Passaram 59 testes de domínio, 13 de servidor/assets, typecheck e build com configLoader runner. Sem deploy nesta etapa.

Minijanela muito pequena: corrigido o colapso do canvas a zero, que causava `Framebuffer status: Incomplete Attachment` e interrompia o jogo. Renderização tem mínimo seguro, cenário preserva uma faixa visível e os controles podem rolar na janela externa. Teste `tools/mini-window-resize-check.mjs` reproduziu a falha antes da correção; depois validou tamanhos alternados, altura zero/fracionária, progresso com outra aba ativa e combate após restaurar, sem duplicar canvas. Relatório: `reports/mini-window-resize-validation.json`.

Carregamento progressivo: comparação local de nova jornada com Naruto caiu de 147 requests/18.261.524 bytes de assets antes do lobby para 31 requests/4.001.631 bytes (-78%). `tools/loading-check.mjs` verifica menu sem Phaser antecipado, loading até primeira imagem válida, downloads essenciais, áudio opcional, moradores progressivos, viagem/vitória, recarga de aventura, retry e cancelamento. Passaram também 56 testes de domínio via Node nativo, 13 testes de servidor/assets, regressão dos três iniciais e lifecycle. A build de produção passou; sob rede simulada de 800 KiB/s e latência de 60 ms, Sasuke entrou em ~6,9 s e completou viagem/combate sem erros. Evidências em `reports/loading-validation.json` e `reports/loading-production-validation.json`. Não houve novo deploy da otimização; a confirmação de funcionamento da publicação anterior veio do usuário.

Correção do acesso por IP no próprio servidor: 53 testes de domínio passaram via Node nativo, incluindo transferência de progresso para localhost e preservação do save antigo em caso de falha. `tools/localhost-transfer-check.mjs` percorreu HTTP por IP → aviso sem fallback silencioso → localhost na mesma porta com save completo e backup → PiP nativo → vitória com outra aba aberta. O modo interno exige escolha explícita. Relatório `reports/localhost-transfer-validation.json`; os modos da minijanela também foram revalidados separadamente.

Minijanela: `tools/mini-window-check.mjs` passou com Document PiP real em localhost no Chrome instalado, fallback sem API e HTTP pelo IP da LAN. Verificou arraste e resize internos, limites em 360×640, câmera/herói visíveis após resize, teclado, cliques com offsets corretos após arraste/scroll do opener, pausa, vitória com outra aba aberta, contexto de áudio ativo no PiP, fechar/restaurar sem recriar o jogo e restauração antes dos painéis. Typecheck/build também validados; relatório `reports/mini-window-validation.json`. O modo externo requer API em contexto seguro; acesso HTTP por IP usa a janela interna.

Progressão individual: 50 testes de domínio (Node nativo; tsx falha em `os.userInfo` antes de executar), 11 testes de servidor, build com `--configLoader runner` e regressões no navegador passaram. `tools/character-progress-check.mjs` migrou um save antigo com Naruto nível 6, treinou Sasuke sem alterar Naruto, evoluiu Sasuke para nível 2 em quatro vitórias, preservou Sakura nível 1/zero XP fora do grupo, recarregou o save e verificou a build individual na arena principal e na rota `/arena`. Relatório `reports/character-progress-validation.json`; atributos dos três iniciais e duelo com dois clientes foram revalidados separadamente. Os campos globais antigos são apenas a projeção do protagonista; não devem servir de build para outro membro.

Atualização de atributos e abertura do combate: sete atributos individuais nos três iniciais (vitalidade, força, ninjutsu, velocidade, chakra, controle e resistência). Nível, treino geral e equipamentos alimentam `src/progression/combat-stats.ts`, sem exigir migração do save. Velocidade define o intervalo (mínimo 450 ms) e o movimento (72–180 u/s); o grupo acompanha a velocidade do líder. Preparação reduzida de 650 para 120 ms e primeira ação antecipada; navegador mediu primeiro ataque em 361–372 ms. Ataques e especiais ajustam sua duração à cadência. A ficha está na aba Atributos do painel de progresso. Resistência reduz dano no PvE; o PvP segue por turnos, com iniciativa pela velocidade no modo Jornada. Valores de jutsu e cura desse modo são derivados no servidor.

Validação desta etapa: 43 testes de domínio executados com o suporte nativo de TypeScript do Node e resolução de imports relativos, 11 testes de servidor, typecheck, `tools/attributes-check.mjs` (movimento, ficha, treino, persistência e vitória dos três iniciais) e `tools/arena-check.mjs` pelo IP da rede. Evidências em `reports/attributes-validation.json` e `reports/arena-browser-validation.json`. O comando padrão com tsx falhou neste ambiente em `os.userInfo` antes de iniciar os testes; a suíte completa foi executada pelo caminho nativo alternativo.

`npm test` (22 testes); `npm run test:server` (autenticação); `npm run build`; `node tools/world-admin-check.mjs` (lobby, velocidade, NPCs, grupo, quatro mapas, inimigos, combate, saves, celular e admin). Relatório: reports/world-admin-validation.json. A ferramenta __idle.advance acelera relógios Phaser e pode produzir uma interrupção de contexto no Chromium após várias viagens; para a regressão final de combate, usar tempo real conforme o script atual.

## Limites atuais

Profundidade de cenário: os recortes manuais do fundo foram DESATIVADOS após o usuário mostrar personagens escondidos atrás de terra. Polígonos de `background.jpg` incluem chão e não são objetos com transparência. Os quatro mapas seguem com fundo achatado; colisões complementares continuam ativas, inclusive a passagem corrigida do portão. A investigação de camadas modulares depende do acervo original, que o usuário confirmou estar em outro computador e disponibilizará depois. Consulte `docs/MAP_LAYERS.md`. Não reativar oclusão com esses recortes nem interpretar os testes anteriores como prova de profundidade correta.

Validação reproduzível: `node --experimental-transform-types --test --test-concurrency=1 tests/training-scenery.test.ts tests/native-navigation-regression.test.ts`; `node tools/training-scenery-check.mjs` (Vite na porta 5178, ou `IDLE_TEST_URL` configurada). Cobre travessia do portão com acompanhante, posição salva inválida e patrulhas em pontos válidos. Agora exige ausência dos recortes opacos. Evidências atuais em `reports/training-scenery-validation.json`, `training-gate-reviewed.png` e `training-ground-visibility.png`. Capturas antigas com copas sobrepostas estão superadas.

Revisão dos quatro mapas: `tests/all-map-scenery.test.ts` verifica 50 rotas por mapa com os bloqueios aplicados. `node tools/all-map-scenery-check.mjs` verifica caminhadas com companheiro, viagens sequenciais e ausência dos recortes opacos; aceita `BASE_URL`. Relatório `reports/all-map-scenery-validation.json`. Esses testes validam navegação e regressões específicas, não a profundidade de todo o cenário. Os botões iniciais aguardam o carregamento dos módulos antes de aceitar cliques.

PvP pela rede local: corrigida a geração de identificadores de ações em HTTP por IP. `crypto.randomUUID` não existe nesse contexto; `src/arena/request-id.ts` usa `crypto.getRandomValues`, disponível nesse acesso. `tools/arena-check.mjs` passou com dois clientes independentes em `http://10.1.43.80:5194`, incluindo ações, cura, defesa, modo Jornada e reconexão; evidência em `reports/arena-browser-validation.json`.

145 conjuntos de mapas originais identificados, quatro integrados. Os SWFs animados da camada intermediária permanecem preservados na origem, sem execução. Personagens adicionais ainda não têm todos os jutsus e vozes associados. A seleção inicial tem três protagonistas. A arena local nivelada está implementada; modo Jornada e revisão dos corpos indevidos nos iniciais estão concluídos; 31 ações em 30 modelos do acervo aguardam revisão incremental. A cota deve preservar a reserva solicitada; não reduzir testes para iniciar um bloco que não caiba nesta janela.

## Servidor e Git

Vite local em 127.0.0.1:5178 inclui a API administrativa. `npm start` serve a build e a API em 127.0.0.1:5180, configurável por HOST/PORT. A senha inicial solicitada é admin; NARUTO_ADMIN_PASSWORD permite alterá-la no servidor. Não existe senha embutida no bundle de interface.

Os assets de runtime somam aproximadamente 2,22 GB, além das cópias WebP otimizadas. Versionar binários usando Git LFS; manter node_modules, dist, assets-extraidos, cache do JPEXS e arquivos de ambiente fora do Git. O acervo original está no outro computador; esta cópia contém os recursos de runtime e os relatórios da extração.

Progressão validada também por `node tools/progression-check.mjs` e reports/progression-browser-validation.json: custos de compra/recrutamento, equipamento, chakra máximo, recompensa única, convite com formação visível e persistência após recarga. Admin ganhou a tela Itens e missões.

Validação de arena: `npm run test:server` (6 testes), `node tools/arena-check.mjs` (um Chromium, dois clientes /arena independentes). Relatório reports/arena-browser-validation.json. Admin agora inclui Salas da arena.


## Refinamento de combate — 20/10/2026

- [x] Modo Jornada da arena: nível, treinos e equipamentos alteram atributos reais; servidor deriva valores e valida slots/limites.
- [x] Naruto/Sasuke/Sakura exibidos sem Kid; pastas e IDs preservados.
- [x] Sombras externas não podem reutilizar bitmap local zero como corpo. Quinze ações dos iniciais e quatro ataques dos inimigos de exploração corrigidos.
- [x] Timelines deduplicadas, origens por ação e janela de preparação sem fuga pelo cenário. Clone original do Rasengan é temporário e intencional.
- [ ] Continuar revisão explícita em lotes pequenos, a partir de reports/external-symbol-audit.json. Restam 31 ações/30 modelos do acervo, nem todos usados no combate atual.
- [x] Site Vercel funcional no navegador, confirmado pelo usuário; problema de imagens/publicação encerrado na lista de pendências.

Validações adicionais: 10 testes de servidor/deploy, 7 testes Python de decodificação/namespace/janelas, 22 testes de domínio e navegador combat-refinement-check.mjs, um único personagem/cena por vez. Estimativas de memória dos cinco atlas revisados por inicial caíram de 52–68 MiB para 2–5 MiB; não é uma medição da memória total do processo.


Revisão ampliada: 503 ações adicionais reparadas em 389 modelos, em lotes de quatro e sem paralelismo. Restam 31 sequências grandes (8 ataques básicos e 23 especiais); preservadas para atlas com recortes/offsets ou adaptação de movimento. Ver reports/catalog-animation-validation.json e catalog-admin-browser-validation.json. A compilação final e a prévia de seis modelos diversos passaram. Não aumentar limites de memória nem lançar múltiplos conversores para tratar essas exceções.
