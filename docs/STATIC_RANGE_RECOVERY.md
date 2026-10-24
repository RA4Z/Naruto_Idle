# Recuperação estática por intervalos

`StaticSwfRenderRange.java` usa a mesma chamada de renderização estática de `StaticSwfRender`, com o canvas global inteiro, a matriz original e escala1. O único recorte é no intervalo de índices de tempo. Cada processo recebe no máximo32quadros; o uso normal é16quadros. Permanecem os limites480quadros,8192por lado,16milhões de pixels por canvas e32MBpor fonte. Não executa ActionScript.

`native_range_recovery.py` registra cada intervalo concluído com metadados, assinatura dos PNGs e RGBA de todos os quadros. Uma tentativa interrompida não entra no ledger e nunca é aceita como quadro válido. A retomada exige fonte, fatos originais, renderizador e dependências idênticos, além da integridade dos arquivos já conferidos. Não importa PNGs parciais dos workers anteriores.

A compactação grava sequências completas WebP sem perdas, uma imagem por vez, sem construir um atlas enorme na memória. Cada imagem gravada é decodificada e comparada ao RGBA do render original antes de receber um comprovante. Repetições e quadros transparentes conservam sua posição na timeline. Uma pausa durante a compactação continua de arquivos comprovados; não recria o trabalho concluído.

`recover_static_ranges.py` exige uma prova de equivalência compatível com os hashes do renderizador, auxiliar e bibliotecas. Só aceita os contratos explícitos `scene-exported-sprite` e `role-left-exported-sprite`. Um processo incompleto mantém apenas o checkpoint; o catálogo só recebe a entrada depois de todos os intervalos e imagens estarem completos. Continua sendo extração de fonte; a sequência exige visualizador ou carregador de produção para entrar no combate.

A prova em `reports/static-range-equivalence-proof-20261024.json` registra a comparação de todos os quadros de três fontes originais contra seus renders integrais previamente conferidos. Uma delas também é comparada com um novo render integral. Esse relatório deve ser gerado e conferido antes da publicação ou do uso em fontes adiadas; a ferramenta rejeita uma prova ausente ou incompatível.

Seis testes cobrem a continuidade de canvas e tempo, transparência e repetição, mudança de fonte ou metadados, lacunas e sobreposição, PNGs truncados, sequência incompleta, retomada de WebP comprovado e caminhos externos.

As operações usam o gate de manutenção da fila principal, com uma única renderização pesada por vez. Uma etapa pode gravar seu checkpoint e devolver a fila principal; a etapa seguinte usa uma nova pausa. Nenhum prazo de manutenção é renovado para prolongar a mesma execução. A publicação final ainda exige validação independente no staging e na cópia instalada, commit e push.
