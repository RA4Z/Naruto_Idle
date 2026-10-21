# Especificação vigente — Caminho da Folha

Este documento descreve o jogo atual e seus contratos. O [pedido original](history/ESPECIFICACAO-ORIGINAL.md) fica preservado como referência de intenção; seus caminhos antigos e funcionalidades futuras não descrevem o estado implementado. Pendências estão no [ROADMAP.md](ROADMAP.md).

## Proposta

Idle RPG para navegador em Phaser/TypeScript, usando recursos visuais/sonoros recuperados de Naruto Online. Regras de progressão e combate são próprias. Originais devem ser preservados; conversores são reproduzíveis e não executam ActionScript.

## Jornada e personagens

Novo jogo permite Naruto 11000101, Sasuke azul/branco 11000211 ou Sakura 11000301. O Sasuke preto 11000201 está reservado; saves antigos recebem a migração correspondente sem perder progresso.

O jogador controla um personagem possuído por vez e pode trocá-lo fora de combate. Nível, XP, treinos e equipamento pertencem a cada personagem; somente o ativo recebe XP online/offline. Party não está disponível nesta versão.

Vitalidade, força, ninjutsu, velocidade, chakra, controle e resistência determinam os valores derivados. Velocidade afeta movimento e intervalo de ataques; limites ficam em src/progression/combat-stats.ts. Recrutas ainda sem configuração própria têm atributos provisórios identificados, sem herdar jutsu de outro modelo.

## Mundo e combate

Há 16 mapas integrados. O jogador anda por clique ou WASD/setas sobre a grade nativa de MapInfo.map. Encontros acontecem por proximidade com linha de passagem válida; combate ocorre no mesmo cenário, trocando as animações de exploração/combate.

Ataques são automáticos; os iniciais possuem jutsu manual com chakra e recarga. Vitória concede XP, moedas e loot; derrota retorna à recuperação. Caçada automática escolhe alvos alcançáveis, recalcula rotas alteradas, descarta caminhos que não chegam ao alcance, detecta falta de movimento e limita a duração da perseguição. Sem inimigos vivos, aguarda respawn.

A dificuldade atual vem da área escolhida, não do ID do mapa. Viagens mostram essa regra e o nível do personagem. Não inventar níveis próprios ou portais entre mapas sem dados/regra implementada.

Máscaras frontais nativas usam transparência recuperada, mas não equivalem a objetos com profundidade individual. Recortes opacos de chão são proibidos. Guia técnico: [MAP_LAYERS.md](MAP_LAYERS.md).

## Progressão e persistência

Loja/mochila com quatro equipamentos e comparação de atributos antes da compra/equipamento; cinco missões persistentes; coleção e recrutamento. Progresso local versionado em folha-idle-v1. Offline limitado conforme src/config/rules.ts, concedido apenas na caçada ativa e gravado antes de mostrar o resumo.

Apenas uma aba controla a jornada por origem/perfil de navegador. A posse é adquirida antes de restaurar/calcular offline e conferida antes de gravar. Outra aba pode usar menu/admin/arena; não pode iniciar uma segunda jornada. Não é sincronização de contas entre IP, localhost, domínios ou dispositivos.

Perda de contexto WebGL interrompe a simulação e reconstrói a cena a partir do snapshot salvo; sem restauração do contexto, usa Canvas. Não conserva um combate parcialmente executado. Retorno da suspensão limpa o delta do loop, sem simular um salto inteiro de combate.

## Interface e qualidade de vida

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

Arena local por turnos com servidor autoritativo, salas por chave, reconexão, chakra, recarga e validação de ações. Modo Nivelado e modo Jornada; este usa snapshot validado do personagem. Sem contas, ranking ou progressão autoritativa do PvE.

Admin autenticado para acervo, revisão, mapas, efeitos, áudio, arquivos e salas. A disponibilidade do frontend na Vercel não implica hospedagem do backend Node.

## Organização e validação

Runtime em public/assets; lógica em src; API em server; conversores em tools; evidências em reports; originais separados. A disponibilidade do acervo depende da máquina: confirmar a raiz antes de extrair.

Uma tarefa pesada por vez, testes seriais e conversão incremental. Verificações desta etapa e seus limites estão em [ESTABILIDADE_E_QOL.md](ESTABILIDADE_E_QOL.md). Não apresentar os históricos como validações novas.
