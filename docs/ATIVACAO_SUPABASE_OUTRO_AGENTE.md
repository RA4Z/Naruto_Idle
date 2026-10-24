# Roteiro de ativação do Supabase em outro computador

## Objetivo e estado recebido

Ativar e validar a integração já implementada no projeto **Naruto Idle**, organização **Lharaz**, usando exclusivamente recursos gratuitos. Projeto existente: `gxyxlfytcjvvkmrlalrs`; [painel](https://supabase.com/dashboard/project/gxyxlfytcjvvkmrlalrs).

Esta tarefa foi autorizada pelo usuário. Aproveitar o projeto existente; não criar uma segunda organização/projeto para contornar erros ou limites. Não contratar SMTP, hospedagem ou recursos pagos. A publicação do frontend deve seguir a autorização vigente na sessão do agente; configurar Supabase não publica automaticamente na Vercel.

**Atualização de 21/10/2026:** o bloqueio da máquina anterior foi superado. Plano Free confirmado, migração `20261021205949_cloud_progress` aplicada, RLS/permissões verificadas e URL/chave pública gravadas no `.env` da cópia `D:\Naruto Idle\Naruto Idle RPG`. Testes SDK no Supabase real passaram com duas contas temporárias, removidas com seus saves; evidência `reports/supabase-live-validation.json`. SMTP e recebimento de e-mails, validação renderizada com contas reais e variáveis/deploy Vercel continuam pendentes. O restante do roteiro descreve a reprodução; consultar o estado antes de reaplicar qualquer etapa. Os relatórios antigos com Auth fictício não comprovam essas pendências.

## 1. Contextualização obrigatória

Ler nesta ordem:

1. [CONTINUATION.md](../CONTINUATION.md): estado vigente e rotina de testes.
2. [BACKEND_E_SUPABASE.md](BACKEND_E_SUPABASE.md): arquitetura, concorrência, confiança e limites.
3. [`.env.example`](../.env.example) e scripts `db:*` em [`package.json`](../package.json).
4. [`tools/supabase-management.mjs`](../tools/supabase-management.mjs), [`supabase-setup.mjs`](../tools/supabase-setup.mjs), [`supabase-status.mjs`](../tools/supabase-status.mjs) e [`supabase-verify.mjs`](../tools/supabase-verify.mjs).
5. [`20261021205949_cloud_progress.sql`](../supabase/migrations/20261021205949_cloud_progress.sql) e [`src/cloud/`](../src/cloud/).

Para esta ativação, não é necessário extrair assets, alterar mapas ou refazer o balanceamento. A implementação atual sincroniza snapshots `client_unverified`; economia PvE autoritativa, rankings, comércio e persistência da arena são uma etapa posterior.

## 2. Preparar a cópia e as credenciais

Localizar a raiz real do repositório no outro computador. Não reutilizar cegamente caminhos `C:\Users\robertn\...` ou o acervo histórico `D:\Naruto Idle\...`. Conferir alterações locais antes de editar, respeitando `AGENTS.md`, se houver.

**O `.env` é ignorado pelo Git e não acompanha clone/pull.** Criar o arquivo a partir do exemplo apenas se ele não existir. Obter o token por transferência segura do usuário ou configurar um token próprio autorizado para essa conta. Não imprimir o arquivo, pedir o token na conversa, versioná-lo ou incluí-lo em capturas/relatórios. Preservar as variáveis existentes ao complementar o arquivo.

Configuração esperada, sem credenciais reais neste documento:

```dotenv
SUPABASE_ACCESS_TOKEN=<token privado configurado localmente>
SUPABASE_ORGANIZATION=Lharaz
SUPABASE_PROJECT_NAME=Naruto Idle
SUPABASE_PROJECT_REF=gxyxlfytcjvvkmrlalrs
SUPABASE_SITE_URL=https://naruto-idle.vercel.app
```

`VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` serão preenchidos pelo setup. Jamais prefixar o token administrativo ou service role com `VITE_`. Região só é relevante na criação de um projeto; não tentar mover o existente.

Usar Node.js 24, na raiz do repositório, e instalar as dependências com `npm ci`. Em outra plataforma, adequar os comandos de shell. A ativação remota não precisa de Docker, Supabase CLI ou do servidor fictício de testes.

## 3. Conferir rede e projeto

Executar:

```powershell
npm run db:status
```

Conferir referência, nome e estado retornados. O destino deve ser o projeto existente informado acima. Os scripts usam as autoridades certificadoras do sistema; não desativar TLS. Se houver bloqueio corporativo, usar somente acesso autorizado/liberação da rede.

O comando de status não confirma o plano. O setup faz essa verificação antes das mutações. Se o projeto estiver pausado ou em preparação, conferir o painel e aguardar/tratar o estado sem habilitar um recurso pago para prosseguir.

## 4. Aplicar e verificar o banco

Executar separadamente, conferindo o código de saída de cada comando:

```powershell
npm run db:setup
npm run db:verify
```

Só executar a verificação após o setup terminar com sucesso. O setup identifica a organização, exige plano `free`, aplica migrações pendentes segundo o histórico, grava a configuração pública no `.env` e configura site/redirects de Auth, preservando as demais opções existentes. É necessário poder ler organização/projetos/chaves/configuração Auth e aplicar migrações/atualizar Auth; o token pode precisar dessas permissões mesmo quando o painel abre normalmente.

O verify inspeciona RLS/permissões sem ler dados de jogadores. Seu sucesso não substitui o teste funcional. Nunca remover RLS ou conceder acesso anônimo para fazer um teste passar.

Se a migração já tiver sido aplicada manualmente pelo SQL Editor e não constar no histórico, **não apagar a tabela ou os saves**. Comparar as definições reais com a migração e reconciliar o histórico com a ferramenta apropriada antes de repetir o setup. Não registrar uma migração como aplicada sem conferir seu conteúdo.

Se algum formato/endpoint da Management API tiver mudado, consultar a documentação oficial atual, corrigir o script de forma conservadora e registrar a diferença. Os scripts foram preparados com base na documentação, mas sua execução remota não foi validada na rede anterior.

## 5. Habilitar cadastro e recuperação reais

Conferir Auth no painel: site URL e redirects precisam corresponder aos endereços de uso. O setup inclui produção, `localhost:5178` e `127.0.0.1:5178`; acrescentar explicitamente outros endereços necessários, preservando os existentes.

Para confirmação e recuperação por e-mail, configurar SMTP próprio já disponível/autorizado e compatível com o requisito de gratuidade. O token do Supabase não fornece acesso à conta de um provedor de e-mail. Se faltarem essas credenciais, concluir o banco e informar exatamente essa dependência ao usuário; não inventar dados, contratar serviço ou desabilitar confirmação silenciosamente.

Só marcar cadastro/recuperação como concluídos após testar recebimento e uso dos links com contas de teste autorizadas. Não usar o serviço de envio padrão restrito à equipe como prova de cadastro público funcionando.

## 6. Ativar o frontend

Localmente, reiniciar `npm run dev` depois de atualizar o `.env`. Variáveis `VITE_*` são incorporadas na build, portanto alterar apenas o painel do Supabase não atualiza uma build já publicada.

Para produção, configurar no projeto correto da Vercel somente:

```dotenv
VITE_SUPABASE_URL=https://gxyxlfytcjvvkmrlalrs.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<chave pública do projeto>
```

Gerar nova build/deploy conforme autorização vigente. Não enviar `SUPABASE_ACCESS_TOKEN`, senha do banco ou service role à Vercel. Não publicar o fixture `tools/cloud-fixture.mjs`; não usar `test-public-key` ou `127.0.0.1:5195` como configuração real. A arena/admin Node continuam dependendo de hospedagem separada.

## 7. Validação antes de declarar concluído

Executar as verificações em série, respeitando a rotina de recursos do repositório:

```powershell
npm run test:cloud
npm run check:i18n
npm run typecheck
npm run build -- --configLoader runner
npm run check:bundle-secrets
```

Depois testar no Supabase real, com duas contas autorizadas e dois dispositivos/perfis isolados. Uma cena de jogo ativa por vez; o segundo dispositivo pode testar o bloqueio sem iniciar outra cena.

| Cenário | Resultado esperado |
| --- | --- |
| Cadastro, confirmação, login e recuperação | E-mails e links reais funcionam nos domínios configurados |
| Conta A importa save local válido | Progresso individual preservado; cópia de visitante mantida |
| Conta A já tem save e tenta nova importação | Save remoto existente preservado |
| Conta B consulta saves | Não lê a jornada da conta A; acesso anônimo também é negado |
| Conta A joga e volta ao início | Último progresso confirmado, posse liberada e visitante preservado |
| Conta A abre em outro dispositivo | Retoma a jornada remota correta após liberação |
| Conta A já está jogando em outro dispositivo | Segunda sessão recebe bloqueio, sem sobrescrever dados |
| Aba fecha abruptamente | Posse expira em até 120 s; retoma a última sincronização confirmada |
| Conexão falha durante gravação | Repetição não duplica atualização; sessão expirada não grava sobre a nova |
| Idioma muda durante jornada da conta | Salva/libera antes de recarregar e retoma o personagem/progresso correto |
| Logout e nova conta | Não mistura saves nem importa cache de outra conta automaticamente |

Um save remoto pode ficar até aproximadamente 30 segundos atrás em fechamento abrupto. Combate parcial não é persistido. Validar personagens, nível/XP individuais, moedas, inventário e equipamento; não conferir apenas a aparência do cenário.

## 8. Registrar a entrega e deixar a retomada correta

Atualizar `CONTINUATION.md`, `docs/ROADMAP.md` e `docs/BACKEND_E_SUPABASE.md` com o estado efetivamente observado. Criar um relatório pequeno, por exemplo `reports/supabase-live-validation.json`, distinguindo migração, permissões, Auth/SMTP, teste entre dispositivos e deploy. Incluir data, referência pública do projeto, migrações aplicadas, verificações aprovadas e pendências; excluir tokens, JWTs, senhas, e-mails pessoais e conteúdo de saves.

Só remover a pendência de bloqueio/ativação depois de confirmar o acesso e a aplicação real. Se SMTP ou deploy ficarem pendentes, manter esses itens explícitos. Encerrar apenas servidores/navegadores iniciados pelo agente. Não encerrar processos do usuário.

## Diagnóstico rápido

| Falha | Ação |
| --- | --- |
| `.env` ausente no outro computador | Preparar configuração e credencial local segura; Git não transfere esse arquivo |
| HTTP 401 | Conferir validade/autorização do token sem imprimi-lo |
| HTTP 403 com HTML/McAfee | Bloqueio de rede; não concluir que o token é inválido |
| HTTP 403 JSON da API | Conferir permissões do token/organização/projeto |
| Plano não confirmado como Free | Parar mutações e informar o usuário; não fazer upgrade |
| Projeto não encontrado/ambíguo | Conferir a referência e a organização; não criar substituto |
| Tabela existente sem histórico | Comparar schema e reconciliar migração sem destruir dados |
| Interface informa nuvem não configurada | Conferir as duas variáveis públicas e reiniciar/recompilar |
| Cadastro/login não concluem | Conferir erro de Auth, confirmação, redirects e SMTP; não remover proteções do banco |

## Prompt para iniciar o próximo agente

> Contextualize-se pelo CONTINUATION.md e siga integralmente docs/ATIVACAO_SUPABASE_OUTRO_AGENTE.md. Ative e teste a integração existente no Supabase da organização Lharaz, projeto Naruto Idle, referência gxyxlfytcjvvkmrlalrs, mantendo tudo gratuito. O código já está implementado; a sessão anterior não alterou o projeto remoto porque a rede bloqueava a Management API. Confira o estado atual antes de aplicar mudanças. Prepare o .env local com credenciais fornecidas de forma segura, pois ele não acompanha o Git. Execute os procedimentos de setup, permissões, Auth/SMTP e validação real, preserve saves e documente resultados e pendências. Não considere os testes com fixture como validação remota. Respeite a autorização vigente para publicar o frontend e mantenha o PvE atual identificado como não verificado; economia autoritativa e persistência da arena são etapas posteriores.
