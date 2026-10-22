# Áudio de ataque e morte do acervo entregue

Etapa de 22/10/2026, posterior ao commit de loading 91a3ef98. O escopo é recuperar e integrar **A_1hit/C_dead dos modelos que possuem ambas as animações no runtime e fonte SWF vinculada**. Não libera variantes reservadas nem acrescenta regras de jutsus, vozes de exploração ou todos os sons do jogo original.

## Entrega comprovada

- 743 modelos elegíveis processados; antes havia quatro manifestos de áudio de atores.
- 1.150 clipes MP3 referenciados por ID, com bytes preservados, incluindo os anteriores.
- 3.029 eventos comparados diretamente com o XML original: 3.012 reproduzíveis, seis de silêncio declarado pelo pacote original e 11 sem pacote correspondente na configuração entregue.
- 1.444 arquivos de fonte com hashes conferidos antes/depois; 697 contêineres de áudio comparados. Cada MP3 publicado corresponde ao DefineSound e ao símbolo/item indicado no soundConfig, sem troca por uma voz parecida.
- Os sete modelos com as 11 referências ausentes continuam `partial` no manifesto de áudio. A disponibilidade dos personagens e o estado dos atlas corporais são assuntos separados.

As referências ausentes são os pacotes 871, 536, 539, 540 e 541, usados por variantes da Temari. Há somente uma versão física de soundConfig.xml no pacote entregue. Encontrar um SWF com número igual não comprova a definição do pacote, seus itens, probabilidades ou vínculo à ação; esses eventos não recebem substitutos.

## Casos reais tratados

Os pacotes 319/928 possuem `num=0` e nenhum item: seis eventos são silêncio nativo, não falas faltantes. Ficam em `silentEvents`, com atributos/configuração e hash do contêiner preservados; nenhum MP3 vazio é fabricado.

Um clipe compartilhado pelos pacotes 287/288 possui 417 bytes de zeros antes do cabeçalho MPEG. Os bytes foram mantidos. O arquivo foi reconhecido e decodificado integralmente pelo FFmpeg instalado (MP3 mono, 44.100 Hz, aproximadamente 0,679 s) e reproduziu no decodificador do navegador. `leadingPaddingBytes` registra o prefixo; não houve corte, transcodificação ou substituição.

Grupos de voz podem ser aninhados. A classificação percorre os ancestrais até o grupo `voice`, conservando `sourceGroups`; sons de arma/passos não são classificados como fala apenas porque o personagem também tem uma fala de morte. A comparação direta detectou e levou à correção dos primeiros oito manifestos gerados antes desse ajuste.

## Integração e limites

`presentation.entityAudio` aponta para pequenos manifestos por modelo. O player existente busca metadados em série para o elenco atual e cria HTMLAudio somente quando um evento dispara. Mantém limite compartilhado de quatro vozes, cancelamento ao trocar ação/elenco, mute, pausa e descarte. Não pré-carrega os 1.150 MP3.

Refinamento do combate em grupo: `PresentationPlayer.entityAction` e `EntityAudioPlayer.action` recebem `instanceId` opcional. O mundo passa o ID da instância do inimigo (`<mapa>:<posição>`), criando canais `enemy:<instância>` independentes mesmo quando usam o mesmo modelo. Sem esse parâmetro, os canais legados `hero`/`enemy` continuam disponíveis. Reações/morte substituem somente a ação do respectivo ator. Callbacks verificam a identidade da ação vigente, impedindo reprodução atrasada mesmo quando o cancelamento do timer ocorre após seu despacho. O limite de quatro vozes continua global, incluindo todos esses canais.

O tempo do quadro nativo é escalado à duração da ação deste idle; essa escala é adaptação mecânica. As três apresentações específicas dos iniciais permanecem preservadas; adicionar seus manifestos ao acervo não cria disparos duplicados no combate. Recrutas e inimigos usam seus próprios IDs pelo caminho já existente. Esta etapa não cria novos jutsus ou escolhe falas aleatórias de outro ninja.

`unresolvedEvents` conserva frame, horário, pacote, motivo e dependência. `silentEvents` conserva silêncio declarado pela fonte. `status: ready` refere-se ao áudio dessas duas ações, sem afirmar que o modelo inteiro ou as demais ações estão completos.

## Reprodução e validação

```powershell
python tools/run_actor_audio_batches.py --source <acervo> --max-batches 6
python tools/recover_entity_audio.py --source <acervo> --ids <até-quatro-IDs-explícitos>
node --experimental-transform-types --import ./tools/resolve-test-imports.mjs tools/validate_actor_audio.mjs
python tools/validate_actor_audio_source.py --source <acervo>
```

O executor retoma somente modelos elegíveis ainda sem manifesto, em até seis lotes de quatro, sempre serializados. Modelo já integrado exige recuperação explícita para uma revisão de dependência. Cada lote passa pelo validador real do player e pela conferência dos hashes MP3. Antes de publicar, o extrator prepara os modelos, confere fontes e recusa substituir um clipe existente de hash diferente. Escritas JSON usam arquivo temporário e substituição; isso evita publicar metadados truncados, sem prometer uma transação de filesystem em caso de falha de disco.

Evidências: `actor-audio-delivery.json`, `actor-audio-validation.json`, `actor-audio-source-validation.json` e `actor-audio-browser-validation.json` em reports. Testes novos cobrem pacote ausente, segundo modelo inválido sem publicação do primeiro, grupo de voz aninhado, silêncio declarado e MP3 com padding. A suíte de assets verifica IDs, tempos, pendências e hashes de todos os modelos; o player mantém seus nove testes.

No navegador local, o player real reproduziu três clipes no ataque da Ino, sua fala de morte, três clipes no ataque de Kankurō e o evento comprovado da Temari, mantendo 871 como pendência e sem erros observados. O clipe com zeros iniciais foi testado separadamente no decodificador nativo. Nenhuma jornada, conta ou save real foi aberto. Essa prévia não equivale a ouvir todas as variantes nem a executar todas em uma caçada. Os screenshots locais ficam em reports/actor-audio-browser.png e actor-audio-padding-browser.png, ignorados pelo Git.

Próximas categorias: jutsus/efeitos externos e vozes de outras ações, UI e profundidade individual de objetos/camadas intermediárias. Os dois JPGs de rumorPlot que vieram vazios exigem outra fonte; não foram marcados como recuperados. A extração integral do acervo aproveitável ainda não está concluída.
