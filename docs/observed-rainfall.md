# Painel de chuva observada

Abra **Chuva observada**, ao lado de **Mapa IDW**, ou use `/chuvas_intensas/?view=monitoring`. A calculadora inicial deixou de consultar e renderizar o monitoramento. A página dedicada oferece mapa Leaflet, tabela ordenável, exportação CSV e detalhes das estações.

## Fonte, janelas e qualidade

Os pontos e acumulados vêm do worker que consulta a API do **Chuva Agora / SIBH**:

`https://apps.spaguas.sp.gov.br/sibh/api/v2/measurements/now?station_type_id=2&hours=1&show_all=false&serializer=complete&public=true`

O navegador usa `/chuvas_intensas/api/observations` e `/integration/status`, com a mesma janela `hours`. O worker consulta **1h, 2h, 3h, 6h, 12h, 24h, 48h e 72h** independentemente. Não são somados acumulados sobrepostos. Os valores são precipitação acumulada, em milímetros; o período de retorno é inferido pela IDF municipal, na mesma duração, sem associar arbitrariamente municípios a estações vizinhas.

A tela consulta a API local a cada minuto enquanto a aba está visível. **Atualizar** relê os dados já sincronizados; não dispara uma importação nem reinicia o worker. O horário exibido é o da sincronização da janela selecionada, em Brasília. Cada estação mostra seu próprio horário de leitura. O intervalo de coleta do worker permanece configurado separadamente.

Na troca de janela, a tela não reutiliza os valores da janela anterior. Requisições antigas são canceladas e não podem sobrescrever a escolha mais recente. Se uma consulta falhar, a última resposta válida **da mesma janela** permanece visível, acompanhada de aviso. A classificação é suspensa quando a leitura envelhece, considerando a qualidade informada, o indicador `is_stale` e o intervalo amostral. A navegação fora do painel interrompe as consultas do navegador.

## Cores e significado do retorno

| Exibição | Cor | Significado |
|---|---|---|
| `2T`, `5T`, `9,5T` | Verde | Retorno estimado abaixo de 10 anos |
| `10T` | Laranja | Retorno estimado de 10 anos, com tolerância para ruído numérico |
| `12T`, `25T` | Vermelho | Retorno estimado acima de 10 anos |
| `<2T` | Verde | Abaixo do limite inferior de 2 anos, sem extrapolação |
| `>200T` | Vermelho | Acima do limite superior de 200 anos, sem extrapolação |
| `—` | Neutra | Leitura antiga, incompleta, IDF indisponível ou duração fora do domínio |

Limites que atravessam mais de uma faixa, como `<25T` ou `>5T`, mantêm a indicação de limite com cor neutra. O arredondamento não transforma uma estimativa acima de 10 anos em `10T` laranja: valores muito próximos podem aparecer como `>10T` ou `<10T`, com maior precisão nos detalhes. Esses cortes são a codificação visual solicitada para o painel e não alteram as classes estatísticas armazenadas pelo motor hidrológico.

Na métrica **Chuva (mm)**, as faixas são 0, >0 a <5, 5 a <15, 15 a <30, 30 a <60 e ≥60 mm. A legenda fica no mapa. Acumulados de estações sem IDF continuam disponíveis em milímetros. Símbolos e textos redundantes permitem compreender as medidas sem depender apenas da cor. O resumo considera a seleção filtrada; o máximo e a contagem de estações com chuva usam apenas leituras atuais.

## Mapa e tabela

O Leaflet recebe latitude/longitude WGS84 e projeta o mapa-base em Web Mercator. O contexto cartográfico usa OpenStreetMap, ou o provedor configurado por `VITE_MAP_TILE_URL`, e o limite estadual simplificado do IBGE. São pontos de observação; não há interpolação espacial da chuva nem mapa de risco.

Na visão geral, estações próximas são agrupadas em células projetadas para reduzir sobreposição. O símbolo mostra o maior acumulado, ou um destaque de retorno/limite entre as estimativas disponíveis; **não soma chuva de estações diferentes**. `+n` indica outras estações no grupo. Clicar aproxima o mapa e lista os membros, inclusive estações em coordenadas coincidentes. Em zoom detalhado, apenas coordenadas coincidentes permanecem agrupadas. Pontos individuais usam suas coordenadas originais, e o selecionado aparece acima dos grupos.

A busca ignora acentos e aceita estação, município ou prefixo. Os filtros permitem exibir todas as estações, chuva atual, retorno acima de 10T ou retorno classificado. Busca e filtros enquadram os resultados, enquanto a troca de duração conserva a posição do mapa. O painel lateral permite consultar a estação e percorrer outras sem repetidos cliques de precisão. O mapa oferece enquadramento de São Paulo, mapa-base opcional, ampliação e zoom. Se os tiles falharem, pontos e limite estadual permanecem disponíveis.

No celular, os controles principais permanecem visíveis, busca/filtros podem ser recolhidos e os detalhes ficam abaixo do mapa. Arrastar com um dedo é uma opção explícita, preservando a rolagem da página; também existem controles de zoom e ampliação. Enter ou Espaço selecionam pontos focados. Arrastar o mapa não seleciona uma estação ao soltar o ponteiro.

A tabela oferece ordenação por estação, acumulado, retorno ou leitura, com 25 linhas por página. **Ver ponto** abre a mesma estação no mapa. Registros sem coordenadas permanecem consultáveis na tabela. O CSV exporta a seleção completa dos filtros, com janela, qualidade, horários e limites, e protege textos que poderiam ser interpretados como fórmulas de planilha.

## Estado e desempenho

O endereço preserva `view=monitoring`, `hours`, `display=map|table`, `metric=rain|return`, `q`, `filter`, `station` e a posição (`map_lat`, `map_lng`, `map_zoom`). Recarregar recupera o contexto; voltar/avançar entre áreas usa o histórico do navegador.

Há uma única instância Leaflet, carregada apenas no painel e na visualização de mapa. A API é paginada em lotes de 2.000; a tela informa explicitamente se o teto de 20.000 registros é atingido. Filtros, legenda, detalhes e tabela compartilham a mesma seleção e a mesma janela. Atualizações preservam o contexto de inspeção.

Os acumulados são agregados do provedor e não comprovam continuidade de todas as leituras. Retornos são estimativas estatísticas, não previsão meteorológica ou alerta oficial de Defesa Civil.
