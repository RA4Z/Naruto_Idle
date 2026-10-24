# Histórico de migrações e integração GitHub

Em 24/10/2026, o check Supabase Preview falhou com:
Remote migration versions not found in local migrations directory.

As migrações tinham sido aplicadas pela Management API com versões geradas na aplicação,
diferentes dos prefixos originais de 12 dígitos no repositório. O SQL era idêntico.

Os arquivos foram renomeados para as versões reais, sem reaplicar SQL:

| Arquivo anterior | Arquivo atual |
|---|---|
| 202610210001_cloud_progress.sql | 20261021205949_cloud_progress.sql |
| 202610210002_player_accounts.sql | 20261021211745_player_accounts.sql |
| 202610210003_cloud_only_progress.sql | 20261021215614_cloud_only_progress.sql |
| 202610220001_session_takeover.sql | 20261022151351_session_takeover.sql |

Os nomes antigos ainda aparecem no campo name do histórico remoto; isso é esperado.
A integração e o setup identificam a aplicação pelo campo version.

tools/supabase-setup.mjs agora verifica todas as versões remotas antes de aplicar novas
migrações. Ao aplicar uma nova migração pela API, consulta a versão efetivamente registrada
e renomeia o arquivo local para essa versão. É necessário incluir o nome final no commit.
Se houver divergência, o setup interrompe em vez de reaplicar SQL pelo nome.

Para novas migrações, usar arquivos no padrão YYYYMMDDHHMMSS_nome.sql.
Não renomear os quatro arquivos de volta e não manter cópias com timestamps antigos.

Validação: 17 testes de nuvem, db:verify e comparação de SQL das quatro migrações remotas.
reports/supabase-migration-alignment.json registra versões e equivalência, sem dados de usuários.

Não foi necessário resetar o banco, reparar o histórico remoto ou alterar dados.
O GitHub precisa receber as renomeações, referências e helper para o próximo check.
Não executar db:setup apenas para repetir o check; após o push, a integração deve usar
o histórico alinhado. Se persistir, conferir o diretório configurado na integração GitHub.
