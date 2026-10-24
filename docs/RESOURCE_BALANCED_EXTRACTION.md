# Concorrência adaptativa de animações

O teste compara os mesmos quatro clipes originais completos com um, dois e quatro processos. Cada rodada inclui renderização, empacotamento, reconstrução integral dos pixels e consolidação serial. Também compara todos os hashes e metadados com a rodada serial, incluindo origem, FPS, quadros e escala. Publicação e Git não fazem parte da medição.

O limite adotado vem do teste de tempo e memória, não de tentar manter o processador em100%. Quatro processos só são preferidos se ganharem pelo menos5% sobre a alternativa e preservarem4GiB livres no teste. Esse limite é um teto: a admissão em produção continua adaptativa.

Cada ação começa com2GiB reservados. O controlador considera a memória ainda não consumida das ações em andamento antes de iniciar outra; reserva planejada4GiB, limite crítico2GiB. CPU acima de92% adia novos processos enquanto trabalhos existentes terminam. Ações do mesmo arquivoSWF são serializadas para preservar seu cache de origem e quadros nativos. Arquivos diferentes usam perfis isolados e índices próprios.

O responsável pelo lote continua sendo o único escritor de seu índice, e o responsável pela publicação continua sendo o único escritor do catálogo/Git. Cada ação tem uma cota de codificadores e RAM, para que vários extratores não criem24codificadores cada um. Ao final da fila do lote, as ações restantes podem aproveitar memória liberada. Uma falha preserva os estágios e encerra somente os filhos da operação.

O teste de WebP compara métodos4/2/0 sempre comlossless=True eexact=True. Cada imagem é reaberta e comparada aoRGBA original. Só se muda o esforço da compressão de sequências fonte quando a amostra reduz o tempo em pelo menos15% sem aumentar os bytes em mais de10%; caso contrário mantém4. Atlases públicos do jogo permanecem em4. Isso não muda qualidade visual, quadros ou limites de memória, e o comportamento para outros arquivos continua sujeito às verificações completas.

Limitações: a carga de cada clipe varia; as medições não são garantia para todo o acervo. Sequências grandes continuam fora depublic e exigem adaptador de runtime. Recursos que excedam limites permanecem explicitamente pendentes; não são aceitos como extraídos. Um registro do renderizador “Source bitmap pixel budget exceeded” é uma pendência de adaptação, preservando o teto existente.

Atualizações apenas no remoto não interrompem cada marco local. A árvore eHEAD locais continuam conferidos contra o registro da sessão; pull é integrado explicitamente e divergência remota é verificada antes de commit/push. Nenhum push forçado é permitido.
