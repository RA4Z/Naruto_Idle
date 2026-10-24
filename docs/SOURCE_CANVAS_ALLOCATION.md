# Canvas original: alocação e guarda de memória

Para timelines não vazias, na escala 1 usada na extração, o JPEXS 26.4.0 aloca cada dimensão com `ceil(span / 20)`. Se qualquer extensão for zero, retorna uma imagem transparente de 1 × 1. A guarda conservadora do nosso renderizador usa `ceil(span / 20) + 1`. São cálculos distintos. [Implementação oficial](https://github.com/jindrapetrik/jpexs-decompiler/blob/version26.4.0/libsrc/ffdec_lib/src/com/jpexs/decompiler/flash/SWF.java#L4865).

`tools/source_canvas_geometry.py` centraliza essa regra. Um caso com altura inteira revelou que a aproximação anterior `floor(span / 20) + 1` coincidia nos pilotos fracionários, mas rejeitava alguns limites inteiros. A regra do conferidor foi corrigida; nenhum quadro original foi redimensionado ou corrigido para caber nela.

| Fonte | Guarda | Imagem nativa |
| --- | --- | --- |
| Gamabunta / d3 | 993 × 628 | 992 × 627 |
| BJhjs3tx / hjs3 | 5837 × 2753 | 5836 × 2752 |
| 11014511_outdooreffect | 3511 × 3547 | 3510 × 3546 |
| 11011741_outdooreffect | 1976 × 1821 | 1975 × 1820 |

As provas revisadas com sufixo `-r2` releem todos os 87 quadros de cada conjunto de pilotos e os comparam aos mesmos hashes RGBA e à referência integral já salva. As classes Java e bibliotecas permanecem idênticas. Os relatórios originais continuam preservados; as revisões registram seus hashes e datas. O caso inteiro tem um comprovante separado de dimensões de 16 quadros parciais, sem alegação de animação concluída.

Nos relatórios históricos, `independentBounds` representa a guarda estimada. `existingPartialRender.frames[].size` e `validation.nativeCanvasSize` registram as dimensões dos PNGs efetivamente gerados. A tabela antiga de `SCENE_TIMEOUT_RECOVERY.md` deve ser interpretada como guarda de memória.
