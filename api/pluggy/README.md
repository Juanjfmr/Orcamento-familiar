# Pluggy — integração bancária (preparação segura)

Este endpoint implementa SOMENTE a emissão de Connect Token do lado do servidor:
POST \`/api/pluggy/connect-token\` com \`Authorization: Bearer <supabase_access_token>\`.

## O que está pronto
- Validação da sessão no Supabase e da participação na família.
- Credenciais Pluggy exclusivamente no servidor.
- API Key Pluggy com cache de aproximadamente 110 minutos (validade oficial: 2 horas).
- Connect Token com \`clientUserId\` obtido da sessão autenticada, dentro de \`options\`.
- Não aceita \`itemId\` arbitrário informado pelo cliente.
- Não registra nem devolve tokens/segredos nos erros.

## Configurar (somente no ambiente Vercel)
- SUPABASE_URL
- SUPABASE_PUBLISHABLE_KEY (chave pública)
- PLUGGY_CLIENT_ID (secreta)
- PLUGGY_CLIENT_SECRET (secreta)

**Não preencha valores neste repositório público.**

## Ainda necessário para a sincronização automática
1. Confirmar elegibilidade de dois titulares/conexões no serviço Pluggy contratado.
2. Integrar Pluggy Connect Widget com o Connect Token (não usar a API Key no browser).
3. Vincular cada Item ao titular autenticado e guardar \`provider_item_id\` em \`duo_private.bank_connections\`.
4. Implementar webhook com validação autêntica do provedor e rotina idempotente de sincronização de contas/transações.
5. Atualizar os dados, conciliar duplicidades e executar categorização por IA com dados minimizados.
6. Testar com ambiente Sandbox e com autorização explícita de cada titular.

Documentação: https://docs.pluggy.ai/en/reference/authentication

O endpoint devolve HTTP 503 até as variáveis de ambiente estarem configuradas.
