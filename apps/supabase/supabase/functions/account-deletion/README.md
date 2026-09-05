# account-deletion

Edge Function autenticada para o ciclo reversível de exclusão de conta.

- `POST { "action": "status" }` consulta o último estado do usuário do JWT.
- `POST { "action": "schedule", "currentPassword": "..." }` reautentica e agenda para sete dias depois.
- `POST { "action": "cancel" }` cancela um agendamento pendente.

A função é publicada com `verify_jwt=true`. Ela nunca aceita ID de usuário no
corpo, nunca registra senha/JWT e cria um cliente Auth efêmero para cada
reautenticação. A service role permanece somente no runtime server-side.

O processamento destrutivo de vencidos não faz parte desta função e continuará
desativado até existir uma política de retenção aprovada, campo a campo.
