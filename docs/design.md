# Contrato de interface

Conceito visual: `design-concept.png`, gerado pela ferramenta Image Gen integrada. Brief: workspace científico em português, cabeçalho institucional azul, parâmetros à esquerda, curvas e resultados à direita, monitoramento SIBH abaixo e acesso operacional. A imagem é referência de interface, não fonte de coeficientes ou de medições.

Tokens: navy `#112c50`, ação `#007e77`, texto `#172b3a`, borda `#dce3e8`, painéis brancos; fundo muito claro `#f8fafb`. Tipografia de sistema com Inter como preferência, sem fontes remotas. Componentes: painel, campo rotulado, botões primário/secundário, abas, tabela rolável, modal de login nativo e estados de dados.

A hierarquia preserva o conceito: marca/navegação, título, workspace de duas colunas, parâmetros, gráfico, dois resultados com unidades e monitoramento. Em telas estreitas, os painéis passam para uma coluna e a navegação usa menu. A tabela pode ser rolada horizontalmente sem ampliar a largura da página.

Os dados determinam as diferenças em relação ao mockup:

- São Paulo usa a intensidade real calculada da fonte; os números exemplificativos da imagem não são usados.
- O limite municipal publicado de 10 min substitui os 5 min exemplificativos da imagem; Guarulhos admite 5 min.
- Eixos lineares, famílias do estudo e marcação numérica coerente substituem o eixo ilustrativo da imagem.
- A estação é um metadado de referência, sem seletor fictício de múltiplas estações IDF por município.
- O monitoramento mostra as observações reais após sincronizar, expandindo o estado vazio ilustrado.
- CSV, tabela numérica, inversão de retorno e revisão operacional completam os fluxos solicitados.

Visualização: duas famílias de gráficos de linhas SVG sob responsabilidade do Recharts, um gráfico por calculadora, aproximadamente 100 pontos por série, atualização ao mudar município/duração/orientação. O estado de município e tela fica na URL; sessão JWT apenas em memória. O mapa SVG usa a malha IBGE e posições observadas, sem interpolação espacial.

Acessibilidade: rótulos nos campos, foco visível, skip-link, modal nativo, alternativas tabulares/CSV aos gráficos, nomes e texto redundantes às cores, tooltip de qualidade nas classificações e preferência por movimento reduzido. Valores principais permanecem visíveis sem hover.
