# Traduções do jogo

## Uso

O seletor **Idioma / Language / Idioma** fica disponível no jogo, no administrador e na arena. Idiomas iniciais: português brasileiro (`pt-BR`, padrão), inglês (`en`) e espanhol (`es`). A escolha fica em `localStorage`, na chave `folha-idle-language`, separada do save da jornada.

Ao trocar, a interface recarrega para reconstruir também textos de configuração. Se houver uma jornada aberta, o jogo restaura a minijanela, salva o progresso e continua a jornada automaticamente no idioma escolhido. A troca usa o fluxo normal de restauração do jogo, não preserva o fotograma ou um combate parcialmente executado. Não muda IDs, moedas, itens, XP ou atributos por causa da tradução. A mudança de idioma não é enviada a outros jogadores da arena.

## Arquivos de referência

- `src/i18n/core.ts`: registro dos idiomas, tradução, interpolação, pluralização, números, escape de HTML e adaptação de conteúdo/mensagens externas.
- `src/i18n/browser.ts`: seletor, aplicação ao HTML inicial e retomada da jornada.
- `src/i18n/locales/pt-BR.json`: catálogo de referência.
- `src/i18n/locales/en.json` e `es.json`: catálogos dos demais idiomas.
- `src/i18n/sources.json`: associação dos nomes/textos canônicos do acervo e mensagens legadas da API a chaves estáveis, independente da redação das traduções.
- `tools/check-i18n.mjs`: verificação de chaves, textos vazios, parâmetros e referências no código/HTML.
- `tests/i18n.test.ts` e `tools/i18n-check.mjs`: testes de regras e dos fluxos reais nos três idiomas.

Os IDs já migrados possuem prefixo do módulo e um identificador estável. Para alterar uma tradução, procure o texto no JSON e edite o valor, mantendo sua chave. O identificador não deve ser recalculado quando o texto mudar. Textos novos podem usar chaves semânticas como `inventory.empty` ou `battle.damage`.

## Adicionar ou alterar textos

Adicione a mesma chave em todos os catálogos. Não coloque frases novas diretamente no componente, nem monte uma frase dividida em palavras traduzidas separadamente: cada idioma pode precisar de outra ordem.

Exemplo de entradas, uma em cada catálogo:

```json
"battle.damage": "{name} causou {damage} de dano"
```

```json
"battle.damage": "{name} dealt {damage} damage"
```

```json
"battle.damage": "{name} causó {damage} de daño"
```

No código:

```ts
import { t, th, formatNumber } from "./i18n/core";
label.textContent = t("battle.damage", { name, damage });
// Em templates HTML, use th: o texto e seus valores são escapados.
panel.innerHTML = `<p>${th("battle.damage", { name, damage })}</p>`;
const speed = formatNumber(12.5, { maximumFractionDigits: 1 });
```

Os catálogos contêm texto simples, sem HTML executável. Não traduza seletores CSS, nomes de eventos, valores internos de enums, ações de animação, IDs de personagens/itens/mapas ou caminhos de arquivos. Use atributos estáveis (`id`, `data-*`, `name`) para localizar controles; não dependa do texto traduzido de um `aria-label` para encontrar um elemento no código.

Para pluralização, use um objeto com `one` e `other` e passe `count`; o núcleo usa `Intl.PluralRules`. `common.characters` é um exemplo funcional. Os mesmos parâmetros devem existir em cada tradução e em cada forma correspondente. Para o HTML inicial, use `data-i18n="chave"` no elemento ou `data-i18n-aria-label`, `data-i18n-title`, `data-i18n-alt` e `data-i18n-placeholder` para atributos.

## Conteúdo dos arquivos e mensagens externas

Conteúdos canônicos permanecem no idioma de origem. `localizeContent()` cria a versão apresentada ao jogador nos limites de carregamento do runtime, catálogo de personagens e API administrativa. Os campos de texto reconhecidos incluem nome, descrição, variante, habilidade e motivo de revisão; o restante dos metadados mantém sua identidade. Notas escritas pelo administrador não são traduzidas automaticamente.

Para adicionar conteúdo novo com nomes/descrições de origem, inclua entradas correspondentes nos três catálogos e associe o texto canônico à chave em `sources.json`. `translateText()` usa essa associação; editar a redação portuguesa não quebra o vínculo com o acervo. Se o texto canônico original mudar, atualize sua associação. Para conteúdo autoral novo, prefira uma chave explícita de tradução na configuração/componente.

`errorText()` / `translateExternalMessage()` localizam erros conhecidos da API mantendo compatibilidade com respostas existentes. Adicione novas mensagens da API aos três catálogos; prefira um código estável para novos contratos. O histórico da arena é apresentado a partir de ação, personagem, dano e cura, sem traduzir ou alterar o estado compartilhado da sala.

Nomes próprios, IDs, nomes de técnicas consagrados, arquivos e identificadores técnicos permanecem iguais quando apropriado. Identificações originais ainda não conferidas, inclusive nomes chineses no acervo de revisão, são preservadas como procedência; não inventar traduções de identidades desconhecidas. Isso não substitui a revisão/tradução editorial do conteúdo recuperado.

## Adicionar um idioma

1. Copie `pt-BR.json` para um novo arquivo com o código desejado e traduza os valores, preservando chaves, parâmetros e formas plurais.
2. Importe o arquivo em `core.ts`, acrescente o nome nativo do idioma a `LOCALES` e seu catálogo a `catalogs`. O seletor usa esse registro.
3. Execute `npm run check:i18n`, `npm run typecheck` e os testes pertinentes. Verifique textos longos, acentos, números e mensagens com valores.
4. Amplie o teste de navegador para o novo idioma, incluindo troca com jornada aberta, coleção, combate, admin e arena. Não considere apenas o menu como cobertura completa.

O núcleo recorre ao português se uma chave existir apenas no catálogo de referência; uma chave totalmente desconhecida aparece como seu próprio identificador para facilitar diagnóstico. A verificação de entrega recusa catálogos incompletos: fallback não é justificativa para publicar traduções faltantes.
