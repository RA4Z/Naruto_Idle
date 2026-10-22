# Roteiro para o computador com os arquivos originais

Este é o procedimento técnico por categoria/lote, não uma segunda fila de tarefas. O estado e a prioridade vigentes estão em [ROADMAP.md](ROADMAP.md) e [../CONTINUATION.md](../CONTINUATION.md). **Atualização da entrega versionada:** os 145 conjuntos estão preparados/acessíveis por Viagens e as 31 ações da fila externa foram reconstruídas. Cenários de fases/a identificar têm exploração segura, não campanhas implementadas. Estado, comandos e evidências em [INTEGRACAO_ACERVO_ENTREGUE.md](INTEGRACAO_ACERVO_ENTREGUE.md). Modularidade/SWF intermediário, profundidade por objeto e demais categorias continuam pendentes. Totais históricos abaixo descrevem o momento de cada investigação.

**Atualização técnica dos mapas em 21/10/2026:** ler primeiro [Mapas: formato confirmado, extração e pendências](MAP_LAYERS.md). Esse guia detalha resolução por versão do CDN, blocos de 256 pixels, PNGs frontais virtuais, aplicação de alphaMap, formato binário/projeção da navegação, escala, comandos por lote e validação. A investigação histórica abaixo não deve fazer a IA procurar PNGs frontais físicos inexistentes nem repetir a tentativa de recortar chão. Máscara nativa já foi recuperada; modularidade/SWF intermediário e profundidade por objeto continuam pendentes. Consultar CONTINUATION/ROADMAP para não repetir tarefas já concluídas, inclusive a reconstrução original das skills do Sasuke.

Nota da integração entre computadores: os atlas das duas skills do Sasuke azul 11000211 já foram regenerados do SWF nesta máquina e preservados no merge. Conferir rendererRevision antes de converter; não reaplicar o fallback histórico. A fila inicial de 31 ações/30 modelos foi encerrada nesta integração; a auditoria atual tem zero pendências de duplicação. Efeitos externos específicos continuam explícitos nos manifestos. O restante deste roteiro continua sendo trabalho futuro, sem disparar extração integral durante o merge.

## Objetivo e ordem de leitura

Pedido do usuário em 20/10/2026: procurar modularidade nos mapas e implementar neste projeto os demais mapas, personagens, modelos, efeitos e todos os recursos aproveitáveis encontrados no acervo original. O trabalho inclui extração, organização, desenvolvimento, integração no jogo e testes. Copiar arquivos ou exibi-los somente no administrador não conclui a integração.

Antes de trabalhar, ler `CONTINUATION.md`, `docs/ROADMAP.md`, este roteiro e `docs/MAP_LAYERS.md`. As decisões atuais prevalecem sobre as notas históricas. A cópia deste computador não contém o acervo bruto; o caminho histórico no outro computador é `D:\Naruto Idle\Naruto_Idle`. Confirmar o caminho real ao retomar, sem presumir que a letra da unidade ou a pasta do projeto sejam iguais.

## Lote de áudio por modelo — validado em 20/10/2026

19000101/19000201/19004301/19002301: ataque e morte recuperados de ações embutidas e deathSoundConfig.xml, com pacotes soundConfig.xml e símbolos DefineSound. 13 pacotes, 42 clipes, 32 novos; originais preservados. Manifestos public/assets/audio/entities/<id>.json referenciados por presentation.entityAudio. Uso real no combate, carregamento serial de metadados e vozes HTMLAudio descartáveis; duração nativa escalada para a animação idle. Admin possui prévias sob demanda. Testes, build e navegador dev/dist aprovados em reports/entity-audio-*.json. Outros modelos/ações e demais categorias seguem pendentes.

## 1. Preparar e inventariar o acervo completo

- [ ] Atualizar a cópia do projeto com as alterações recentes antes de converter, preservando trabalho local e saves de teste. Não partir de uma versão anterior à troca de personagem e às correções de carregamento.
- [ ] Separar a raiz dos originais da raiz de saída deste jogo. Preservar os arquivos brutos e seu caminho relativo; nunca converter por cima deles.
- [ ] Localizar `recovery/resource-manifest.json`, `recovered-web/cdn` e eventuais backups em `assets-extraidos/`. Inventariar também arquivos fora do manifesto, arquivos compactados, recursos sem extensão e dependências referenciadas por XML/configuração.
- [ ] Registrar por arquivo: ID, categoria, caminho de origem, versão/tag do CDN, tamanho, hash SHA-256, formato detectado, referências, destino e estado de processamento. Detectar duplicatas por conteúdo, preservando os vínculos de todos os IDs que usam o mesmo recurso.
- [ ] Não misturar versões diferentes apenas porque possuem o mesmo nome. Documentar a versão escolhida e manter as alternativas rastreáveis.
- [ ] Levantar o total real por categoria e comparar com os inventários históricos de `reports/`. Os totais antigos são referência, não prova de que a nova extração está completa.
- [ ] Auditar os scripts antes de executar: há caminhos absolutos antigos, regras de iniciais antigas e conversões que podem sobrescrever manifestos ou recriar defeitos. Parametrizar origem/destino e corrigir esses pontos antes dos lotes.

Executar uma operação pesada por vez, com um worker e lotes pequenos, explícitos e retomáveis. Não sobrepor extração, build e navegador; não disparar regeneração integral do acervo para corrigir poucos modelos. Decodificar SWF estaticamente, sem executar ActionScript.

## 2. Investigar modularidade e profundidade dos mapas

- [ ] Enumerar **todos** os IDs de mapas e variantes, incluindo vilas, interiores, arenas, instâncias e cenários de missões encontrados. Partir da auditoria dos 145 conjuntos e dos 16 mapas integrados; não limitar o trabalho aos quatro cenários iniciais.
- [ ] Para cada mapa, procurar `_scene_bg.xml`, `_scene_mg.xml`, `_scene_fg.xml`, `MapInfo.map`, demais configurações de cena e cada dependência externa. Os caminhos históricos são `assets/scene/map/<id>/...`.
- [ ] Inspecionar imagens, blocos, SWFs, símbolos e bibliotecas compartilhadas, procurando árvores, copas, troncos, cercas, paredes, telhados, pedras, pontes, portões, água e objetos animados separados. Registrar se são objetos independentes, blocos de camada ou uma única imagem achatada.
- [ ] Recuperar transparência real e as transformações originais: posição, escala, espelhamento, rotação, origem, ordem, dimensões, animação e referências entre arquivos. Não substituir alpha por uma máscara aproximada baseada na cor do chão.
- [ ] Gerar uma amostra inspecionável de cada tipo de camada e um relatório de referências resolvidas/ausentes antes de alterar a renderização do mapa inteiro.
- [ ] Preservar objetos separados no runtime quando existirem. Uma imagem composta pode servir de prévia ou fundo distante; não deve destruir a modularidade necessária à profundidade.
- [ ] Criar metadados por objeto: ID estável, asset, posição, origem nos pés/base, camada, ordem/profundidade, colisão e, quando necessário, partes que ficam em ordens distintas. Reutilizar assets compartilhados por referência.
- [ ] Integrar fundo/solo, objetos, atores e primeiro plano segundo a composição real. Ordenar por base no chão quando adequado; usar camadas fixas para elementos cuja semântica exigir isso. Cercas diagonais, pontes e estruturas longas podem precisar de segmentos ou partes distintas, não de um único valor de Y para toda a imagem.
- [ ] Manter navegação e composição visual separadas: `MapInfo.map` descreve trânsito, não os pixels transparentes de uma árvore. Definir colisão nos obstáculos apropriados, sem bloquear toda a copa ou toda a imagem do objeto.
- [ ] Validar passagens por portas, portões, pontes e mudanças de altura; se houver andar superior/inferior no original, recuperar seus dados antes de permitir cruzamentos sobrepostos.

**Não reativar os recortes opacos de `background.jpg` em `src/world/occlusion.ts`.** Eles escondiam personagens atrás de terra. Se algum mapa só tiver fundo achatado, registrar esse limite, manter a cena funcional e continuar procurando as dependências; não declarar profundidade modular concluída nem inventar objetos separados.

Priorizar os mapas atuais 10001, 10005, 10006 e 10008 para resolver os problemas já demonstrados. Depois integrar os demais mapas por lotes. Em cada mapa, implementar entrada, saída, destinos, spawn válido, navegação, colisões, câmera, habitantes, inimigos, encontros e elementos interativos pertinentes. Trocar somente a imagem do fundo não conta como mapa implementado.

## 3. Completar personagens, modelos e animações

- [ ] Localizar todos os modelos e variantes: jogáveis, NPCs, inimigos, chefes, criaturas, invocações, transformações e objetos animados. Conservar ID, identidade, variante e relação entre corpo, retrato, animações e configurações; não deduzir identidade apenas por um retrato parecido.
- [ ] Recuperar caminhada/repouso e direções, entrada/saída, ataques, dano, morte, especiais e outras ações presentes. Não limitar a extração às ações que a interface atual já conhece; catalogar as demais e implementar o suporte necessário ao uso delas.
- [ ] Preservar FPS, duração, timeline, eventos, origem, espelhamento, transformações e escala do rig. Conferir o corpo durante transições entre exploração e combate, sem redimensionar cada pose isoladamente.
- [ ] Resolver símbolos externos em namespace separado dos bitmaps locais. **`extname` com `assetId=0` não pode resolver o corpo local 0.** Procurar o recurso externo correto e manter pendência explícita se ele faltar.
- [x] Recuperar `assets/battle/role/left/11000211.swf`, regenerar SP_skill1 e SP_skill2 do Sasuke azul e retirar o mapeamento provisório após validação. Etapa anterior preservada nesta integração; não refazer o fallback.
- [x] Preservar `reports/animation-backups/sasuke-11000211/skill-originals.json`, os hashes em `reports/sasuke-skill-fallback.json` e o XML original como evidência histórica. O fallback C_idle/A_1hit foi substituído pela reconstrução original.
- [x] Processar as 31 ações restantes da fila `reports/external-symbol-audit.json` incrementalmente, com provas de pixels/origem/tempo. Clones, efeitos locais e transformações legítimas foram mantidos. Símbolos externos ainda não reconstruídos continuam sinalizados em cada manifesto; zero pendências da fila de duplicação não significa efeitos completos.
- [ ] Integrar modelos elegíveis à coleção, recrutamento, seleção do personagem ativo, atributos, progressão, equipamento e combate. Integrar os demais como NPCs, inimigos, chefes ou objetos conforme sua função real. Modelos incompletos permanecem visíveis no acervo de revisão, com o motivo e os arquivos faltantes.

Decisões que a extração deve preservar: Sasuke inicial é **11000211**, azul/branco. **11000201**, roupa preta, permanece reservado para o futuro, mesmo que suas animações sejam recuperadas. O jogador troca de personagem; grupo/party está adiado. Cada personagem tem nível/XP/treinos/equipamento próprios; somente o ativo ganha XP. Não reativar party nem liberar automaticamente todas as variantes por executar um script antigo.

## 4. Integrar efeitos, áudio, interface e demais recursos

- [ ] Recuperar efeitos de golpes, projéteis, jutsus, impactos, cura, buffs/debuffs, auras, invocações, transformações e efeitos ambientais. Relacionar cada um à ação, personagem ou cena correta usando as configurações originais.
- [ ] Recuperar vozes, sons, música e eventos de sincronização. Implementar disparo, posição, duração, volume, orientação e descarte corretos. Não aplicar o efeito/voz do Naruto a todo recruta sem vínculo comprovado.
- [ ] Mapear jutsus e habilidades às ações e eventos corretos e desenvolver sua integração às regras deste idle. Registrar diferenças quando a mecânica original não for diretamente aplicável. Só retirar a indicação de habilidade não integrada depois de funcionar no jogo.
- [ ] Recuperar artes de loading, `assets/loading/*.jpg`, `config/LoadingTips.xml`, fundos, painéis, ícones, cursores, botões, HUD, retratos e recursos de interface; integrá-los às telas correspondentes sem prejudicar legibilidade ou navegação.
- [ ] Procurar configurações e assets de itens, equipamentos, consumíveis, receitas, raridades, missões, diálogos, lojas, recompensas, encontros e progressão. Implementar o conteúdo correspondente de forma compatível com o jogo atual, com persistência e uso real, não apenas uma pasta de imagens.
- [ ] Catalogar também vídeos, fontes, arquivos vetoriais, animações de interface, formatos não suportados e categorias novas descobertas. Desenvolver o conversor ou adaptador necessário por etapas. Se um recurso depender de arquivos ausentes ou de suporte ainda não implementado, registrar a dependência e a tarefa específica em vez de omiti-lo.

O objetivo é cobertura completa do acervo aproveitável. “Extraído”, “catalogado no admin” e “integrado ao jogo” são etapas diferentes. Conteúdo reservado por decisão do usuário pode ter extração e suporte concluídos, mas deve manter sua disponibilidade futura. Regras antigas que conflitem com decisões atuais devem ser adaptadas, sem desfazer o funcionamento já aprovado.

## 5. Organização obrigatória dos arquivos

Usar a organização existente como base e ampliá-la quando uma nova categoria exigir:

| Destino | Conteúdo e regra |
| --- | --- |
| Raiz externa dos originais | Arquivos brutos intactos, caminhos e versões preservados. Não colocar o acervo inteiro no runtime público. |
| `assets-extraidos/manifestos/` | Inventário, procedência, hashes, dependências, resultados e duplicatas. Pasta local ignorada pelo Git; entregar os relatórios necessários ao trabalho no outro computador. |
| `assets-extraidos/` | Intermediários e backups de conversão por categoria/ID; nunca confundir com saída pronta para o jogo. |
| `public/assets/characters/<slug-com-id>/` | Personagem identificado, `manifest.json`, retrato/prévia e subpastas `world/` e `battle/`, seguindo `tools/entity_layout.py`. Manter slugs existentes estáveis. |
| `public/assets/para-revisao/` | Modelos incompletos/sem identidade ou função confirmada, com metadados de pendência; preservar seus IDs. |
| `public/assets/maps/<id>/` | Fundo, camadas, objetos ou referências compartilhadas, navegação e manifesto do mapa. Definir e documentar o novo esquema modular antes de usá-lo. |
| `public/assets/effects/`, `public/assets/audio/` | Recursos de apresentação com manifestos e referências às ações; compartilhar por ID/hash quando apropriado. |
| `public/assets/loading/` e novas categorias necessárias | Saídas prontas para uso, com organização documentada e integração às telas; criar o destino quando ainda não existir. |
| `public/assets/catalog/` | Catálogos canônicos, revisões e índices de runtime, com referências válidas às saídas. |
| `src/` e `server/` | Adaptadores de renderização, funcionalidades, regras e persistência necessárias à integração. |
| `reports/` | Relatórios portáveis, comparações, evidências e progresso por lote. Não depender de caminhos absolutos da máquina para entender o resultado. |

- [ ] Conservar IDs e URLs já usados por saves e catálogos. Se uma mudança for inevitável, implementar aliases/migração e testar saves antigos antes de remover o caminho anterior.
- [ ] Atualizar catálogos canônicos, manifestos, prévias e revisões sem sobrescrever decisões do administrador. Não editar apenas `runtime.json`, que é gerado por `tools/prepare-runtime.mjs`.
- [ ] Usar caminhos relativos e parâmetros de origem/destino nos scripts; registrar o caminho absoluto local apenas como informação de procedência, sem torná-lo requisito para servir o jogo.
- [ ] Manter originais de imagem e áudio; derivados otimizados têm ligação e hash da fonte. Preservar resolução útil dos mapas e alpha dos objetos/sprites. Não converter transparência para JPEG.
- [ ] Seguir `.gitattributes`/Git LFS para binários e conferir que as saídas públicas são imagens/sons reais, não ponteiros LFS. Evitar referências a disco local em URLs do navegador.
- [ ] Entregar scripts reproduzíveis junto com os assets preparados, manifestos e código. O jogo precisa funcionar nas outras máquinas sem a unidade D: ou o acervo bruto.

## 6. Processo por lote e critérios de conclusão

1. Selecionar IDs/categoria e limite explícitos; listar a origem e todas as dependências.
2. Extrair/decodificar, verificar hashes e registrar limitações. Manter backup dos derivados que serão substituídos.
3. Organizar e atualizar manifestos/catálogos. Abrir as prévias e conferir visualmente, sem considerar o simples sucesso do conversor uma aprovação.
4. Implementar a funcionalidade necessária e integrar o recurso ao fluxo correto do jogo. Manter revisão/admin disponíveis para inspeção.
5. Validar no navegador e rodar os testes pertinentes, typecheck e build. Não executar tudo simultaneamente. Não marcar um lote concluído enquanto houver falha na integração anunciada.
6. Registrar o que foi integrado, os arquivos alterados, os testes e os próximos IDs. Entregar a etapa conforme a rotina do ROADMAP, sem incluir alterações alheias ou contratar/publicar infraestrutura nova.

Critérios mínimos de aceitação:

- [ ] Mapas: caminhar dos dois lados de árvores/cercas/paredes, atravessar passagens legítimas e conferir pixels de oclusão. Testar jogador e inimigos, volta do combate, troca de mapa/personagem, câmera e save/reload. Rotas válidas sozinhas não provam profundidade correta.
- [ ] Personagens: prévia de todas as ações extraídas, direções de movimento, ataque/skill/dano/morte, entrada e saída de combate, tamanho/origem estáveis e ausência de cópias indevidas. Conferir seleção e progresso individual sem duplicar atores.
- [ ] Efeitos/áudio: vínculo e sincronização corretos, limite de instâncias, término/limpeza, pausa e ausência de efeitos ou sons presos após trocar de cena.
- [ ] Novos conteúdos e funcionalidades: uso real, regras, persistência e retorno de erro claro quando faltar recurso; verificar compatibilidade dos saves.
- [ ] Carregamento: manter menu leve, assets essenciais primeiro e demais recursos por demanda. Não pré-carregar o acervo inteiro. Testar falha/retry, cache e descarte de cenas, além da minijanela em tamanhos pequenos.
- [ ] Distribuição: testar build com assets presentes e URLs relativas válidas; não assumir que aprovação no dev garante que a build recebeu os arquivos corretos.

Manter um relatório por ID com estados distintos: **descoberto → extraído → convertido → organizado/catalogado → integrado → testado**. Usar **pendente**, **bloqueado por dependência** e **reservado para o futuro** com motivos concretos. Resumir totais por categoria, recursos não classificados e referências ausentes. Nenhum arquivo descoberto deve desaparecer silenciosamente do acompanhamento; cada recurso deve chegar ao uso apropriado ou a uma pendência explícita e rastreável.

Ferramentas existentes a revisar e reaproveitar: `tools/prepare_world.py`, `tools/entity_pipeline.py`, `tools/entity_layout.py`, `tools/recover_entity_variants.py`, `tools/recover_presentation.py`, `tools/catalogue_media.py`, `tools/normalize_media_catalog.py`, `tools/prepare_previews.py`, `tools/audit_external_symbols.py`, `tools/refine_external_actions.py` e `tools/prepare-runtime.mjs`. Conferir o código e as opções reais antes de executar; a presença de um script não garante suporte a todas as camadas ou a todos os formatos.
