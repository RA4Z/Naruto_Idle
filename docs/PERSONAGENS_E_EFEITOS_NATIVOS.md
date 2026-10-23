# Personagens e efeitos nativos — 22/10/2026

## Acervo de efeitos por fonte — 23/10

O acervo contém 100 IDs reais com atlas, 1 entrada em sequência de quadros e 4 animações exportadas sem vínculo de habilidade. São 91 SWFs únicos e 114 pares fonte/ação distintos. O relatório integral conferiu 121 camadas e 4920 quadros, incluindo as referências repetidas a uma mesma fonte. Essas contagens não equivalem a técnicas disponíveis no combate.

A névoa original Wuyinshu (2213, ações wy1/wy2) excedia o teto de memória do atlas. Agora seus 220 quadros estão preservados em WebP sem perda, com ordem, tempo, origem e canvas completos. A sequência fica em asset-source/native-effects, fora de public; um carregador com memória limitada ainda é necessário antes do uso no combate. O validador independente verifica também origem, duração, hashes dos arquivos e RGBA de cada posição da timeline. Não houve redução de resolução nem substituição por imagem estática.

O planejador inventariou as 2.003 fontes de efeito e 3.371 ações visuais exportadas. No momento do plano, 108 pares fonte/ação estavam preparados e 3.263 pendentes; o primeiro lote novo de quatro fontes foi extraído e validado (277 quadros). IDs sintéticos source:… são referências de acervo, não IDs de habilidade. O resolvedor usa apenas recurso e nome de ação exatamente iguais aos do Effect.xml; não remove espaços nem deduz nomes ou personagens por prefixo.

A imagem externa yingzi(1).png foi recuperada por nome exato de bitmapShare.swf: 212×73, registro (-106,-36), dados XML/AMF concordantes. O material e a prova estão em public/assets/effects/shared, com integração marcada como não aplicada. A composição dessa sombra nos corpos permanece pendente.

37 testes Python passaram. Casos de regressão cobrem alteração de pixels, origem e ordem da sequência, caminhos fora da pasta, preservação de edições atuais ao instalar novos lotes e associação exata entre arquivo/ação/habilidade. A extração estática não executa ActionScript e não comprova scripts em execução, composição com o fundo do mundo ou encaixes ainda não adaptados. Apenas o Rasengan anteriormente integrado usa o caminho nativo no combate; as demais entradas continuam em revisão.

Esta etapa recupera ações e efeitos dos arquivos entregues de Naruto Online. O vínculo é feito por ID e configuração original, sem deduzir habilidades trocando prefixos numéricos. Extração, prévia e integração ao combate são estados distintos.

## Entregas

- **861 ações adicionais em 16 modelos**, com **9.279 quadros** comparados integralmente contra os bitmaps, transformações e tempos da fonte: Naruto, Sasuke azul, Sakura, Ino, Shikamaru, Chōji, Temari, Kankurō, Hinata, Gaara, Neji, Tenten, Lee, Kiba, Shino e Kakashi. Entradas, saídas, combos, reações, estados aéreos e especiais são consultáveis no admin; recuperar uma ação não libera automaticamente sua mecânica.
- **Dois especiais antes truncados foram completados**: Naruto `11000101/SP_skill1`, de 24 para 98 quadros; Sasuke preto `11000201/SP_skill1`, de 38 para 100 quadros. Os 198 quadros foram comparados integralmente. O Sasuke preto continua reservado; o inicial permanece `11000211` azul/branco. Backup dos atlas anteriores na pasta local ignorada de revisão e metadados portáveis nos relatórios.
- **16 efeitos, 18 camadas e 1.071 quadros** de renderização estática nativa, sem reduzir resolução. Rasengan, Chidori, efeitos de Ino, Shikamaru, Chōji, Temari, Kankurō, Sasuke azul, Gaara, Hinata, Neji, Kiba, Shino, Kakashi e Tenten. Frente/fundo conservam origens separadas no mesmo plano; não são recentralizados individualmente.
- Auditoria de **1.466 modelos e 2.003 SWFs de efeitos**: 1.911 display lists e 92 recursos com ações bitmap. Configuração exata de ninja/habilidades encontrada para 700 modelos. O inventário completo, símbolos, eventos e dependências estão em `reports/character-effect-inventory.json.gz`.

## O que mudou no jogo

O Rasengan usa o corpo completo de 98 quadros e o efeito `2015`, preso à origem nativa do Naruto. `NativeEffectPlayer` lê o índice real da timeline do corpo; quadros de textura deduplicados não viram um relógio diferente. O efeito acompanha escala, posição, espelhamento, profundidade e alpha do personagem. Pausa conserva o quadro; troca de ação, término, ocultação, destruição ou saída da cena limpam o efeito. Não há um segundo tween movendo o jutsu por cima da trajetória original. Os eventos sonoros desse especial usam a duração completa do corpo como referência.

O espelhamento foi corrigido também nos personagens. `flipX` do Phaser espelha dentro do recorte; por isso, a origem deve passar de `x` para `1-x`. Sem isso, poses compactas e efeitos refletiam ao redor de centros diferentes. A origem é atualizada por quadro e imediatamente ao mudar o lado, preservando a correção anterior que evita reiniciar a origem de uma animação já em andamento.

O admin ganhou prévias dos 16 efeitos: seleção de personagem/ação/skill original, reprodução, pausa, quadro e espelhamento. Corpo e efeito aparecem em painéis separados para não apresentar uma ancoragem ainda não comprovada como integração pronta. Camadas do mesmo efeito usam limites conjuntos e a mesma escala. Sem evento original de início, a prévia avisa e mostra somente o efeito.

Os outros efeitos continuam em revisão antes de substituir a apresentação de combate. O acervo original usa distâncias de ataque, deslocamentos após o golpe, alvos e pontos nomeados específicos; esses dados não equivalem automaticamente à movimentação do nosso mundo. `refPoint` e `skillEffectPoint` não são substituídos por deslocamentos inventados.

## Vínculos que exigiam cuidado

`config/skill/ninjaSkillConfig.xml` fornece o caminho real ninja → skill. Ele é cruzado com `assets/battle/SkillAction.xml`, `Effect.xml` e o XML de ações do corpo. Todas as linhas de estrelas/variantes são conservadas.

- Naruto `11000101`: `21000104 → SP_skill1 → 2015`, início no quadro 0.
- Sasuke azul `11000211`: `21000214 → SP_skill5 → 4542`.
- O Chidori `2010` está ligado a `21000204/SP_skill1` do Sasuke preto `11000201`. A extração dessa variante não a libera para recrutamento. A apresentação autoral já existente do azul permanece até a revisão específica do seu combate; não a descrevemos como o vínculo original.
- Gaara `2125` e Kakashi `2101` possuem frente/fundo distintos. Hinata usa tanto a defesa `4117` quanto o início `4016`.

Nenhuma regra de conta, XP, inventário, equipamento, recrutamento, reserva de variantes ou persistência foi alterada. Sem alterações no Supabase, contas ou saves reais.

## Formato e fidelidade

`tools/StaticSwfRender.java` usa a biblioteca oficial JPEXS 26.4.0 para renderizar display lists, matrizes, filtros e subclips estaticamente. Não abre Flash Player nem executa ActionScript. O Java e o JPEXS vieram de fontes oficiais, com hashes registrados em `reports/native-renderer-dependencies.json`; os binários e os perfis permanecem fora do Git/runtime.

O retângulo deve incluir filtros (`getDisplayRectWithFilters`). Os bounds exportados em SVG não são os bounds dos PNGs; usá-los como origem deslocava o Rasengan. Três quadros iniciais também foram comparados ao exportador CLI oficial, com RGBA idêntico.

O empacotador mantém resolução e coordenadas nativas, usa retângulos variáveis, remove somente transparência e deduplica por **pixels e posição**. Imagens iguais em posições diferentes não compartilham a origem errada. `packedAtlasUrl`, `frameSizes`, `frameOrigins`, `timeline`, FPS e tamanho do canvas original permitem reconstruir cada quadro. Texturas fixas anteriores continuam compatíveis. Limites: 480 quadros, lado 8.192, atlas/canvas de até 16 milhões de pixels e bitmaps fonte de até 32 milhões. Estourar orçamento gera pendência; não reduz a imagem silenciosamente.

Os 1.071 quadros foram reconstruídos novamente a partir dos **arquivos públicos persistidos** e comparados aos hashes RGBA dos renders nativos. Isso prova transporte, empacotamento, transparência e registro contra essa renderização estática; não prova comportamento de scripts do Flash nem ancoragens do combate ainda não resolvidas.

## Validação e evidências

- 333 testes TypeScript, 16 testes Python, tipos e 1.292 mensagens PT/EN/ES aprovados.
- 24.720 imagens/sons conferidos, sem ponteiros LFS publicados. Build de distribuição e verificação de segredos aprovados; permanece o aviso conhecido de tamanho do pacote Phaser.
- 861 ações/9.279 quadros: `reports/additional-actions-validation.json`.
- Dois especiais completos/198 quadros: `reports/complete-native-skills-validation.json`.
- 16 efeitos/18 camadas/1.071 quadros: `reports/native-effects-validation.json`.
- Carregamento e relógios das prévias em WebGL e Canvas: `reports/native-effects-browser-validation.json`. Rasengan conferido visualmente no impacto, pausado no quadro 61 e espelhado nos dois renderizadores, usando o mesmo player da produção. Não houve teste completo de jornada autenticada nem medição de FPS.
- Fixture local somente de leitura: `/tools/qa/native-effects.html`. `?effect=2015&overlay=1` usa o player real do Rasengan; `&canvas=1` força Canvas; `&review=1` usa o componente de revisão do admin. Não é uma nova tela do jogador.

## Próximas dependências reais

O inventário ainda contém 81.013 nomes de ações/marcações não preparados. Há repetições, pontos de referência e ações sem bitmaps locais; esse número não representa 81 mil clipes únicos prontos. Não gerar PNGs vazios para encerrar a fila.

Nos lotes atuais, as entradas `C_entry/C_entry_1` de Gaara precisam de interpolação de tween; `C_callup_dead` de Kakashi precisa da mistura original. Os efeitos bitmap `2030`, `2016` e `2005` exigem suporte fiel a blends/tweens/metadados, em vez de ignorá-los e declarar o resultado perfeito. O conversor agora sinaliza tween local como parcial.

A sombra externa `yingzi(1).png` continua em namespace separado. Foi encontrada uma biblioteca com `yingzi.png`, mas o alias ainda não foi comprovado. Os corpos parciais e os relatórios mantêm essa dependência. A validação de pixels dos corpos exclui conscientemente os símbolos externos não resolvidos.

Não restam timelines encurtadas entre as ações já preparadas e auditadas; isso não significa que todas as ações, efeitos, áudios e mecânicas do acervo estejam integrados. Próximos passos: adaptar blends/tweens/cor com referência verificável; resolver pontos externos e estágios originais; integrar efeitos às ações corretas por personagem; ampliar os lotes mantendo as mesmas provas.

## Reprodução

Os scripts recebem caminhos explícitos, não dependem de `D:`. Originais ficam somente para leitura. Saídas intermediárias devem ir à pasta local ignorada `assets-extraidos/` e ser revisadas antes de copiar os arquivos aprovados para `public`.

1. Auditar: `python tools/audit_character_effects.py --source ORIGINAIS --project . --output assets-extraidos/native-audit.json`.
2. Preparar o JDK 17 e o JPEXS oficial conforme os hashes. Compilar `tools/StaticSwfRender.java` com `javac -cp "FFDEC/lib/*" -d CLASSES tools/StaticSwfRender.java`.
3. Efeitos, no máximo quatro IDs explícitos: `python tools/recover_bound_effects.py --source ORIGINAIS --project . --output SAIDA_EFEITOS --work INTERMEDIARIOS --java JAVA --ffdec FFDEC --classes CLASSES --ids 2015,2010,2125,2101`.
4. Ações, no máximo quatro modelos: `python tools/recover_character_actions.py --source ORIGINAIS --project . --output SAIDA_ACOES --ids 11000101,11001201,11001301,11001601`. `--complete-clipped --actions SP_skill1` permite completar explicitamente um clip encurtado, conservando backup; não desbloqueia variantes.
5. Catálogo e derivados selecionados: `python tools/prepare_native_catalog.py --source ORIGINAIS --project . --effects SAIDA_EFEITOS --audit assets-extraidos/native-audit.json --output SAIDA_REVISAO`. Somente atlas/JSON selecionados são copiados; SWFs, classes Java, perfis e intermediários não entram no público.
6. Conferir os derivados instalados: `python tools/validate_native_effects.py --source ORIGINAIS`. Sem `--source`, é possível conferir atlas/hashes em outra máquina; a verificação dos brutos exige o acervo original.
7. Corpos: `validate_compact_actions.py` aceita `--revision`, `--expected`, `--all-frames`, `--report` e `--no-contact`, mantendo os padrões dos 31 reparos anteriores. Não sobrescrever aquele relatório histórico ao validar outra revisão.

Uma conversão pesada por vez, lotes explícitos, provas antes de avançar; manter as decisões atuais de conteúdo e não rodar regenerações antigas sobre o catálogo inteiro.
