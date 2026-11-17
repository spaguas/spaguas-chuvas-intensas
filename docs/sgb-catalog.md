# Catálogo SGB e monitoramento de publicações

O sistema consulta o [catálogo oficial de São Paulo](https://www.sgb.gov.br/chuvas-intensas-e-equacoes-idf-sao-paulo) e os respectivos registros e PDFs do RIGeo. O snapshot inicial foi obtido em 6 de novembro de 2026: **247 publicações distintas, 245 municípios e 256 modelos IDF**. A listagem repete Pirassununga; esse link é processado uma única vez. Artur Nogueira mantém as publicações de 2017 e 2025. Itanhaém tem dois relatórios de 2016, de postos distintos.

O snapshot contém 52.102 pontos transcritos das tabelas. **218 modelos passaram na validação e 38 ficaram pendentes**, distribuídos em 35 publicações. As pendências incluem divergências entre coeficientes e tabelas, trechos incompatíveis e ausência de tabela independente. Essas quantidades descrevem os modelos SGB; modelos aprovados também podem permanecer como alternativas para escolha operacional. A base DAEE original é preservada.

## Consulta operacional e uso público

Em **Área operacional → Catálogo SGB**, filtre município e ano bibliográfico, consulte a compatibilização, a validação, o SHA-256 e o PDF de cada versão. O botão **Revisar equação** abre o editor existente, com coeficientes, família, ano, instituição, URL e coordenadas do posto. Salvar cria uma versão manual. Publicá-la exige os mesmos controles numéricos do cadastro operacional.

A calculadora pública, o gráfico, a inversão do retorno e o SIBH usam a seleção municipal ativa. Os links de fonte apontam para o documento efetivamente utilizado. Uma versão validada não selecionada permanece no histórico; uma fórmula pendente não entra nos cálculos.

O ano mostrado no filtro vem de `citation_publication_date` do RIGeo. O ano da listagem é armazenado separadamente. Por exemplo, São João da Boa Vista aparece como 2014 na página, enquanto o registro e o PDF correspondem a 2024; o painel mostra a divergência. Data de descoberta, data de publicação e data de revisão do PDF são conceitos separados.

## Critérios de compatibilização

1. Município atendido é associado ao código IBGE por nome normalizado, com aliases explícitos para Santo Antônio **da/de** Posse e São **Luís/Luiz** do Paraitinga. Não há associação aproximada por similaridade textual.
2. Posto e coordenadas pertencem ao modelo. Uma IDF pode atender município diferente daquele onde o posto se encontra. Coordenadas ausentes não são preenchidas com o centroide da cidade.
3. Modelos numericamente idênticos no mesmo domínio de duração são vinculados à equação existente, sem nova versão de coeficientes. A comparação usa nove combinações por trecho, no intervalo comum de retorno, e tolerância relativa de `1e-7`; não confunde diferenças de coeficientes com mera igualdade de município. O snapshot inicial vinculou cinco modelos a equações já existentes.
4. Outros modelos são inseridos como versões distintas, com os coeficientes originais. Diferenças por arredondamento ou por novo ajuste permanecem inspecionáveis.
5. Uma publicação com um único modelo validado pode assumir a seleção pública quando não há seleção ativa, ou quando seu ano bibliográfico supera o da seleção automática. A compilação DAEE inicial usa 2018 como ano de publicação da fonte. Por padrão, uma equação publicada manualmente é preservada. Administradores podem autorizar sua substituição por uma publicação validada mais recente, com justificativa e auditoria.
6. Relatórios com múltiplos modelos exigem escolha técnica. Uma nova publicação pendente não remove uma equação ativa. Publicação removida do site não apaga histórico nem desativa cálculos automaticamente.

As famílias versionadas adicionadas são `SGB_POWER`, `SGB_LOG` e `SGB_POWER_LOG`. Gumbel continua usando a família existente. Nas famílias logarítmicas, a expressão usa explicitamente `t/60` quando a fonte define a duração em horas; a entrada da plataforma continua em minutos. Cada saída é normalizada em mm/h.

As publicações digitalizadas de Aramina, Buritizal e Artur Nogueira (2025) receberam amostras de referência transcritas visualmente da tabela 01, nas durações 10, 60 e 1440 minutos, incluindo todas as colunas impressas dessas linhas. A transcrição está em `data/sgb/reviewed-extractions.json` e só se aplica ao SHA-256 conferido. Ela não corrige valores impressos. Demais PDFs digitalizados novos passam por OCR; extrações insuficientes ficam pendentes.

## IDW e postos compartilhados

Municípios como Alumínio, Mairinque e São Roque compartilham o mesmo posto no SGB. O IDW agrupa coordenadas iguais, arredondadas a seis casas decimais, e usa uma única referência elegível por posição. Prevalece o maior ano bibliográfico; em empate, o código IBGE. As referências descartadas aparecem com o motivo **Mesmo ponto de referência**. Isso impede que uma republicação municipal multiplique o peso espacial de um posto.

O município mantém sua própria seleção para o cálculo direto e para a classificação SIBH. A deduplicação se aplica à interpolação espacial. O retorno por IDW continua exploratório e limitado ao domínio dos modelos.

## Operação em desenvolvimento

Com o PostgreSQL local e as variáveis do `.env` configuradas:

```bash
npm run db:migrate
npm run db:seed
npm run sgb:import
npm run dev
```

`sgb:import` aplica o snapshot de forma idempotente, em ordem cronológica. Não depende de conexão com o SGB e respeita a política administrativa de adoção, incluindo a proteção de versões manuais, habilitada por padrão. A importação repete a validação antes de qualquer ativação.

Para verificar o site uma vez ou manter o monitor ativo em um terminal separado:

```bash
npm run sgb:sync
npm run sgb:watch
```

O monitor local usa `pdftotext`, `pdfinfo` e `pdftoppm` (Poppler). Para PDFs digitalizados, também usa Tesseract com idioma português. No Ubuntu, as dependências são `poppler-utils`, `tesseract-ocr` e `tesseract-ocr-por`. A imagem Docker já contém essas dependências.

## Docker

O Compose inclui `sgb-monitor`, separado do worker SIBH, com reinício automático e healthcheck. O serviço `migrate` aplica as migrations, o catálogo DAEE e o snapshot SGB antes da API.

Para acrescentar apenas o monitor ao ambiente local já iniciado:

```bash
docker compose -f docker-compose.yml -f compose.local.yml up -d --build --no-deps sgb-monitor
docker compose -f docker-compose.yml -f compose.local.yml logs --tail=50 sgb-monitor
```

O comando pressupõe que o PostgreSQL do projeto já está disponível. A rede continua na subnet dedicada configurada por `APP_SUBNET`, sem alterações no daemon Docker ou no Nginx externo. A API e os assets preservam `/chuvas_intensas`.

Valores iniciais opcionais, usados somente na criação da configuração pela migration 007:

```dotenv
SGB_POLL_SECONDS=86400
SGB_TIMEOUT_MS=90000
```

A configuração efetiva está em **Área operacional → Administração → Atualização SGB / CPRM** e na tabela `sgb_settings`. Alterar as variáveis após a migration não sobrescreve o que foi salvo no banco. O intervalo normal aceita de 1 hora a 30 dias (padrão diário); após falha total ou parcial usa o intervalo de nova tentativa, de 1 minuto a 30 dias (padrão 1 hora). A agenda usa o término da última execução e é recalculada ao alterar a periodicidade. Sem execução anterior, a primeira consulta fica imediatamente elegível. A pausa bloqueia novas verificações, inclusive `sgb:sync`; o snapshot local continua sendo uma importação independente.

O monitor consulta a configuração a cada 30 segundos. Uma varredura em andamento conserva seus valores até terminar. Reinícios respeitam o horário calculado, e a elegibilidade é verificada novamente sob advisory lock PostgreSQL, impedindo execuções simultâneas e varreduras duplicadas entre CLI e Docker. O heartbeat indica presença do processo; uma pausa administrativa não é tratada como falha de saúde. Após atualizar os arquivos, aplique a migration 007 e atualize o serviço `sgb-monitor` antes de usar a nova configuração.

A tela permite configurar timeout (1–180 s), PDF (1–50 MB), HTML (1–10 MB), até três tentativas adicionais para falhas transitórias, espera progressiva entre tentativas, pausa entre requisições, limite de redução da listagem (0–50%), ETag/Last-Modified, OCR, limite de páginas digitalizadas e tempo por etapa de extração. Os domínios oficiais e o processamento sequencial permanecem fixos. Desativar OCR faz com que PDFs digitalizados sejam registrados como falha para conferência.

Políticas de adoção:

- **Exigir revisão:** preserva candidatos sem publicação automática.
- **Apenas lacunas:** adota um único modelo validado somente quando o município não tem equação ativa.
- **Mais recentes:** também pode substituir a equação ativa quando o ano bibliográfico é maior, respeitando a proteção de versões manuais.

A opção de revisão no mesmo ano aceita apenas novo conteúdo do mesmo registro RIGeo cuja equação ativa é gerida pelo SGB. Outro relatório do mesmo ano ou uma compilação DAEE não é substituído por essa opção. Relatórios com múltiplas IDFs exigem escolha técnica, e modelos inválidos nunca são ativados automaticamente. Publicações já importadas não são reavaliadas nem ativadas retroativamente quando a configuração muda; use a revisão operacional para selecionar uma alternativa existente.

O mínimo de pontos independentes (12–2000) e as tolerâncias absoluta (até 0,25 mm/h) e relativa (até 1%) permitem tornar a conferência mais rigorosa. Aceita-se a diferença até o maior valor entre ambas as tolerâncias, sempre com domínio e famílias válidos. Uma fórmula reprovada permanece pendente, preservando a seleção ativa anterior.

Salvar exige justificativa e a revisão atual da configuração. Alterações concorrentes retornam 409 e exigem recarregar. O registro `sgb.settings_updated` guarda administrador, justificativa, valores anteriores/novos e revisão; `sgb_sync_runs.settings_snapshot` e `settings_revision` guardam a política efetiva de cada execução. A auditoria de adoção também registra a razão da seleção.

## Verificação e histórico

Em cada execução, o monitor relê a listagem completa, inclusive publicações antigas. Assim também encontra uma publicação de ano anterior adicionada posteriormente. Para cada item, consulta os metadados e o PDF. ETag e Last-Modified permitem resposta 304; quando há conteúdo novo, o SHA-256 e os metadados determinam se é necessária outra extração.

Revisões do PDF, mudanças de ano bibliográfico e novas versões do parser geram registros distintos. As tabelas são criadas pela migration `004_sgb_catalog.js`, com SQL em `db/sgb.sql`:

- `sgb_publications`: identidade RIGeo, município atendido, ano da listagem, presença e última consulta;
- `sgb_publication_versions`: SHA-256, ano bibliográfico, metadados, PDF e versão do parser;
- `sgb_models`: modelo, equação vinculada, resultado da compatibilização, parâmetros e conferência;
- `sgb_sync_runs`: execuções, progresso, contadores e falhas por publicação.

As equações recebem instituição, URL, ano, coordenadas e origem de gestão. O histórico de parâmetros e a auditoria permanecem nas tabelas existentes. Os PDFs são baixados para processamento temporário; a base guarda hash, URL, trechos extraídos e modelos, sem armazenar todo o acervo binário no repositório.

O parser não executa conteúdo dos documentos. Downloads seguem uma lista fixa de domínios oficiais, com validação de redirecionamento, timeout, tamanho máximo e assinatura de PDF. Mudança estrutural da tabela ou redução superior ao limite configurado (20% por padrão) interrompe a execução para evitar um catálogo incorreto. Uma falha isolada fica registrada e é tentada novamente na próxima verificação; equações existentes são mantidas.

Endpoints autenticados, documentados no Swagger:

```text
GET /chuvas_intensas/api/admin/sgb/publications?year=2025&municipality_id=3503802
GET /chuvas_intensas/api/admin/sgb/status
GET /chuvas_intensas/api/admin/sgb/runs
GET /chuvas_intensas/api/admin/sgb/settings  # apenas admin
PUT /chuvas_intensas/api/admin/sgb/settings  # apenas admin, revisão e justificativa
```

`data/sgb/catalog.json` contém o snapshot reproduzível e as evidências de extração. `scripts/build-sgb-catalog.mjs <cache>` permite reconstruí-lo a partir de `index.html` e de pastas `documents/<id>/{item.html,report.pdf,report.txt,ocr.txt}`. O processamento contínuo está no serviço Node.js `sgb-service.js`; não depende do cache usado na elaboração inicial.
