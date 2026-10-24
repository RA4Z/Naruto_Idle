# Pontos originais dos efeitos de cenário

Três exports `posData` de `assets/role/npc/scene/npcres` foram lidos diretamente dos originais e comparados com uma segunda leitura do timeline estático pelo JPEXS26.4. São dados de posicionamento; não são novas animações, personagens, habilidades ou hitboxes.

## Dados preservados

| Fonte | Instância | X local | Y local |
|---|---|---:|---:|
| 11006081_outdoor_effect.swf | head | 0,2 | -241 |
| 11011761_outdoor_effect.swf | head | 0 | -361 |
| 11016211_outdooreffect.swf | head | 0 | -454,1 |

As coordenadas foram convertidas de twips dividindo por20. Os inteiros originais da matriz, inclusive escala e rotação em fixed16, também ficam preservados. Os limites estáticos podem ter área zero com origem deslocada: não devem ser normalizados para `[0,0,0,0]`.

Cada fonte tem um quadro, uma instância nomeada e um sprite filho vazio. A leitura própria aceita somente o formato observado: `PlaceObject2` com Character+Matrix+Name. Rejeita flags extras, scripts, referências visuais, nomes/profundidades ambíguos e timelines animados. SHA da fonte, símbolo exportado, quadro e fps são conferidos contra o plano. A segunda leitura confirmou nome, profundidade, posição e limites sem rasterizar imagens ou executar scripts.

O formato de campos de PlaceObject2 foi conferido na [implementação pública do JPEXS](https://github.com/jindrapetrik/jpexs-decompiler/blob/master/libsrc/ffdec_lib/src/com/jpexs/decompiler/flash/tags/PlaceObject2Tag.java). O parser e a sonda deste projeto são próprios; nenhum código descompilado do jogo foi incorporado.

## Contrato para integração futura

- O ponto pertence à fonte de cenário, em coordenadas locais. Ainda falta validar o encaixe no mundo com a arte e o ator correspondentes. IDs numéricos de arquivo não autorizam deduzir uma identidade jogável.
- Espelhamento e escala devem ser aplicados uma única vez, pela transformação do ator/efeito. Não compensar deslocamentos com recortes arbitrários.
- `head` não define colisão, alcance, janela de ataque ou dano. O PvE atual continua usando sua regra de distância e navegação; a arena continua seguindo as regras próprias do servidor.
- Não substituir esses dados por retratos, screenshots ou efeitos parecidos. Não anexar automaticamente sombras ou efeitos externos.
- A conclusão destes três exports de pontos não conclui os22 exports visuais de cenário. Eles ainda exigem o adaptador explícito `scene-exported-sprite`, renderização, prova de cada quadro e publicação separada.

Dados: `asset-source/scene-source-points/index.json`. Evidências: `reports/scene-posdata-original-source-proof.json.gz`. Leitor: `tools/scene_point_data.py`; sonda independente: `tools/ProbeScenePointData.java`.
