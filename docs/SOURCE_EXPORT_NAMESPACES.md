# Preservação de bundles já publicados

Um mesmo recurso e ação pode aparecer em um efeito numérico e em uma exportação source-only. Se o empacotamento ou os metadados diferirem, compartilhar a mesma pasta pode causar colisão de arquivos. O instalador continua recusando sobrescritas.

`tools/source_export_namespace.py` prepara um endereço separado somente para uma entrada source-only ainda não publicada quando detecta uma colisão real. Ele mantém intactos os arquivos e o índice publicados. A nova pasta inclui o hash da entrada preparada, sem mudar a identidade lógica da fonte ou da ação.

As imagens são copiadas sem recodificação. Somente URLs e o manifesto que as contém são ajustados. FPS, timeline, coordenadas, prova RGBA, configuração original e limites de textura permanecem iguais. Sequências completas também podem ser isoladas, mantendo seus arquivos e timeline.

O publicador deve executar novamente a validação de todos os quadros depois do ajuste e antes de instalar. A prova e o relatório de isolamento acompanham o commit. Um arquivo preparado adulterado, caminho externo ou identidade source-only já publicada interrompe a operação.

O caso que motivou a correção foi o atlas `Wuyinshu / wy2`, já referenciado pelo bundle numérico 2213. O arquivo existente foi preservado; a nova exportação recebe seu próprio endereço. Isso não troca automaticamente o efeito usado no combate.
