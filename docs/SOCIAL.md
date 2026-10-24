# Perfis e amigos

O botão **Amigos e perfil** está disponível na jornada e na tela da conta.
O painel **Na vila** permite buscar perfis sociais. Clicar diretamente em um jogador
no mapa abre uma ficha individual de inspeção, separada desse painel.

## Recursos

- Buscar pelo nome de usuário exato, sem diferenciar maiúsculas/minúsculas.
- Exibir perfil com nome, identificador @username, avatar, descrição e data de entrada.
- Meu perfil: ajustar capitalização, descrição de até 160 caracteres e avatar entre os três iniciais.
- Enviar, aceitar, recusar ou cancelar pedidos.
- Remover amigos com confirmação na própria interface.
- Lista persistida no Supabase; nenhuma amizade ou perfil é salvo em localStorage.
- Indicação **Na mesma vila** apenas para jogadores presentes na sua conexão atual.
  **Fora desta vila** não significa necessariamente offline.
- O painel atualiza as listas a cada 15 segundos quando não está editando o perfil,
  e possui um botão Atualizar. Não há chat privado ou notificações globais nesta entrega.

## Identidade

player_profiles.username continua canônico em minúsculas e único.
player_profiles.display_name preserva capitalização, com lower(display_name)=username.
Cadastro e conclusão de perfil enviam o texto original, e o servidor normaliza somente
o identificador. Contas antigas usam a capitalização dos metadados se ainda disponível;
quando ela já foi perdida pelo cadastro antigo, o jogador pode ajustá-la em Meu perfil.

O backend lê display_name pelo próprio JWT, transmite displayName e mantém username
para compatibilidade. Clientes antigos continuam recebendo username; atualizar o backend
no Render e o frontend na Vercel para a exibição nova. O perfil é recarregado no socket
após uma edição e publicado na próxima atualização de presença.

## Banco

Migração: 20261024151431_social_profiles.sql, aplicada no projeto Free existente.
O timestamp do arquivo corresponde ao histórico real da Management API.
O preenchimento inicial de display_name não altera inventário, progresso, senha ou e-mail.

player_friendships tem uma linha por par ordenado de contas e estado pending/accepted.
RLS permite leitura somente aos participantes; gravação direta é revogada.
As RPCs usam auth.uid(), validações e transações:
- social_profile(p_user uuid)
- social_search(p_username text)
- social_list()
- social_friend_action(p_target uuid,p_action text)
- social_update_profile(p_display_name text,p_bio text,p_avatar_id text)

Somente autenticados acessam o social. Perfis públicos retornam campos explicitamente
selecionados, sem e-mail, tokens ou save. Relações aceitas requerem ação do destinatário.
Solicitações repetidas não criam duplicatas. Um jogador não pode aceitar o próprio pedido.
Exclusão de conta remove vínculos em cascata. Há limite de 200 relações/pedidos por remetente.
O avatar usa somente IDs permitidos; descrições são renderizadas como texto, sem HTML.

## Vila

Kakashi (11001601) e Hinata (11001201) deixaram de ser carregados/criados como moradores.
A alteração não remove os personagens da coleção nem afeta jogadores que os utilizem.

## Validação

- npm run test:cloud: regras de perfil, privacidade, RLS e ciclo de amizade em PGlite.
- npm run db:verify: leitura de esquema e permissões, sem ler dados de jogadores.
- node --import tsx --test tests/multiplayer-client.test.ts: capitalização e validação da identidade.
- node --import tsx tools/social-browser-check.mjs: duas contas simuladas, PGlite com SQL real,
  backend WebSocket e Chrome, incluindo persistência/reload, XSS como texto e layout mobile.
- node --use-system-ca tools/social-live-check.mjs --create-test-users:
  duas contas descartáveis no Supabase real, criadas confirmadas sem enviar e-mails e removidas no finally.

Evidências: reports/social-validation.json, reports/social-live-validation.json,
reports/social-friends-desktop.png e reports/social-friends-mobile.png.

Não são necessários novos secrets, serviço SMTP ou variável de ambiente para o social.

## Inspeção de jogadores no mapa

Ao passar o mouse sobre os pixels visíveis de outro personagem, uma borda dourada
acompanha sua animação. Ela desaparece ao sair do personagem/canvas ou abrir uma janela.
O clique interrompe a propagação para o chão, sem deslocar o herói.

A ficha mostra a capitalização do nome, personagem ativo, nível, seis atributos de combate
e cinco espaços de equipamento. Cada espaço pode expandir a descrição e bônus do item.
A ação de amizade fica no início da ficha: solicitar, cancelar, aceitar/recusar ou indicar amizade.
Não há busca, abas de amigos ou edição de equipamentos na ficha de outra pessoa.

A RPC social_inspect_player(p_user uuid), da migração 20261024154443_player_inspection.sql,
retorna apenas perfil público, ID do personagem ativo, nível, treinamento e itens equipados
que existam no catálogo, pertençam ao espaço correto, estejam no inventário e cumpram o nível.
Inventário completo, moedas, XP, outros personagens e metadados do save não são retornados.
A leitura direta do save de outras contas continua bloqueada. A ficha usa o último save
confirmado na nuvem; Atualizar consulta novamente. Os atributos são derivados com as mesmas
regras de combate do jogo. Mudanças ainda não salvas podem aparecer após o próximo salvamento.
O catálogo SQL de equipamentos deve acompanhar futuros itens adicionados em rules.ts.

Validação adicional: node --import tsx tools/player-inspection-browser-check.mjs.
O teste usa duas contas locais isoladas para validar hover, saída do canvas, clique sem movimento,
identidade, equipamentos, solicitação/aceite e layout mobile. Evidências em
reports/player-inspection-validation.json e reports/player-{hover,inspection}-*.png.
O teste social-live-check também verifica a inspeção e RLS com saves descartáveis no Supabase real.
Esta ficha não exige mudanças no servidor WebSocket nem variáveis novas.
