# Publicação na Vercel

Status em 20/10/2026: o usuário confirmou que o jogo está funcionando corretamente no navegador. A demanda de publicação/imagens foi encerrada e removida do a fazer. As otimizações de carregamento atuais são locais até um próximo deploy; nenhum deploy foi executado pelo agente nesta etapa.

## Histórico do problema resolvido

As imagens públicas haviam sido entregues como ponteiros de texto Git LFS, embora as respostas fossem HTTP 200 com Content-Type image/png. A correção indicada foi habilitar Git Large File Storage no projeto da Vercel e refazer a publicação. Referência: https://vercel.com/docs/project-configuration/git-settings . Preservar Git LFS para os binários, incluindo os novos WebP.

O comando npm run check:assets verifica imagens/sons e identifica ponteiros LFS não materializados. A build prepara o catálogo compacto de runtime; a conversão de imagens é manual, com artefatos WebP já presentes no repositório. A configuração em docs/deferred-vercel/vercel.json é histórica, sem necessidade de ativação para encerrar a demanda já resolvida pelo usuário.

## Escopo do funcionamento confirmado

A confirmação diz respeito ao jogo no navegador. A hospedagem estática não executa automaticamente server/index.mjs; admin e arena autoritativa continuam dependendo de backend Node e não foram revalidados neste domínio nesta etapa. Isso é uma limitação arquitetural separada, não uma reabertura da pendência de imagens.
