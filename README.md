# Duo Finn — Orçamento Familiar

Aplicação privada de finanças para duas pessoas, com painel compartilhado e extratos individuais protegidos.

> **Atenção:** este repositório está público durante o desenvolvimento. Não adicione credenciais Pluggy, chave Supabase `service_role`, tokens do WhatsApp, PDFs reais, extratos ou dados pessoais.
>
> Status atual: infraestrutura Supabase independente e integração de autenticação em construção. Nenhuma conta bancária foi conectada.

## Escopo da V1
- Contas bancárias individuais sincronizadas automaticamente (integração Pluggy pendente).
- Resumo familiar conjunto sem duplicidade entre transferências internas e faturas.
- RLS para proteger movimentações de cada titular.
- IA para categorização assistida (pendente de API).
- Agente reativo via WhatsApp (pendente de gateway).

## Infraestrutura
- Supabase: `duo-finn` (São Paulo, sa-east-1; project ref `zvjulrlqoxysinmtplsn`).
- Vercel: demonstração independente `duo-finn-v1-lab`.
- Migrations em `supabase/migrations/`.

### Segurança
- Autenticação Supabase Auth e RLS em todas as tabelas expostas.
- Agregados familiares por funções autenticadas, extratos completos disponíveis somente ao titular.
- Segredos exclusivamente em provedores de backend, nunca no GitHub público.
- Sem lançamentos financeiros manuais obrigatórios.
