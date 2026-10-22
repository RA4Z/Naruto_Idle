# Movimento em combate, teclado e nível da conta

Implementado em 22/10/2026. Esta especificação substitui o combate imóvel anterior e o teto antigo de nível 100.

## Fuga e combate dinâmico

Clique no chão, no minimapa ou use WASD/setas durante a luta para se deslocar/fugir. O movimento usa a mesma navegação e colisões da exploração. Um destino inalcançável não cancela o combate. Mover manualmente desativa a caçada automática e suspende os golpes do jogador enquanto ele se desloca. Ao parar, o ninja fica pronto para atacar o alvo selecionado assim que ele entrar no alcance, respeitando passagem livre e cadência, sem exigir outro clique. Um inimigo diferente que já esteja próximo não rouba essa mira. Selecionar um inimigo ou reativar a caçada também retoma os ataques. As técnicas manuais ficam suspensas somente durante o deslocamento de retirada, com explicação no HUD. `Hunt.updateMovement` recebe o deslocamento real de cada quadro antes de atualizar alcance e simular golpes; não reinicia os relógios ao alternar movimento/parada.

Fugir não dá invulnerabilidade nem encerra o encontro imediatamente. Cada perseguidor conserva vida e relógio de ataque; pode atingir o jogador enquanto estiver a menos de 28 unidades e houver passagem livre. A cena atualiza o alcance depois do deslocamento do jogador. Fora do alcance, o atacante continua perseguindo pelas regras de percepção/memória/limite de patrulha, mas não acerta através de distância ou parede. Ao perder um perseguidor, a retirada continua contra os demais. Perder o último encerra o combate sem recompensas e preserva o destino de movimento. Um inimigo retornando à patrulha não reinicia o combate automaticamente só por continuar próximo.

Novos inimigos que alcançam um jogador em deslocamento iniciam o combate sem apagar o caminho manual. Vitória também não apaga um trajeto já definido. Derrota cancela o destino e bloqueia movimento até recuperação. Pausa, carregamento e modais continuam suspendendo o jogo. Não se pode trocar ninja/equipamento ou viajar enquanto ainda houver combate ativo. Fuga e retomada não reiniciam relógios para obter golpes extras, nem acumulam rajadas.

Código: `Hunt.retreating`/`retreat()` e retarget com preservação de intenção em `src/model.ts`; gate de movimento em `src/world/combat-movement.ts`; entrada, ordem movimento/alcance/simulação e animações em `src/main.ts`. Perseguição continua em `enemies.ts`/`awareness.ts`.

## Assistência de teclado

`src/world/keyboard-navigation.ts` implementa `KeyboardNavigator`, usado somente no controle por WASD/setas. A resposta direta é mantida em espaço livre. Perto de colisões, o controlador tenta pequenos alinhamentos por rotas locais e deslizamento por direções tangenciais. A grade e os polígonos originais continuam sendo a autoridade: não encolhe o personagem, não atravessa obstáculos, não teleporta, não aumenta a velocidade e não transforma uma tecla em viagem automática.

- Antecipação de 20–34 unidades; desalinhamentos laterais candidatos de 8, 16 e 24 unidades.
- Busca local limitada a 80 nós por candidato e nova tentativa a cada 160 ms, reutilizando o pequeno trajeto enquanto a tecla é mantida.
- Rotas com volta inicial ou desvios maiores que duas vezes a antecipação são descartadas.
- Tentativas tangenciais de 15°, 30°, 45° e 60° só vencem a resposta direta quando avançam melhor na direção solicitada.
- Soltar a tecla, inverter a direção, pausar ou iniciar um trajeto por clique cancela a assistência pendente.
- `NativeNavigation.path` recebeu orçamento opcional `maxVisited`; seu padrão é ilimitado, preservando a busca de mouse e dos inimigos.

Referências conceituais: [deslizamento de corpos controlados em colisões](https://docs.godotengine.org/en/stable/classes/class_characterbody2d.html) e [seguimento de trajetos com tolerâncias e limites de busca](https://docs.godotengine.org/en/stable/classes/class_navigationagent2d.html). A implementação é própria sobre `NativeNavigation`, sem importar Godot ou alterar o motor Phaser.

## Conta e níveis sem teto

O save tem `accountLevel` e `accountXp`, independentes dos campos `level`/`xp` do ninja ativo e de cada `characterProgress`. Conta e ninjas usam exatamente a mesma função `needed(level) = floor(80 * level ** 1.35)`. Não existe nível máximo de jogo: 100→101, 1000→1001 e os níveis seguintes continuam funcionando. O requisito de 16→17 é idêntico para ambos. As validações mantêm números inteiros seguros, positivos para nível e não negativos para XP; removido o teto 100 inclusive do loadout Jornada do PvP. Os limites de cadência/movimento e de treinamento são regras distintas e continuam vigentes.

`addXp` é o ponto de entrada para recompensas: concede a mesma quantidade ao ninja ativo e à conta. Vitória, missões e estimativa offline usam esse ponto; trocar ninja não troca nem reinicia a conta. `addCharacterXp` permanece uma operação individual para manipular progresso específico, não deve substituir `addXp` em novas recompensas. Apenas a conta e o ninja ativo recebem XP, sem distribuir aos inativos.

Contas novas começam no nível 1. Saves sem os campos de conta são migrados uma única vez a partir do ninja possuído mais avançado (nível, depois XP), ignorando a roupa preta aposentada do Sasuke. Não existia histórico total de XP por conta; não se inventa uma soma histórica nem se percorre um laço por todos os níveis para reconstruí-la. Após a migração, todo XP novo é acumulado na conta. O normalizador é usado também por `cloudSnapshot`; snapshots incompletos/corrompidos são rejeitados. A concessão offline é gravada antes do resumo e não pode ser repetida pelo mesmo intervalo.

HUD mostra nível/barra de XP da conta separados do ninja, com PT/EN/ES. `account-progress-ui.ts` reaproveita os nós enquanto os valores não mudam. Campos novos continuam dentro do snapshot JSONB existente; não é necessária migração de esquema nem alteração do plano Supabase. A economia continua `client_unverified`, como o restante do progresso atual.

## Verificação e limites

Testes em `account-progress.test.ts`, `combat-retreat.test.ts` e `keyboard-navigation.test.ts` cobrem curva de XP até 10.000, restauração/nuvem além de 100, migração idempotente, XP offline único, dano durante retirada, alcance, múltiplos perseguidores, cancelamento e retomada sem rajadas. A assistência atravessa um corredor estreito que bloqueia o controle anterior, respeita o orçamento de deslocamento e colisões, e é exercitada em oito direções nos quatro mapas iniciais. Testes da arena aceitam loadouts de nível 1.001 sem perder rejeição de equipamentos inválidos.

Suíte completa: 304 testes TypeScript; arena: 8 testes. Fixture de navegador `/tools/fixtures/account-retreat.html` utiliza os controladores, regras e renderizador reais com dados em RAM; verifica nível da conta após troca de ninja, dano próximo/ausente longe e assistência na abertura. Na amostra, assistência chegou a x≈303 enquanto o movimento comum parou em x≈188. A fixture não executa o mundo completo do Phaser nem autentica contas reais; não equivale a teste de ponta a ponta de animações/perseguição em todos os mapas.
