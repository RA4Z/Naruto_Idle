# Caminho da Folha — Idle RPG

Jogo de navegador em Phaser 3 e TypeScript, com regras próprias de combate, evolução e loot. Recursos visuais e sonoros são recuperados dos arquivos originais; ActionScript não é usado como motor do jogo.

## Executar

Node.js 24 e npm. Na raiz desta cópia:

```powershell
Set-Location -LiteralPath 'C:\Users\robertn\Documents\Naruto_Idle'
npm ci
npm run dev
```

Abra http://localhost:5178. O servidor de desenvolvimento aceita acesso pela rede usando o IP deste computador e a mesma porta. Para o administrador, use `npm run admin` em vez de iniciar outro servidor na mesma porta; a senha inicial é `admin`, configurável por `NARUTO_ADMIN_PASSWORD`.

```powershell
npm run build -- --configLoader runner
npm start
```

O servidor Node serve a build e APIs na porta 5180, configurável por PORT/HOST. O frontend na Vercel funciona; isso não hospeda automaticamente as APIs Node da arena/admin.

## Jogar

Entre com e-mail e senha ou crie uma conta com nome de usuário único. Depois escolha Naruto, Sasuke azul/branco ou Sakura. A jornada começa na Vila da Folha. Ande por clique ou WASD/setas, viaje e ative a caçada opcional. Ataques são automáticos; jutsus dos iniciais usam chakra e recarga. A dificuldade depende da área selecionada, não do cenário escolhido.

- 16 mapas, navegação nativa, inimigos móveis, encontros no mesmo cenário, loot e progresso offline limitado.
- Personagens possuídos com nível, XP, treinos e equipamento próprios; troca fora de combate. Party adiada.
- Meus personagens separado do acervo/recrutamento, com busca, favoritos, ordenação e destaque do ativo.
- Loja/mochila com comparação de equipamento, cinco missões e recrutamento.
- 22 equipamentos com caminhos de dano, sobrevivência e chakra, graus por nível e filtros por slot/estilo.
- Recrutas com oito estilos, crescimento e técnicas próprias do idle; inimigos distintos e uma elite identificável por grupo, com recompensas maiores.
- Dificuldades de caçada selecionáveis em Viagens nos níveis 1/5/12/25, independentes do cenário.
- Viagens com busca, favoritos, último destino e dificuldade informada.
- Resumo de combate com tempo ativo, taxas de XP/moedas e comparação por mapa/personagem.
- Arena local por turnos, modos Nivelado/Jornada e reconexão.
- Carregamento progressivo, áudio sob demanda e minijanela.
- Acessibilidade e áudio: fonte 85–150%, redução de efeitos e volumes de música/ambiente/vozes.

Português, inglês e espanhol. Primeiro acesso usa as preferências do navegador; idioma não suportado resulta em inglês. A escolha manual é salva e prevalece depois. Ao mudar o idioma, a jornada é salva e retomada após recarregar.

## Progresso e estabilidade

O PvE exige conta Supabase e salva o progresso por usuário: login e sessão exclusiva entre dispositivos. O progresso persistente existe somente no Supabase; a aba usa memória temporária e descarta os caches locais antigos. Importação/exportação de saves foi removida. O banco remoto foi ativado e testado por SDK e Chrome em 21/10/2026, no plano Free; SMTP para cadastro/recuperação públicos e variáveis/deploy da Vercel ainda estão pendentes. Configuração e limites em [Backend e Supabase](docs/BACKEND_E_SUPABASE.md). Os snapshots da beta são não verificados; a economia ainda roda no cliente. Apenas uma aba pode controlar a jornada por origem; HTTP LAN usa uma lease transacional quando Web Locks não está disponível. Aba que perde a posse não pode gravar nem continuar simulando.

Perda de contexto WebGL reconstrói o cenário com o snapshot salvo, usando Canvas se o navegador não restaurar a GPU. Minijanela preserva tamanho mínimo do renderizador. Combate parcial não é restaurado.

Document PiP depende de suporte/contexto seguro. No mesmo computador do servidor, prefira localhost; a alternativa interna arrastável não acompanha outras abas. Existe transferência explícita do progresso do IP para localhost; as origens não compartilham saves automaticamente.

## Documentação vigente

- [CONTINUATION.md](CONTINUATION.md): contextualização e retomada.
- [Especificação](docs/ESPECIFICACAO.md): contratos e limites atuais.
- [Roadmap](docs/ROADMAP.md): entregas e pendências reais.
- [Estabilidade e QoL](docs/ESTABILIDADE_E_QOL.md): implementação e validação desta etapa.
- [Traduções](docs/TRADUCOES.md): adicionar textos/idiomas.
- [Balanceamento](docs/BALANCEAMENTO.md): perfis, técnicas, elites, equipamentos, dificuldades e simulações.
- [Backend e Supabase](docs/BACKEND_E_SUPABASE.md): contas, migrações, sincronização, implantação gratuita e economia futura.
- [Mapas](docs/MAP_LAYERS.md): formato, navegação e extração.
- [Originais](docs/EXTRACAO_E_INTEGRACAO_ORIGINAIS.md): roteiro para o computador com o acervo.
- [README histórico](docs/history/README-2026-10-21.md): investigação inicial, comandos antigos e registros por lote.

O histórico está preservado em docs/history, separado do estado vigente. Não reaplicar a mitigação antiga do Sasuke, reativar party ou recortar chão para fingir profundidade.

## Verificar

```powershell
npm run check:i18n
npm run typecheck
npm test
npm run test:server
npm run build -- --configLoader runner
```

Se o ambiente impedir o runner tsx, a suite TypeScript também pode rodar no Node 24:

```powershell
node --experimental-transform-types --import ./tools/resolve-test-imports.mjs --test --test-concurrency=1 tests/*.test.ts
```

Com Vite na porta 5194 (ou BASE_URL configurada), `node tools/qol-check.mjs` valida os fluxos desta etapa. Executar build, extração e navegadores serialmente: uma tarefa pesada por vez, até seis lotes de verificação por ciclo.

## Recursos e recuperação

Runtime em public/assets; extrações/relatórios em pastas próprias. Arquivos grandes são versionados com Git LFS; uma instalação com ponteiros LFS no lugar das imagens não serve os assets reais. Não alterar originais ou repetir conversão integral para corrigir poucos modelos.

16/145 conjuntos de mapas integrados; 129 restantes. Máscaras frontais nativas recuperadas; objetos intermediários e profundidade individual pendentes. Skills do Sasuke azul já reconstruídas. Restam 31 ações em 30 modelos para revisão e outros efeitos, sons, personagens e artes para integrar. O acervo bruto histórico D:\Naruto Idle\Naruto_Idle não está disponível nesta cópia; confirmar o caminho no outro computador.
