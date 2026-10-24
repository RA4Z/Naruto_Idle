# Limites dos workers de fonte

A renderização estática e a compactação são etapas diferentes. Limitar apenas o Java não limita o tempo total de um export grande. `tools/bounded_process.py` também permite limitar o processo Python que organiza essas etapas, sem reduzir resolução, remover quadros ou substituir o efeito.

O comando recebe uma lista de argumentos e roda sem shell. Se passar do prazo, somente a árvore do processo criado pela chamada é encerrada. No Windows, o mecanismo usa o PID retornado por `Popen` e `/T /F`, conforme a [documentação do taskkill](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill). Não procura processos por nome, não encerra aplicativos compartilhados e não remove fontes ou arquivos gerados.

Uma falha ao confirmar o encerramento é um erro distinto e impede liberar outra operação pesada. Um timeout não prova que a animação está extraída. Se o índice já tiver sido gravado, o bundle ainda precisa passar pela reconstrução independente de todos os quadros. Caso contrário, a fonte permanece pendente e os intermediários ficam preservados para revisão.

A intercalação de cenários usa uma fronteira confirmada entre ciclos de efeitos de batalha. Enquanto um cenário renderiza, valida e é publicado, a fila de batalha espera. Cada pedido tem uma identidade própria; o próximo pedido não prolonga a pausa do ciclo anterior. A janela da fronteira continua limitada a15minutos, e as etapas deixam uma reserva para salvar o estado e liberar a fila.

Testes verificam saída e códigos de erro, argumentos/durações inválidos, encerramento real de um processo filho e preservação de um arquivo que representa a fonte original. A limitação de tempo não altera o renderizador, FPS, escala, origem ou regras de combate.
