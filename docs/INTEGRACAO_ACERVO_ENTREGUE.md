# Mapas e animações do acervo entregue

Integração de 21/10/2026. O jogo vigente é a pasta `Naruto_Idle` do repositório conectado; a entrega bruta permanece separada e intacta. O objetivo desta etapa é concluir os mapas/ações da fila atual, sem confundir recuperação de cenário com implementação de campanha.

## Resultado e escopo

- **145 mapas preparados e disponíveis em Viagens**, frente aos 16 anteriores. Os 129 novos incluem 39 locais nomeados do mundo, 69 cenários associados a fases e 21 sem nome/contexto confirmado. Os 16 anteriores foram preservados; a coleção Mundo contém 55 destinos do mundo/legado.
- Todos têm fundo composto dos blocos originais, navegação nativa, máscara frontal, ponto de chegada, miniatura, câmera e registro compatível com saves. O índice e a lista aceita na restauração são atualizados juntos. Cada conversão registra versão e hashes antes/depois.
- Os 90 cenários de fase/a identificar têm **exploração segura** explícita: caminhada, viagem de saída e retomada; não oferecem campanhas, chefes ou recompensas originais inexistentes. Cenários reaproveitados por várias fases conservam todas as referências no manifesto. Não inventar nomes/lore para os 21 sem contexto.
- Novas caçadas têm encontros autorais restritos às famílias já usadas pelo idle; isso é adaptação mecânica. Nove novas áreas de caça também receberam as trilhas/ambientes associados às cenas originais, com bytes/hashes preservados e reprodução/descarte pelo sistema existente.
- Moradores padrão da Folha ficam em Konoha. Não inserir automaticamente os mesmos moradores em outras vilas, esconderijos ou cenários narrativos.
- **31 ações de 30 modelos reconstruídas**: oito ataques, 14 especiais 1 e nove especiais 2. A fila `external-symbol-audit.json` passou a zero. As 503 correções anteriores e o Sasuke inicial azul/branco foram preservados. Isso não libera variantes reservadas, nem atribui regras de jutsu inéditas aos recrutas.

## Animações e memória

O renderer mantém o namespace externo separado: `extname` com `assetId=0` jamais resolve o corpo local 0. Não remove clones, invocações ou transformações locais legítimas.

O formato `compact-ground-origins-v1` recorta transparência após renderizar nas coordenadas originais. Cada quadro único tem origem própria, incluindo deslocamentos fora da célula; a timeline continua apontando aos quadros únicos. Renderizar primeiro no mesmo plano evita diferenças de interpolação em poses rotacionadas. Personagem ativo, atores, arena e prévias administrativas interpretam as novas origens; atlas antigos mantêm a origem compartilhada.

O orçamento padrão permanece 8 milhões de pixels por atlas. Exceções desta fila usam um limite explícito de 16 milhões (64 MB RGBA), lado máximo 8192 e decodificação de fontes limitada a 32 milhões. Apenas um conversor roda por vez. Atlas carregam sob demanda; o cache de atores já limita residentes/bytes e descarta recursos inativos. Nenhuma biblioteca inteira é pré-carregada.

`externalEffects` e `status: partial` continuam verdadeiros quando falta reconstruir um efeito/sombra compartilhado. Fila de duplicação corrigida não significa integração completa de todos os efeitos externos.

## Origem e reprodução

`OriginalArchive` aceita tanto o acervo original com `recovery/resource-manifest.json`/`recovered-web/cdn` quanto a entrega com `manifestos/inventory.json`. Nesta entrega a versão é fixada pelo inventário; caminho físico é `<categoria>/<versão>/<caminho lógico>`. Nunca escolher a pasta aparentemente mais nova.

Os hashes de `sourceKind: exported-inventory` comprovam os bytes entregues. Algumas imagens do pacote foram reencodificadas na extração anterior; esses hashes não são anunciados como identidade binária do CDN histórico. Arquivos brutos não são modificados. Nenhum ActionScript é executado.

Procedimento retomável, executado a partir da pasta do jogo:

```powershell
python tools/plan_world_expansion.py --source <acervo>
python tools/run_delivery_batches.py --source <acervo> --max-batches 6
python tools/run_animation_batches.py --source <acervo> --max-batches 6
# Somente para IDs ainda pendentes que excedem 8M:
python tools/refine_external_actions.py --source <acervo> --ids <ids> --limit 4 --actions A_1hit,SP_skill1,SP_skill2 --compact --pixel-budget 16000000
python tools/validate_compact_actions.py --source <acervo>
python tools/audit_external_symbols.py
node tools/prepare-runtime.mjs
```

O planejador preserva decisões já registradas ao ser reexecutado; o executor ignora IDs já integrados. O reparador ignora ações corrigidas, exceto com `--refresh-compact` explícito. Esse modo foi usado uma vez após a comparação detectar diferenças de interpolação. `--offset` limita uma revisão explícita a outra parte da lista. Máximo de seis lotes por ciclo, quatro mapas/modelos por lote e processos estritamente seriais.

## Evidências e limites

- `reports/world-delivery-preflight.json`: inventário dos 145 conjuntos e classificação por referências reais.
- `reports/world-delivery-*.json`, `alpha-delivery-*.json`: lotes explícitos, fontes, igualdade integral do alpha e igualdade RGBA do WebP frontal. O primeiro lote de quatro mapas foi verificado separadamente em `alpha-delivery-10003-10039-10053-10058.json`.
- `reports/compact-animation-validation.json`: 31 ações, 124 amostras de quadros reconstruídas independentemente no plano de coordenadas do SWF; igualdade exata RGBA, duração, FPS e origem. São amostras, não comparação de cada quadro com o player Flash.
- `tests/delivered-worlds.test.ts`: arquivos portáveis, navegação/spawns e round-trip de saves de todos os 145 destinos. Os destinos antigos preservam o ajuste runtime do spawn pela grade; os novos têm spawn diretamente transitável.
- `tests/test_original_archive_delivery.py`, `test_compact_frames.py`, `animation-origin.test.ts`: versão/caminhos, formatos de bitmap, reconstrução dos pixels/deslocamento/timeline e compatibilidade de origens antigas.
- `tools/qa/extracted-assets.html`: inspeção **local pelo Vite**, usando `EntityActor`/Phaser do jogo e verificação serial dos 31 atlas no navegador. Não inclui autenticação falsa no produto, não abre uma jornada nem altera progresso; não faz parte da build publicada.

A validação técnica de todos os mapas não equivale a playtest visual de todas as passagens dos 145 conjuntos. A inspeção renderizada cobre amostras e os fluxos registrados no relatório final. Máscaras globais continuam sem profundidade individual por árvore/cerca/SWF intermediário. Transições físicas, campanhas/encontros/populações narrativas e demais vozes/efeitos seguem na fila ampla, com dependências reais. Loading foi concluído na etapa abaixo.

Nenhum save real, esquema remoto, conta ou serviço pago foi alterado. Testes renderizados usam a fixture local existente de Auth/SQL; a build final deve ser gerada sem essa configuração e verificada antes do envio.

## Validação final e correções de integração

Os testes renderizados encontraram e corrigiram o caminho de viagem segura com uma lista de inimigos vazia. Essa lista não herda inimigos da área anterior; o ator de espera invisível recebe um manifesto válido. Inicialização/restauração também reconhecem cenários seguros. Rótulos de retorno e mensagens distinguem Konoha, outras áreas seguras e caçadas.

O servidor Vite tinha um glob privado que atingia a pasta ancestral `assets-extraidos` e bloqueava o próprio jogo nesta máquina. A proteção foi delimitada à pasta privada interna do projeto; `.env.example`, `.git/HEAD` e intermediários continuam retornando 403. A pasta bruta externa não entrou no runtime. Não foi desativada proteção de credenciais.

Resultados consolidados em `reports/delivery-integration-summary.json` e `delivery-browser-validation.json`. Testes de domínio incluem navegação/rotas em todos os destinos; a verificação binária dos 31 atlas tem hashes vinculados às amostras de pixels. Na fixture local, a inspeção incluiu Konoha → Chuva, rota por minimapa, cenário 10002 com saída/reload/retomada, cenário 30052 explicitamente sem identidade, Caverna Misteriosa com dois oponentes, jutsus, duas vitórias (+42 XP/+14 moedas) e retorno a Konoha. Nenhum desses resultados é progresso de uma conta real.

## Loading — concluído em 22/10

O prefixo original tem 198 arquivos: **197 imagens e cfg.xml**. Três imagens já estavam integradas; foram recuperadas 194 adicionais, totalizando 165.437.903 bytes. Não são 198 imagens. São 194 JPEG e três PNG (19, 140, 141), estes entregues com extensão JPG: os bytes foram preservados, mas a URL pública usa PNG para corresponder ao formato real.

`run_loading_batches.py --source <acervo> --max-batches 6` retoma até seis lotes sequenciais de três. Cada ciclo verifica o catálogo inteiro: SHA256 contra a fonte, formato, dimensões, decodificação completa e hash da fonte após a leitura. Reexecutar com tudo pronto valida sem duplicar a recuperação. `loading-art-validation.json` tem prova individual de 197/197. `source-config-review.json` conserva as cinco entradas/pesos originais, sem impor a escolha promocional do outro jogo.

A revisão das 197 miniaturas encontrou campanhas sazonais, vários idiomas, versões antigas e anúncios de conteúdo. Por isso, **extração completa não significa publicar todo banner**. `selection.json` mantém três IDs anteriores e 14 fundos em português revisados, usados somente como ilustrações decorativas. O componente compila apenas as 17 URLs, sorteia o ponto inicial e roda ciclicamente; solicita uma imagem por tela, sem pré-carregar 165 MB. Nenhum banner libera personagem ou anuncia disponibilidade. As 71 dicas continuam `review-only`.

`tools/qa/loading-art.html` usa o componente real e permite verificar sequencialmente todas as imagens. O navegador decodificou 197/197 e mostrou o overlay real; não abriu jornada, save ou autenticação. A inspeção de navegador cobre a decodificação de todos e a renderização de uma amostra, não cada composição em todos os tamanhos de tela. Relatório `loading-browser-validation.json`; evidência visual local em `reports/loading-browser.png` (ignorada pelo Git). Os quatro testes de assets/runtime, typecheck e i18n passaram; a build e a verificação de configuração privada constam no relatório desta etapa.
