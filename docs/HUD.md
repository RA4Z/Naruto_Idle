# HUD sobre o mundo

A área do jogo ocupa a janela inteira. O cabeçalho e rodapé da página aparecem na
tela de conta e ficam ocultos durante a jornada. A antiga barra lateral foi removida
do DOM e seus estilos foram retirados.

## Organização

- Canto superior esquerdo: personagem em uso, nível, vida, chakra e experiência.
  O retrato abre o resumo da jornada, progresso da conta, treino e registros da sessão.
- Topo: social, personagens/equipamentos, loja, missões, viagem, arena e configurações.
  Cada ícone tem um nome acessível e rótulo visível. As ações existentes são reaproveitadas.
- Canto superior direito: minimapa circular permanente. Nome da localização dentro da
  faixa superior; presença dentro da faixa inferior. Sem caixa externa, recolher ou expandir.
- Durante combate: ações compactas na parte inferior e alvos disponíveis como cartões
  pequenos sobre o mapa. Os bloqueios de viagem e uso de habilidades continuam ativos.
- Som, música, volume, idioma, acessibilidade, janela flutuante e saída estão nas configurações.
- Falhas de sincronização ficam visíveis como aviso discreto; sincronizações normais
  não reservam uma faixa permanente na tela.

O número de pessoas é a presença real na mesma sala da Vila da Folha, incluindo o próprio
jogador após conectar. Não é uma contagem global de contas autenticadas. Fora da vila,
a interface mostra Área individual. Durante conexão/reconexão, mostra o estado em vez de
inventar uma contagem. Nenhuma alteração no servidor ou variável de ambiente é necessária.

## Assets originais

Os ícones foram selecionados visualmente entre 389 candidatos dos assets extraídos,
principalmente do HUD mainUI do build PT_NarutoAlpha9.19Build301. Foram copiados apenas
os PNGs usados para public/assets/hud. sources.json registra caminho original e dimensões.

| Acesso | Imagem original |
| --- | --- |
| Social | mainUI bitmap-1943: aperto de mãos |
| Personagens | mainUI bitmap-1427: Naruto |
| Loja | mainUI bitmap-1141: loja da vila |
| Missões | mainUI bitmap-1344: pergaminho de missão |
| Viagem | mainUI bitmap-1516: mapa |
| Arena | mainUI bitmap-1784: armas |
| Configurações | mainUI bitmap-830: engrenagem |
| Moedas | naruto.ui bitmap-914 |

tools/hud-asset-catalog.py recria as pranchas de seleção a partir dos assets locais
(requer Python/Pillow e rg). Não é uma etapa de build.

## Implementação e referências

src/ui/game-hud.ts move os controles existentes para o HUD e diálogos, preservando IDs,
eventos e regras. Os valores compactos são derivados do mesmo estado usado no combate.
src/world/minimap.ts mantém a projeção, pontos, rotas e navegação por teclado.
src/multiplayer/village.ts escreve a presença no rodapé interno do minimapa.

O canvas e seus overlays continuam se movendo juntos para a janela flutuante; abrir uma
tela de gerenciamento restaura o viewport principal. Não há outro renderer ou cópia do jogo. As consultas dos controles usam o host do canvas
como alternativa ao documento principal quando ele estiver na janela destacada; os nós
de feedback e alvos não se duplicam durante as atualizações do HUD.

A direção visual usa ícones originais, superfícies translúcidas, bordas finas e informação
contextual. A pesquisa consultou a orientação da [Unity sobre UI imersiva, legibilidade e
redução de texto](https://unity.com/blog/games/how-to-immerse-your-players-through-effective-ui-and-game-design).
A implementação é própria, em DOM/CSS/SVG sobre Phaser.

## Validação

- npm run typecheck
- npm run check:i18n
- node --import tsx tools/hud-browser-check.mjs
- node --import tsx tools/player-inspection-browser-check.mjs
- npm run build -- --configLoader runner
- npm run check:bundle-secrets

O teste do HUD usa PGlite, Auth simulado e o backend WebSocket real com duas contas locais.
Verifica os layouts de 320, 390, 1024 e 1280 px, navegação, atalhos, áudio/idioma/acessibilidade,
janela flutuante interna e Picture-in-Picture nativo do Chrome, ausência de sobreposição
dos atalhos no viewport pequeno, mudança de mapa, pausa/retomada e contagem ao sair da vila.
Nenhuma conta real ou save de produção é alterado.

Evidências: reports/hud-validation.json, reports/hud-1280.png, reports/hud-390.png,
reports/hud-window.png e reports/hud-adventure.png.
