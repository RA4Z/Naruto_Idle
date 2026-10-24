# Jogadores visíveis na Vila da Folha

A cena conecta ao backend somente no mapa 10001. Cada conta vê o username e o
personagem ativo dos outros jogadores, com animações direcionais e interpolação.
A posição é enviada no máximo a cada 100ms; quando parado, a atualização acontece
a cada segundo. Ao viajar, voltar ao menu ou perder a jornada, a conexão é encerrada
e os sprites remotos são removidos. O cliente tenta reconectar após quedas do serviço.

## Executar localmente

1. Em Naruto Idle Backend: `npm ci`, `npm run build`, `npm start`.
2. No .env do jogo: `VITE_MULTIPLAYER_URL=ws://localhost:10000/ws`.
3. Em ALLOWED_ORIGINS do backend: incluir a origem exata usada para abrir o jogo,
   por exemplo `http://localhost:5178` (sem barra final).
4. Reiniciar o Vite depois de editar as variáveis.
5. Abrir duas contas diferentes em perfis de navegador separados e entrar na vila.

Em computadores diferentes, localhost aponta para máquinas diferentes. Para testes LAN,
usar o IP da máquina do backend na URL WebSocket e permitir a origem do frontend no backend.
Em HTTPS, usar obrigatoriamente WSS.

O indicador no mapa informa conexão, indisponibilidade e quantidade de participantes.
Sem VITE_MULTIPLAYER_URL válido, a vila continua funcionando sem presença online.

## Publicar

A pasta Naruto Idle Backend é um projeto separado e precisa ser enviada para um repositório
GitHub acessível pelo Render. Escolher New Web Service, runtime Node, plano Free:

- Build: `npm ci --include=dev && npm run build`
- Start: `npm start`
- Health check: `/health`
- NODE_VERSION: 24.14.1
- NODE_ENV: production
- SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY: mesmo projeto do frontend
- ALLOWED_ORIGINS: origens HTTPS exatas do site; sem curingas ou barra final
- MAP_IDS: 10001

Não criar outro banco: os dados continuam no Supabase. Não enviar .env ao GitHub.
Os dados de colisão estão versionados em data/village.json e são lidos em execução.
As únicas consultas adicionais no Supabase são Auth, o próprio perfil e o próprio save,
com o token do jogador e as políticas RLS existentes. Não precisa de service_role.

Depois de obter a URL do Render, configurar na Vercel:
`VITE_MULTIPLAYER_URL=wss://SEU-SERVICO.onrender.com/ws`
e fazer um novo deploy do frontend. Alterar variável de build sem redeploy não muda o bundle.

## Protocolo adicional

Após autenticação e join_map, cliente envia:
`{"type":"state","state":{"x":385,"y":260,"characterId":"11000101","direction":0,"moving":false}}`

O servidor valida mapa, personagem da coleção lida no Supabase, coordenadas finitas,
destino caminhável e deslocamento limitado. Outros participantes recebem
`{"type":"player_state","mapId":"10001","player":{"id":"UUID","username":"nome","state":{...}}}`.

map_state também inclui os últimos estados dos jogadores, permitindo entrada tardia.
O próprio personagem não é duplicado. Tokens e e-mail não são enviados a outros jogadores.
O token renovado é reenviado pelo evento TOKEN_REFRESHED do Supabase.

## Validação

- Backend: `npm test`.
- Frontend: `node --import tsx --test tests/multiplayer-client.test.ts`.
- Navegador: compilar o backend, depois no jogo executar
  `node --import tsx tools/multiplayer-browser-check.mjs`.
  O teste usa portas locais 5196/5197/5198, duas contas simuladas, Chrome real,
  sprites reais e servidor WebSocket real. Não modifica contas ou saves remotos.
- Evidência: reports/multiplayer-village-validation.json e reports/multiplayer-village.png.

## Limites

É presença visual, sem PvP ou recompensas. O navegador ainda calcula seu movimento;
validar o destino e deslocamento não transforma esse movimento em simulação autoritativa.
A primeira posição válida pode vir do local restaurado pelo jogo. A coleção vem do save
existente, que ainda faz parte do sistema anterior de progresso calculado no frontend.
O backend não escreve saves nem concede acesso de gameplay aos mapas.

Apenas Vila da Folha participa desta integração. MAP_IDS não é uma política de desbloqueio.
Uma única instância mantém as salas em RAM. Reinícios limpam presença; os clientes reentram.
O Render Free pode dormir e levar tempo para acordar. Nenhuma capacidade de jogadores
simultâneos foi prometida ou medida por esses testes.
