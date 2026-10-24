# Extração e validação sobrepostas

A autorização de 24/10/2026 permite paralelismo medido sem reduzir a qualidade. Esta política substitui a serialização integral das etapas de extração principal, mantendo somente um escritor de catálogo e uma fila de publicação/Git. A fila auxiliar continua usando a pausa de manutenção exclusiva.

## Execução

- Um extrator prepara até quatro ações originais por lote em diretório próprio. Enquanto um validador confere integralmente esse lote, o extrator trabalha no seguinte.
- Somente o controlador consolida entradas aprovadas. A consolidação exige cobertura completa, hash da entrada após a prova e igualdade SHA dos artefatos. Falha interrompe os filhos pertencentes à operação e preserva os resultados para revisão.
- Sequências de quadros inteiros podem usar até 24 processos independentes para WebP lossless, exact, method=4. O número efetivo depende do tamanho do canvas, quadros únicos, CPU e RAM livre. Fontes pequenas seguem sequenciais para evitar custo de inicialização.
- Reserva de planejamento de 4 GiB de RAM, verificação de 2 GiB durante a operação e reserva de disco de 8 GB. O codec não usa GPU. O controlador não fecha aplicativos do usuário.
- Todos os quadros codificados são reabertos e comparados em RGBA; o empacotador original confere novamente cada quadro, inclusive repetições, ao produzir o manifesto. FPS, ordem, coordenadas, escala, limites de atlas e renderizadores permanecem preservados.
- Catálogo e publicação são sequenciais. Cópias de raster no estágio usam links físicos quando possível; metadados têm cópias independentes. A limpeza exige igualdade com o instalado e com o objeto Git LFS local. Originais, manifestos e provas são preservados.
- Git add/checkpoints continuam por etapa. Commit/push somente no limite da janela de trabalho ou na conclusão de uma fila longa, conforme a política de sessão.

## Evidência e alcance

`capacity-five-minute-20261024.json`: teste de até cinco minutos, 760 renderizações de quadros conferidas, 19 quadros distintos de três fontes. Doze renderizadores tiveram aproximadamente 5× a vazão de um na etapa Java. Isso não mede o processo completo.

`cpu-saturation-20261024.json`: 608 renderizações adicionais conferidas. De 12 para 20–21 renderizadores, ganho adicional de cerca de 6%, com maior consumo de RAM. Não se pressupõe ganho linear até 24.

`parallel-sequence-golden-20261024.json`: duas sequências originais completas (17 e 7 quadros) e uma amostra explicitamente parcial de quatro quadros de cenário. Manifestos, pixels e arquivos WebP idênticos entre execução sequencial e paralela.

`overlap-pipeline-golden-20261024.json`: três efeitos completos renderizados novamente em execução serial e em pipeline. Entradas e hashes RGBA originais iguais; prova completa após a consolidação e medição de sobreposição real de processos. Produção continuava em segundo plano, portanto os tempos não são previsão universal.

Os testes de falha cobrem corrupção, alteração da fonte após seleção, mudança de entrada após validação, prova incompleta, caminhos externos, memória, cancelamento e preservação de entradas existentes. Extração completa de uma sequência continua sendo diferente de integração de jutsu, hitbox ou carregador no combate.

## Ativação e retomada

A política local `cycles/sequence-parallel-policy.json` controla o recurso. Ausente ou desativada, mantém o caminho sequencial. `enabled` habilita os codificadores, `maximumEncodingWorkers` limita processos e `overlapExtractionValidation` habilita os lotes isolados. Instalação somente em fronteira real de manutenção, com comprovante de pausa e hashes das ferramentas anteriores. Os diretórios de execução têm nomes curtos por compatibilidade com Java/Windows e redirecionamento de AppData.
