# Ponto de continuidade — estado atual

Atualizado em 21/10/2026. Este arquivo descreve o estado vigente. O [histórico de implementação](docs/history/CONTINUATION-2026-10-21.md) preserva decisões e evidências antigas, inclusive soluções provisórias já substituídas; não usá-lo como fila de tarefas.

## Ordem de leitura

1. [Especificação vigente](docs/ESPECIFICACAO.md): comportamento e limites do produto.
2. [Roadmap consolidado](docs/ROADMAP.md): entregas e pendências reais.
3. [Estabilidade e qualidade de vida](docs/ESTABILIDADE_E_QOL.md): mudanças desta etapa, arquitetura, testes e limites.
4. [Mapas e extração](docs/MAP_LAYERS.md) e [integração dos originais](docs/EXTRACAO_E_INTEGRACAO_ORIGINAIS.md).
5. [Traduções](docs/TRADUCOES.md).
6. [Balanceamento](docs/BALANCEAMENTO.md): estilos, técnicas, inimigos/elites, equipamentos e dificuldades.
7. [Backend e Supabase](docs/BACKEND_E_SUPABASE.md): integração de contas/saves, SQL, comandos, limites e bloqueio remoto atual.
8. [Ativação por outro agente](docs/ATIVACAO_SUPABASE_OUTRO_AGENTE.md): roteiro operacional para o outro computador, credenciais, migrações, SMTP, Vercel e validação real.

## Produto e código

- Phaser 3.90, TypeScript 5.9, Vite 7.1.12; frontend em src/, API local em server/.
- Novo jogo escolhe Naruto 11000101, Sasuke azul/branco 11000211 ou Sakura 11000301. Sasuke preto 11000201 permanece reservado. Skills do Sasuke azul foram regeneradas do original, sem o fallback histórico.
- Um personagem controlado por vez. Nível, XP, treino e equipamento individuais; XP online/offline somente do ativo. Party continua adiada.
- 16 mapas funcionais de 145 conjuntos identificados; 129 restantes. Navegação nativa, patrulhas, encontros, recompensas, viagens e persistência.
- Máscaras frontais nativas recuperadas. Profundidade por objeto/SWF intermediário ainda pendente. Não reativar recortes opacos de background.jpg.
- 22 equipamentos em três caminhos e três graus, cinco missões, recrutamento, jutsus dos iniciais, loja, coleção e arena local autoritativa. Recrutas têm oito estilos por família, crescimento e técnicas genéricas autorais, sem herdar jutsus de outros modelos. Todos os recrutáveis atuais com exploração/combate têm família configurada.
- Onze modelos inimigos dos mapas têm perfis de caçador/brutamontes/assassino/blindado/conjurador/curandeiro; uma elite por grupo de seis, identificação dourada e recompensas próprias. Cura inimiga limitada a três usos por encontro. Dificuldades selecionáveis em Viagens nos níveis 1/5/12/25; graus de equipamento I/II/III exigem nível 1/5/12. Drop de elite limitado pelo nível e pela dificuldade.
- Carregamento progressivo, retry, três artes originais de loading, áudio sob demanda e minijanela nativa quando suportada. Produção Vercel funcionando conforme confirmação do usuário; backend da arena/admin depende do servidor Node.
- PT/EN/ES oficiais. Primeiro acesso detecta preferências do navegador, inclusive variantes regionais; fallback inglês. Escolha manual salva prevalece. IDs, regras, notas do usuário e caminhos não são traduzidos.
- Jornada exclusiva por origem do navegador: Web Locks ou lease transacional em IndexedDB no HTTP LAN, com conferência de posse antes de gravar/restaurar. Menu e acervo podem abrir em outras abas.
- QoL: coleção própria separada do acervo, favoritos/busca/nível, comparação real de equipamento, busca/favoritos/última viagem, estado da caçada, explicações de bloqueios e resumo de combate por tempo ativo.
- Preferências independentes do save: fonte 85–150%, redução de efeitos, volumes de música/ambiente/vozes. Perda de WebGL reconstrói a cena do snapshot salvo; timeout usa Canvas.
- Supabase opcional implementado localmente: Auth por e-mail, snapshot JSONB por conta, importação sem substituir nuvem, backup/exportação, revisão/idempotência e lease de 120 s entre dispositivos. Sincroniza a cada 30 s e antes de sair/trocar idioma. Snapshot sempre client_unverified; PvE/economia ainda no navegador. Projeto informado: Lharaz/Naruto Idle, gxyxlfytcjvvkmrlalrs. Management API bloqueada por McAfee HTTP 403; nenhuma migração/provisionamento remoto realizado. Credencial privada somente no .env ignorado; setup gratuito preparado, sem deploy.

## Ambiente e rotina

Raiz atual: C:\Users\robertn\Documents\Naruto_Idle. O acervo histórico D:\Naruto Idle\Naruto_Idle não está disponível nesta cópia; confirmar sua raiz no outro computador antes de extrair. Não copiar caminhos antigos como se fossem locais.

Uma tarefa pesada por vez; suites serializadas, um Chromium e somente uma cena de jogo ativa nos testes. Até seis lotes de verificação por ciclo; encerrar recursos próprios e conferir memória antes de novo ciclo. Extração: até quatro mapas por lote, sempre um de cada vez. Não encerrar processos do usuário, não sobrescrever originais ou alterações alheias; preservar a exclusão pré-existente de DESIGN_DE_PROGRESSAO.md.

A autorização histórica de desenvolvimento contínuo, limites de uso e publicação está preservada no início do [roadmap histórico](docs/history/ROADMAP-2026-10-21.md). O pedido atual autoriza integração e provisionamento no Supabase somente no plano gratuito; não inclui contratar hospedagem Node, recursos pagos ou extração. Não declarar teste, publicação, migração remota ou recuperação de assets sem evidência. Provisionamento Supabase permanece bloqueado pelo gateway, conforme docs/BACKEND_E_SUPABASE.md.

## Validação e retomada

Combate/áudio em mundo aberto, 21/10/2026: primeiro ataque no próprio encontro (sem espera de preparação), próximos golpes mantêm intervalo por velocidade e primeiro ataque inimigo após 220 ms. Vinhetas de início/vitória/derrota removidas do mundo aberto; clipes originais preservados. Passos usam distância real de 24 px, intervalo mínimo de 180 ms, alternância, contato de até 160 ms e um canal descartável; param ao imobilizar/pausar/abrir menu/entrar em combate/trocar mapa. 116 testes de domínio e typecheck/build final passaram. Navegador real com Naruto, Sasuke, Sakura e Guy validou primeiro golpe no mesmo frame, vitória, derrota controlada, passos e ausência das vinhetas, sem erros. Evidência: reports/combat-audio-validation.json; reprodução: tools/combat-audio-check.mjs. Não interpretar o tempo medido do disparo como latência de rede ou duração da animação. Servidor 5194 e navegadores de teste encerrados; sem deploy.

Supabase, etapa local concluída: 114 testes de domínio, 22 servidor/assets/banco, 1.149 chaves PT/EN/ES, typecheck, build e verificação de credenciais no bundle passaram. SQL real em Postgres embarcado; navegador com Auth fictício validou conta, save, exclusividade entre dispositivos e retomada após troca de idioma. Regressão de QoL no bundle final passou. Evidências em reports/cloud-browser-validation.json e reports/qol-production-validation.json; guia docs/BACKEND_E_SUPABASE.md. Servidores 5194/5195 e navegadores encerrados, sem deploy. Próxima ação remota: permitir acesso autorizado à Management API, executar npm run db:setup e npm run db:verify e configurar SMTP/variáveis públicas da Vercel. Token não validado devido ao bloqueio de rede; não pedir que o usuário o publique na conversa.

Balanceamento concluído em 21/10/2026: 107 testes de domínio e 21 de servidor/assets, 1.115 chaves pt-BR/en/es, typecheck e build final passaram. Simulação de 2.112 encontros sem combate acima de 60 segundos; validações dev e produção cobriram elite, recrutas, técnicas genéricas, equipamentos, requisitos individuais, recompensas e persistência. Regressões de QoL/recuperação gráfica e idiomas/admin/arena também passaram. Evidências e limites em docs/BALANCEAMENTO.md e reports/balance-*-validation.json, reports/balance-simulation.json, reports/qol-production-validation.json e reports/i18n-browser-validation.json. Servidor temporário 5194 e navegadores encerrados; sem deploy. O resultado de estabilidade/QoL abaixo pertence à etapa anterior.

Etapa de estabilidade/QoL concluída: 102 testes de domínio, 21 servidor/assets, 1.021 chaves pt-BR/en/es, typecheck e build final passaram. Navegadores dev e bundle compilado validaram os fluxos novos, perda/restauração real WebGL, fallback Canvas e progresso preservado; minijanela extrema, idiomas/admin/arena e loading/retry/cancelamento também passaram. Detalhes, limites e relatórios em docs/ESTABILIDADE_E_QOL.md. Servidor temporário 5194 e navegadores encerrados; sem deploy. Última correção: viagens/retorno ao lobby ficam indisponíveis durante o encontro e explicam o motivo, inclusive na fase de recompensas.

Consultar docs/ESTABILIDADE_E_QOL.md e reports/qol-validation.json para o resultado desta etapa. Os relatórios anteriores de mapas, animações, loading, arena e i18n continuam em reports/. Não confundir contagens históricas de testes com execução atual.

Próximas prioridades de conteúdo: recuperação dos originais em lotes; 31 ações/30 modelos da auditoria externa; objetos modulares e profundidade; demais mapas, sons, efeitos e artes. Portais originais ficam após a recuperação prioritária, usando ligações e coordenadas comprovadas.
