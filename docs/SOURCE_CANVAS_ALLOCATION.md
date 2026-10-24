# Dimensão de guarda e dimensão da imagem

O renderizador integral existente limita a memória com `ceil(span / 20) + 1`. A imagem que o JPEXS realmente aloca usa `floor(span / 20) + 1`. Nos limites fracionários em twips, a guarda é um pixel maior que a imagem. Isso não exige alterar, cortar ou ampliar nenhum quadro.

A conferência do novo renderizador por intervalos revelou essa distinção e foi corrigida antes da publicação. Os 87 quadros dos três pilotos passaram na comparação completa de RGBA com os renders integrais. A guarda de memória continua conservadora e mantém os limites anteriores.

`reports/source-canvas-allocation-20261024.json` registra as dimensões e a origem das evidências para três fontes completas e duas saídas parciais. Nas fontes completas, as dimensões vêm dos comprovantes de todos os quadros. Nas parciais, vêm dos PNGs legíveis; isso não transforma uma fonte incompleta em publicação.

| Fonte interrompida | Guarda estimada | Imagem efetivamente gerada |
| --- | --- | --- |
| 11014511_outdooreffect | 3511 × 3547 | 3510 × 3546 |
| 11011741_outdooreffect | 1976 × 1821 | 1975 × 1820 |

As dimensões do relatório histórico `aux-timeout-metadata-20261024.json`, no campo `independentBounds`, representam a guarda. O campo `existingPartialRender.frames[].size` já registra as dimensões efetivas dos PNGs. A tabela antiga em `SCENE_TIMEOUT_RECOVERY.md`, apresentada como canvas original, deve ser interpretada como estimativa para a guarda de memória; esta nota fornece a distinção correta. Os relatórios datados permanecem preservados.
