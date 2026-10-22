# Roadmap consolidado

Atualizado em 21/10/2026. O [histórico](history/ROADMAP-2026-10-21.md) preserva cronologia, autorizações e relatórios. Esta lista prevalece sobre seus itens antigos.

## Entregas atuais

- [x] Login sem mínimo visual de senha, e-mail identificado como credencial para autofill, apelido separado e persistência do progresso só no Supabase. Importação/backup local removidos; criação inicial pelo servidor e RPC legada sem importação de JSON. Economia por comandos autoritativos continua pendente.

- [x] Combate PvE com múltiplos atacantes, alvo trocável por clique e continuação entre inimigos sem reiniciar seus atributos/relógios.
- [x] Percepção circular e frontal, perseguição com memória/retorno e zonas invisíveis por padrão. Console de visualização exclusivo de `npm run admin`. [Regras e manutenção](COMBATE_E_PERCEPCAO.md).

- [x] Retomada após vitória vinculada à duração do golpe final, sem espera fixa de 1,7 s.
- [x] Alvo destacado e rota manual/automática desenhada no cenário.
- [x] Três conjuntos de equipamentos por personagem, com comparação, aplicação validada e persistência.
- [x] Minimapa navegável por clique/teclado com inimigos, elites, NPCs, portal e câmera. [Funcionamento e manutenção](ESTABILIDADE_E_QOL.md#navegação-e-conjuntos-de-equipamentos).

- [x] Ciclo exploração → encontro → combate no mesmo cenário → XP/loot → retomada; atributos individuais definem dano, vida, chakra e cadência/movimento.
- [x] Troca entre personagens possuídos, progresso individual e party desativada.
- [x] Sasuke inicial azul/branco 11000211; skills reconstruídas do original. Variante preta reservada.
- [x] 145 conjuntos preparados com grade nativa, máscara frontal com alpha, câmera, caminhada, save/reload e viagens. Os 16 anteriores conservam suas regras; novos cenários têm exploração segura explícita, sem anunciar campanhas prontas.
- [x] 22 equipamentos em caminhos de dano/sobrevivência/chakra, graus por nível, filtros, comparação e drops de elites; loja, cinco missões e recrutamento.
- [x] Oito estilos de recrutas por família, crescimento, técnicas próprias do idle e cobertura de todos os recrutáveis atuais com exploração/combate.
- [x] Onze modelos inimigos com seis estilos, resistência física/ninjutsu, comportamento, técnicas avisadas, uma elite por grupo e recompensas reais.
- [x] Dificuldades selecionáveis em Viagens com desbloqueios nos níveis 1/5/12/25. [Regras e validação](BALANCEAMENTO.md).
- [x] Arena local autoritativa, modos Nivelado/Jornada, reconexão e ações validadas.
- [x] Admin de personagens/mapas/efeitos/sons/arquivos, prévias de animação em grid e revisão persistente.
- [x] Carregamento progressivo, retry e 197 artes originais recuperadas, com seleção separada de 17 fundos revisados, sob demanda.
- [x] Minijanela com proteção de tamanho mínimo; Document PiP em contexto compatível e alternativa interna explícita.
- [x] PT/EN/ES, manutenção centralizada, detecção inicial do navegador, fallback inglês e preferência manual persistente.
- [x] Site Vercel funcional conforme confirmação do usuário; antiga falha de imagens encerrada.
- [x] Jornada exclusiva entre abas da mesma origem e proteção das gravações de progresso.
- [x] Caçada com replanejamento, descarte de alvo inacessível, detecção de imobilidade e limite de perseguição.
- [x] Recuperação de contexto gráfico com snapshot salvo e alternativa Canvas.
- [x] Meus personagens separado do acervo, favoritos, busca, ordenação por nível e destaque do ativo.
- [x] Comparação de equipamento antes de comprar/equipar.
- [x] Viagem com busca, favoritos, último destino e dificuldade baseada nas regras reais.
- [x] Estado da caçada, processamento e motivos de ações indisponíveis.
- [x] Resumo de combate por tempo ativo, vitórias/derrotas e XP/moedas por minuto.
- [x] Tamanho de texto, redução de efeitos e volumes separados de música, ambiente e vozes.
- [x] Documentação vigente separada dos registros históricos.
- [x] Implementação local da integração Supabase: contas, saves opcionais, importação explícita, backup, revisão/idempotência e posse entre dispositivos. [Configuração e limites](BACKEND_E_SUPABASE.md).
- [x] Tela obrigatória de login/cadastro/recuperação, nome de usuário único, perfis com RLS e proteção de entrada na jornada. Migração de perfis aplicada e Chrome validado com Supabase real (desktop, celular e PT/EN/ES).
- [x] Banco Supabase remoto no plano Free: migração aplicada, RLS/permissões verificadas e sessões SDK reais de duas contas temporárias validadas; contas/saves de teste removidos. Evidência em reports/supabase-live-validation.json.

Detalhes e limites: [Especificação](ESPECIFICACAO.md), [estabilidade/QoL](ESTABILIDADE_E_QOL.md), [traduções](TRADUCOES.md).

## Pendências de conteúdo, na ordem já definida

1. [ ] Extrair, organizar e integrar os demais recursos do acervo, com uso real no jogo e validação por lote: mapas/camadas/objetos, personagens/animações, jutsus/efeitos, áudio e interface. Seguir [o roteiro dos originais](EXTRACAO_E_INTEGRACAO_ORIGINAIS.md).
2. [ ] Recuperar objetos/SWF intermediários com transformações e profundidade individual. Máscara frontal global não encerra esse trabalho; consultar [MAP_LAYERS.md](MAP_LAYERS.md).
3. [ ] Completar conteúdo narrativo, habitantes e encontros apropriados dos mapas recuperados. Extração/viagem/navegação dos 145 conjuntos concluídas; exploração segura não equivale a campanha implementada. Identificar contexto de 21 cenários e conferir visualmente cada missão quando for implementada.
4. [x] Reconstruir as 31 ações em 30 modelos da fila externa, com namespace correto, origem por quadro e verificação independente de pixels/tempo/deslocamento. As skills já corrigidas do Sasuke inicial foram preservadas; efeitos externos compartilhados continuam explícitos em cada manifesto.
5. [ ] Integrar demais efeitos/jutsus originais, vozes das outras ações e ampliar missões. Ataque/morte nativos já têm 743 modelos processados, 1.150 clipes e 3.029 eventos comparados às fontes; 11 eventos sem pacote ficam explícitos. Ver [AUDIO_NATIVO_DO_ACERVO.md](AUDIO_NATIVO_DO_ACERVO.md). Refinar os perfis autorais com novos dados de uso; o primeiro balanceamento e a expansão de equipamento já foram implementados.
6. [x] Recuperar todas as 197 imagens reais de loading (194 adicionais; cfg.xml não é imagem), validar bytes/decodificação e selecionar 17 fundos. As outras artes e as 71 dicas permanecem em revisão de conteúdo, sem publicar anúncios antigos ou regras inexistentes.
7. [ ] Durante a recuperação, registrar conexões, portais e coordenadas originais comprovadas.
8. [ ] Após a recuperação prioritária, implementar transições físicas entre mapas com destinos e chegadas corretos.

## Melhorias futuras fora deste lote

- [ ] Restauração por arquivo JSON exportado e auditoria do balanceamento offline. Exportação local e importação explícita para uma conta ainda sem save já estão na integração Supabase.
- [ ] Expandir diagnósticos administrativos e edição de colisões, itens/missões.
- [ ] Troca de idioma sem recarregar; hoje salva e restaura a jornada.
- [ ] Concluir a ativação pública da integração Supabase: configurar SMTP e testar confirmação/recuperação por e-mail, variáveis públicas/deploy da Vercel e teste em dois dispositivos físicos. Banco/RLS, SDK e Chrome com perfis isolados já validados; bloqueio McAfee anterior encerrado nesta máquina.
- [ ] Economia PvE autoritativa e tabelas normalizadas, política para legado não verificado, persistência da arena e hospedagem externa do Node. Contas/snapshots desta beta não habilitam rankings ou comércio confiáveis.
- [ ] Party, formação e afinidades: adiados expressamente pelo usuário.

## Rotina de trabalho

Uma tarefa pesada por vez; testes seriais, um Chromium, até seis lotes de verificação por ciclo. Encerrar recursos próprios e conferir memória entre ciclos. Converter até quatro mapas por lote, um mapa por vez. Preservar originais, IDs, dependências e alterações alheias; extração estática sem ActionScript.

Autorização histórica de continuidade: 18h–6h Brasília pode usar a janela de cinco horas inteira; durante o dia manter cerca de 10%; reserva semanal de 10% prevalece. Consultar uso real, não resgatar créditos, salvar checkpoints. A publicação de etapas validadas em origin foi autorizada historicamente; não incluir a exclusão alheia DESIGN_DE_PROGRESSAO.md nem contratar/publicar infraestrutura sem autorização. Conferir a instrução vigente da sessão antes de agir.
