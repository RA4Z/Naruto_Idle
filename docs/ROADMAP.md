# Roadmap consolidado

Atualizado em 21/10/2026. O [histórico](history/ROADMAP-2026-10-21.md) preserva cronologia, autorizações e relatórios. Esta lista prevalece sobre seus itens antigos.

## Entregas atuais

- [x] Combate PvE com múltiplos atacantes, alvo trocável por clique e continuação entre inimigos sem reiniciar seus atributos/relógios.
- [x] Percepção circular e frontal, perseguição com memória/retorno e zonas invisíveis por padrão. Console de visualização exclusivo de `npm run admin`. [Regras e manutenção](COMBATE_E_PERCEPCAO.md).

- [x] Retomada após vitória vinculada à duração do golpe final, sem espera fixa de 1,7 s.
- [x] Alvo destacado e rota manual/automática desenhada no cenário.
- [x] Três conjuntos de equipamentos por personagem, com comparação, aplicação validada e persistência.
- [x] Minimapa navegável por clique/teclado com inimigos, elites, NPCs, portal e câmera. [Funcionamento e manutenção](ESTABILIDADE_E_QOL.md#navegação-e-conjuntos-de-equipamentos).

- [x] Ciclo exploração → encontro → combate no mesmo cenário → XP/loot → retomada; atributos individuais definem dano, vida, chakra e cadência/movimento.
- [x] Troca entre personagens possuídos, progresso individual e party desativada.
- [x] Sasuke inicial azul/branco 11000211; skills reconstruídas do original. Variante preta reservada.
- [x] 16 mapas integrados, grade nativa, máscara frontal com alpha, patrulhas, save/reload e viagens.
- [x] 22 equipamentos em caminhos de dano/sobrevivência/chakra, graus por nível, filtros, comparação e drops de elites; loja, cinco missões e recrutamento.
- [x] Oito estilos de recrutas por família, crescimento, técnicas próprias do idle e cobertura de todos os recrutáveis atuais com exploração/combate.
- [x] Onze modelos inimigos com seis estilos, resistência física/ninjutsu, comportamento, técnicas avisadas, uma elite por grupo e recompensas reais.
- [x] Dificuldades selecionáveis em Viagens com desbloqueios nos níveis 1/5/12/25. [Regras e validação](BALANCEAMENTO.md).
- [x] Arena local autoritativa, modos Nivelado/Jornada, reconexão e ações validadas.
- [x] Admin de personagens/mapas/efeitos/sons/arquivos, prévias de animação em grid e revisão persistente.
- [x] Carregamento progressivo, retry e três artes originais de loading.
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
- [x] Banco Supabase remoto no plano Free: migração aplicada, RLS/permissões verificadas e sessões SDK reais de duas contas temporárias validadas; contas/saves de teste removidos. Evidência em reports/supabase-live-validation.json.

Detalhes e limites: [Especificação](ESPECIFICACAO.md), [estabilidade/QoL](ESTABILIDADE_E_QOL.md), [traduções](TRADUCOES.md).

## Pendências de conteúdo, na ordem já definida

1. [ ] Extrair, organizar e integrar os demais recursos do acervo, com uso real no jogo e validação por lote: mapas/camadas/objetos, personagens/animações, jutsus/efeitos, áudio e interface. Seguir [o roteiro dos originais](EXTRACAO_E_INTEGRACAO_ORIGINAIS.md).
2. [ ] Recuperar objetos/SWF intermediários com transformações e profundidade individual. Máscara frontal global não encerra esse trabalho; consultar [MAP_LAYERS.md](MAP_LAYERS.md).
3. [ ] Integrar os 129 conjuntos de mapas restantes com navegação, população, encontros, save e inspeção visual.
4. [ ] Revisar 31 ações em 30 modelos conforme reports/external-symbol-audit.json; não refazer as skills já corrigidas do Sasuke inicial.
5. [ ] Integrar demais efeitos/jutsus originais e áudio dos personagens e ampliar conteúdo de missões. Refinar os perfis autorais com novos dados de uso; o primeiro balanceamento e a expansão de equipamento já foram implementados.
6. [ ] Integrar 195 artes de loading restantes e revisar as 71 dicas sem anunciar mecânicas inexistentes.
7. [ ] Durante a recuperação, registrar conexões, portais e coordenadas originais comprovadas.
8. [ ] Após a recuperação prioritária, implementar transições físicas entre mapas com destinos e chegadas corretos.

## Melhorias futuras fora deste lote

- [ ] Restauração por arquivo JSON exportado e auditoria do balanceamento offline. Exportação local e importação explícita para uma conta ainda sem save já estão na integração Supabase.
- [ ] Expandir diagnósticos administrativos e edição de colisões, itens/missões.
- [ ] Troca de idioma sem recarregar; hoje salva e restaura a jornada.
- [ ] Concluir a ativação pública da integração Supabase: configurar SMTP e testar confirmação/recuperação por e-mail, variáveis públicas/deploy da Vercel e fluxo renderizado em dispositivos reais. Banco/RLS e sessões SDK reais já validados; bloqueio McAfee anterior encerrado nesta máquina.
- [ ] Economia PvE autoritativa e tabelas normalizadas, política para legado não verificado, persistência da arena e hospedagem externa do Node. Contas/snapshots desta beta não habilitam rankings ou comércio confiáveis.
- [ ] Party, formação e afinidades: adiados expressamente pelo usuário.

## Rotina de trabalho

Uma tarefa pesada por vez; testes seriais, um Chromium, até seis lotes de verificação por ciclo. Encerrar recursos próprios e conferir memória entre ciclos. Converter até quatro mapas por lote, um mapa por vez. Preservar originais, IDs, dependências e alterações alheias; extração estática sem ActionScript.

Autorização histórica de continuidade: 18h–6h Brasília pode usar a janela de cinco horas inteira; durante o dia manter cerca de 10%; reserva semanal de 10% prevalece. Consultar uso real, não resgatar créditos, salvar checkpoints. A publicação de etapas validadas em origin foi autorizada historicamente; não incluir a exclusão alheia DESIGN_DE_PROGRESSAO.md nem contratar/publicar infraestrutura sem autorização. Conferir a instrução vigente da sessão antes de agir.
