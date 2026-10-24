# Especificação vigente — Caminho da Folha

Este documento descreve o jogo atual e seus contratos. O [pedido original](history/ESPECIFICACAO-ORIGINAL.md) fica preservado como referência de intenção; seus caminhos antigos e funcionalidades futuras não descrevem o estado implementado. Pendências estão no [ROADMAP.md](ROADMAP.md).

## Proposta

Idle RPG para navegador em Phaser/TypeScript, usando recursos visuais/sonoros recuperados de Naruto Online. Regras de progressão e combate são próprias. Originais devem ser preservados; conversores são reproduzíveis e não executam ActionScript.

## Jornada e personagens

Novo jogo permite Naruto 11000101, Sasuke azul/branco 11000211 ou Sakura 11000301. O Sasuke preto 11000201 está reservado; saves antigos recebem a migração correspondente sem perder progresso.

O jogador controla um personagem possuído por vez e pode trocá-lo fora de combate. Nível, XP, treinos e equipamento pertencem a cada personagem; somente o ativo recebe XP online/offline. Party não está disponível nesta versão.

A conta possui nível/XP próprios e recebe o mesmo XP novo do ninja ativo, inclusive de missões e progresso offline. Conta e personagens não têm teto de nível e usam a mesma curva de XP em cada nível. Saves antigos iniciam a conta no progresso do ninja possuído mais avançado; trocar ninja não muda o nível da conta. [Contrato e validação](MOVIMENTO_E_PROGRESSAO_DA_CONTA.md).

Vitalidade, força, ninjutsu, velocidade, chakra, controle e resistência determinam os valores derivados. Velocidade afeta movimento e intervalo de ataques; limites ficam em src/progression/combat-stats.ts. Recrutas têm perfis por família em oito estilos, crescimento próprio e técnicas genéricas autorais, sem herdar jutsu de outro modelo. A tabela cobre os recrutáveis atuais com exploração/combate. Detalhes em [BALANCEAMENTO.md](BALANCEAMENTO.md).

## Mundo e combate

Há 145 conjuntos preparados e acessíveis por Viagens. O jogador anda por clique ou WASD/setas sobre a grade nativa de MapInfo.map. O catálogo separa 55 destinos do mundo/legado, 69 cenários de fases e 21 a identificar. Os 90 cenários das duas últimas categorias permitem exploração segura, sem campanhas ou recompensas originais implementadas. Nos destinos de caça, encontros acontecem por proximidade com linha de passagem válida; combate ocorre no mesmo cenário, trocando as animações de exploração/combate. Moradores padrão da Folha ficam em Konoha; outros locais aguardam elencos/contextos confirmados.

Ataques são automáticos; os iniciais possuem jutsu manual com chakra e recarga. Vitória concede XP, moedas e loot; derrota retorna à recuperação. Caçada automática escolhe alvos alcançáveis, recalcula rotas alteradas, descarta caminhos que não chegam ao alcance, detecta falta de movimento e limita a duração da perseguição. Sem inimigos vivos, aguarda respawn.

Durante o combate, clique no chão/minimapa ou use WASD/setas para mover/fugir. O deslocamento suspende os golpes do jogador, mas mantém dano dos inimigos em alcance e sua perseguição. Parar deixa o ninja pronto para atacar automaticamente o alvo selecionado quando ele entrar no alcance, sem novo clique e sem reiniciar a cadência. Selecionar um inimigo também retoma os ataques. Teclado possui ajuste local para deslizar por colisões e alinhar passagens estreitas, respeitando velocidade/obstáculos. [Detalhes](MOVIMENTO_E_PROGRESSAO_DA_CONTA.md).

A seleção da caçada compara o comprimento do percurso navegável até o alcance de ataque, e não apenas distância em linha reta. A cada 500 ms reavalia inimigos vivos; troca o alvo quando economiza pelo menos 24 unidades de percurso e 25% do percurso atual. Um inimigo já em alcance tem prioridade sobre uma perseguição ainda distante. Pequenas oscilações de patrulha não provocam troca, e um alvo inacessível é descartado sem aguardar outro ciclo para avaliar os restantes. Reutiliza caminhos válidos e evita buscar rotas de candidatos cuja distância mínima já não pode melhorar a escolha.

O primeiro golpe acontece no próprio encontro quando o jogador está lutando; os seguintes respeitam a velocidade individual, inclusive ao retomar depois da fuga. O inimigo pode responder após 220 ms de simulação ativa. Mundo aberto não toca vinhetas de início/vitória/derrota. Passos seguem movimento real com intervalo mínimo e um canal, interrompido ao parar ou pausar; continuam durante deslocamento de fuga. Demais ações/vozes e som de nível continuam disponíveis.

A dificuldade vem da área escolhida, não do ID do mapa. Viagens permitem escolher dificuldades de nível 1/5/12/25 e mostram o nível do personagem. Onze modelos inimigos têm perfis próprios de resistência, cadência e comportamento; um dos seis inimigos de cada grupo é elite, identificado por estrela/rótulo dourado e anel. Elites têm recompensas maiores e chance de equipamento limitada por nível/dificuldade. Cura inimiga pode ocorrer até três vezes por encontro. Não inventar portais entre mapas sem dados comprovados.

Máscaras frontais nativas usam transparência recuperada, mas não equivalem a objetos com profundidade individual. Recortes opacos de chão são proibidos. Guia técnico: [MAP_LAYERS.md](MAP_LAYERS.md).

## Progressão e persistência

Loja/mochila com 22 equipamentos, filtros por slot/caminho e comparação de atributos antes da compra/equipamento; cinco missões persistentes; coleção e recrutamento. Caminhos de dano, sobrevivência e chakra têm ganhos e penalidades; graus II/III exigem nível 5/12 do personagem selecionado. Posse dos quatro itens antigos e seus atributos são preservados. Progresso local versionado em folha-idle-v1. Offline limitado conforme src/config/rules.ts, concedido apenas na caçada ativa e gravado antes de mostrar o resumo; continua como estimativa da dificuldade, sem simular perfis/elites/equipamento.

Apenas uma aba controla a jornada por origem/perfil de navegador. A posse é adquirida antes de restaurar/calcular offline e conferida antes de gravar. Outra aba pode usar menu/admin/arena; não pode iniciar uma segunda jornada. Essa proteção local não compartilha saves entre origens.

A entrada exige conta Supabase e perfil com nome de usuário único. A tela inicial oferece login por e-mail/senha, cadastro com nome de usuário/e-mail/senha/confirmação e recuperação. A migração 20261021211745_player_accounts cria perfis isolados por RLS e exige perfil para abrir o save. Contas antigas completam o nome sem perder a jornada. Banco no plano Free validado via SDK e Chrome em 21/10/2026. SMTP/cadastro e recuperação públicos por e-mail e variáveis/deploy da Vercel continuam pendentes. Importação/exportação local foi removida; o progresso é persistido exclusivamente no Supabase e a aba mantém só memória temporária para renderizar e recuperar a GPU. game_open cria a jornada no servidor a partir do personagem escolhido. A interface preserva revisão/idempotência e posse entre dispositivos. Gravações periódicas a cada 30 s; sair/trocar idioma aguarda confirmação. Snapshot sempre não verificado: a economia e o combate PvE permanecem no cliente. Configuração gratuita, SQL, validação e limites em [BACKEND_E_SUPABASE.md](BACKEND_E_SUPABASE.md).

Perda de contexto WebGL interrompe a simulação e reconstrói a cena a partir do snapshot salvo; sem restauração do contexto, usa Canvas. Não conserva um combate parcialmente executado. Retorno da suspensão limpa o delta do loop, sem simular um salto inteiro de combate.

## Interface e qualidade de vida

Combate PvE permite vários inimigos simultâneos, mantendo um alvo para os golpes do jogador. Clique no sprite ou na lista de oponentes para trocar. Vida, cadência e cura são individuais; matar um continua a luta contra os sobreviventes. Inimigos detectam por círculo curto e cone frontal maior, usando os obstáculos da navegação e memória de perseguição. Zonas são invisíveis; `npm run admin` permite mostrá-las pelo console aberto com `'`, usando `debug=true`. O jogo normal não instala esse console. [Regras e limites](COMBATE_E_PERCEPCAO.md).

- Minimapa navegável por clique/teclado; rotas douradas/ciano e alvo destacado no cenário. Recolhimento automático em janela pequena.
- Três conjuntos de equipamentos por personagem, prévia dos atributos, validação completa antes de aplicar e persistência no save.
- Vitória libera exploração após o golpe final (até 700 ms), mantendo a recompensa única e os efeitos de morte/XP. [Detalhes](ESTABILIDADE_E_QOL.md#navegação-e-conjuntos-de-equipamentos).

- Meus personagens com busca, favoritos, ordenação por nível/nome e personagem ativo destacado; acervo/recrutamento em tela separada.
- Viagens com busca por nome/ID, favoritos, último destino e dificuldade da área.
- Estados da caçada, indicação de processamento e motivos de indisponibilidade.
- Resumo da sessão de combate com tempo ativo, vitórias, derrotas, XP/moedas e taxas por minuto; pausa/diálogos não contam como simulação ativa.
- Fonte entre 85–150%, efeitos reduzidos e volumes independentes de música, ambiente e vozes; volume geral e ativação de áudio continuam disponíveis.
- Carregamento progressivo com retry; arte original; áudio sob demanda.
- Minijanela nativa em navegadores/contextos com Document PiP; alternativa interna explícita. Renderizador nunca deve colapsar a 0×0.

## Idiomas

Português brasileiro, inglês e espanhol. No primeiro acesso, usa o primeiro idioma suportado das preferências do navegador; variantes regionais são aceitas. Sem correspondência, usa inglês. Escolha manual persistente tem prioridade. Servidor mantém textos canônicos em português. Catálogos tipados e manutenção em [TRADUCOES.md](TRADUCOES.md).

## Arena e administração

Arena local por turnos com servidor autoritativo, salas por chave, reconexão, chakra, recarga e validação de ações. Modo Nivelado e modo Jornada; este valida a estrutura do snapshot do personagem, sem garantir origem confiável dos atributos. A arena ainda não usa contas Supabase nem resultados persistidos no banco. Sem ranking ou progressão autoritativa do PvE.

Admin autenticado para acervo, revisão, mapas, efeitos, áudio, arquivos e salas. A disponibilidade do frontend na Vercel não implica hospedagem do backend Node.

## Organização e validação

Runtime em public/assets; lógica em src; API em server; conversores em tools; evidências em reports; originais separados. A disponibilidade do acervo depende da máquina: confirmar a raiz antes de extrair.

Uma tarefa pesada por vez, testes seriais e conversão incremental. Verificações desta etapa e seus limites estão em [ESTABILIDADE_E_QOL.md](ESTABILIDADE_E_QOL.md). Não apresentar os históricos como validações novas.
