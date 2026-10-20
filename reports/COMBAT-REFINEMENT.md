# Revisão de combate — 20/10/2026

Defeito confirmado nos quadros: `<element assetId="0" extname="yingzi(1).png"/>` referencia uma imagem EXTERNA de sombra. O conversor resolvia assetId=0 no dicionário LOCAL e desenhava outro corpo. Agora extname tem namespace separado e não participa da resolução de bitmaps locais. Efeitos externos não recuperados continuam explicitamente listados; o jogo já usa sombra de chão própria.

Quinze ações dos iniciais revisadas (C_idle, A_1hit, C_dead, SP_skill1, SP_skill2), sem tocar nos SWFs. Originais e backups antes da correção em assets-extraidos/animation-review-before. Pipeline mantém quadros únicos e timeline completa da janela usada. O Phaser agora consome timeline, origem e altura de referência por modo, sem redimensionar cada pose. Preparação Naruto 24 quadros, Sasuke 38, Cura Sakura 26; o deslocamento cinematográfico não é aplicado ao ator de exploração. Efeitos de projétil continuam separados. O clone breve do Rasengan está nos pixels originais; não foi inventado pelo renderer.

Lote adicional de quatro ataques A_1hit usados nos mapas: 19000301, 19000701, 19001701, 19000901. O script exige IDs explícitos, lotes pequenos e execução sequencial. A auditoria de metadados de 2150 XMLs registrou o trabalho restante: 530 ações em 403 modelos. Não declarar todos os especiais do catálogo revisados. Avisos de ações fora do lote foram preservados.

Testes: cinco casos Python (ARGB/alpha/paleta + namespace externo + janela de frames), 22 testes de domínio, 9 de servidor/deploy e navegador real com os três iniciais executados sequencialmente. Confirmou vitória, uma instância Phaser do protagonista, origens finitas, movimento sobre a grade e suspensão/retorno do loop ao abrir/fechar a arena. Nenhuma ausência de asset ou erro JavaScript. Houve uma tentativa inicial com timeout no teste de aproximação, sem diagnóstico capturado; duas execuções seguintes passaram. O teste registra estado/captura se voltar a ocorrer.

Estimativa RGBA dos cinco atlas revisados, sem afirmar memória total do navegador: Naruto 54,06 → 4,37 MiB; Sasuke 67,50 → 4,81 MiB; Sakura 52,50 → 2,27 MiB. A melhora vem de remover quadros repetidos e partes cinematográficas não usadas, preservando os pixels recuperados.


## Passada ampliada

503 ações adicionais em 389 modelos reparadas em lotes explícitos de quatro, um processo por vez e prioridade reduzida. Decoder em duas passagens para ler somente os bitmaps necessários; teto de 16 milhões de pixels de origem e 8 milhões de pixels de quadros únicos por ação. Restam 31 ações em 30 modelos: 8 ataques A_1hit e 23 especiais. As versões anteriores dessas exceções foram preservadas; exigem atlas recortados/offsets ou adaptação de movimento. Não declarar revisão visual completa de todas as ações.

Validação: PNG CRC, capacidade dos atlas, índices de timeline e origens de todas as 503 ações; navegador real no admin com Kakashi, Lee, Hinata, Lobo, Olho das Chamas e Kinkaku, um canvas por vez. Os 15 atlas dos iniciais foram reproduzidos byte a byte pelo decoder otimizado. Sete testes Python e dez testes de servidor/deploy passaram. A API administrativa em produção lê os metadados da build dist, mantendo-os coerentes com as imagens. Prévia limitada a 24 FPS.
