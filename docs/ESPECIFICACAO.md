Você é meu parceiro de desenvolvimento. Quero que você analise os arquivos locais de Naruto Online, identifique e extraia os recursos visuais disponíveis e crie uma base jogável de um novo Idle RPG em Phaser.

O foco é aproveitar os **assets** encontrados, como personagens, animações, cenários, mapas, inimigos, efeitos, ícones, interfaces e sons. **As regras e os sistemas do Naruto Online não devem ser reproduzidos:** criaremos um jogo novo, com progressão e combate próprios.


- Pasta onde o projeto Phaser deve ser criado: D:\Naruto Idle\Naruto Idle RPG

Trabalho em Windows. Considere caminhos com espaços, arquivos grandes e a possibilidade de o material estar organizado em pastas, pacotes, arquivos SWF ou cache.

Se os arquivos ainda não estiverem na pasta indicada, informe claramente o que está faltando e deixe preparado tudo que puder ser feito sem eles. Não invente que encontrou ou extraiu recursos.

## Visão do jogo

Quero criar um **Idle RPG de Naruto para navegador**, inspirado na ideia geral de hunts, evolução, coleta de recursos e progresso automático de jogos como Poke Idle World.

O jogador escolherá um personagem inicial entre:

- Naruto;
- Sasuke;
- Sakura.

Cada um deverá ter seus próprios recursos visuais de exploração e de combate, se estiverem disponíveis nos arquivos.

O ciclo principal desejado é:

1. O jogador escolhe um dos três personagens.
2. Entra em um mapa com inimigos.
3. O personagem usa sua versão de **exploração/mundo aberto** para caminhar automaticamente pelo mapa.
4. Ao encontrar um inimigo, o combate começa **na posição do mapa onde o encontro aconteceu**.
5. Os participantes passam a usar suas respectivas versões e animações de **combate**, caso existam.
6. O combate acontece automaticamente, com ataques, habilidades, efeitos e indicadores visuais.
7. Ao vencer, o jogador recebe XP, moeda e possíveis itens.
8. A batalha termina, o personagem volta à sua versão de exploração e continua a caçada.
9. O jogador sobe de nível, melhora seu personagem e desbloqueia novas áreas com o tempo.

Quero que seja gostoso de assistir: o personagem deve realmente caminhar pelo mapa e as batalhas automáticas devem parecer vivas e caprichadas. **Não quero uma tela estática de números, nem que toda batalha abra uma tela separada com outro cenário.**

O jogo de Pokémon é uma referência para o ciclo idle e para a organização por áreas de caça. A transição entre exploração e combate no mesmo ponto do mapa é uma característica específica que quero neste projeto.

## 1. Primeiro: investigar os arquivos

Antes de escolher um método de extração ou uma arquitetura definitiva, faça uma inspeção real dos arquivos locais.

- Liste as pastas e identifique tipos, quantidades e tamanhos dos arquivos relevantes.
- Inspecione assinaturas e formatos quando a extensão não for suficiente.
- Procure arquivos relacionados a personagens, exploração, combate, cenários, inimigos, habilidades, efeitos, interfaces, ícones, fontes e áudio.
- Verifique se existem arquivos Flash `.swf`, imagens, sequências de quadros, atlas, dados de animação, esqueletos, arquivos de mapas ou pacotes.
- Investigue se o material parece estar completo ou se há indícios de arquivos ausentes ou carregados separadamente.
- Identifique se Naruto, Sasuke e Sakura possuem versões distintas para exploração e combate, sem presumir nomes ou formatos.
- Analise como os mapas são compostos: imagens inteiras, blocos, camadas, objetos ou outro formato.
- Faça uma amostragem visual para identificar conteúdo que tenha nomes genéricos ou IDs.
- Procure possíveis metadados de animação: posição, ponto de origem, direção, duração de quadros, escala, transparência e camadas.

Não execute arquivos desconhecidos apenas para inspecioná-los. Não altere nem apague os arquivos originais. Trabalhe em cópias ou em uma pasta de saída separada.

Crie um relatório com:

- O que foi encontrado e onde;
- Quantidade de arquivos por tipo;
- O que aparenta estar completo ou ausente;
- Formatos reconhecidos e possíveis ferramentas para leitura;
- Recursos que já podem ser usados;
- Recursos que precisam de conversão ou reconstrução;
- Obstáculos e dúvidas reais.

Se algo estiver criptografado, protegido, incompleto ou em formato desconhecido, registre o bloqueio com precisão. Não afirme que conseguiu acessar algo que não conseguiu.

## 2. Extração e organização dos recursos

Quero que você tente inventariar e extrair **o máximo possível dos assets disponíveis localmente**, não apenas os usados no primeiro mapa.

Isso inclui, quando encontrados:

- Personagens em versão de exploração;
- Personagens em versão de combate;
- Animações de parado, caminhada, ataque, habilidade, dano, derrota e outras existentes;
- Inimigos e NPCs;
- Cenários, mapas, elementos de chão, construções e objetos;
- Efeitos de combate, partículas e habilidades;
- Ícones, itens, retratos e elementos de interface;
- Músicas e efeitos sonoros;
- Dados auxiliares necessários para reconstruir animações e mapas.

Use ferramentas apropriadas ao formato encontrado. Para SWF, avalie o uso do **JPEXS Free Flash Decompiler** ou outra ferramenta adequada e documente a versão e os comandos usados. Não presuma que exportar um SWF gerará automaticamente uma animação pronta para Phaser.

Organize a saída de maneira compreensível, por exemplo:

```text
assets-extraidos/
  personagens/
    exploracao/
    combate/
  inimigos/
  mapas/
  efeitos/
  interface/
  itens/
  audio/
  outros/
  manifestos/
```

A estrutura exata pode ser ajustada ao que realmente for encontrado.

Para cada recurso, registre em um manifesto, quando possível:

- Arquivo de origem e identificador interno;
- Caminho dos arquivos extraídos;
- Categoria e personagem associado, se identificável;
- Tipo de animação;
- Número de quadros e duração/FPS, quando conhecidos;
- Dimensões e transparência;
- Ponto de origem ou offsets;
- Direção;
- Dependências;
- Estado da conversão: pronto, parcial, não identificado ou bloqueado.

Preserve os nomes originais ou seus IDs no manifesto, mesmo que crie nomes mais legíveis. Use hashes para detectar duplicatas, mas não descarte versões que pareçam semelhantes e possam ter diferenças relevantes.

Gere, quando possível, **pré-visualizações ou folhas de contato** para facilitar a identificação visual. Evite transformar milhares de arquivos em um processo manual sem necessidade: crie scripts reproduzíveis e execute a extração em lotes quando for possível.

### Sobre animações e mapas

Se as animações forem compostas por partes, vetores, linhas do tempo, máscaras ou efeitos, preserve os dados disponíveis e documente o que seria necessário para reconstruí-las. Para o protótipo, converta ou reconstrua primeiro um conjunto pequeno e funcional.

Quando apropriado, gere spritesheets ou atlas para o Phaser, preservando:

- Transparência;
- Sequência e duração dos quadros;
- Alinhamento e ponto de origem;
- Escala coerente;
- Direções disponíveis;
- Qualidade visual adequada.

Não prometa fidelidade exata quando dados estiverem ausentes. Registre o que foi efetivamente validado.

Para mapas, preserve camadas e dimensões quando possível. Se os dados de colisão não estiverem disponíveis, crie uma configuração própria simples e identificada como tal.

## 3. Criar o projeto Phaser

Crie um projeto executável com:

- **Phaser e TypeScript**;
- Ferramentas de desenvolvimento e build adequadas;
- Estrutura clara para cenas, entidades, animações, mapas, combate, inventário e persistência;
- Arquivos de configuração de personagens, inimigos, mapas, itens e habilidades separados da lógica principal;
- Um carregador de assets guiado por manifesto;
- Instruções claras para instalar, executar e gerar a versão de produção.

Antes de instalar dependências, verifique o ambiente disponível. Escolha versões compatíveis e registre-as no projeto.

Não tente converter todo o código original do Naruto Online. O código do nosso jogo deve ser novo e voltado ao ciclo idle descrito aqui. Se algum comportamento visual depender de dados do jogo original, use esses dados apenas na medida necessária para entender ou reproduzir a apresentação do asset.

## 4. Tela inicial e escolha de personagem

Crie uma tela inicial com a opção **Novo jogo** e uma tela de seleção entre Naruto, Sasuke e Sakura.

Cada opção deve mostrar, quando disponível:

- Nome e retrato;
- Uma prévia do personagem;
- Uma descrição curta;
- Um estilo de combate inicial próprio.

As diferenças de jogo podem ser simples e configuráveis, por exemplo:

- Naruto: ataques equilibrados;
- Sasuke: ataque e velocidade;
- Sakura: resistência e recuperação.

Essas são sugestões iniciais de design, não precisamos copiar atributos ou regras do Naruto Online.

Ao escolher, o jogador entra na primeira área e a escolha é salva.

Se algum dos três personagens não tiver um asset utilizável, mantenha-o selecionável com um marcador visual claramente identificado como provisório. Não use outro personagem fingindo que é o correto.

## 5. Exploração automática no mapa

O personagem deve aparecer no mapa usando sua versão **mundo aberto/exploração**.

Implemente uma primeira área de caça com:

- Um mapa real extraído, se houver um utilizável;
- Caso contrário, um mapa provisório claramente identificado;
- Movimentação automática entre pontos válidos;
- Animação de caminhada adequada à direção, quando disponível;
- Limites do mapa e obstáculos simples;
- Inimigos aparecendo em posições válidas;
- Encontro por proximidade entre personagem e inimigo;
- Botão para iniciar ou pausar a caçada.

A movimentação deve ser visualmente agradável e suficiente para demonstrar o loop. Não precisa implementar um mundo inteiro ou um sistema complexo de navegação nesta primeira versão.

## 6. Transição para o combate no mesmo lugar

Este é um dos requisitos mais importantes.

Quando o personagem encontrar um inimigo:

- Registre a posição do encontro no mapa.
- Pare a movimentação automática dos participantes.
- Mantenha o mesmo mapa e a mesma região da câmera visíveis.
- Troque suavemente a versão de exploração pela versão de combate do personagem, se encontrada.
- Apresente o inimigo usando sua versão de combate, se disponível.
- Posicione ambos de forma legível ao redor do ponto do encontro, respeitando o espaço disponível.
- Use escala, ponto de origem e posicionamento configuráveis para evitar que os personagens pulem ou flutuem visualmente.
- Reproduza o combate diretamente sobre o cenário, sem carregar uma tela de batalha separada.

Pode haver um pequeno ajuste visual de câmera ou posicionamento para que a luta fique bonita, mas ela deve parecer acontecer no local onde o encontro começou.

Ao terminar:

- Exiba o resultado e as recompensas.
- Remova ou atualize o inimigo conforme necessário.
- Troque o personagem de volta para sua versão de exploração.
- Preserve sua posição de forma coerente.
- Retome a movimentação e a busca por outro inimigo.

Implemente os estados e transições de forma explícita, por exemplo: `explorando`, `iniciando combate`, `combatendo`, `recompensas` e `retomando exploração`. Trate pausas e reinícios para evitar encontros duplicados ou personagens presos.

## 7. Combate automático

Crie um sistema simples, novo e independente das regras do Naruto Online:

- Ataques automáticos em intervalos configuráveis;
- Pelo menos uma habilidade especial automática para o personagem inicial, se houver animação adequada;
- Vida para personagem e inimigo;
- Dano calculado pelo nosso próprio sistema;
- Animações de ataque, impacto e dano quando disponíveis;
- Barras de vida legíveis;
- Números de dano discretos;
- Efeitos e sons quando encontrados e utilizáveis;
- Vitória e derrota com consequências claras;
- Retorno à caçada após uma vitória.

Priorize uma apresentação agradável, com boa temporização e efeitos moderados. Não use telas piscando excessivamente nem efeitos tão grandes que escondam os personagens.

Não invente que uma animação foi extraída: se ela não existir ou não estiver pronta, use uma solução provisória e registre isso no relatório.

## 8. XP, loot e progressão

Implemente uma base funcional e configurável para:

- XP por inimigo derrotado;
- Níveis e uma fórmula simples de progressão;
- Moeda;
- Tabela simples de drops com chance e quantidade;
- Inventário inicial;
- Melhorias básicas de atributos;
- Pelo menos uma área de caça inicial;
- Estrutura para futuras áreas com requisitos de nível, tipos de inimigo e tabelas de loot diferentes.

Mostre na interface:

- Personagem escolhido e nível;
- Vida e progresso de XP;
- Área atual;
- Quantidade de moeda;
- Últimos drops;
- Número de inimigos derrotados;
- Controles de iniciar e pausar a caçada.

Se viável, inclua uma área de resumo da sessão com duração, XP, moeda, drops e derrotas. Esses indicadores são inspirados no tipo de informação útil para hunts idle; não precisamos copiar a interface do jogo de Pokémon.

## 9. Salvamento e progresso offline

Para a primeira versão:

- Salve localmente a escolha de personagem, nível, XP, moeda, inventário, área e configurações.
- Inclua uma versão do formato de salvamento.
- Ao retornar, calcule uma recompensa offline **simples e limitada**, com base no horário salvo e em regras configuráveis.
- Mostre ao jogador um resumo das recompensas recebidas.
- Garanta que atualizar a página repetidamente não duplique recompensas.

Deixe claro no projeto que esse cálculo local é apenas para protótipo e que o relógio e o salvamento local podem ser manipulados.

Projete os sistemas de forma que, em uma fase posterior, possamos mover o progresso e as regras importantes para um servidor.

## 10. Preparação para o jogo online

No futuro, quero contas, ranking e interação entre jogadores. Estruture o projeto para facilitar:

- Autenticação;
- Progresso salvo em banco;
- Recompensas calculadas no servidor;
- Ranking;
- PvP assíncrono;
- Guildas e outras interações futuras.

Para esta primeira entrega, **não é obrigatório publicar o jogo nem contratar serviços**. Não finja que há multiplayer real se ele ainda não estiver implementado. Se necessário, use interfaces para separar a lógica do protótipo local de uma futura implementação de servidor.

## 11. Qualidade e validação

Depois de implementar a base:

- Rode a instalação, a verificação de tipos e o build.
- Inicie o projeto localmente e teste o fluxo completo no navegador, se o ambiente permitir.
- Verifique escolha dos três personagens.
- Verifique caminhada, encontro, troca para combate no mesmo mapa, vitória, loot e retorno à caminhada.
- Verifique derrota, pausa e retomada.
- Verifique salvamento, recarga da página e recompensa offline.
- Verifique que o inventário e o manifesto não apontam para arquivos inexistentes.
- Observe visualmente escala, alinhamento, transparência e fluidez das animações.
- Corrija os problemas encontrados e apresente o que não foi possível validar.

Não use testes que apenas confirmem valores fixos da implementação. Priorize testes que detectem falhas reais, como recompensas duplicadas, estados travados ou perda de progresso.

## 12. Entregáveis

Ao final, quero receber:

1. Um projeto Phaser executável com uma primeira versão jogável do ciclo de auto farm.
2. Os recursos extraídos e organizados, dentro das possibilidades dos arquivos fornecidos.
3. Manifestos e relatórios que permitam identificar origem, conversão e recursos ainda não aproveitados.
4. Scripts e instruções para reproduzir ou continuar a extração.
5. Um `README` em português explicando como instalar, rodar, testar, adicionar assets e gerar a build.
6. Uma lista clara do que está funcionando, do que usa elementos provisórios e do que ficou bloqueado.
7. Os próximos passos recomendados para melhorar a fidelidade das animações, adicionar mapas e preparar o jogo online.

**Critério de conclusão:** escolher um inicial, caminhar automaticamente, encontrar um inimigo, ver uma batalha automática acontecer naquele ponto do mapa, ganhar XP e loot, retornar à exploração e recuperar o progresso após recarregar.

Caso os arquivos disponíveis não permitam usar os assets reais em alguma parte, entregue o ciclo funcionando com marcadores provisórios, documente a limitação e continue o trabalho de extração que for possível. Não esconda limitações nem descreva recursos provisórios como se fossem extraídos.