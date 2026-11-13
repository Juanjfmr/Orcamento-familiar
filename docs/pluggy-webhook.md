# Duo Finn — Pluggy Connect e webhook (novembro de 2026)

## Entregue no repositório

- \`pluggy-widget.js\`: adaptador JavaScript do widget \`window.PluggyConnect\` (sem React).
- \`api/pluggy/connect-token.js\`: endpoint \`POST\` autenticado via Supabase. Emite token com \`options.clientUserId\` preenchido a partir do JWT, nunca do corpo enviado pelo cliente.
- \`lib/pluggy-server.js\`: reuso da API Key Pluggy e configuração automática do webhook \`event: all\` com cabeçalho secreto.
- \`api/pluggy/confirm-item.js\`: após \`onSuccess\`, busca \`GET /items/{id}\` e confirma \`clientUserId\` antes de registrar o Item.
- \`supabase/functions/pluggy-webhook/index.ts\`: endpoint público Edge com autenticação própria via cabeçalho secreto e validação de \`clientId\`.
- \`duo_private.pluggy_webhook_events\`: fila de eventos mínimos, sem extratos ou payload bruto, com \`event_id\` único.
- \`duo_private.bank_connections\`: vínculo privado do Item com o titular.
- \`public.finn_my_bank_connections()\`: apresenta ao titular apenas o status das suas conexões.

## Segurança

O repositório é temporariamente público. **Não enviar Client Secret, API Key nem tokens ao GitHub.**
As variáveis \`PLUGGY_CLIENT_SECRET\`, \`PLUGGY_WEBHOOK_SECRET\` e \`PLUGGY_CONFIRM_SECRET\` existem apenas no ambiente Preview da Vercel. O banco contém somente hashes dos dois últimos segredos.
O registro de notificações exige uma credencial não adivinhável e \`clientId\` correto. Uma notificação não é prova de propriedade: o processamento deve consultar \`GET /items/{id}\`.
Webhooks \`transactions/*\` não contêm \`clientUserId\`; qualquer importação futura precisa usar mapeamento confiável \`itemId\` -> titular e conferir a conta vinculada.

## Endpoints

- \`POST /api/pluggy/connect-token\` (Vercel, bearer Supabase): token temporário e status de registro do webhook.
- \`POST /api/pluggy/confirm-item\` (Vercel, bearer Supabase, corpo \`{itemId}\`): registra conexão verificada, \`status: pending_sync\`.
- \`POST https://zvjulrlqoxysinmtplsn.supabase.co/functions/v1/pluggy-webhook\` (Pluggy -> Supabase; exige \`X-Duo-Webhook-Secret\`): valida e coloca evento na fila, responde HTTP 202.

**A função Edge está publicada, mas o webhook na Pluggy só será registrado no primeiro uso bem-sucedido do endpoint de Connect Token.**
Se a Pluggy impedir \`GET/POST /webhooks\` por limitações do plano, o widget ainda pode funcionar, mas a sincronização automática ficará indisponível. A interface sinaliza essa diferença.

## Não confundir

- **Conexão registrada**: Item associado ao titular; não significa extrato importado.
- **Webhook enfileirado**: sinal recebido e guardado com idempotência; não significa atualização processada.
- **Dados sincronizados**: será implementado pelo worker que consulta Pluggy e grava contas, faturas e transações idempotentemente.

## Pendências

1. Deploy da nova versão Vercel (a última tentativa foi bloqueada por limite diário da API).
2. Testar widget em Android, autenticação Supabase e registro de webhook na Pluggy.
3. Implementar worker seguro com consultas à API Pluggy para conta/cartão/transação, paginação, reconciliação, deduplicação e tratamento de eventos.
4. Testar com contas Sandbox antes de autorizar dados reais.
5. Rotacionar o Client Secret compartilhado antes de produção e atualizar Preview/Production separadamente.
6. Garantir políticas de cadastro fechado aos dois titulares antes de produção.

Documentação:
- https://docs.pluggy.ai/en/reference/webhooks
- https://docs.pluggy.ai/en/docs/developer-tools/webhooks-ref
- https://docs.pluggy.ai/en/docs/connections/item
- https://docs.pluggy.ai/en/reference/authentication
