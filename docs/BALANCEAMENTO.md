# Balanceamento de personagens, inimigos e equipamento

Regras autorais do idle, adicionadas em 21/10/2026. Não reproduzem atributos/regras do Naruto Online. Não alteram arquivos originais, nomes de IDs, posse ou XP já conquistado. Os três iniciais preservam suas bases e jutsus; o Sasuke preto continua reservado e party continua adiada.

## Recrutas

`src/progression/recruit-profiles.ts` associa explicitamente as famílias do catálogo a oito estilos. A cobertura automatizada confere todas as 312 entradas atualmente classificadas como jogáveis com exploração/combate, incluindo iniciais e a variante reservada; isso não concede a variante reservada nem transforma entradas em revisão em recrutáveis. Modelos adicionais da mesma família compartilham o kit; iniciais continuam usando suas configurações específicas. Hinata, Gaara e Kakashi têm ajustes de base por família.

| Estilo | Vantagem | Custo |
| --- | --- | --- |
| Versátil | Base e crescimento equilibrados | Sem especialização dominante |
| Guardião | Vida/resistência, técnica protege o próximo golpe em 35% | Menor velocidade e dano |
| Duelista | Ataques físicos fortes e rápidos | Pouca vida, ninjutsu e chakra |
| Ágil | Cadência e movimento | Menor vida/resistência |
| Especialista em ninjutsu | Técnica escala mais com ninjutsu | Ataque comum e proteção menores |
| Médico | Técnica cura, bom controle/regeneração | Dano e velocidade menores |
| Estrategista | Técnica custa 28 chakra | Vida/força moderadas |
| Combatente pesado | Força, vida e técnica física | Velocidade/chakra menores |

Base, crescimento por nível e tipo/potência/custo da técnica vêm do perfil. Treino e equipamento continuam individuais. Não há sorteio de atributos nem seleção de perfil pelo nome traduzido. Famílias novas precisam de classificação explícita; a suite de cobertura impede adicionar novos recrutáveis sem revisar a tabela. O fallback de estilo versátil é apenas uma proteção de execução para IDs futuros/desconhecidos.

Recrutas passam a ter uma técnica genérica do idle, automática a cada terceiro ataque e também manual com chakra/recarga. Usa ataque básico validado, com texto/valores próprios. Não usa o Rasengan, Chidori ou a cura visual da Sakura nem carrega SP_skill não utilizado do recruta. Os jutsus originais individuais continuam sendo trabalho de recuperação posterior. Técnicas físicas usam resistência física do inimigo; as demais usam resistência a ninjutsu. Cura não passa da vida máxima; proteção consome-se no próximo golpe recebido.

## Inimigos e elites

`src/world/enemy-profiles.ts` configura os onze modelos usados nos mapas atuais. Seis estilos reais, mais o perfil genérico de proteção para modelos adicionais:

- Caçador: lobos, aproximação em raio limitado, ataques rápidos e terceiro golpe forte. Lobo preto tem vida/dano/recompensas maiores que o lobo comum.
- Brutamontes: tigre, mais vida, golpes lentos e pesados, pouca resistência a ninjutsu.
- Assassino: Anbu e caçador da Névoa, cadência rápida e terceiro ataque ignora parte da resistência.
- Blindado: líder Anbu e samurai, maior resistência física; ninjutsu é mais eficaz.
- Conjurador: informação da Névoa, marionetes e longo alcance da Areia; tenta manter distância, resiste a ninjutsu e é vulnerável a ataques físicos.
- Curandeiro: unidade de cura da Areia, tenta manter distância e pode substituir a terceira ação por cura de 8% da vida máxima, até três vezes por encontro.

`EnemyField` aplica velocidade, raio de patrulha e aproximação/recuo sobre a grade nativa. Não atravessa obstáculos, não foge indefinidamente para fora do raio de origem e não muda escala dos sprites. Durante um encontro, o participante permanece parado no ponto de combate. As técnicas inimigas são avisadas nos 300 ms finais da preparação e usam o ataque básico validado; não anunciam recuperação de jutsus originais ausentes.

Cada grupo de seis tem **uma elite**, no sexto slot, com estrela/rótulo dourado e anel no chão. Mantém a condição no respawn. Sobre o perfil do mesmo tipo, recebe 1,8× vida, 1,2× dano, intervalo de ataque 10% menor, +8 em ambas as resistências e 2,5× XP/moedas, com arredondamento. A ficha do alvo informa perfil, vida, resistências, cadência e recompensas.

Elites têm 25% de chance de um equipamento elegível ainda não possuído, quando houver candidato. Grau máximo é limitado **tanto pelo nível do personagem quanto pela dificuldade selecionada**; não é possível farmar equipamento III numa dificuldade inicial usando um personagem avançado. Sem candidato no grau, não há item. Recompensas, registro da sessão e histórico usam os valores efetivamente concedidos, uma única vez por vitória.

## Equipamentos

`src/progression/rules.ts` contém 22 itens: quatro antigos preservados e dezoito novos (nove linhas, em dois graus). Slots continuam weapon/armor/charm. Posse fica no inventário e equipamento fica no progresso individual.

| Caminho | Arma | Armadura | Talismã |
| --- | --- | --- | --- |
| Dano | Lâmina de assalto | Traje de assalto | Talismã da presa |
| Sobrevivência | Bastão do guardião | Armadura do guardião | Talismã da guarda |
| Chakra/técnicas | Foco canalizador | Manto canalizador | Talismã do fluxo |

Grau II: nível 5, 260 moedas por item. Grau III: nível 12, 950 moedas; bônus/penalidades do II multiplicados por 1,8 e arredondados (regeneração mantém uma casa decimal). Os antigos mantêm preço, atributos e IDs.

Os caminhos de dano ganham força/cadência com custos em vida/chakra/resistência; sobrevivência ganha vida/resistência com menor velocidade/dano; chakra ganha ninjutsu, reserva e regeneração com menos dano físico/proteção. Vida, força, chakra e velocidade nunca ficam abaixo dos mínimos seguros por penalidades. Não há compra duplicada. Comprar/equipar exige o nível do personagem selecionado; possuir um item com outro personagem não ignora esse requisito. O modo Jornada da arena valida o requisito no servidor.

Loja/mochila têm filtros por slot e caminho. Prévia compara ataque, vida, chakra, regeneração, dano da técnica, golpes/s, movimento e resistência. Se o item ainda estiver bloqueado, a comparação usa ambos os conjuntos no nível mínimo exigido e informa esse nível. A prévia não concede nível, equipamento nem posse e não altera o save.

## Dificuldades

A dificuldade é independente do fundo/mapa e pode ser escolhida em Viagens, fora de encontro/carregamento:

| Nível mínimo | Dificuldade | Vida/dano base | XP/moedas base |
| --- | --- | --- | --- |
| 1 | Inicial | 52 / 6 | 22 / 8 |
| 5 | Patrulha | 110 / 13 | 48 / 19 |
| 12 | Missão veterana | 330 / 35 | 125 / 48 |
| 25 | Missão de elite | 850 / 80 | 320 / 120 |

Perfis e elites aplicam seus modificadores sobre esses valores. As duas primeiras dificuldades mantêm os números anteriores. Trocar para um personagem de nível inferior reduz a dificuldade conforme os desbloqueios; não aumenta a dificuldade automaticamente ao subir de nível. O estado é salvo. Offline continua sendo a estimativa existente da dificuldade selecionada, sem simular equipamento, perfis ou encontros com elites; o balanceamento específico do offline não pertence a este lote.

## Manutenção e verificação

Entrada em combate revisada em 21/10/2026: o primeiro ataque do jogador acontece no frame do encontro, sem a preparação anterior; golpes seguintes mantêm o intervalo derivado da velocidade. Primeiro ataque inimigo após 220 ms de simulação ativa. Pausa congela o encontro e não repete o golpe de abertura. Essa revisão foi validada com 116 testes de domínio e no navegador para os três iniciais e Guy (`reports/combat-audio-validation.json`); as simulações de balanceamento abaixo pertencem à entrega anterior.

No mundo aberto, as vinhetas de início/vitória/derrota ficam desativadas; ações, vozes e subida de nível mantêm seus próprios sons. Passos alternados seguem deslocamento real (24 px, mínimo 180 ms), um único canal e contato de até 160 ms, sem acumular clipes ao parar/pausar ou abrir diálogos. Os arquivos originais permanecem preservados.

Fechamento em 21/10/2026: passaram 107 testes de domínio e 21 de servidor/assets, verificação das 1.115 chaves nos três idiomas, typecheck e build final. As 2.112 simulações terminaram em vitória ou derrota antes de 60 segundos. Os relatórios de navegador citados abaixo validam também vitória contra elite no desenvolvimento e conjurador/equipamento III no bundle de produção. São amostras de validação, não garantia de equilíbrio perfeito.

As regressões `reports/qol-production-validation.json` e `reports/i18n-browser-validation.json` passaram após o balanceamento, incluindo recuperação real de WebGL, minijanela, troca de personagem, equipamentos, viagem, acessibilidade, idiomas, arena e administração dos 22 itens/cinco missões. A API administrativa passou a importar as regras estaticamente para evitar erro de módulo encerrado no Vite. Servidor temporário e navegadores de teste encerrados; sem deploy.

- Perfis: `src/progression/recruit-profiles.ts`; inimigos: `src/world/enemy-profiles.ts`; fórmulas: `combat-stats.ts`/`model.ts`; itens: `rules.ts`; dificuldades: `src/config/areas.ts`.
- Textos novos em pt-BR/en/es; aliases dos itens completos permitem traduzir também a API administrativa. Não usar nomes traduzidos como chave de balanceamento.
- `tests/balance.test.ts` cobre catálogo, variantes, crescimento, técnicas, cura/proteção, resistência física/ninjutsu, elites, recompensas, níveis, saves e arena.
- `tools/balance-simulation.mjs`: 2.112 combates determinísticos, onze personagens representativos, níveis 1/5/12/25, quatro conjuntos e seis inimigos normais/elites. Relatório `reports/balance-simulation.json`. É uma amostra de combate isolado, não prova de equilíbrio perfeito da economia/caçada contínua.
- `tools/balance-check.mjs`: jogo dev com compra/equipamento, recruta, atributos, dificuldade, combate, save/reload, três idiomas e encontro/vitória reais contra elite. Evidência `reports/balance-browser-validation.json`.
- `tools/balance-production-check.mjs`: mesmos contratos essenciais no bundle compilado, sem atalhos da cena de desenvolvimento. Evidência `reports/balance-production-validation.json`.

Executar em série, uma tarefa pesada por vez. Validar uma mudança de números com simulações e confrontar no navegador; não declarar vantagem de um conjunto somente pelo dano bruto. Dano pode vencer mais rápido e falhar contra elites; sobrevivência troca velocidade por consistência; chakra depende do perfil e da resistência do alvo. A simulação final registrou zero combates acima de 60 segundos após limitar a cura inimiga.
