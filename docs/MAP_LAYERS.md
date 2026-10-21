# Mapas: formato confirmado, extração e pendências

Este é o guia técnico atual para extração dos mapas. Ler junto com [o roteiro geral](EXTRACAO_E_INTEGRACAO_ORIGINAIS.md) e conferir os scripts citados antes de executar. As seções atuais prevalecem sobre o histórico ao final. Em 21/10/2026 há 16 destinos integrados de 145 conjuntos identificados; consultar o catálogo e a auditoria para obter o total após novos lotes.

## Onde procurar e como resolver os arquivos

`--source` recebe a **raiz do acervo**, que contém `recovery/resource-manifest.json` e `recovered-web/cdn`, não a pasta de um mapa nem a pasta do projeto Phaser. O caminho histórico é `D:\Naruto Idle\Naruto_Idle`; a disponibilidade depende da máquina. Nesta cópia em `C:\Users\robertn\Documents\Naruto_Idle`, esse caminho histórico não está disponível. Confirmar o caminho real no computador com os originais.

`tools/original_archive.py` resolve cada caminho lógico pelo campo `tag` do manifesto: `<acervo>/recovered-web/cdn/<tag>/<caminho>`. Não escolher uma versão de CDN por suposição. `raw()` lê os bytes originais e `data()` tenta descompressão zlib, retornando o bruto se não for zlib; arquivos de metadados podem precisar dessa descompressão antes de interpretar XML ou navegação. Hashes de procedência são calculados sobre os bytes brutos.

| Arquivo lógico | Papel confirmado ou limite atual |
| --- | --- |
| `assets/scene/map/<id>/_scene_bg.xml` | Lista os blocos de imagem do fundo e sua posição por `imgX`/`imgY`. |
| `assets/scene/map/<id>/_scene_fg.xml` | Descreve recortes virtuais do fundo, com posição e tamanho; não implica PNG físico separado. |
| `assets/scene/map/<id>/alphaMap.png` | Canal alpha nativo usado na camada frontal. Não é um mapa de colisão. |
| `assets/scene/map/<id>/_scene_mg.xml` | Referências da camada intermediária; recuperar recursos e transformações, especialmente SWFs. Integração ainda pendente. |
| `assets/scene/map/<id>/MapInfo.map` | Grade binária de navegação, sem informação suficiente para separar visualmente árvores ou cercas. |
| `config/world/SceneCFG.xml` | Relação entre cena, mapId e nome original. Cena e mapa não são necessariamente o mesmo ID. |

## Reconstrução do fundo e da camada frontal

O preparador atual usa blocos de **256 pixels**. Para o fundo, cola a imagem indicada pelo `url` do bloco em `(imgX * 256, imgY * 256)`, respeitando as dimensões do raster original. Não aplicar aqui o zoom da câmera nem reduzir as coordenadas dos XMLs.

Para cada entrada frontal:

1. Localizar o bloco do fundo com o mesmo par `(imgX, imgY)`.
2. Ler `offsetX`, `offsetY`, `width` e `height` do recorte frontal. Conferir que o retângulo cabe no bloco; o extrator atual recusa extrapolação.
3. Recortar a cor do **JPEG original do fundo**, no retângulo `(offsetX, offsetY, offsetX + width, offsetY + height)`.
4. Calcular a posição global: `x = imgX * 256 + offsetX`, `y = imgY * 256 + offsetY`.
5. Aplicar à peça o canal **A** de `alphaMap.png` na mesma região global. Preservar os níveis intermediários de transparência; não transformar em máscara binária.
6. Compor a peça em uma imagem RGBA transparente do tamanho do raster do mapa. Preservar o alinhamento em `(0, 0)`, sem esticar a máscara para compensar diferenças de dimensões.

Essa regra vem de `map/images/MapTile.as`, método `processImageRender`, e está implementada em `compose_foreground()` de `tools/recover_native_foreground.py`. Portanto, referências frontais terminadas em `.png` podem ser **nomes virtuais**: não declará-las ausentes apenas porque não existe um PNG com esse nome. Isso não autoriza ignorar dependências realmente ausentes da camada intermediária.

Saídas atuais: `foreground.png` canônico, `foreground.webp` sem perda e `native-alpha.png` com os bytes da máscara original. No WebGL, `src/world/native-foreground.ts` aplica a máscara ao fundo já carregado. No Canvas, `src/world/foreground-plan.ts` seleciona a composição RGBA pronta. Ambos precisam representar os mesmos pixels/alinhamento, sem duplicar downloads grandes desnecessariamente.

## Navegação e sistemas de coordenadas

O decodificador de referência é `native_navigation()` de `tools/prepare_world.py`; o consumidor é `src/world/navigation.ts`.

- Cabeçalho binário big-endian `>4I4H`, 24 bytes: largura/altura do raster, duas dimensões de tile, colunas/linhas da grade e largura/altura da célula.
- Cada registro começa com `x`, `y`, `flag` (`>IIB`). Flag 1 acrescenta `w`, `h`, `region` (`>III`); flag 0 acrescenta a referência para uma célula raiz (`>II`). Validar referências e consumo integral do arquivo.
- **Flag 0 não significa obstáculo.** As células registradas são caminháveis; raiz e região são metadados. Os IDs de região são arbitrários: não presumir região 0/1 nem inferir pela ordem dos mapas.
- Para a célula `(cx, cy)`, o centro em pixels de origem é `px = (cx - cy) * cellWidth / 2 + sourceWidth / 2` e `py = (cx + cy + 1) * cellHeight / 2 - sourceWidth / 4`. Usar a mesma projeção no extrator e no jogo, sem substituí-la por uma fórmula isométrica genérica.
- A escala atual é `SCALE = 3.072`: posições em unidades do jogo são os pixels de origem divididos por 3.072; `navigation.json` registra `unitsPerSourcePixel = 1 / 3.072`. O zoom da câmera é uma operação posterior e independente.
- O preparador atual exclui células projetadas fora do raster e seleciona o maior componente conexo por vizinhança de quatro lados. Registra as exclusões e as regiões encontradas. Isso é uma escolha do idle atual; não prova que os demais componentes sejam inválidos no cliente original.

Spawn e elenco de inimigos atuais são definidos para este idle, não recuperações das regras originais de encontros. Preservar essa distinção nos relatórios. Conexões/chegadas originais devem ser catalogadas, mas a implementação de portais continua adiada conforme o ROADMAP.

## Sequência operacional para outro lote

Executar na raiz do projeto. Os valores abaixo são placeholders: substituir pela raiz real e por até quatro IDs novos, previamente auditados. Não executar sobre os mapas já integrados apenas para testar o comando.

```powershell
$originaisDoJogo = "CAMINHO_REAL_DO_ACERVO"
$idsDoLote = "ID_NOVO_1,ID_NOVO_2"
python tools/audit_original_maps.py --source "$originaisDoJogo"
```

Antes da conversão, cadastrar os IDs novos em `SPECS` de `tools/prepare_world.py`, confirmar nome/cena, dependências e elenco compatível. O script **não aceita automaticamente qualquer um dos 145 IDs**. Auditar os limites atuais: raster com até 16 milhões de pixels, lado de até 8192 pixels e pelo menos 50 células no componente transitável; casos fora desses limites exigem adaptação explícita, não descarte silencioso.

```powershell
python tools/prepare_world.py --source "$originaisDoJogo" --ids "$idsDoLote" --limit 4
node tools/prepare-runtime.mjs
```

`prepare_world.py` processa um mapa por vez e já chama a recuperação da máscara frontal. Não é necessário chamar `recover_native_foreground.py` novamente para o mesmo lote. Esse segundo script é útil para uma reparação frontal específica de mapas já preparados; ele exige manifesto/fundo existentes. O preparador recusa mapas existentes sem `--refresh`; esse parâmetro é uma regeneração deliberada, após revisão dos efeitos e backups, não uma etapa padrão.

Conferir as saídas em `public/assets/maps/<id>/`, `public/assets/maps/index.json`, `public/assets/catalog/runtime-images.json` e no relatório `reports/world-expansion-<ids-separados-por-hifen>.json`. Acrescentar os destinos em `src/config/maps.ts`, usado na validação dos saves, **antes** dos testes e da entrega. Regenerar o índice compacto após todas as alterações canônicas; não editar só `runtime.json`.

Para a conferência de pixels de um lote específico:

```powershell
python tools/validate_native_foreground.py --source "$originaisDoJogo" --batch "world-expansion-IDS-DO-LOTE.json" --report "alpha-IDS-DO-LOTE.json"
```

Os nomes acima também devem ser substituídos pelos nomes reais do lote. Verificar igualdade do alpha pixel a pixel, identidade RGBA do WebP sem perda, hashes das fontes e ausência de corrupção. Em seguida, usar `tools/world-expansion-check.mjs`, `tools/native-foreground-check.mjs` e `tools/world-expansion-production-check.mjs` com os IDs/fixtures/URLs apropriados; ler as opções reais desses testes, pois os padrões podem apontar para lotes antigos. Cobrir WebGL e Canvas separadamente, caminhada/combate, save/reload com todos os destinos visitados, volta à vila e inspeção visual das capturas. Executar testes, navegador e build em série, nunca junto da extração. Até seis lotes de verificação por ciclo, um de cada vez.

## O que ainda não foi resolvido

A máscara frontal original é uma camada global, atualmente desenhada acima dos atores. Ela **não** é um sistema de profundidade individual por objeto. Recuperar uma árvore separada ainda exige localizar sua referência/imagem/SWF, interpretar transformações, definir a base no chão e implementar ordenação adequada. Cercas longas, pontes e vários andares podem exigir partes ou regras próprias. `_scene_mg.xml` e seus recursos devem ser investigados, sem declarar que toda referência corresponde a um objeto modular já confirmado.

Não criar alpha pela cor da terra, não reaproveitar polígonos opacos de `background.jpg` e não confundir máscara visual com grade caminhável. Se faltar uma dependência, registrar seu caminho, fonte e impacto. Se a camada nativa for comprovadamente vazia, preservá-la vazia; os casos e a condição de aceitação estão descritos abaixo.

## Camadas frontais nativamente vazias — 21/10/2026

10013 (topo do Vale do Fim) e 10016 (cânion) têm zero recortes no XML frontal e alphaMap.png inteiramente transparente. O extrator aceita essa ausência comprovada, sem criar pixels ou obstáculos. Caso haja recortes declarados e composição inesperadamente vazia, continua recusando o resultado. Teste de regressão, comparação integral do alpha e navegador WebGL/Canvas cobrem os dois mapas. Os novos 10012/10021 possuem máscaras reais; os dezesseis mapas integrados continuam sem profundidade individual de objetos/SWF intermediários.

## Atualização confirmada: máscara frontal nativa

A recuperação foi realizada no computador com o acervo, separado do projeto canônico; isso não significa que os originais acompanhem toda cópia do repositório. A referência estática `map/images/MapTile.as`, método `processImageRender`, esclarece o formato: os nomes PNG do XML frontal são virtuais. O cliente recorta o bloco JPEG correspondente usando offset/width/height e aplica o alpha original de `alphaMap.png` com `BitmapData.copyPixels`. Os `.cfg/.bin` inspecionados contêm metadados AMF3, não imagens empacotadas.

As máscaras dos mapas 10001/10005/10006/10008 usam transparência 0/85/170. `tools/recover_native_foreground.py --source <acervo> --ids 10001,10005,10006,10008` recompõe somente esses quatro mapas, um por vez. Mantém retângulos e pixels das fontes, verifica hashes, guarda backup local e preserva URLs. No WebGL, NativeForegroundLayer reutiliza a textura já carregada do fundo com a máscara original. Somente 44–125 KB adicionais por mapa são baixados. Canvas usa WebP sem perda, comparado integralmente em RGBA; PNGs canônicos continuam disponíveis.

Isso recupera a camada frontal translúcida global original. Não resolve ordenação de cada árvore/cerca por Y, divisão de objetos longos, animações intermediárias ou passagens em vários andares. Esses itens continuam pendentes. O método não inventa alpha a partir das cores do chão e não altera navegação. Os recortes opacos manuais permanecem desativados.

Evidências por ID: `reports/native-foreground-recovery.json`, `native-foreground-pixel-validation.json` e `native-foreground-browser-validation.json`. A auditoria dos demais mapas fica em `reports/original-map-audit.json`. Conferir os estados nos relatórios: conversão sozinha não significa validação visual completa.

## Histórico anterior à recuperação

As notas abaixo ficam preservadas como histórico; disponibilidade do acervo e ausência da camada frontal vazia foram superadas pela atualização acima.


Roteiro completo para o computador com o acervo: [Extração e integração dos originais](EXTRACAO_E_INTEGRACAO_ORIGINAIS.md), especialmente as etapas 1, 2, 5 e 6. O usuário pediu investigar modularidade em todos os mapas, integrar os mapas restantes e implementar os recursos encontrados com organização e testes; não limitar a retomada aos quatro fundos atuais.

Os recortes de `background.jpg` foram desativados em `src/world/occlusion.ts`: o polígono copia chão e vegetação juntos e pode esconder o personagem atrás de terra. Testes de rota e contagem de recortes não validaram a composição visual anterior. As colisões complementares continuam separadas em `scene-geometry.ts` e `map-scenery.ts`.

Os scripts históricos apontam para uma estrutura de camadas:

- `assets/scene/map/<id>/_scene_bg.xml`: composição do fundo em blocos.
- `assets/scene/map/<id>/_scene_mg.xml`: camada intermediária a inspecionar.
- `assets/scene/map/<id>/_scene_fg.xml`: camada frontal a inspecionar.
- `MapInfo.map`: navegação, não separação visual de objetos.

Isso é um indício de organização em camadas, sem comprovar que cada árvore ou cerca exista isolada. `tools/prepare_world.py` compõe o fundo e só tenta imagens PNG/JPG da camada frontal; referências SWF e a camada intermediária não entram nessa composição. Os relatórios antigos registram a camada intermediária como pendente. Os `foreground.png` dos mapas atuais não possuem objetos recuperados.

O usuário confirmou que o acervo está em outro computador e adiou sua disponibilização. A pasta histórica é `D:\Naruto Idle\Naruto_Idle`. Para retomar, preservar/trazer preferencialmente:

- `recovery/resource-manifest.json`;
- `recovered-web/cdn`, ao menos os diretórios `assets/scene/map/{10001,10005,10006,10008}` e os recursos externos referenciados pelos XMLs;
- `assets-extraidos/mapas` e `assets-extraidos/manifestos`, se disponíveis.

Próxima inspeção: ler XMLs reais, enumerar referências e arquivos ausentes, conferir alpha dos recursos separados e transformações/origens/ordem das camadas. Converter somente amostras pequenas de SWF sem executar ActionScript. A profundidade só deve ser reativada para objetos isolados e visualmente validados, com base no chão definida por objeto. Não recriar oclusão com polígonos opacos do fundo.

A máscara de bitmap do Phaser é específica de WebGL; por isso o fallback Canvas usa a composição RGBA pronta. Referência primária: [BitmapMask — Phaser](https://docs.phaser.io/api-documentation/3.88.2/class/display-masks-bitmapmask).
