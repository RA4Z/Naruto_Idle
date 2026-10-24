# Conferência do plano de extração

`tools/extraction_plan_status.py` produz um retrato somente de leitura de um plano de ações exportadas. Ele compara a identidade completa da fonte e o nome exato da ação; não usa a posição da fila como percentual de conclusão.

O retrato separa cinco estados mutuamente exclusivos:

- publicado, com os metadados de prova de todos os quadros;
- preparado no staging, ainda sem publicação;
- timeline não visual já revisada em um comprovante anterior;
- adiado, preservando a causa;
- ainda não tentado neste staging.

A publicação prevalece sobre entradas antigas do staging e suas pendências. Isso evita contar a mesma ação duas vezes. Uma fonte divergente, um plano duplicado ou metadados de prova incompletos interrompem a conferência. Fontes de outros planos não aumentam o numerador.

Exemplo, a partir de uma pasta com os arquivos de entrada:

```powershell
python tools/extraction_plan_status.py --plan plano.json --published-index publicado.json --staging-index staging.json --nonvisual-review revisao.json.gz --output retrato.json
```

O último argumento de revisão é opcional e aceita o comprovante `empty-source-exports-187-review.json.gz` ou um retrato anterior com `reviewedNonvisualSourceActions`. Cada entrada deve declarar a fonte e ação exatas, transparência total e revisão explícita. O hash do documento de entrada fica no retrato.

O retrato não renderiza, não revalida os pixels dos arquivos e não executa fontes originais. Ele confere os metadados de provas existentes. As leituras de arquivos de uma fila ativa têm hashes individuais; não representam uma transação simultânea entre workers. A ferramenta escreve somente o relatório escolhido.

`reports/battle-effect-progress-20261024-0640.json` registrou 1.463 publicações das 3.263 ações planejadas (44,84%), 7 preparadas, 3 não visuais revisadas, 71 adiadas e 1.719 ainda não tentadas. As 71 pendências eram 69 de canvas e 2 de tamanho de fonte. Esses números são datados e não representam o percentual geral de personagens, mapas ou jogo concluído. O catálogo completo naquele instante tinha 1.505 fontes, incluindo 42 fora deste plano. Sequências completas publicadas ainda podem exigir adaptador de produção.

Sete testes verificam a partição e a prioridade de publicação, a rejeição de fontes divergentes e provas incompletas, duplicidade e identidade do plano, requisitos da revisão não visual e o plano vazio.
