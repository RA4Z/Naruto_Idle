# Camadas dos mapas: investigação pendente

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
