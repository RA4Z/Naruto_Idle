# Estabilidade e qualidade de vida

Implementação de 21/10/2026. Estado do produto em [ESPECIFICACAO.md](ESPECIFICACAO.md); fila em [ROADMAP.md](ROADMAP.md). Este lote não inclui backup geral de save, alteração do balanceamento offline ou extração de assets.

## Uma jornada por origem

`src/journey-lock.ts` adquire posse antes de importar/iniciar a jornada e antes de `restore()` calcular offline. Em contextos com Web Locks, o navegador mantém a exclusão mesmo em abas em segundo plano. No HTTP LAN sem a API, uma transação readwrite em IndexedDB arbitra uma lease de 20 segundos, renovada a cada quatro segundos. Um token em localStorage impede gravações de um proprietário antigo.

Cada gravação verifica a posse; no fallback, a gravação também passa pela mesma fila transacional da aquisição da lease, conferindo o proprietário dentro da transação antes de atualizar o save. Isso impede uma escrita antiga pendente de cair depois da aquisição de outra aba. O loop verifica a posse antes de simular. Troca de token interrompe a aba antiga. Sair ao menu, fechar/navegar e trocar idioma liberam a posse após salvar. Após crash/suspensão prolongada, a lease pode expirar; a aba antiga para em vez de sobrescrever a nova. Ela pode voltar pelo Continuar após a outra liberar a jornada. Falha de armazenamento não permite iniciar duas jornadas silenciosamente.

Escopo: mesma origem, perfil e partição de armazenamento. Não sincroniza IP com localhost, abas anônimas, dispositivos ou contas. Menu/admin/arena não precisam possuir a jornada. Document PiP move o mesmo jogo; não cria outro proprietário.

## Caçada e gráficos

`AutoHuntNavigator` preserva alvo/rota, refaz caminhos quando o alvo se move ou o próximo segmento fica bloqueado e valida alcance/linha de passagem ao fim da rota. Alvo sem caminho é ignorado por três segundos. Imobilidade por 2,5 segundos ou perseguição de 20 segundos ignora o alvo por cinco segundos, permitindo outro alvo. Consultas são limitadas a intervalos de 500 ms. Os estados visíveis distinguem busca, aproximação, ausência de inimigos e alvos inacessíveis.

Em perda real do contexto WebGL, salva o snapshot, interrompe o loop, restaura a minijanela e mostra loading. Contexto restaurado reconstrói a cena; sem restauração em quatro segundos, usa Canvas. A instância anterior é destruída antes da nova. Retry e retorno ao menu continuam disponíveis se o carregamento falhar. O snapshot preserva personagem, mapa, posição válida, inventário e progresso; combate parcial recomeça pelo fluxo normal.

O retorno de suspensão/aba limpa o delta do loop e atualiza o tamanho; o passo de simulação continua limitado a 100 ms. Não é simulação de todas as batalhas durante a suspensão. Offline continua usando o cálculo existente na restauração da jornada.

## Interface

- **Meus personagens:** busca por nome/ID, favoritos, ordenação por nível/nome e ativo destacado; acesso separado a acervo/recrutamento. Variantes reservadas continuam ocultas. Troca durante combate permanece bloqueada, com motivo.
- **Equipamento:** `compareEquipment()` simula o item no slot correto, inclusive antes da compra, derivando os mesmos atributos do combate. Não altera inventário, moedas ou progresso durante a prévia. Mostra diferenças de ataque, vida, chakra e regeneração, inclusive zero e perdas.
- **Viagens:** busca por nome/ID, favoritos e último destino persistidos; nível recomendado da área e nível do personagem. A dificuldade não é inventada por mapa. Durante o carregamento, controles ficam indisponíveis e o status informa o destino; erro permite tentar novamente.
- **Feedback:** processamento com aria-busy; motivos de chakra, recarga, combate e moedas insuficientes. Estado da caçada visível.
- **Sessão:** métricas de combate em memória: tempo de simulação ativo, vitórias/derrotas, XP/moedas concedidos nas vitórias e taxas por minuto. Pausa/diálogos não contam. Recortes por personagem/mapa mostram até oito grupos na interface. Não inclui XP de missões, gastos, offline ou histórico permanente. Trocar personagem/recuperar gráficos preserva a sessão; nova jornada/recarga inicia outra.

## Preferências e áudio

`src/preferences.ts` persiste fonte (85–150%), efeitos reduzidos, volumes independentes de música/ambiente/vozes, favoritos e último mapa em `folha-idle-preferences`, separado do save. Sem armazenamento, a preferência funciona durante a sessão. Redução de movimento segue a preferência do sistema no primeiro uso; a escolha manual prevalece.

Fontes da interface usam rem. Minijanela recebe tamanho de fonte e classe de redução. Efeitos decorativos de combate e transições da interface podem ser desativados sem alterar ataques/dano/cadência. Personagens continuam animados. Arena respeita redução de efeitos e volume de voz.

O volume geral continua multiplicando todos os canais. `SceneAudioPlayer` aplica os volumes independentes a música e ambiente; `EntityAudioPlayer` usa o campo original voice; o adaptador `src/audio/mix.ts` identifica os seis pacotes de voz legados dos iniciais. Metadados novos podem declarar voice explicitamente. Sons de arma, passos e interface não são silenciados pelo controle de vozes.

Todas as mensagens novas têm pt-BR/en/es. Preferência do navegador é usada no primeiro acesso, fallback inglês; escolha manual salva tem prioridade.

## Verificação

Resultado da entrega anterior de estabilidade/QoL, antes do lote de [balanceamento](BALANCEAMENTO.md): **102 testes de domínio e 21 de servidor/assets passaram**, além de typecheck, verificação dos 1.021 textos nos três idiomas e build de produção (49,56 s). Após o ajuste de navegação, os 22 testes relevantes de caçada/equipamento/áudio passaram novamente. A única advertência de build era o tamanho do chunk Phaser já existente. Os resultados atuais de personagens/inimigos/equipamento ficam no guia de balanceamento.

Navegador dev: bloqueio/liberação de abas, lease expirada, antigo proprietário impedido de gravar, retomada de idioma no fallback LAN, congelamento/retomada via Chrome DevTools, coleção/acervo, comparação, preferências, viagem/vitória e perda real/restauração WebGL, incluindo Canvas após timeout. Todos aprovados sem erros em reports/qol-validation.json. Também passaram os três idiomas com jogo/admin/arena, redimensionamento extremo da minijanela e loading com imagem obrigatória ausente, retry, cancelamento/reinício e vitória após reload.

Bundle compilado: bloqueio da segunda aba, troca para Sasuke pela coleção, comparação de itens, preferências, viagem/vitória, resumo por personagem/mapa, PiP com acessibilidade, mudança para espanhol retomando a jornada e recuperação gráfica com save preservado. Tela de 390 px com fonte a 150% inspecionada. Zero erros em reports/qol-production-validation.json.

Os primeiros testes de navegador revelaram duas falhas no próprio teste (fixture sem área e contagem que incluía o canvas oculto da arena); foram corrigidas. O teste de produção também revelou um problema real: retorno ao lobby aceitava clique durante recompensas. Agora viagens ficam indisponíveis até o encontro terminar, com motivo visível; o fluxo compilado passou após a correção.

Servidor temporário 5194 e navegadores de teste foram encerrados. Processos preexistentes do usuário foram preservados. Sem deploy nesta etapa.

- Suite de domínio serial inclui cenários de rota interrompida, alvo móvel/inacessível, imobilidade e limite de perseguição, além de comparação sem mutação e mixagem independente.
- `tools/qol-check.mjs`: duas abas da mesma origem (somente uma cena ativa), bloqueio/liberação nativo, coleção/acervo, favoritos/busca, equipamentos, preferências, viagem, vitória, resumo e perda/restauração real de WebGL, inclusive fallback Canvas. Alternativa LAN exercitada desativando Web Locks e simulando lease expirada; confirma que o antigo proprietário para sem gravar.
- `tools/mini-window-resize-check.mjs`: redimensionamentos repetidos, altura zero/fracionária, outra aba ativa e combate após restaurar.
- `tools/i18n-check.mjs`: três idiomas, jornada, troca de idioma, admin e arena.
- `tools/qol-production-check.mjs`: fluxos essenciais no bundle compilado.

Os resultados estão em reports/qol-validation.json, reports/qol-production-validation.json, reports/i18n-browser-validation.json, reports/mini-window-resize-validation.json e reports/loading-validation.json. Consultar os arquivos antes de afirmar que uma verificação foi executada. Suspensão física do computador não é automatizada; congelamento do navegador, background, resize e retomada não comprovam todos os drivers/GPU/navegadores.

## Navegação e conjuntos de equipamentos

O minimapa mostra terreno, grade navegável, personagem, câmera, inimigos, elites, NPCs, portal, alvo e rota. Clique para caminhar usando a mesma navegação e colisões do cenário. Setas movem um cursor; Enter/Espaço confirma e Home retorna ao personagem. A rota manual é dourada, a automática é ciano, e um anel ciano destaca o alvo vivo. Não é possível comandar movimento durante combate, pausa, carregamento ou diálogo. Regiões fora da projeção do mapa são ignoradas; destinos usam o ajuste à grade existente. O cabeçalho permite recolher o painel; em espaço reduzido ele mostra somente esse cabeçalho. Não há teleporte nem um segundo renderizador.

Em Atributos/mochila → Conjuntos, cada personagem tem três espaços: dano, sobrevivência e chakra. Os nomes organizam os espaços, sem restringir seus itens. Equipe pela mochila e salve; sobrescrever atualiza somente o espaço escolhido. Aplicar valida propriedade e nível de todos os itens antes de substituir o equipamento completo, inclusive espaços vazios; durante combate/troca/carregamento fica bloqueado. A prévia deriva os oito atributos pela função real de combate. Conjuntos ficam em `Save.equipmentPresets`, indexados pelo ID do personagem, separados de `characterProgress`, e acompanham o save local e o snapshot de nuvem opcional. Saves antigos continuam válidos. Não concedem equipamentos ou alteram moedas/XP.

A vitória concede a recompensa uma vez e libera exploração após a duração do golpe final (aproximadamente 293–450 ms para ataque básico e 360–700 ms para skill dos protagonistas), sem a antiga sequência de 1,7 s. Animação de morte e texto de XP continuam independentemente. Pausa congela esse intervalo; recuperação de derrota mantém sua duração anterior.

Manutenção: `src/world/map-projection.ts` projeta coordenadas; `minimap.ts` controla o SVG e a acessibilidade, atualizados junto ao HUD a cada 250 ms; `route-overlay.ts` desenha a rota no chão. `src/progression/preset-schema.ts` valida o formato; `equipment-presets.ts` aplica e compara sem mutações na prévia. Novas mensagens estão no grupo `expansion.*` dos três catélogos. O minimapa é removido tanto no shutdown quanto no destroy da cena para permitir recuperação gráfica sem duplicação. Testes específicos: `tests/navigation-presets.test.ts` e `tools/navigation-presets-check.mjs` (Vite em 5194; gera `reports/navigation-presets-validation.json`).

## Combate e percepção dos inimigos

O combate em grupo, a seleção manual de alvo e a percepção/perseguição com memória estão descritos em [COMBATE_E_PERCEPCAO.md](COMBATE_E_PERCEPCAO.md). As zonas ficam invisíveis; o console com `'` e `debug=true/false` existe somente no servidor iniciado por `npm run admin`. Abrir o console pausa a jornada pelo mesmo bloqueio de diálogos existente. Navegação passou a retornar apenas coordenadas, evitando referências cíclicas aos atores em rotas e snapshots.
