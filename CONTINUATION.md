# Ponto de continuidade — estado atual

Atualizado em 21/10/2026. Este arquivo descreve o estado vigente. O [histórico de implementação](docs/history/CONTINUATION-2026-10-21.md) preserva decisões e evidências antigas, inclusive soluções provisórias já substituídas; não usá-lo como fila de tarefas.

## Ordem de leitura

1. [Especificação vigente](docs/ESPECIFICACAO.md): comportamento e limites do produto.
2. [Roadmap consolidado](docs/ROADMAP.md): entregas e pendências reais.
3. [Estabilidade e qualidade de vida](docs/ESTABILIDADE_E_QOL.md): mudanças desta etapa, arquitetura, testes e limites.
4. [Mapas e extração](docs/MAP_LAYERS.md) e [integração dos originais](docs/EXTRACAO_E_INTEGRACAO_ORIGINAIS.md).
5. [Traduções](docs/TRADUCOES.md).

## Produto e código

- Phaser 3.90, TypeScript 5.9, Vite 7.1.12; frontend em src/, API local em server/.
- Novo jogo escolhe Naruto 11000101, Sasuke azul/branco 11000211 ou Sakura 11000301. Sasuke preto 11000201 permanece reservado. Skills do Sasuke azul foram regeneradas do original, sem o fallback histórico.
- Um personagem controlado por vez. Nível, XP, treino e equipamento individuais; XP online/offline somente do ativo. Party continua adiada.
- 16 mapas funcionais de 145 conjuntos identificados; 129 restantes. Navegação nativa, patrulhas, encontros, recompensas, viagens e persistência.
- Máscaras frontais nativas recuperadas. Profundidade por objeto/SWF intermediário ainda pendente. Não reativar recortes opacos de background.jpg.
- Quatro equipamentos, cinco missões, recrutamento, jutsus dos iniciais, loja, coleção e arena local autoritativa. Recrutas adicionais têm atributos provisórios e não herdam jutsu de outro modelo.
- Carregamento progressivo, retry, três artes originais de loading, áudio sob demanda e minijanela nativa quando suportada. Produção Vercel funcionando conforme confirmação do usuário; backend da arena/admin depende do servidor Node.
- PT/EN/ES oficiais. Primeiro acesso detecta preferências do navegador, inclusive variantes regionais; fallback inglês. Escolha manual salva prevalece. IDs, regras, notas do usuário e caminhos não são traduzidos.
- Jornada exclusiva por origem do navegador: Web Locks ou lease transacional em IndexedDB no HTTP LAN, com conferência de posse antes de gravar/restaurar. Menu e acervo podem abrir em outras abas.
- QoL: coleção própria separada do acervo, favoritos/busca/nível, comparação real de equipamento, busca/favoritos/última viagem, estado da caçada, explicações de bloqueios e resumo de combate por tempo ativo.
- Preferências independentes do save: fonte 85–150%, redução de efeitos, volumes de música/ambiente/vozes. Perda de WebGL reconstrói a cena do snapshot salvo; timeout usa Canvas.

## Ambiente e rotina

Raiz atual: C:\Users\robertn\Documents\Naruto_Idle. O acervo histórico D:\Naruto Idle\Naruto_Idle não está disponível nesta cópia; confirmar sua raiz no outro computador antes de extrair. Não copiar caminhos antigos como se fossem locais.

Uma tarefa pesada por vez; suites serializadas, um Chromium e somente uma cena de jogo ativa nos testes. Até seis lotes de verificação por ciclo; encerrar recursos próprios e conferir memória antes de novo ciclo. Extração: até quatro mapas por lote, sempre um de cada vez. Não encerrar processos do usuário, não sobrescrever originais ou alterações alheias; preservar a exclusão pré-existente de DESIGN_DE_PROGRESSAO.md.

A autorização histórica de desenvolvimento contínuo, limites de uso e publicação está preservada no início do [roadmap histórico](docs/history/ROADMAP-2026-10-21.md). A tarefa atual não solicita deploy nem extração. Não declarar teste, publicação ou recuperação de assets sem evidência.

## Validação e retomada

Etapa de estabilidade/QoL concluída: 102 testes de domínio, 21 servidor/assets, 1.021 chaves pt-BR/en/es, typecheck e build final passaram. Navegadores dev e bundle compilado validaram os fluxos novos, perda/restauração real WebGL, fallback Canvas e progresso preservado; minijanela extrema, idiomas/admin/arena e loading/retry/cancelamento também passaram. Detalhes, limites e relatórios em docs/ESTABILIDADE_E_QOL.md. Servidor temporário 5194 e navegadores encerrados; sem deploy. Última correção: viagens/retorno ao lobby ficam indisponíveis durante o encontro e explicam o motivo, inclusive na fase de recompensas.

Consultar docs/ESTABILIDADE_E_QOL.md e reports/qol-validation.json para o resultado desta etapa. Os relatórios anteriores de mapas, animações, loading, arena e i18n continuam em reports/. Não confundir contagens históricas de testes com execução atual.

Próximas prioridades de conteúdo: recuperação dos originais em lotes; 31 ações/30 modelos da auditoria externa; objetos modulares e profundidade; demais mapas, sons, efeitos e artes. Portais originais ficam após a recuperação prioritária, usando ligações e coordenadas comprovadas.
