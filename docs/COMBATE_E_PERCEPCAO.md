# Combate em grupo e percepção

## Segunda revisão — avisos, áudio e custo de perseguição

- Especiais exigem ao menos `COMBAT.enemyWindupMs` (300 ms) de simulação ativa depois do aviso. Encher o relógio fora do alcance não permite avisar e atingir no mesmo quadro. Sair do alcance/passagem cancela a preparação, voltar exige novo aviso; pausa congela a contagem, troca de alvo não interfere no relógio do inimigo e derrota limpa todos os avisos. Uma barra âmbar abaixo da vida e o título do botão do alvo indicam a preparação. Ataques básicos conservam sua cadência anterior.
- Áudio usa um canal por **instância de inimigo**, com ID `<mapa>:<posição>`, em vez de um único canal para todos. Sofrer dano/morrer cancela somente a ação daquele ator; dois modelos iguais não se silenciam. Callbacks antigos conferem a ação vigente antes de emitir som. Permanecem o teto global de quatro vozes e os limites por pacote, pausa, mute e descarte.
- `world/combat-sync.ts` publica primeiro o alcance de todos os perseguidores e remove os demais desistentes antes de substituir o alvo que saiu. A escolha passa a considerar o quadro atual, sem focar temporariamente outro inimigo que também estava desistindo; alvo manual válido e cadência continuam preservados.
- Perseguidores reaproveitam a rota enquanto o jogador não se desloca mais de oito unidades e o destino ainda permite ataque. A checagem continua a cada 400 ms; rota consumida, jogador movido ou destino bloqueado forçam novo cálculo. Inimigos imóveis por falta de caminho ou pela derrota do jogador deixam a animação de corrida sem cancelar ações de batalha.

Regressões novas: `combat-windup.test.ts`, `combat-sync.test.ts` e extensões de `entity-audio.test.ts`/`enemy-field.test.ts`. Antes das correções, cinco cenários falharam reproduzindo os defeitos e a busca repetida; após a correção passam também os cenários de canais simultâneos, descarte de callback atrasado, limite global, pausa, cura e derrota. Suíte completa: 324 testes TypeScript e oito da arena aprovados, além dos tipos e das 1.278 mensagens nos três idiomas. Testes de perseguição contam chamadas reais ao cálculo de caminhos, sem alegar medição de FPS. O navegador continua indisponível nesta etapa; barra/tooltip e integração visual exigem conferência manual. Estado de preparação é transitório e não altera o formato do save.

## Revisão do combate dinâmico — 22/10/2026

- Aproximação em grupo valida o alcance **e** a passagem livre no fim da rota. Um ponto distribuído atrás de uma parede não é mais aceito apenas porque existe caminho até ele; nesse caso a perseguição tenta a posição do jogador. A implementação compartilhada está em `src/world/melee.ts`. Os seis pontos mantêm a distribuição em terreno livre, sem atravessar colisões.
- Se o alvo selecionado abandonar a perseguição, o foco automático prioriza um sobrevivente já ao alcance, preservando retirada, vida e relógios. A seleção manual continua respeitada enquanto aquele inimigo permanecer no combate.
- A pose de combate parada acompanha o lado do alvo; golpes e reações dos inimigos voltam-se para o jogador. Efeitos de dano usam o ator identificado pelo evento, mesmo com múltiplos participantes.
- Pedir repetidamente a mesma animação em `EntityActor.play` preserva quadro, origem e reprodução. Isso evita deslocamentos nos atlas compactos que possuem `frameOrigins`; `tick` continua aplicando a origem do quadro atual. Pedidos com `force` reiniciam a ação normalmente.
- Reaparecer inicia outra `incarnation`, cancela tweens antigos e restaura transparência, ângulo e contador de bloqueio. As duas etapas atrasadas da morte conferem a instância e sua vida antes de ocultar o ator. Um novo alerta manual também limpa o bloqueio da perseguição anterior.

Regressões em `tests/melee-approach.test.ts`, `tests/enemy-field.test.ts` e `tests/combat-retreat.test.ts`: passagem estreita, parede sólida, seis posições, percurso sem atravessar colisões, preferência de alvo, origem por quadro, pausa/reaparecimento e novo alerta. O teste de `EnemyField`/`EntityActor` executa as classes de produção com uma interface gráfica simulada; **não renderiza WebGL**. O navegador estava indisponível nesta revisão, portanto a aparência e a integração autenticada completa ainda exigem conferência manual no jogo. As validações históricas de navegador abaixo pertencem às etapas anteriores.

O jogador concentra ataques básicos e técnicas em um único alvo. Outros inimigos podem detectá-lo, aproximar-se e entrar no mesmo combate. Cada integrante tem vida, intervalo de ataque, resistência, preparação de especial e orçamento de cura próprios. Modelos repetidos são instâncias diferentes: o identificador é `<mapa>:<posição no grupo>`, não o ID do asset.

Clique no sprite de um inimigo para persegui-lo durante a exploração. No combate, clique no inimigo ou no botão correspondente da lista de alvos. Selecionar outro oponente conserva a vida dos dois e todos os relógios; não concede outro golpe inicial. Pode-se atrair deliberadamente um inimigo próximo e visível clicando nele durante a luta. Inimigos fora do alcance aproximam-se, mas não causam nem recebem dano até haver distância e passagem válidas. O jogador pode mover/fugir clicando no chão/minimapa ou usando WASD/setas, com assistência leve do teclado. Inimigos próximos continuam atacando durante a retirada; selecionar um oponente retoma os golpes do jogador. [Movimento e regras de fuga](MOVIMENTO_E_PROGRESSAO_DA_CONTA.md).

Ao derrotar um alvo, XP, moedas e loot são concedidos uma única vez e o foco passa a um sobrevivente, priorizando quem já está ao alcance. Não há regeneração de 20% entre adversários do mesmo grupo. A exploração e essa recuperação voltam após eliminar o último inimigo e concluir o golpe final. Derrota conta uma vez, conserva recompensas já recebidas e recupera o personagem pelo fluxo existente. Oponentes vivos voltam às suas posições ao recuperar da derrota.

## Detecção e perseguição

Parâmetros centrais em `src/world/awareness.ts`:

- Percepção circular: raio 36 unidades, apenas um pouco maior que o anterior de 32.
- Cone frontal: abertura total de 120°, raio `max(140, profile.radius + 85)`, antes 90° e `max(90, profile.radius + 40)`.
- Memória após perder o contato visual: 10 segundos, antes quatro. Voltar a enxergar renova esse prazo.
- Limite de perseguição: 420 unidades da origem da patrulha, antes 260.
- Sem progresso por 7,5 segundos: abandona a perseguição e tenta retornar à origem, antes 2,5 segundos. Não interfere no inimigo que já está parado em alcance de ataque.

As duas zonas exigem linha livre pela navegação real. Cercas, paredes e vegetação bloqueiam quando estão representadas na grade/polígonos de colisão; a imagem do cenário sozinha não define cobertura. Não há detecção por ruído nem chamada automática do grupo inteiro ao atacar um membro. Isso permite aproximar-se pelas costas além do círculo e usar obstáculos para isolar grupos. A direção acompanha a patrulha e a perseguição.

Perseguição usa rotas pela grade, recalculadas a cada 400 ms, com posições de aproximação distribuídas ao redor do jogador. Inimigos com animação de mundo a utilizam; modelos sem esse modo usam sua apresentação de batalha para deslocar-se. Perder o jogador ou ultrapassar os limites remove o inimigo do combate sem recompensa; ao reencontrá-lo depois dessa retirada, inicia-se uma nova participação com vida cheia. Inimigos mortos reaparecem após 12 segundos.

## Console exclusivo do administrador

As zonas ficam invisíveis por padrão, inclusive no servidor de administrador. O destaque do alvo e as barras individuais continuam disponíveis no jogo.

1. Execute `npm run admin`. O comando abre `/admin`; para jogar use **Abrir o jogo**, ou acesse `/` no mesmo servidor.
2. Pressione a tecla `'` fora dos campos de texto para abrir o console.
3. Digite `debug=true` e pressione Enter para mostrar círculo, cone e indicadores de alerta. Use `debug=false` para ocultá-los.
4. Feche com `'`, Esc ou o botão. O console aberto pausa a simulação da jornada. A escolha é temporária e volta a `false` ao recarregar.

`vite.config.ts` define `import.meta.env.ADMIN_CONSOLE` pelo evento de execução npm `admin`; a instalação também exige `import.meta.env.DEV`. Visitar `/admin`, alterar a URL ou rodar `npm run dev` não habilita o console. O build normal exclui seu módulo e CSS. O parser só aceita a atribuição booleana; não executa JavaScript. Essa ferramenta visual não substitui a autenticação do painel nem altera saves/atributos.

## Organização e validação

- `src/progression/combat-opponent.ts`: estado independente de cada oponente.
- `Hunt`, em `src/model.ts`: um relógio do jogador, seleção e participação de oponentes, dano e recompensa por morte. Campos antigos como `enemyHp` são acessores do alvo atual.
- `src/world/awareness.ts`: geometria e memória de detecção, sem Phaser.
- `src/world/enemies.ts`: patrulha, perseguição, reaparecimento e desenho opcional das zonas.
- `src/main.ts`: integração do encontro, animações e efeitos com ID do oponente de origem, cliques e lista de alvos. Não criar um `Hunt` separado por inimigo.
- `src/admin/debug-*`: estado visual, parser e console, separados do painel de validação de assets.

`tests/group-combat.test.ts` cobre percepção, memória, vários atacantes, troca, alcance, pausa, mortes, recompensas, comandos e rotas sem metadados cíclicos dos atores. `tools/group-combat-check.mjs` usa Vite em 5194 e valida o jogo renderizado; `tools/admin-console-check.mjs` testa o servidor normal e, com `--admin`, o servidor iniciado por `npm run admin -- --port 5194`. Relatórios em `reports/group-combat-validation.json` e `reports/admin-console-*-validation.json`.

Combate parcial continua transitório: recarregar ou recuperar WebGL reconstrói a cena a partir da jornada salva, sem conservar HP/relógios dos oponentes. O cálculo offline continua estimado, sem simular percepção ou confrontos em grupo. A arena PvP mantém suas regras próprias de duelo.


## Spawn ao entrar ou retomar o mapa — 22/10

`mapEnemyHomes`, em `src/world/spawn.ts`, recebe a entrada canônica do mapa. Ordena a grade, encontra o componente alcançável por conexões livres e escolhe até seis pontos distintos por distância máxima entre origens, com semente estável do ID do mapa. Exclui um raio de 85 unidades da entrada quando há espaço. Posição salva do jogador não participa da escolha. `src/main.ts` passa `map.spawn`, e `EnemyField.reset` mantém cada posição como `mob.home`, inclusive no reaparecimento após morte. Mapas seguros ou sem inimigos não criam atores.

A regressão reproduziu o confinamento ao raio320 antes do ajuste. Agora cobre a classe real, os mapas de aventura, reconexão, componente desconectado, mapas pequenos e reaparecimento. 337 testes TS, tipos/build/segredos aprovados. A fixture `/tools/qa/enemy-spawn.html` usa mapa10005 e a classe real sem carregar conta/save; alternar os botões de retomada preservou todas as seis origens no navegador. A geometria de colisão continua sendo a grade/polígonos: a imagem do cenário não acrescenta barreiras automaticamente. Não foi testada uma sessão autenticada real.
