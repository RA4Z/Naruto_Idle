# Dois cenários interrompidos pelo prazo de renderização

O relatório `reports/aux-timeout-metadata-20261024.json` investiga duas fontes já adiadas pelo auxiliar. Ele preserva os fatos originais, símbolos, labels, FPS, contagem de tags, assinatura da timeline e uma segunda leitura de bounds pelo JPEXS. Não executa ActionScript nem tenta renderizar novamente.

| Fonte | Símbolo | Quadros | Canvas original | PNGs parciais legíveis |
| --- | ---: | ---: | --- | ---: |
| 11014511_outdooreffect | 538 | 178 | 3511 × 3547 | 90 |
| 11011741_outdooreffect | 841 | 178 | 1976 × 1821 | 142 |

O prazo anterior era de 180 segundos por processo. Ambos os canvases cabem no limite atual de 16 milhões de pixels. Entretanto, a primeira sequência completa representa cerca de 2,22 bilhões de pixels de canvas ao longo dos quadros; a segunda, 640 milhões. Isso ajuda a orientar a investigação de custo; não mede o tempo exato nem demonstra, sozinho, a causa de todo o processamento.

Na primeira pasta parcial, `0090.png` não pôde ser decodificado. Os outros 90 PNGs eram legíveis. Na segunda, os 142 PNGs existentes eram legíveis. Nenhuma pasta tinha todos os quadros nem os metadados finais completos. Nenhuma foi publicada ou considerada uma animação concluída. O relatório registra o hash de cada PNG legível; não declara uma nova comparação de todos os pixels contra o original.

## Próxima etapa concreta

Preparar um renderizador de intervalos separado, sem alterar as classes usadas pela fila ativa. Cada intervalo deve manter exatamente o mesmo canvas global, origem, FPS, matriz, filtros e chamada nativa de renderização. O intervalo limita trabalho por processo, não corta ou redimensiona a imagem. Respeitar a exclusão de operações pesadas e o gate de manutenção.

Antes de aceitar esse adaptador, comparar todos os quadros de fontes pequenas renderizadas integralmente contra a soma dos intervalos, incluindo filtros, transparência, primeiro/último quadro, fronteiras entre intervalos e labels. Rejeitar intervalos ausentes ou duplicados. Só permitir retomada de saídas com fonte, símbolo, parâmetros e hashes comprovados; um arquivo truncado nunca conta como quadro existente válido.

Após essa prova, recuperar cada uma das duas fontes em intervalos limitados, montar os metadados completos e passar pelos mesmos validadores de origem e de pixels no staging e na cópia instalada. Publicar e remover cópias geradas apenas depois das provas e do push. Esta etapa ainda não foi implementada; as duas fontes continuam adiadas.
