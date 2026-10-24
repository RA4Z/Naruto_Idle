# Progresso persistido somente no Supabase

Atualizado em 21/10/2026. Substitui os fluxos antigos de save local, importação e backup.

- Entrar pede e-mail e senha sem impor mínimo de oito no login. Cadastro e troca de senha continuam com mínimo de oito e confirmação.
- O e-mail tem type=email/autocomplete=username, inclusive no cadastro: é o identificador para gerenciadores de senhas. O apelido usa name=nickname/autocomplete=off e não é uma credencial de login. Credenciais já gravadas incorretamente no gerenciador podem precisar de atualização pelo usuário.
- Não existem botões de importar ou baixar save, nem fallback para localStorage/sessionStorage/IndexedDB. A inicialização remove saves/backups locais legados, e links de transferência antigos não são importados.
- O estado necessário para desenhar e recuperar WebGL existe apenas na RAM da aba (MemoryProgressStore). É descartado ao encerrar ou perder a jornada. Retomadas consultam o save remoto.
- O cache de sessão do Supabase Auth, idioma, preferências de interface e identificadores aleatórios de exclusividade entre abas podem continuar locais. Não armazenam o progresso do personagem. Não apagar indiscriminadamente essas informações.
- A arena standalone consulta o save da conta no Supabase. A minijanela em LAN sincroniza/libera antes de navegar para localhost, sem transportar JSON na URL; a nova origem exige login.

## Banco

Atualização de 22/10/2026: migração `20261022151351_session_takeover` aplicada ao projeto Free. A entrada do cliente usa `game_takeover`, que transfere a posse imediatamente para o novo acesso e retorna o último snapshot/revisão. Escritas, heartbeat e liberação da sessão antiga não afetam a nova. A aba antiga detecta a perda em sua próxima requisição; o intervalo de verificação agora é cinco segundos (substitui os 30 segundos citados abaixo), sujeito a suspensão/throttling do navegador. Uma sessão suspensa só descobre a troca ao voltar a executar; o banco já rejeita suas gravações desde a transferência. Alterações não sincronizadas antes da troca podem ser perdidas. `game_open` e `game_claim` permanecem para compatibilidade com versões antigas, sem permitir importação.

Migração `20261021215614_cloud_only_progress`: `game_open` recebe lease e personagem inicial opcional. O banco cria a jornada com nível 1, moedas/XP zero, inventário vazio e registros dos três iniciais. Uma jornada existente não é substituída. A função antiga `game_claim` rejeita todo JSON (`IMPORT_DISABLED`) e só permite retomada sem payload. RLS e exclusividade continuam em vigor.

Autossave agrupa alterações em até aproximadamente um segundo; heartbeat a cada 30 segundos. Sair pelo menu e trocar idioma aguardam a sincronização. Fechar/ocultar tenta enviar com keepalive quando o tamanho permite. Não há garantia de entrega em queda de rede/processo: a retomada usa apenas a última gravação confirmada pelo Supabase.

## Limite de segurança

Isso elimina a restauração de progresso adulterado em armazenamento local. Ainda **não é uma economia autoritativa**: `game_commit` aceita snapshots calculados no cliente, sob sessão/revisão válidas, e um cliente alterado pode forjar esses valores. Os saves continuam `client_unverified`. Para proteger moedas, XP, drops, equipamentos e personagens de adulteração intencional, migrar as regras para comandos no backend e rejeitar snapshots econômicos do navegador. Não habilitar ranking/comércio confiáveis antes dessa etapa.

## Verificação

`npm run test:cloud` inclui isolamento de memória, limpeza de legados, defaults no servidor e rejeição de importação JSON. `db:verify` confere as permissões remotas. O teste opt-in `tools/supabase-live-check.mjs --create-test-users --browser` cria e remove contas de teste e verifica: login sem minlength, autofill declarado, ausência dos botões, retomada após cache falso e ausência de gravações de progresso no browser. Ele não testa o preenchimento de um cofre pessoal do Chrome nem o envio de e-mails.
