# Duo Finn — Orçamento Familiar

Aplicação financeira privada para **dois titulares**, com painel unificado e extratos individuais.

> **Repositório temporariamente público:** não adicionar dados pessoais, senhas, documentos ou tokens. O arquivo `config.js` contém somente a chave **publicável** do Supabase, concebida para aplicações cliente; a chave `service_role` e credenciais Pluggy nunca devem ser enviadas ao GitHub.

## Infraestrutura criada e verificada

- Supabase: [projeto duo-finn](https://supabase.com/dashboard/project/zvjulrlqoxysinmtplsn), região `sa-east-1` (São Paulo).
- Migração inicial aplicada: `supabase/migrations/20261112010000_initial_household_rls.sql`.
- Migração de índices aplicada: `supabase/migrations/20261112020000_bank_sync_indexes.sql`.
- Vercel: nova interface implantada em Preview, estado `READY` — https://duo-finn-v1-ert4f9ztg-hub-militar.vercel.app . A conexão bancária automática ainda não está ativa.

## Front-end presente neste repositório

- Cadastro/login por e-mail com Supabase Auth; confirmação pode exigir configurar URLs permitidas no painel Supabase.
- Primeiro titular cria a família; convite aleatório de 64 caracteres, válido por 48 horas e limitado ao segundo titular.
- Segundo titular entra na família com o próprio acesso.
- Painel familiar consulta agregados autenticados; nenhum detalhe de transação de outro titular é retornado.
- "Meu extrato" consulta apenas transações do usuário autenticado com RLS.
- Correção de categorias com permissão de atualização exclusiva ao titular.
- Interface responsiva para desktop e celular. Quando sem dados bancários, exibe um estado vazio verdadeiro.

## Banco e segurança

- Tabelas: `households`, `household_members`, `bank_accounts`, `transactions`; itens Pluggy separados em `duo_private.bank_connections`.
- As tabelas públicas têm Row Level Security (RLS).
- Não há `INSERT` direto para usuários autenticados nas tabelas financeiras.
- RPCs de consolidação checam a participação do usuário, retornando apenas totais.
- Teste transacional com dois titulares: aprovada a proteção de extrato, participação e consolidação; dados do teste removidos por `ROLLBACK`.
- A auditoria do Supabase registra 6 avisos sobre funções `SECURITY DEFINER`. O uso é deliberado para RPCs autenticadas, com checagem explícita de vínculo; realizar revisão final de segurança antes da entrada de dados financeiros reais.

## Conector Pluggy

`api/pluggy/connect-token.js` cria token Pluggy somente com credenciais de servidor e JWT de titular autenticado.

Configurar **apenas na Vercel**, após confirmar as condições de uso do Meu Pluggy:
- `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`
- `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET`

O Client Secret provisório foi configurado como variável sensível **somente em Preview** na Vercel. Produção continua sem essa credencial. Não há webhook, sincronização, IA ou WhatsApp operacionais. Veja `api/pluggy/README.md`.

## Antes de inserir dados reais

1. Validar login e convite na versão Preview já publicada e configurar URLs autorizadas no Supabase.
2. Ajustar URL do aplicativo e Redirect URLs em Supabase Auth; confirmar e-mail/login de ambos.
3. Proteger as inscrições para apenas os dois titulares (evitar cadastros abertos).
4. Testar efetivamente o login + convite e revisar permissões.
5. Validar acesso ao Pluggy para as duas conexões e ativar os fluxos seguros.
6. Implementar sincronização idempotente, categorização IA e agente WhatsApp.
7. Tornar o repositório privado antes da operação com dados financeiros verdadeiros.

## V2

Um financiamento imobiliário ativo, com PDF atualizado e simulador de amortização. O PDF histórico de exemplo não foi importado para o banco.
