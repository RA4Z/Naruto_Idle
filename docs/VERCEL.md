Publicação adiada pelo usuário em 20/10/2026. Não solicitar login, habilitar LFS nem refazer deploy até ele retomar o assunto.

# Publicação na Vercel

Diagnóstico verificado em 20/10/2026: `/assets/characters/naruto-kid/portrait.png` devolvia HTTP 200 e Content-Type image/png, mas o corpo era texto `version https://git-lfs.github.com/spec/v1` (129 bytes). Spritesheets também estavam como ponteiros. Isso causa os retratos quebrados e os erros do Phaser; não são centenas de defeitos independentes de animação.

Correção no projeto existente: Settings → Git → Git Large File Storage (LFS) → Enable. Depois fazer Redeploy. Documentação oficial: https://vercel.com/docs/project-configuration/git-settings . O suporte LFS baixa os objetos reais antes da build. Não remover LFS nem colocar 2,22 GB de binários comuns no Git.

`npm run check:assets` oferece uma verificação sequencial dos cabeçalhos das imagens/sons e falha explicitamente se houver ponteiros LFS. Ao retomar a publicação, ligar essa verificação ao prebuild. Evita publicar outra build com imagens falsas. A configuração preparada em `docs/deferred-vercel/vercel.json` fixa build/output e rotas da SPA, mas ainda não foi ativada na raiz.

A Vercel estática não executa `npm start`: /api/admin e /api/arena estavam em 404. O servidor Node local continua responsável por sessões administrativas e partidas em memória. Antes de oferecer arena online nesse domínio, conectar um backend persistente e validar dois clientes externos; não hospedar salas autoritativas apenas na memória de funções efêmeras. Nenhuma infraestrutura paga foi contratada. Corrigir assets torna o PvE estático jogável; não equivale a publicar o multiplayer.

Verificação remota após deploy: conferir assinatura PNG real, imagem JPEG real, três retratos e carregamento de uma jornada sem erros. Ainda não declarar resolvido no domínio enquanto houver ponteiros ou deploy pendente.
