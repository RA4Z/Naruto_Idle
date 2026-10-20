# Arena local — 20/10/2026

Servidor real com duas sessões independentes, cookie HttpOnly/SameSite, chave de 10 caracteres aleatórios, SSE e comandos POST de mesma origem. A interface não determina vida/dano; o servidor aplica regras fixas do modo nivelado. Comandos exigem turno atual e requestId; repetir o mesmo comando não causa outro golpe. Salas limitadas a 100, convites expiram após 15 minutos, turno 30 segundos, ausência 60 segundos, retenção de resultado 5 minutos, partida até 2 horas.

Validações: cinco testes da arena mais o teste administrativo, serializados. Servidor testado contra ação fora da vez, HP/dano adulterado, comando duplicado, chave inválida, sala cheia, sessão inválida, recarga, chakra insuficiente, defesa, cura, expiração e reconexão. Um único Chromium com dois contextos independentes confirmou sincronização via servidor, reload, nocaute por desistência, interface celular e diagnóstico administrativo. Efeitos luoxuanwan/qianniao/hphuifu renderizados e requisições MP3 originais verificadas. reports/arena-browser-validation.json.

Consumo: rota /arena sem Phaser, canvas até 24 FPS e DPR máximo 2, animações/efeitos sob demanda. A jornada suspende seu loop enquanto a arena está aberta. Um navegador de teste por vez; fechar antes de build/extração. Nenhuma extração em massa realizada nesta etapa.

Limites: sem contas, ranking, persistência de partidas após reinício ou recompensas. Atributos nivelados, sem equipamentos da jornada neste primeiro modo. Não houve publicação externa. Próximos pedidos do usuário: modo com equipamento/atributos e correção da resolução de sombras externas como corpos duplicados nas animações recuperadas.
