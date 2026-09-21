# UHC — Reunião executiva de resultados

Aplicação estática para conduzir uma reunião de resultados com dados confidenciais no navegador do CEO. A publicação GitHub Pages contém apenas código, componentes e conteúdo genérico: não contém SSOT, Excel, números financeiros, respostas, ata ou relatórios.

## Utilização

1. Abra a aplicação publicada e escolha **Carregar SSOT**.
2. Selecione o ficheiro JSON SSOT local. O esquema, a data de referência, fórmulas, períodos, forecast e reconciliações são validados antes de mostrar resultados.
3. Preencha a preparação e conduza os sete tópicos. As respostas, perguntas, decisões e ações ficam apenas no armazenamento local deste navegador.
4. No fecho, use **Exportar cópia** e escolha uma palavra-passe. A exportação usa AES-GCM com uma chave derivada por PBKDF2; guarde a palavra-passe separadamente. A cópia pode ser recuperada em **Preparação**.

## Segurança e limites

- O SSOT é lido em memória e não é persistido; não existe upload, telemetria, APIs de terceiros ou analytics.
- A persistência local não sincroniza respostas entre dispositivos ou participantes.
- GitHub Pages é público. Para dados reais publicados, autenticação empresarial, colaboração simultânea, controlo de acesso e auditoria, é necessário um backend privado com identidade, autorização por função e armazenamento cifrado.
- Saldos de caixa, Working Capital e métricas de dias são apresentados como tal: não são um mapa de fluxos de caixa nem uma confirmação de liquidez.

## Desenvolvimento e validação

```bash
npm ci
npm run lint
npm test
```

O workflow constrói, testa a ausência de dados sensíveis e publica `dist` no GitHub Pages. O `base` Vite é o caminho do projeto Pages.
