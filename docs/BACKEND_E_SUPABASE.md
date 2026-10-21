# Contas e persistência: Supabase

## Estado desta entrega

Primeira etapa de backend: contas por e-mail/senha, recuperação de senha, save por conta, importação explícita, backup local/exportação JSON, sincronização periódica e posse exclusiva entre dispositivos. O jogo local continua disponível sem configurar Supabase.

**O projeto remoto ainda não foi alterado nesta sessão.** O usuário informou a organização **Lharaz** e o projeto existente **Naruto Idle**, referência pública `gxyxlfytcjvvkmrlalrs`. O token está no `.env` ignorado pelo Git. Consultas à Management API e `npm run db:setup` receberam HTTP 403 com página do McAfee Web Gateway; não foi possível validar o token, confirmar o plano remoto ou aplicar a migração. Não anunciar provisionamento concluído com base nos testes locais.

## Limite de confiança

Esta etapa sincroniza o PvE existente: o navegador ainda calcula combate, economia e recompensas. Todo snapshot é marcado `client_unverified`, inclusive uma jornada nova, sem promoção para progresso competitivo. RLS e exclusividade protegem acesso e concorrência; não transformam valores enviados pelo jogador em uma economia autoritativa.

A arena amigável continua no servidor Node atual. Seus modos e salas não foram migrados para o Supabase, e os atributos importados da Jornada continuam não verificados. Não habilitar ranking, comércio, recompensas competitivas ou compras reais com esses snapshots.

## Organização do código

| Caminho | Responsabilidade |
| --- | --- |
| `supabase/migrations/` | SQL versionado; tabela, RLS e funções transacionais |
| `supabase/config.toml` | Configuração do desenvolvimento Supabase local, se usar a CLI |
| `src/cloud/client.ts` | SDK oficial, configuração pública e transporte RPC |
| `src/cloud/snapshot.ts` | Validação/migração compartilhada com o save local |
| `src/cloud/sync.ts` | Máquina de sincronização, revisão, posse e repetição idempotente |
| `src/cloud/journey.ts` | Integração com jornada, backup, relógio e ciclo de vida |
| `src/cloud/ui.ts` | Conta, login/cadastro/recuperação, importação e exportação |
| `tools/supabase-management.mjs` | Acesso administrativo e atualização local do `.env`, sem imprimir credenciais |
| `tools/supabase-setup.mjs` | Localizar/criar projeto Free e aplicar migrações pendentes |
| `tools/supabase-status.mjs` / `supabase-verify.mjs` | Consulta de estado e inspeção de permissões implantadas |
| `tests/cloud-*.test.*` | Validação de snapshots, concorrência, falhas e SQL real |
| `tools/cloud-fixture.mjs` / `cloud-check.mjs` | Teste de navegador contra Auth fictício e Postgres real embarcado; nunca implantar esse servidor |

Os textos de conta e sincronização estão nos catálogos PT/EN/ES usuais. Não adicionar mensagens de produto dentro dos scripts administrativos.

## Banco e concorrência

`public.game_saves` contém uma linha por `auth.users.id`, com exclusão em cascata quando a conta é excluída. O snapshot JSONB preserva o formato de save versão 1 e todos os registros individuais de personagens, inventário, equipamento, missões e localização. JSONB evita manter duas representações concorrentes durante a migração do PvE; normalização econômica pertence à etapa autoritativa abaixo. Não indexar todo o JSON nem registrar cada frame/golpe.

Campos separados: `revision`, `provenance`, `lease_id`, `lease_until`, `last_request_id`, hash do último pedido e timestamps do servidor. Limite de 128 KiB no snapshot e validação básica de estrutura no banco; o cliente usa a validação completa de `restore()` sem conceder offline na simples leitura/importação.

- `game_claim`: cria/importa somente se ainda não houver save e adquire posse por 120 segundos. Usa bloqueio de linha. Outro dispositivo recebe `SESSION_BUSY`; uma importação nunca substitui uma jornada já existente.
- `game_commit`: exige posse ainda válida e revisão esperada; incrementa a revisão atomicamente. Repetição do mesmo pedido/conteúdo retorna a revisão aplicada, sem duplicar gravação. Mesmo ID com conteúdo diferente é rejeitado.
- `game_heartbeat`: renova somente uma posse que ainda não expirou. Uma sessão suspensa não ressuscita por heartbeat.
- `game_release`: libera somente a posse correspondente da própria conta.

RLS permite ler apenas o próprio save. `anon` não lê nem executa essas funções. `authenticated` não faz INSERT/UPDATE/DELETE diretamente: grava por funções `SECURITY DEFINER`, com `search_path` vazio e usuário obtido de `auth.uid()`. Não usar service role no navegador.

O cliente envia no máximo um pedido de sincronização por vez. Em falha de rede, repete o mesmo recibo antes de enviar conteúdo mais recente. A cada 30 segundos envia o snapshot mais recente ou heartbeat; não usa Realtime para saves. Ao sair pelo menu, aguarda os pedidos e gravações locais pendentes antes de liberar a posse e restaurar o cache de visitante. Falha de sincronização mantém o jogo aberto e explica o erro; perda/expiração de posse interrompe a jornada.

Ao fechar a aba abruptamente, a última sincronização confirmada pode ter até aproximadamente 30 segundos de atraso. O cache local fica disponível para recuperação, mas não sobrescreve automaticamente a nuvem. A posse remota pode levar até dois minutos para expirar. A troca de idioma aguarda a sincronização/liberação e retoma a jornada da conta após recarregar. Suspensão/perda de rede prolongada exige retomar pelo save remoto.

O cálculo offline usa o horário devolvido pelo servidor ao abrir a jornada e é sincronizado antes de liberar o jogo. A exclusividade evita duas sessões honestas resgatando o mesmo intervalo; como o cliente ainda calcula e envia o resultado, isso não é proteção contra adulteração intencional.

## Configuração gratuita

1. Disponibilizar acesso autorizado a `api.supabase.com` e ao domínio do projeto `gxyxlfytcjvvkmrlalrs.supabase.co`. Não desativar validação TLS nem contornar o gateway corporativo. Em redes corporativas com certificados instalados no sistema, os comandos usam `--use-system-ca`.
2. Conferir `.env.example`. O `.env` real já contém o token do usuário e a referência informada; nunca copiá-lo para a documentação, relatórios ou Git.
3. Executar `npm run db:status`, depois `npm run db:setup`. O setup identifica a organização e **recusa mutações se o plano não for confirmado como `free`**. Uma referência existente precisa pertencer à organização selecionada. Não altera assinatura, compute, backups pagos, réplicas ou add-ons. Se houver ambiguidade/limite, para com erro.
4. O setup aplica migrações pelo histórico da Management API e grava somente URL/chave pública em `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Preserva o token administrativo como variável privada. Configura site/redirects, preservando as demais opções de Auth. Se criar um projeto novo, salva a senha gerada localmente, cria no plano Free e solicita repetir o comando após ficar pronto.
5. Executar `npm run db:verify`: inspeciona RLS e permissões, sem ler saves/usuários. Fazer também o teste real com duas contas e dois dispositivos antes de anunciar ativação pública.
6. Configurar SMTP próprio no painel para confirmações e recuperação por e-mail. O envio padrão do Supabase é restrito à equipe; não desabilitar confirmação silenciosamente para contornar essa restrição. Credenciais de SMTP permanecem somente no provedor/painel.
7. Reiniciar `npm run dev`. Para Vercel, configurar **somente** as duas variáveis `VITE_SUPABASE_*` no projeto de frontend e gerar novo deploy. O token da Management API não vai para a Vercel. Esta entrega não fez deploy do frontend nem contratou hospedagem Node.

Não mover sprites/imagens para o banco. Continuam estáticos/CDN. Monitorar tamanho do banco, tráfego e operações; quota de usuários de Auth não representa capacidade de jogadores simultâneos. O script não ativa cobranças para superar limites.

## Validação e reprodução

```powershell
npm run test:cloud
npm run check:i18n
npm run typecheck
npm run build -- --configLoader runner
npm run check:bundle-secrets
```

O teste SQL usa PGlite, Postgres embarcado, com roles e `auth.uid()` simulados. Verifica a migração real: isolamento entre contas, proibição de gravação direta/anônima, importação sem substituição, posse exclusiva, revisão, idempotência, payload incompatível e expiração. Isso não valida configuração real de Auth, SMTP, PostgREST ou o projeto remoto.

Navegador local, em terminais separados, somente para desenvolvimento:

```powershell
node --experimental-transform-types --import ./tools/resolve-test-imports.mjs tools/cloud-fixture.mjs
# Outro terminal:
$env:VITE_SUPABASE_URL='http://127.0.0.1:5195'
$env:VITE_SUPABASE_PUBLISHABLE_KEY='test-public-key'
npm run dev -- --port 5194
# Outro terminal:
node tools/cloud-check.mjs
```

Uma cena Phaser ativa por vez. Encerrar o fixture e o servidor ao terminar; remover as variáveis temporárias antes de uma build. Nunca copiar a configuração fictícia para `.env` ou Vercel. Evidência: `reports/cloud-browser-validation.json`, explicitamente identificada como ambiente local. A build é verificada contra as credenciais privadas configuradas e contra a URL do fixture por `check:bundle-secrets`.

## Próxima etapa: economia autoritativa

Fechamento local em 21/10/2026: passaram 114 testes de domínio (incluindo sete de snapshots/sincronização), 22 de servidor/assets/banco, 1.149 chaves em três idiomas, typecheck e build final. O teste de navegador com fixture passou login/credenciais inválidas, retomada, bloqueio de segundo dispositivo, sincronização antes de sair, backup de visitante, troca de idioma com retomada e logout. A regressão do bundle compilado também passou exclusividade entre abas, equipamentos/viagem/vitória, minijanela/preferências/idioma, recuperação WebGL e fonte ampliada no celular (`reports/qol-production-validation.json`). Bundle sem credenciais privadas/configuração fictícia e diff sem erros de whitespace. Servidores e navegadores de teste encerrados. Não houve deploy nem alteração remota do Supabase; Auth/SMTP reais ainda não foram testados.

Depois da ativação e validação real desta base, migrar comandos econômicos para o Node: comprar/equipar/recrutar/resgatar missão/iniciar e encerrar caçada. O navegador envia a intenção; o servidor lê o estado confiável, calcula resultado e grava atomicamente, com idempotência e controle de revisão. Compartilhar as regras de domínio TypeScript existentes, sem duplicar fórmulas no SQL e no cliente.

Criar tabelas normalizadas de personagens, inventário, moeda, missões e sessões de caçada; importar dados atuais como legado não verificado. Progresso verificado começa por uma política explícita, sem promover automaticamente os saves desta beta. Timestamps, RNG/recompensas e liquidação offline devem ser calculados no servidor. Não manter uma simulação 60 Hz por jogador desconectado; usar intervalos limitados e liquidação em lotes. Persistir resultados/participantes da arena e buscar builds verificadas pelo usuário autenticado. Hospedar o processo Node com acesso HTTPS; Vercel estática e Supabase Auth não hospedam automaticamente esse processo.

Referências: [Management API](https://supabase.com/docs/reference/api/introduction), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [plano Free](https://supabase.com/pricing).
