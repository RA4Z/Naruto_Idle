# Caminho da Folha — Idle RPG

Protótipo local de um jogo **novo**, em Phaser 3 e TypeScript. As regras de combate, progressão, drops e progresso offline são próprias. Os arquivos ActionScript do jogo anterior não são usados como motor ou regras deste projeto.

## Jogar

Requisitos usados nesta máquina: Windows, Node.js **24.14.1**, npm **11.11.0**. Versões do projeto: Phaser **3.90.0**, TypeScript **5.9.3**, Vite **7.1.12**. O `package-lock.json` fixa as dependências da instalação validada.

```powershell
Set-Location -LiteralPath 'D:\Naruto Idle\Naruto Idle RPG'
npm ci
npm run dev -- --port 5178
```

Abra **http://127.0.0.1:5178/**. Não abra `index.html` diretamente pelo Explorador: o carregamento dos módulos e assets precisa do servidor local.

Escolha **Novo jogo**, depois Naruto, Sasuke ou Sakura. A jornada começa na Vila da Folha, um lobby seguro. Viaje para iniciar uma caçada opcional. Use **Pausar caçada** para congelar exploração ou combate. O botão de treino custa 25 moedas. A patrulha avançada é liberada no nível 5 e usa o mesmo cenário nesta versão.

O botão **Continuar jornada** recupera a escolha, nível, XP, moedas, inventário, área, melhorias e configurações do navegador. Um novo jogo pede confirmação antes de substituir o progresso existente.

## O que funciona

- Seleção dos três iniciais com retratos reais e atributos próprios.
- Caminhada automática com as versões de exploração, oito direções e temporização recuperada dos SWFs.
- Encontro por proximidade e máquina de estados explícita.
- Troca para a versão de combate no mesmo ponto do mapa, sem trocar de cena.
- Ataques automáticos e habilidade a cada três ataques; Sakura também recupera vida.
- Barras de vida, números de dano, efeitos moderados, vitória, derrota e recuperação.
- XP, níveis, moedas, drop de fragmentos, inventário, treino e área avançada.
- Retorno à exploração após o combate.
- Resumo da sessão, histórico de encontros e drops.
- Salvamento local versionado e recompensa offline limitada a duas horas. O cálculo é gravado antes de mostrar o resumo, para não pagar o mesmo intervalo novamente.

**O progresso é um protótipo local:** relógio e localStorage podem ser manipulados. O PvE e sua progressão ainda usam localStorage. A arena agora possui um servidor autoritativo próprio para duelos; não há contas, ranking ou guildas. O modo Nivelado usa atributos fixos; o modo Jornada importa nível, treinos e equipamentos do save local para amistosos.

## Assets reais e elementos provisórios

| Elemento | Situação |
| --- | --- |
| Naruto, Sasuke e Sakura | IDs básicos 11000101, 11000201 e 11000301; identificados por amostragem visual, com pistas dos XMLs de NPC |
| Exploração dos iniciais | 16 ações por personagem: oito paradas e oito caminhadas; direções conferidas visualmente |
| Combate dos iniciais | SWFs próprios, com idle, ataque e ações especiais; limitações por ação no manifesto |
| Primeiro cenário | Fundo do mapa 10001 recomposto de 144 blocos; não inclui toda a animação das camadas superiores |
| Caminho e colisão | Grade original MapInfo.map, projeção isométrica e caminhos sobre células transitáveis |
| Inimigos e NPCs | Modelos originais recuperados; biblioteca com busca, funções por capacidade e pendências sinalizadas |
| Jutsus dos iniciais | Efeitos originais de Rasengan, Chidori e Cura ligados aos IDs de configuração e adaptados ao espaço/cadência do protótipo |
| Sons dos iniciais | 61 MP3 originais de 27 pacotes, com tempos/camadas recuperados; volume e música opcionais |
| Fontes | Fontes do sistema, sem dependência de Google Fonts |

Os atlas usam transparência e um ponto de chão comum. O conversor preserva a duração dos quadros, offsets, espelhamento, escala, rotação e alpha reconhecidos. A tela de cada quadro é 320×256, com origem `(160,210)`; ações que excedem esses limites são marcadas como parciais. Referências externas (`extname`) também ficam registradas como limitações. **Não há promessa de fidelidade exata para todas as 183 sequências geradas.** As animações básicas de exploração, idle de combate e primeiro ataque foram verificadas no protótipo. Os efeitos dos três iniciais agora têm um pipeline separado de recuperação e apresentação, descrito em `reports/ENTITY-INTEGRATION.md`. A coreografia e a duração foram adaptadas ao protótipo.

## Biblioteca e relatórios

Os 57.421 originais do manifesto foram inventariados e processados em lote. Nenhum original foi alterado ou apagado. A origem fica em `D:\Naruto Idle\Naruto_Idle\recovered-web\cdn`; o novo projeto possui cópias organizadas em `assets-extraidos`.

A extração encontrou **269.962 imagens embutidas** e **5.560 MP3 embutidos**, além dos arquivos de imagem e áudio que já eram independentes. Foram registradas **343.719 saídas** na extração geral e **1.795 grupos de originais com hashes idênticos**. As versões foram preservadas, sem descartar duplicatas.

- `reports/inventory-summary.json`: quantidades por extensão e agrupamento de caminhos.
- `reports/character-evidence.json`: nomes/IDs observados nos XMLs. Alguns nomes de NPC não correspondem ao retrato; use a folha visual como verificação, não apenas o texto.
- `reports/portraits.jpg`: folha de contato com IDs originais.
- `reports/library-summary.json`: cobertura, saídas e bloqueios da extração.
- `reports/media-summary.json`: catálogo detalhado de mídias e duplicatas, gerado pelo script correspondente.
- `assets-extraidos/manifestos/inventory.json`: origem, versão, categoria e estado inicial dos 57.421 recursos.
- `assets-extraidos/manifestos/library-extraction.jsonl`: resultados por original, hashes, saídas, tags complexas e avisos. A última entrada por origem é a mais recente.
- `assets-extraidos/manifestos/media.jsonl`: dimensões, canais de transparência, hashes, IDs internos e referência ao original de cada mídia catalogada.
- `assets-extraidos/manifestos/duplicates.json` e `media-duplicates.json`: duplicatas exatas, sem apagar arquivos.
- `public/assets/manifest.json`: assets preparados para a primeira área.
- `public/assets/animations.json`: ações, FPS, quadros, origem e limitações dos atlas dos iniciais.
- `assets-extraidos/mapas/10001`: XMLs originais descomprimidos das camadas do mapa.

Dois JPGs têm **zero bytes na origem**: `assets/rumorPlot/plotimg/214315.jpg` e `213065.jpg`. Não foi possível extrair imagem deles. O arquivo `assets/user/userHead.bmp` tem conteúdo SWF, reconhecido por assinatura, e foi preservado e tratado como tal.

Os SWFs da biblioteca são classificados como **parciais** mesmo quando imagens/áudio foram extraídos: exportar bitmaps não reconstrói automaticamente linhas do tempo, máscaras, vetores, fontes, blend modes, esqueletos ou dependências externas. XMLs de ações e dados binários embutidos foram preservados. Valores desconhecidos de personagem, direção, animação, duração ou origem ficam nulos no catálogo geral; o FPS da linha do tempo de origem não é apresentado como se cada bitmap fosse uma animação pronta.

## Reproduzir a preparação

Python **3.12** e Pillow **12.2.0** foram usados. Não se executam arquivos desconhecidos nem ActionScript.

```powershell
python -m pip install Pillow==12.2.0
python tools\prepare_assets.py --source 'D:\Naruto Idle\Naruto_Idle' --output 'D:\Naruto Idle\Naruto Idle RPG'
python tools\swf_atlas.py
python tools\extract_library.py --workers 6
python tools\extract_library.py --retry-blocked --workers 6
python tools\summarize_library.py
python tools\catalogue_media.py
python tools\validate-assets.py
```

`extract_library.py` tem retomada por origem registrada e aceita `--limit N` para lotes menores. A decodificação da camada externa foi baseada na função `util/decryptSWF.as` observada no carregador. O script também reconhece SWF CWS/zlib e ZWS/LZMA. As imagens/MP3/XML/binary data são copiados ou extraídos estaticamente; formatos complexos continuam identificados no registro.

O **JPEXS Free Flash Decompiler 26.4.0**, com Java portátil 17, foi avaliado e usado para inspeção de tags, símbolos e teste de exportação. O comando `-export sprite,symbolClass` no SWF de exploração de Naruto exportou símbolos, mas **não** gerou uma caminhada pronta: as poses são bitmaps relacionados por XML/AMF, e foi necessário o conversor específico.

Exemplo reproduzível, usando as ferramentas já presentes na pasta de recuperação:

```powershell
& '..\Naruto_Idle\tools\jre17\jdk-17.0.20.1+1-jre\bin\java.exe' -jar '..\Naruto_Idle\tools\ffdec\ffdec.jar' -dumpSWF 'assets-extraidos\personagens\exploracao\naruto\11000101.swf'
```

## Código e novas configurações

- `src/main.ts`: apresentação Phaser, carregamento dos atlas, seleção, mapa, entidades e interface.
- `src/model.ts`: estados de caça, combate, progressão, persistência e offline, sem dependência de Phaser.
- `src/config/characters.ts`: personagens e atributos iniciais.
- `src/config/areas.ts`: áreas, requisitos, recompensas e rota própria.
- `src/config/items.ts`: tabela de drops.
- `src/config/rules.ts`: intervalos, habilidades e limites offline.
- `src/server-contracts.ts`: interfaces para uma futura implementação autoritativa.

Para adicionar um personagem, identifique sua origem visual primeiro, prepare os SWFs de exploração/combate e gere um manifesto de ações. O carregador usa os nomes `idle_0..7`, `run_0..7`, `C_idle`, `A_1hit`, `SP_skill1` e `C_dead` quando disponíveis. Atualize a configuração e valide as referências antes de executar. Não use o ID de outro personagem como substituição silenciosa.

## Testar e gerar produção

```powershell
npm run typecheck
npm test
npm run build
npm run preview -- --port 4173
```

A build está em `dist`. O pacote Phaser gera um aviso de tamanho de chunk; a build conclui, e o motor está separado do código do jogo. Não houve publicação externa.

Com o servidor de desenvolvimento na porta 5178 e Chrome instalado no caminho padrão:

```powershell
node tools\browser-check.mjs
node tools\browser-edge-check.mjs
```

Os testes do navegador usam um contexto separado: não modificam o progresso do navegador que você usar para jogar. O ponto de inspeção `__idle` só existe em modo de desenvolvimento. Os relatórios e capturas ficam em `reports`.

Foram validados os três iniciais, movimentação, pausa, encontro, manutenção da cena e posição do encontro, vitória, retorno à exploração e salvamento/recarga. Os testes adicionais verificaram pausa em combate, derrota/recuperação, resumo offline e ausência de pagamento duplicado. Cinco testes de domínio cobrem progressão e essas transições. A checagem de assets encontrou 187 referências existentes e nenhuma ausente.

## Próximos passos

1. Integrar inimigos reais identificados, começando por poses simples de exploração e combate.
2. Resolver os efeitos externos e aumentar dinamicamente os limites dos atlas para ações amplas.
3. Reconstruir as camadas superiores do mapa, máscaras e regiões navegáveis, com revisão visual.
4. Selecionar áudio real por conteúdo e metadados, sem atribuir sons arbitrários às habilidades.
5. Ampliar tabelas de loot por área, equipamentos e variedade de inimigos.
6. Mover regras e recompensas para um servidor antes de contas, ranking, PvP ou progresso competitivo.

A especificação fornecida foi preservada em `docs/ESPECIFICACAO.md`. O esboço inicial é um protótipo funcional com limitações explícitas, não uma reconstrução completa do Naruto Online.

## Continuação agendada

O ciclo jogável já está validado, mas a extração geral ainda não inclui todas as imagens Lossless embutidas: o inventário registrou 178.637 tags DefineBitsLossless2 e 88 DefineBitsLossless, além de vetores e linhas do tempo complexas preservados nos SWFs. Esses números são ocorrências de tags, não uma contagem de novos arquivos únicos.

A automação **Concluir esboço Naruto Idle RPG** foi criada nesta conversa, ativa a cada cinco horas, para continuar as conversões viáveis e os refinamentos restantes, consultando a cota real e mantendo o ponto de continuidade. Ela continua conforme docs/ROADMAP.md e não deve ser desativada apenas por concluir o esboço inicial. Não se exige fidelidade 1:1 de todo o jogo. Mantenha o computador ligado e o app aberto para as retomadas locais.

## Revisão de cenário e proporções

A câmera usa zoom fixo 3,1 e acompanha a exploração livre pela grade nativa. O personagem tem proporção menor em relação aos prédios, com escalas fixas por rig e uma referência de altura comum nos três iniciais. Corrida agachada muda a silhueta original, sem reduzir progressivamente a escala. O alvo permanece no chão da rua durante o combate. A navegação permite percorrer o componente transitável principal dos quatro mapas integrados.

O fundo preserva os 3072×3072 pixels dos blocos recuperados. O canvas ocupa o espaço real da janela, sem faixas internas ou redução CSS quando o diário cresce. Detalhes, limites e evidências em `reports/SCENE-REFINEMENT.md`, `scene-validation.json` e `viewport-validation.json`.

Verificações adicionais: `node tools/scene-check.mjs` percorre ida/volta com os três iniciais; `node tools/viewport-check.mjs` confere desktop, janela estreita, celular e redimensionamento de retorno.

## Biblioteca de personagens e apresentação

Durante a jornada, **Personagens da vila** abre a biblioteca de 1.466 IDs recuperados. Busque por nome/ID e escolha **Adicionar à vila**, **Acompanhar** ou **Enfrentar**, conforme as animações disponíveis. Os três iniciais continuam sendo as opções jogáveis; a biblioteca amplia NPCs, companheiros de caminhada e adversários. Escolhas são salvas. Recursos incompletos ficam identificados, sem substituir animações ausentes por outro personagem.

Os iniciais estão em `public/assets/characters/naruto-kid/`, `sakura-kid/` e `sasuke-kid/`, cada um com `portrait.png`, `world/`, `battle/` e `manifest.json`. A pasta `characters/` contém somente modelos identificados com o padrão de caminhada e combate dos iniciais. Cada variante tem nome, traje quando informado na fonte e ID original no nome da pasta. `characters/index.json` lista apenas essa coleção. NPCs, inimigos, objetos, retratos isolados, modelos incompletos e sem identificação ficam em `public/assets/para-revisao/`, separados por categoria. O catálogo global está em `public/assets/catalog/entities.json`; cada entrada aponta para seu `manifestUrl`, sem deduzir caminhos pelo ID. `src/entities/` separa catálogo, carregamento, renderização e interface da biblioteca. Recursos são carregados sob demanda, com paginação e limites de cache; somente os efeitos e áudios do inicial ativo são carregados.

Marque **Sons originais** e ajuste **Volume**. **Música da vila** é opcional. Os jutsus usam sprites originais recuperados, incluindo vetores renderizados estaticamente; a pausa congela efeitos e sons. Evidências, limites e comandos em `reports/ENTITY-INTEGRATION.md`; resultados em `entity-assets-validation.json`, `entity-visibility-validation.json`, `entity-presentation-validation.json` e `entity-cache-validation.json`.

As cinco invocações vetoriais recuperadas na segunda passada estão marcadas como **parciais**: a pose original está disponível, mas a animação completa ainda não foi reconstruída. O catálogo atual habilita 1.330 dos 1.466 IDs em pelo menos uma função. Há 136 entradas sem animação utilizável nas funções atuais, preservadas para recuperação adicional. `tools/recover_entity_variants.py` trata esses formatos sem executar scripts originais. Passos, ataques e jutsus usam áudio recuperado; a música é opcional.

## Organização dos personagens — 19/10/2026

São **312 modelos/variantes** na pasta `public/assets/characters/` e **1.154 recursos** em `public/assets/para-revisao/`. Cada modelo tem um `README.md` com nome e ID, além de manifesto com procedência e limitações. Naruto Kid, Sasuke Kid e Sakura Kid preservam suas pastas e IDs salvos.

O critério da coleção principal exige um ninja regular identificado na configuração original, repouso e corrida em oito direções, `C_idle`, `A_1hit`, `C_dead` e ao menos um `SP_skillN` convertido. Partes ausentes, cor e mesclagem não recuperadas nas ações exigidas impedem a entrada. Repouso estático é válido na origem; poses vetoriais parciais não contam como animação completa. Efeitos externos permanecem descritos no manifesto e não representam partes ausentes do corpo.

Essa coleção indica compatibilidade das animações; a seleção de protagonista continua com os três iniciais. A vinculação individual de todos os jutsus e vozes dos demais modelos continua pendente.

- `public/assets/para-revisao/retratos/`: 123 retratos sem animação utilizável.
- `public/assets/para-revisao/animacoes-incompletas/`: 134 modelos com ações ou partes visuais pendentes.
- `public/assets/para-revisao/npcs-inimigos-e-cenario/`: 343 recursos fora da família de ninjas regulares.
- `public/assets/para-revisao/invocacoes-e-objetos/`: 37 invocações, clones e objetos auxiliares.
- `public/assets/para-revisao/sem-identificacao/`: 517 recursos cujo nome ou identidade precisa de conferência.

`reports/character-folders.csv` relaciona todos os nomes, variantes, IDs e destinos. A biblioteca abre na coleção de personagens e oferece o acervo de revisão em um filtro separado. Retratos pertencentes a personagens válidos continuam junto de seu personagem. O arquivo histórico de extração em `assets-extraidos/` preserva a organização e os caminhos de procedência; não é a pasta de personagens usada pelo jogo.

Execute `python tools/entity_layout.py` após novas conversões. As duas rotinas de recuperação já fazem essa etapa automaticamente e consultam o catálogo global para reutilizar as pastas existentes. Não volte a criar pastas numéricas na raiz de `characters/`.

Validação específica: `python tools/check_character_layout.py`. Consulte `reports/character-layout-validation.json` e `reports/character-organization.json`.


## Lobby, mapas e administração

Vila da Folha agora é um lobby seguro: clique no chão ou use WASD/setas. Caminhada 96 unidades/s e zoom 3.1. Viajar abre os quatro mapas integrados; nos três destinos de exploração existem seis inimigos com patrulha e respawn. A caçada automática é opcional. O grupo comporta três convidados e começa vazio. A biblioteca e o admin mostram personagens inteiros.

Abra `/admin` e entre com a senha inicial `admin`. A senha é validada pela API do servidor e a sessão usa cookie HttpOnly; `NARUTO_ADMIN_PASSWORD` permite alterá-la. As telas incluem personagens e suas animações, mapas, efeitos, áudio e todos os arquivos do runtime. `npm run dev` inclui a API; para servir a build, use `npm start` (porta 5180 por padrão). A simples hospedagem estática não fornece autenticação administrativa.

Leia `docs/ROADMAP.md` para as funcionalidades ainda pendentes e a continuidade nos resets. Validação atual em `reports/world-admin-validation.json`.


## Progressão

O painel Mochila · missões · loja reúne quatro equipamentos com bônus reais, compras por moedas, cinco missões de recompensa única e a coleção de personagens. Os três iniciais já pertencem à coleção; recrutar outro modelo elegível custa 60 moedas e 3 fragmentos. Recrutar e convidar para o grupo são ações separadas. O chakra base é 100; jutsus custam 35 e têm cooldown de 1,2 s. Há regeneração contínua e bônus por equipamento. O botão Jutsu permite lançar manualmente durante o combate. Os saves anteriores recebem os novos campos sem apagar o progresso.

Arena PvP local disponível no botão da jornada ou em `/arena`. Crie uma sala, compartilhe a chave e entre por outro navegador/perfil conectado ao mesmo servidor. A rota dedicada não carrega Phaser nem a vila. Dois perfis independentes representam dois jogadores; duas abas do mesmo perfil compartilham a mesma sessão.

O servidor controla turnos de 30 segundos, vida, dano, chakra, recarga e resultado. Há ataque, jutsu, defesa e concentração de chakra, com Rasengan/Chidori/Cura e áudio original opcional. Escolha Nivelado para atributos fixos ou Jornada para usar nível, treinos e equipamentos. A build é fixada ao entrar e o servidor calcula os valores; a progressão importada ainda vem do save local, portanto esse modo é amistoso e sem ranking. Atualizar a página retoma a sessão, mas o relógio continua; ausência prolongada encerra o duelo. Salas temporárias em memória, sem ranking nem recompensas. Acesso pela internet não foi publicado; dois computadores precisam alcançar o mesmo servidor. O /admin inclui Salas da arena.

Para validar com baixa carga: `npm test`, depois `npm run test:server`, depois `npm run build`, cada comando separadamente. Para navegador, um único `node tools/arena-check.mjs`, com o servidor local ativo. Não sobreponha extrações/builds/navegadores. Mais detalhes em reports/ARENA.md.


## Animações e baixo consumo

A interface chama os iniciais de Naruto, Sasuke e Sakura; as pastas `*-kid` preservam a versão. Foram corrigidas cópias indevidas nos especiais: referências externas de sombra reutilizavam erroneamente o bitmap zero do corpo. Quinze ações dos iniciais e quatro ataques de inimigos foram regenerados com timelines e origens próprias. O clone temporário do Rasengan pertence à animação original.

Os atlas revisados agora usam quadros únicos e janelas de preparação compatíveis com os efeitos separados; isso reduz sua memória RGBA estimada de 52–68 MiB para 2–5 MiB por inicial. Não significa que o processo inteiro usa apenas esse volume. Revisões futuras são incrementais, sem refazer o catálogo todo. Consulte reports/COMBAT-REFINEMENT.md.

A publicação em naruto-idle.vercel.app foi adiada por pedido do usuário; diagnóstico em docs/VERCEL.md, sem alteração da configuração ativa de hospedagem.


A revisão foi ampliada a 503 ações em 389 modelos do catálogo, com validação de PNGs, quadros e origens. O decoder lê somente os bitmaps das ações pedidas e processa lotes sequenciais. Restam 31 sequências grandes para uma revisão própria de atlas; elas continuam preservadas e sinalizadas nos relatórios. O admin de produção usa os manifestos da mesma build que fornece as imagens.
