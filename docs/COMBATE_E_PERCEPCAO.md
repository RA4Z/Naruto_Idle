# Combate em grupo e percepção

O jogador concentra ataques básicos e técnicas em um único alvo. Outros inimigos podem detectá-lo, aproximar-se e entrar no mesmo combate. Cada integrante tem vida, intervalo de ataque, resistência, preparação de especial e orçamento de cura próprios. Modelos repetidos são instâncias diferentes: o identificador é `<mapa>:<posição no grupo>`, não o ID do asset.

Clique no sprite de um inimigo para persegui-lo durante a exploração. No combate, clique no inimigo ou no botão correspondente da lista de alvos. Selecionar outro oponente conserva a vida dos dois e todos os relógios; não concede outro golpe inicial. Pode-se atrair deliberadamente um inimigo próximo e visível clicando nele durante a luta. Inimigos fora do alcance aproximam-se, mas não causam nem recebem dano até haver distância e passagem válidas. O personagem permanece parado durante o combate, como no fluxo anterior; movimentação de combate/fuga manual não foi adicionada.

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
