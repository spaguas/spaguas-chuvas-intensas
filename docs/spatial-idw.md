# Ferramenta espacial de retorno IDW

Acesso em desenvolvimento: `http://127.0.0.1:5178/chuvas_intensas/?view=spatial`.

1. Abra **Mapa IDW**.
2. Informe chuva acumulada em **mm** e duração em **minutos**.
3. Clique no mapa ou aplique latitude/longitude em graus decimais. Clicar em um posto seleciona sua coordenada original.
4. Confira o município, o retorno ponderado e o hub. Cada linha da tabela informa distância, peso, retorno local, contribuição e versão da equação.
5. Em **Parâmetros da interpolação**, ajuste quantidade de postos, potência e raio. Os cálculos são atualizados automaticamente. O CSV preserva a vizinhança e os parâmetros.

## Método

A identificação do município usa ponto-no-polígono sobre os **645 municípios** paulistas. O município identifica a localização; a vizinhança IDW pode incluir postos de outros municípios. Isso é uma ferramenta espacial separada dos cálculos municipais e da classificação automática SIBH, cujas regras permanecem locais.

As distâncias são calculadas **até os postos de referência do estudo**, usando suas coordenadas transcritas, e não até centroides municipais. Haversine utiliza raio médio terrestre de 6371,0088 km. O mapa é renderizado pelo Leaflet em Web Mercator; a distância numérica não é calculada em pixels ou na projeção do mapa. As linhas do hub são ligações gráficas, não percursos de estrada.

Para uma chuva h e duração t, cada equação elegível é invertida para obter Tᵢ. A interpolação solicitada é aplicada **diretamente aos retornos em anos**:

```text
wᵢ = dᵢ^(-p) / Σ dⱼ^(-p)
T_IDW = Σ wᵢ × Tᵢ
```

Padrões: cinco vizinhos, potência p=2 e raio de 100 km. São parâmetros exploratórios, sem calibração regional. Limites configuráveis: 3–12 vizinhos, p entre 1 e 4 e raio entre 5 e 300 km. Exige-se ao menos três postos elegíveis, salvo coincidência com posto conhecido. Na coincidência numérica (até 1 mm), apenas os coincidentes recebem peso, evitando divisão por zero; múltiplos coincidentes recebem pesos iguais.

O IDW de T não é equivalente a interpolar intensidades, frequências ou probabilidades e depois inverter uma distribuição. O resultado é uma **estimativa espacial exploratória**, não uma IDF regional homologada. O método considera distância, sem incorporar automaticamente relevo, altitude, bacia, clima ou representatividade das séries. Os pesos maiores não representam menor incerteza estatística.

## Domínios e cobertura

- Equações pendentes/retiradas, coordenadas ausentes, duração incompatível, avaliação inválida e postos fora do raio são excluídos com motivo visível.
- A escolha dos vizinhos é feita por distância antes de considerar se seus retornos são numéricos ou censurados. Um retorno censurado não é descartado para selecionar outro posto com T conveniente.
- Se todos os retornos estão dentro dos domínios, a média é numérica.
- Um retorno `T < Tmin` contribui com intervalo `1 < T < Tmin`, considerando recorrência de máximos anuais. Um retorno `T > Tmax` contribui com intervalo aberto superiormente.
- Os pesos propagam esses limites. A API devolve desigualdade ou intervalo quando não há T exato. Não se substitui `T > 200` por 200 nem `T < 2` por 2. Esses intervalos de domínio **não são intervalos de confiança**.
- Um ponto fora da malha paulista retorna 422. Ponto compartilhado entre polígonos retorna ambiguidade e pede deslocamento, sem escolher município arbitrariamente.
- A malha é simplificada; a identificação próxima a divisas e litoral é indicativa.

## Fontes e rastreabilidade

| Camada | Fonte / unidade | Atualização / tratamento |
|---|---|---|
| Municípios | [IBGE, malhas v3](https://servicodados.ibge.gov.br/api/docs/malhas?versao=3), GeoJSON, longitude/latitude em graus | Snapshot local, qualidade mínima, 645 polígonos; origem e hashes em `data/geography/source.json` |
| Nomes e geocódigos | API de Localidades do IBGE | Snapshot associado aos polígonos pelo código IBGE |
| Postos e equações | PDF DAEE/CTH e PostgreSQL | Versão atual consultada a cada cálculo; 75 postos, 68 equações ativas na importação inicial |
| Mapa-base | [OpenStreetMap](https://www.openstreetmap.org/copyright), via tiles HTTPS | Carregado pelo navegador com atribuição; depende da disponibilidade do provedor |
| Hub e resultado | Distâncias e cálculo da aplicação | Recalculados para ponto, chuva, duração e parâmetros atuais; não são observações meteorológicas |

A migration `002_backfill_station_coordinates.js` recupera oito pares que o importador inicial não reconhecia por variantes de apóstrofo/backtick em graus-minutos-segundos. Atualiza apenas coordenadas ausentes, sem alterar coeficientes ou substituir coordenadas operacionais existentes. O importador foi corrigido para reproduzir a transcrição.

Alguns postos da publicação ficam fora do polígono municipal simplificado associado. Isso gera aviso de conferência no catálogo e no resultado, sem deslocar o posto ou substituir sua coordenada pela sede municipal. Confira o georreferenciamento antes de uso técnico.

## API

- `GET /chuvas_intensas/api/spatial/municipalities`: polígonos locais, cache HTTP de 24 horas.
- `GET /chuvas_intensas/api/spatial/reference-stations`: postos, coordenadas, domínios, estados e versões.
- `POST /chuvas_intensas/api/idf/spatial-return-period`: resultado, município, parâmetros, vizinhos, pesos, contribuições, exclusões e fontes.

```json
{
  "latitude": -23.5505,
  "longitude": -46.6333,
  "depth_mm": 63,
  "duration": 60,
  "neighbors": 5,
  "power": 2,
  "radius_km": 100
}
```

`status` pode ser `estimated`, `bounded` ou `insufficient_neighbors`. Ausência de vizinhos retorna 200 com resultado nulo e diagnóstico; entradas inválidas e pontos fora/ambíguos retornam 422. A API não consulta geocodificadores externos por clique. Os resultados não são persistidos; a URL conserva os parâmetros e o CSV fornece uma cópia exportável.

## Interface e infraestrutura

Um mapa Leaflet é carregado apenas quando a ferramenta é aberta. As bordas e pontos são vetores georreferenciados; a espessura das ligações representa peso. Marcadores, numeração e rótulos mantêm tamanho legível durante o zoom. A tabela oferece alternativa sem hover e os campos de coordenadas permitem operar sem clicar em marcas pequenas. O mapa é apresentado primeiro no celular; o movimento por arraste pode ser ativado com **Mover mapa**, e depois liberado para rolagem da página. Zoom tem controles explícitos; a roda do mouse não é capturada.

A falha do mapa-base não impede seleção por coordenadas, identificação municipal, vetores ou cálculo. **Mapa-base** pode ser desativado para economizar tráfego ou trabalhar com a geometria local. A malha e os postos precisam ser carregados inicialmente pela API local. Respostas de cálculos anteriores são canceladas ao mudar parâmetros, evitando resultado de ponto antigo.

O Nginx inclui `https://tile.openstreetmap.org` no `img-src` da CSP. O subpath continua `/chuvas_intensas`. `VITE_MAP_TILE_URL` e `VITE_MAP_TILE_ATTRIBUTION` permitem definir outro provedor e sua atribuição no build; ajuste também o domínio da CSP. O padrão OpenStreetMap segue sua [política de tiles](https://operations.osmfoundation.org/policies/tiles/), sem prefetch/offline em massa. Em implantação de alto tráfego, configure um provedor dimensionado para essa carga.

Referências de implementação: [Leaflet 1.9.4](https://leafletjs.com/reference-1.9.4.html), [definição e parâmetros IDW — Esri](https://doc.esri.com/en/arcgis-pro/latest/help/analysis/geostatistical-analyst/how-inverse-distance-weighted-interpolation-works.html).
