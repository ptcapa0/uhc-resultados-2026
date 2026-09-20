# Resultados mensais UHC — julho/agosto de 2026

Aplicação estática para conduzir a reunião de resultados. É publicada em GitHub Pages apenas como código e interface: cada utilizador importa o seu próprio workbook no respetivo navegador.

## Segurança e dados

- O XLSX é lido localmente pelo browser; não há upload, APIs, telemetria ou armazenamento do workbook.
- A versão publicada começa com uma demonstração claramente fictícia.
- Notas da reunião ficam localmente neste browser e podem ser exportadas/importadas como JSON. Não são partilhadas entre utilizadores.
- O repositório ignora ficheiros de dados e o workflow bloqueia workbooks, CSVs e padrões de controlos financeiros antes do deploy.

## Executar localmente

```bash
npm ci
npm run dev
```

Importe o workbook de resultados pelo botão **Carregar ficheiro de resultados**. A importação usa a folha `Dados`, filtra cenário, ano, mês, rubrica e `BalPL`, exclui `SALDOS INICIAIS`, e mostra avisos quando não consegue classificar um campo. Não assuma que o saldo contabilístico de depósitos e caixa é liquidez disponível. A margem do workbook é interpretada contra vendas de mercadorias.

## Verificação e publicação

```bash
npm run lint
npm run test
```

O workflow GitHub Actions constrói, testa, executa o controlo de privacidade e publica `dist` em GitHub Pages. O `base` de Vite está definido para o project site `ptcapa0/uhc-resultados-2026`.

## Limitações e evolução

Esta versão não inventa aging, previsão, clientes, produtos ou explicações; dados que o workbook não permita classificar ficam como **Por validar com o CFO**. Para colaboração simultânea seriam necessários autenticação empresarial, autorização por função, backend protegido, encriptação/persistência controlada e auditoria; GitHub Pages não é solução de acesso reservado nem colaboração em tempo real.
