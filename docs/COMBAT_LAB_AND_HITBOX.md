# Laboratório de combate e contrato de colisão

O laboratório está em `/admin#lab`, também acessível pelo menu administrativo e pelo botão de cada personagem. Usa autenticação administrativa existente. Não abre jornada, consulta conta de jogador, concede personagens, salva progresso ou altera decisões de revisão.

É possível selecionar personagem, alvo visual e mapa; caminhar com clique/WASD/setas; reposicionar os atores; escolher uma ação original; pausar e percorrer a timeline; mudar velocidade/zoom e conferir espelhamento. Os ataques de modelos numéricos passam por uma instância temporária do `Hunt`, com atributos de nível 1 e alvo de treino de perfil padrão. A aparência do alvo não muda esse perfil. Não é um simulador do balanceamento final de cada inimigo.

## O que realmente decide um acerto hoje

| Sistema | Regra funcional | Relação com a arte |
| --- | --- | --- |
| Mundo/PvE | Distância entre os pontos no chão estritamente menor que 28 unidades e `NativeNavigation.clear` livre de obstáculos | A largura do sprite, o brilho do jutsu e o tamanho de um PNG não entram no cálculo |
| `Hunt` | Alvo em alcance, personagem parado, jogo não pausado; jutsu também exige chakra e recarga | O dano é resolvido logicamente no tick/cast, antes de executar a animação visual |
| Arena PvP atual | Ações por turno validadas pelo servidor, com HP/chakra/recarga e idempotência | Não há posições ou colisão espacial nessa modalidade atual |

O círculo dourado/vermelho no laboratório é o limite da regra real do mundo. O segmento entre os atores permite observar o contato e a obstrução. Os retângulos verdes são os limites visuais do quadro, e os pontos verdes são os registros no chão. Esses retângulos **não são hurtboxes de dano**. O limite exatamente igual a 28 é fora do alcance.

Ainda não existem no combate atual volumes de colisão específicos de espada, projétil, clones ou explosão, nem janelas de acerto por quadro da técnica. Não foram inventados ao criar esta ferramenta. Isso evita apresentar uma animação grande como um ataque de área funcional.

## Compatibilidade com a extração

- O renderer usa `queueAnimation`, `animationFrames`, `animationOrigin` e a escala visual do jogo. Preserva a timeline original, inclusive referências repetidas a um mesmo quadro, origens por quadro, atlas compactados e múltiplas páginas. O índice exibido é da timeline; o número `#` é do quadro único da textura.
- As fontes alternativas usam `modes.source` e IDs `role-source-…`. O endpoint administrativo acrescenta somente links validados do índice privado de revisão. Não muda `entities.json`, `runtime.json`, capacidades, coleção jogável ou identidades. Fontes RPG mantêm seus nomes `walk_N`, `sit` e `sit_idle` sem renomear os arquivos.
- Uma fonte sem identidade jogável pode testar a regra espacial, mas não recebe atributos/dano ou uma habilidade. A simulação de dano rejeita diretamente IDs não numéricos, além da separação na UI.
- Efeitos são anexados somente por vínculo existente explícito de modelo/ação. O Rasengan 2015 usa o `NativeEffectPlayer` e o relógio original do corpo, inclusive ao pausar e inspecionar um quadro depois do fim do clipe. Não há associação inferida por nome de arquivo. Animações corporais de outros jutsus podem ser inspecionadas sem fingir que um efeito ainda não integrado está pronto.
- Camadas externas ainda não anexadas aparecem como pendentes. Uma prova de pixels extraídos não é uma prova da habilidade em combate.
- **Carregar / atualizar fontes** consulta novamente os índices/manifests e recria a cena. Novos clipes publicados aparecem sem reescrever lógica de dano. Texturas de prévia não utilizadas são removidas ao exceder 12 clipes ou 128 MiB estimados, preservando os atores ativos; a troca de mapa/modelo destrói o jogo anterior.

## Contrato para hitboxes futuras

Os dados de animação extraídos devem continuar imutáveis e independentes do balanceamento. Uma futura configuração de combate deve vincular explicitamente `entityId`, ação e versão do perfil, usando unidades do mundo, origem no chão, orientação e intervalo ativo da **timeline**, não o índice único de textura. Um quadro pode aparecer repetidamente na timeline.

Pontos/eventos originais podem ajudar a posicionar ou sincronizar uma área, mas precisam de revisão e de um mapeamento explícito antes de causar dano. Não interpretar automaticamente todo evento ou símbolo chamado `hit` como autoridade de combate. Ataques de área/projéteis exigirão testes geométricos próprios e deduplicação por ataque/alvo. A regra espacial de PvP precisará ser validada no servidor se essa modalidade deixar de ser por turnos.

Alterar recorte, compressão, página de atlas ou resolução da arte não pode alterar alcance, dano ou quantidade de alvos. Esses são os principais conflitos evitados pelo laboratório e pelas regressões atuais.

## Validação reproduzível

`tests/combat-lab.test.ts` cobre limite estrito, parede, movimento, pausa, ausência de dano de abertura fora de alcance, isolamento, nomes RPG originais e rejeição de identidades de revisão na simulação. `tests/admin-lab.test.mjs` cobre autenticação, somente leitura, inclusão restrita de fontes e preservação dos dados jogáveis sem varrer o acervo inteiro. O runner de testes de servidor precisa do loader TypeScript do projeto, por exemplo `node --import tsx --test tests/admin-lab.test.mjs tests/admin-review.test.mjs`.

Prova de navegador: `reports/admin-combat-lab-validation.json`. As imagens de revisão ficam no workspace de trabalho, sem incluir imagens de contas ou saves reais.
