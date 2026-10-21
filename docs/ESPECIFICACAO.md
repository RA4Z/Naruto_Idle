# Especificação vigente — Caminho da Folha

Este documento descreve o jogo atual e seus contratos. O [pedido original](history/ESPECIFICACAO-ORIGINAL.md) fica preservado como referência de intenção; seus caminhos antigos e funcionalidades futuras não descrevem o estado implementado. Pendências estão no [ROADMAP.md](ROADMAP.md).

## Proposta

Idle RPG para navegador em Phaser/TypeScript, usando recursos visuais/sonoros recuperados de Naruto Online. Regras de progressão e combate são próprias. Originais devem ser preservados; conversores são reproduzíveis e não executam ActionScript.

## Jornada e personagens

Novo jogo permite Naruto 11000101, Sasuke azul/branco 11000211 ou Sakura 11000301. O Sasuke preto 11000201 está reservado; saves antigos recebem a migração correspondente sem perder progresso.

O jogador controla um personagem possuído por vez e pode trocá-lo fora de combate. Nível, XP, treinos e equipamento pertencem a cada personagem; somente o ativo recebe XP online/offline. Party não está disponível nesta versão.

Vitalidade, força, ninjutsu, velocidade, chakra, controle e resistência determinam os valores derivados. Velocidade afeta movimento e intervalo de ataques; limites ficam em src/progression/combat-stats.ts. Recrutas têm perfis por família em oito estilos, crescimento próprio e técnicas genéricas autorais, sem herdar jutsu de outro modelo. A tabela cobre os recrutáveis atuais com exploração/combate. Detalhes em [BALANCEAMENTO.md](BALANCEAMENTO.md).

## Mundo e combate

Há 16 mapas integrados. O jogador anda por clique ou WASD/setas sobre a grade nativa de MapInfo.map. Encontros acontecem por proximidade com linha de passagem válida; combate ocorre no mesmo cenário, trocando as animações de exploração/combate.

Ataques são automáticos; os iniciais possuem jutsu manual com chakra e recarga. Vitória concede XP, moedas e loot; derrota retorna à recuperação. Caçada automática escolhe alvos alcançáveis, recalcula rotas alteradas, descarta caminhos que não chegam ao alcance, detecta falta de movimento e limita a duração da perseguição. Sem inimigos vivos, aguarda respawn.

A dificuldade vem da área escolhida, não do ID do mapa. Viagens permitem escolher dificuldades de nível 1/5/12/25 e mostram o nível do personagem. Onze modelos inimigos têm perfis próprios de resistência, cadência e comportamento; um dos seis inimigos de cada grupo é elite, identificado por estrela/rótulo dourado e anel. Elites têm recompensas maiores e chance de equipamento limitada por nível/dificuldade. Cura inimiga pode ocorrer até três vezes por encontro. Não inventar portais entre mapas sem dados comprovados.

Máscaras frontais nativas usam transparência recuperada, mas não equivalem a objetos com profundidade individual. Recortes opacos de chão são proibidos. Guia técnico: [MAP_LAYERS.md](MAP_LAYERS.md).

## Progressão e persistência

Loja/mochila com 22 equipamentos, filtros por slot/caminho e comparação de atributos antes da compra/equipamento; cinco missões persistentes; coleção e recrutamento. Caminhos de dano, sobrevivência e chakra têm ganhos e penalidades; graus II/III exigem nível 5/12 do personagem selecionado. Posse dos quatro itens antigos e seus atributos são preservados. Progresso local versionado em folha-idle-v1. Offline limitado conforme src/config/rules.ts, concedido apenas na caçada ativa e gravado antes de mostrar o resumo; continua como estimativa da dificuldade, sem simular perfis/elites/equipamento.

Apenas uma aba controla a jornada por origem/perfil de navegador. A posse é adquirida antes de restaurar/calcular offline e conferida antes de gravar. Outra aba pode usar menu/admin/arena; não pode iniciar uma segunda jornada. Essa proteção local não compartilha saves entre origens.

Integração opcional de contas e snapshots Supabase implementada, com ativação remota pendente por bloqueio do gateway. Conta e nuvem no menu oferece cadastro/login/recuperação, importação explícita sem substituir save existente, backup/exportação, revisão/idempotência e posse entre dispositivos. Gravações periódicas a cada 30 s; sair/trocar idioma aguarda confirmação. Snapshot sempre não verificado: a economia e o combate PvE permanecem no cliente. Configuração gratuita, SQL, validação e limites em [BACKEND_E_SUPABASE.md](BACKEND_E_SUPABASE.md).

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

Arena local por turnos com servidor autoritativo, salas por chave, reconexão, chakra, recarga e validação de ações. Modo Nivelado e modo Jornada; este valida a estrutura do snapshot do personagem, sem garantir origem confiável dos atributos. A arena ainda não usa contas Supabase nem resultados persistidos no banco. Sem ranking ou progressão autoritativa do PvE.

Admin autenticado para acervo, revisão, mapas, efeitos, áudio, arquivos e salas. A disponibilidade do frontend na Vercel não implica hospedagem do backend Node.

## Organização e validação

Runtime em public/assets; lógica em src; API em server; conversores em tools; evidências em reports; originais separados. A disponibilidade do acervo depende da máquina: confirmar a raiz antes de extrair.

Uma tarefa pesada por vez, testes seriais e conversão incremental. Verificações desta etapa e seus limites estão em [ESTABILIDADE_E_QOL.md](ESTABILIDADE_E_QOL.md). Não apresentar os históricos como validações novas.
