# Shinobi Idle — Documento de Progressão e Balanceamento (v0.2)

**Estado:** proposta de game design. Não é uma promessa de conteúdo já implementado. Este documento diferencia números preliminares da versão de testes, que tem custos deliberadamente reduzidos.

## 1. Princípios

1. **Um ninja, uma jornada:** Naruto clássico → Naruto Shippuden → formas e transformações posteriores. Evoluir nunca reseta nível, qualidade ou propriedade dos equipamentos.
2. **Coleção horizontal:** novas aquisições adicionam estilos, afinidades, táticas e composição de equipe. Personagens iniciais não ficam obsoletos.
3. **Três eixos separados:** XP/nível mede treinamento; evolução requer marcos de história/nível/itens; qualidade (E → S) exige fragmentos do personagem.
4. **Classes diferentes, caça solo equivalente:** em condições equiparadas, a meta é XP/h com desvio máximo de ±5–8% entre papéis; experiências de combate distintas por sobrevivência, tempo de abate e recuperação. Não compensar papéis com multiplicadores secretos de XP.
5. **Endgame acessível, com horizonte longo:** jogador consistente chega à porta do conteúdo avançado aproximadamente após 6–12 meses de jogo, não após centenas de horas obrigatórias de ações repetitivas sem decisões.
6. **Nada depende apenas de sorte:** todos os materiais e fragmentos críticos devem ter aquisição garantida por contratos, eventos ou troca; o loot raro pode acelerar ou enriquecer estratégias.

## 2. Modelo de dados de cada personagem

- `characterId`, `level`, `xp`, `form`, `quality`, `skillUnlocks`, `talentChoices`, `equippedGear`, `skillLoadout`, `shards`.
- Nível e atributos exclusivos de cada ninja, sem XP automática para reservas durante caça solo.
- Conta possui progresso do mapa, capítulos, moedas, títulos, histórico de missões, materiais universais e coleção desbloqueada.
- Em batalhas por equipe, os personagens utilizam exatamente os seus níveis, habilidades e itens individuais já conquistados.

## 3. Qualidade por fragmentos (proposta de release)

| Nova qualidade | Fragmentos dessa etapa | Total acumulado | Incremento de atributos total |
|---|---:|---:|---:|
| E | — | 0 | 0% |
| D | 20 | 20 | +3% |
| C | 50 | 70 | +6% |
| B | 100 | 170 | +9% |
| A | 200 | 370 | +12% |
| S | 400 | 770 | +15% |

*Premissas de equilíbrio, não números finais.* O bônus é aplicado **uma única vez**, preferencialmente sobre atributos de base, evitando multiplicações que transformem S em obrigação para conteúdos básicos. Os graus B/A/S podem habilitar escolhas de talentos situacionais. Fragmentos são pessoais, mesmo após a evolução do ninja; duplicatas convertem-se em fragmentos; contratos permitem escolher qual ninja receberá recompensas. **Ninja de qualidade S não é pré-requisito para iniciar o endgame.**

## 4. Evolução permanente e transformações

- Exemplo de etapa da versão de produção: Clássico → Shippuden a partir de nível 40, conclusão de missão narrativa, 3 pergaminhos específicos e 5.000 ryō.
- *Formas permanentes* ampliam árvores de habilidade e alteram visual. **Não** reiniciam o nível.
- *Transformações temporárias* são jutsus com requisitos de chakra, duração e recarga, podendo modificar o conjunto de habilidades. Elas não devem acrescentar bônus multiplicativos ilimitados à caça.
- Exemplo da versão de testes: nível 8, 2 missões resgatadas e 2 pergaminhos. Este requisito é propositalmente mais fácil para verificar a funcionalidade.

## 5. Balanceamento de caça solo por sustain

A variável principal de comparação é o **XP por hora efetiva**, e não o dano instantâneo:

`XP/h = (3600 × XP_médio_por_abate) / (tempo_de_combate + tempo_de_movimento + tempo_de_recuperação + tempo_de_derrota_esperado)`

Se os monstros forem idênticos e concederem 40 XP cada, eis uma *meta hipotética* com tempos já incluindo movimentação dentro das colunas:

| Arquétipo | Combate e deslocamento | Recuperação | Tempo total/abate | Abates/h | XP/h |
|---|---:|---:|---:|---:|---:|
| Dano | 10 s | 6 s | 16 s | 225 | 9.000 |
| Tanque | 14 s | 2 s | 16 s | 225 | 9.000 |
| Suporte | 12 s | 4 s | 16 s | 225 | 9.000 |

O dano alto reduz o tempo de combate; o tanque minimiza dano sofrido, necessidade de poções e interrupções; o suporte usa autocura e gestão de chakra. Não devem existir itens apenas para uma classe que aumentem diretamente XP/h sem alternativa equivalente. O mapa e os encontros devem ser idênticos na comparação.

### Simulação obrigatória antes do online

Executar ao menos 10.000 encontros por arquétipo para cada faixa de nível/qualidade, com os mesmos inimigos, equipamento de orçamento equivalente e regras de IA equivalentes. Registrar XP/h, moedas/h, mortes/h, consumo/h de poções, tempo médio de luta, tempo de recuperação e variação estatística. Verificar explicitamente composições extremas, equipamentos raros e jutsus de área. Ajustar as taxas para ±5–8% do valor mediano do grupo, reavaliando após cada atualização. Balanceamento **não está validado** no protótipo v0.2.

## 6. Aquisição de personagens

- **Inicial:** escolher Naruto, Sasuke ou Sakura.
- **Fragmentos direcionados:** escolher o foco de caça/contrato, permitindo aquisição previsível de outro ninja.
- **Recrutamento:** exige fragmentos específicos ou missão narrativa.
- **Duplicatas:** convertem em fragmentos; nada de personagens duplicados ocupando inventário.
- **Ninjas reservados:** mantêm nível e itens, mas não sobem passivamente na caça solo. Não limitar todos os personagens a um recurso compartilhado que torne impossível progredir com os favoritos.

## 7. Equipamentos e economia

Qualidades propostas para o jogo final: **Comum → Incomum → Raro → Épico → Lendário → Mítico**. O nível de reforço é uma progressão distinta, com materiais específicos, ryō e recuperação parcial ao reciclar equipamentos. Armas transferíveis entre ninjas compatíveis ajudam na troca de personagem. O sistema precisará de mecanismos de retirada de moeda e materiais da economia quando existir mercado.

## 8. Endgame de 6–12 meses: marcos e significado

**Definição de entrada no endgame:** desbloquear a campanha "Quarta Grande Guerra Ninja" e o primeiro chefe de incursão cooperativa; ter uma equipe funcional para desafios estratégicos. Exemplo de requisitos sujeitos a testes: concluir seis arcos narrativos, conta no nível 120, três ninjas no nível 100, pelo menos um de qualidade A, duas evoluções Shippuden e acesso às missões de Kage. Não exigir qualidade S.

| Período de referência | Conteúdos e metas |
|---|---|
| Semana 1 | Primeiro ninja, Konoha, caça, equipamentos iniciais, primeiras missões e primeiro recrutamento |
| Semanas 2–4 | Exame Chūnin, novas zonas, escolha de jutsus, qualidade C/D, objetivos de coleção |
| Meses 2–3 | Arcos da história, chefes de mapa, terceira/quarta opções de ninja, forja e primeiras sinergias de equipe |
| Meses 4–6 | Missões avançadas, evoluções Shippuden, equipamentos épicos, qualidade B/A, formações 3v3 PvE |
| Meses 6–12 | Entrada na Grande Guerra Ninja, chefes de incursão, equipamentos lendários, títulos altos, primeiros desafios de endgame |
| Após o acesso | Equipes alternativas, melhoria rumo a S, chefes rotativos, modos competitivos separados e progressão sazonal horizontal |

Ponto de calibração: **45–60 minutos diários de escolhas ativas**, mais janelas de idle de duração limitada, não exigir estar conectado 24 h. Jogadores intensivos podem chegar antes; casuais levar mais tempo. Esses marcos deverão ser recalibrados após testes fechados; não são uma estimativa baseada em dados reais de jogadores.

## 9. Missões, títulos e razões para continuar jogando

- **Curto prazo (minutos):** caça, contrato simples, novo drop, upgrade pequeno.
- **Médio prazo (dias):** completar capítulo, obter 20–50 fragmentos, testar novo ninja, fabricar arma.
- **Longo prazo (semanas):** avançar qualidade, evolução, formar sinergia e construir equipamentos.
- **Muito longo prazo (meses):** expandir coleção útil, alcançar incursões, fechar missões de organização, títulos de prestígio e conjuntos raros.
- **Pós-endgame:** desafios novos de habilidade e composição, e não níveis infinitos dominados somente por tempo de jogo ou pagamentos.

Títulos inicialmente cosméticos; bônus funcionais, se existirem, devem ser baixos e oferecer rotas alternativas para todas as funções.

## 10. Escopo realmente implementado na v0.2

- Mapa e caça automática locais, mantendo o protótipo v0.1.
- Cinco ninjas no catálogo; três escolhas iniciais e dois extras recrutáveis.
- Progressão de nível individual; troca de personagem; qualidade E → S com fragmentos próprios.
- Escolha do ninja cujos fragmentos serão concedidos por contratos e alguns abates.
- Evolução permanente Clássico → Shippuden simplificada; nome de jutsu avançado e bônus moderados.
- Armas como loot com quatro raridades, troca e reforço até +10.
- Sustentação diferenciada por classe: regeneração e mitigação, com repouso automático de caça.
- Títulos demonstrativos, ainda sem menu de equipar títulos.
- Salvamento local e simulação limitada de XP offline.

**Não implementado:** servidor persistente, partidas online, raids, loja real, fragmentos em escala de produção, transformação temporária completa, equipe lutando simultaneamente, evolução visual fiel por sprites externos, economia multiplayer, balanceamento estatístico comprovado, endgame real de 6–12 meses.
