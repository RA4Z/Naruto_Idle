# Canvas maior somente na extração offline

Algumas animações têm um canvas global grande por causa do movimento ao longo da timeline. Cada pose recortada pode ser pequena. Este adaptador permite avaliar fontes estáticas previamente auditadas com até 32 milhões de pixels de canvas, 8192 por lado e 480 quadros. A fonte decodificada continua limitada a 32 MB. O processo Java usa o mesmo teto de heap de 1 GB e a mesma chamada estática de renderização.

Os limites de runtime continuam em 16 milhões de pixels por página, 64 milhões de pixels e 16 páginas por atlas. Sequências completas continuam com o limite anterior de 16 milhões por imagem. O adaptador não publica uma sequência maior como alternativa automática.

O novo renderizador é separado das classes existentes. Antes do uso, `reports/reviewed-native-equivalence-20261024.json` precisa comprovar a igualdade de todos os quadros dos três pilotos originais, incluindo comparação com um novo render integral. Sua assinatura, bibliotecas e auxiliar ficam vinculados à prova.

`static_effect_export_contract.py` exige a fonte, assinatura, export, símbolo, FPS, duração, tags e labels originais. O contrato é específico para sprites estáticos de efeitos; fontes com MME, scripts ou instâncias nomeadas sem comprovação exigem outro tratamento. Os nomes dos arquivos são preservados, inclusive pontos repetidos quando existem no original.

`recover_reviewed_native.py` renderiza por intervalos com comprovantes retomáveis. Antes de empacotar, lê cada quadro isoladamente e conta os recortes únicos, suas posições e memória. Se as poses não couberem nos limites atuais de atlas, preserva os renders e registra a pendência para outro adaptador. Não acumula crops sem teto nem diminui resolução.

Uma entrada aprovada recebe `offlineRenderBudget`. O validador só aceita o canvas ampliado quando os fatos da fonte original e uma nova leitura independente dos bounds concordam. A comparação de todos os quadros reconstruídos do atlas continua obrigatória, no staging e na cópia instalada. As páginas continuam sujeitas aos limites anteriores.

Para validar uma entrada revisada, acrescente às opções normais de `validate_native_effects.py`:

```text
--java CAMINHO_JAVA --ffdec PASTA_FFDEC --bounds-classes PASTA_CLASSES --budget-work PASTA_PRIVADA_FORA_DO_GIT
```

O leitor `ProbeSourceBounds` trabalha somente com metadados do original e não renderiza. A cópia temporária fica fora dos originais e do repositório e é removida ao final. Fontes comuns permanecem no limite padrão de 16 milhões de pixels e não precisam dessas opções.

Os testes verificam identidade, FPS e labels originais, rejeição de scripts e dados não visuais, limites offline e de runtime separados, leitura independente de bounds, alocação exata do raster, repetição de crops em posições diferentes e interrupção antes de acumular memória demais.
