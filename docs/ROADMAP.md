# Desenvolvimento contínuo — Naruto Idle RPG

## Autorização e rotina

O usuário autorizou desenvolvimento contínuo nos resets naturais, mantendo aproximadamente 10% da cota de 5 horas e da cota semanal. Consultar o uso real antes e entre etapas. Não resgatar créditos de reset. Fazer commit e push de cada etapa validada em origin (RA4Z/Naruto_Idle). Não incluir alterações alheias: a exclusão pré-existente de DESIGN_DE_PROGRESSAO.md ainda não pertence a estes commits. Não contratar nem publicar infraestrutura sem nova autorização. Multiplayer local e seu desenvolvimento estão autorizados.

## Entregas verificadas

- [x] Organização de 312 modelos/variantes e 1.154 entradas de revisão com IDs estáveis.
- [x] 1.330 prévias de corpo inteiro e visualizador de animações no admin.
- [x] Lobby seguro na Vila da Folha, WASD/setas e clique com busca de caminho.
- [x] Navegação por MapInfo.map original: projeção isométrica e componente transitável principal.
- [x] Caminhada 96 unidades/s (antes 32), zoom 3.1 (antes 2.15).
- [x] Folha 10001, Floresta 10005, Treinamento 10006 e País das Ondas 10008, com viagens e retorno.
- [x] Seis inimigos por mapa de exploração, patrulha e respawn individual de 12 s.
- [x] Grupo opcional de até três convidados, vazio por padrão; sem duplicar um morador convidado.
- [x] /admin com senha inicial admin validada no servidor, cookie HttpOnly/SameSite e logout.
- [x] Telas administrativas: visão geral, personagens, mapas, efeitos, sons e todos os arquivos de runtime.

## Próximos blocos, nesta ordem

1. [ ] Refinar grupo e formação em repouso, navegação, escolha de alvo e perseguição dos inimigos. Testar longa duração, múltiplas voltas e todos os iniciais.
2. [ ] Chakra, custos de jutsus e regeneração; manter cura da Sakura e animações/áudio originais funcionando.
3. [ ] Loot e mochila, loja, equipamentos por slot e builds com efeitos nos atributos; transações e migração de saves testadas.
4. [ ] Quests persistentes, objetivos de exploração/combate, recompensas únicas e indicador no lobby.
5. [ ] Coleção de companheiros e recrutamento separados do grupo ativo, com visualização e progressão.
6. [ ] Arena de turnos sincronizados: servidor autoritativo, salas por chave, dois clientes independentes, chakra, cooldown, validação de turno, reconexão e expiração. Não apresentar simulação local como multiplayer. Acesso pela internet depende de hospedagem/configuração posterior.
7. [ ] Admin com itens, equipamentos, quests, salas da arena, diagnósticos e colisões sobrepostas no mapa.
8. [ ] Expandir mapas e NPCs incrementalmente, com entrada/saída, população e inspeção visual. Não basta trocar o fundo.
9. [ ] Nitidez: preservar pixels originais e testar densidade de tela, filtros e escala. Não afirmar detalhes ou super-resolução que não existem.

## Verificação

`npm test` (17 testes); `npm run test:server` (autenticação); `npm run build`; `node tools/world-admin-check.mjs` (lobby, velocidade, NPCs, grupo, quatro mapas, inimigos, combate, saves, celular e admin). Relatório: reports/world-admin-validation.json. A ferramenta __idle.advance acelera relógios Phaser e pode produzir uma interrupção de contexto no Chromium após várias viagens; para a regressão final de combate, usar tempo real conforme o script atual.

## Limites atuais

145 conjuntos de mapas originais identificados, quatro integrados. Os SWFs animados da camada intermediária permanecem preservados na origem, sem execução. Personagens adicionais ainda não têm todos os jutsus e vozes associados. A seleção inicial tem três protagonistas. A arena e os sistemas listados como pendentes ainda não foram implementados.

## Servidor e Git

Vite local em 127.0.0.1:5178 inclui a API administrativa. `npm start` serve a build e a API em 127.0.0.1:5180, configurável por HOST/PORT. A senha inicial solicitada é admin; NARUTO_ADMIN_PASSWORD permite alterá-la no servidor. Não existe senha embutida no bundle de interface.

Os assets de runtime somam aproximadamente 2,22 GB. Versionar binários usando Git LFS; manter node_modules, dist, assets-extraidos, cache do JPEXS e arquivos de ambiente fora do Git. A extração original de 8 GB permanece local e preservada.
