# Cadastro de famílias e expressões IDF

Na **Área operacional → Famílias de equações**, o operador cadastra o formato matemático e seus coeficientes. A aplicação não depende de alterar código para adicionar outra expressão dentro da linguagem aritmética suportada.

## Fluxo de uso

1. Clique em **Cadastrar família**.
2. Informe código único, nome, descrição e unidade padrão do resultado (`mm/h` ou `mm/min`). O código usa letras maiúsculas, números e sublinhado, de 3 a 40 caracteres.
3. Escreva a expressão de intensidade `i(t,T)`. Não escreva `i =`; informe apenas o lado direito.
4. Declare cada coeficiente: símbolo, descrição, unidade informativa, valor padrão e limites numéricos. `t` e `T` são entradas fixas e não devem ser cadastradas como coeficientes.
5. Use **Testar expressão** para conferir intensidade e altura em uma duração e retorno. A prévia usa os valores padrão da tabela; não publica uma equação municipal.
6. Salve a família. Em **Equações e versões**, crie ou revise uma equação, selecione **família e versão** em cada trecho e preencha seus coeficientes locais.
7. Para publicar a equação municipal, forneça fonte, justificativa e ao menos três pontos independentes de referência. A API continua verificando domínio, positividade, crescimento com retorno e concordância numérica.

Os valores padrão de uma família não substituem coeficientes oficiais de um município. A unidade de cada trecho pode ser ajustada, pois a mesma forma algébrica pode ser parametrizada em escalas diferentes. A resposta pública é sempre convertida para mm/h; a altura é calculada em mm.

## Exemplo de formato

```text
K * T^a / (t + b)^n
```

| Símbolo | Papel | Exemplo de padrão |
|---|---|---:|
| K | Coeficiente de escala | 1000 |
| a | Expoente do retorno | 0.2 |
| b | Ajuste da duração | 20 |
| n | Expoente da duração | 0.8 |

Esses valores são exemplos para experimentar o editor, sem atribuição a município ou estudo. Com saída em mm/h, t=60 min e T=10 anos, a prévia do exemplo é aproximadamente 47,591 mm/h e 47,591 mm.

## Linguagem matemática

- Entradas: `t` em minutos e `T` em anos; símbolos diferenciam maiúsculas de minúsculas.
- Operadores: `+`, `-`, `*`, `/`, `^`; parênteses definem agrupamento. `×`, `÷` e `−` são reconhecidos como equivalentes tipográficos.
- Potência é associativa à direita: `2^3^2 = 512`. `-2^2 = -4`; use `(-2)^2` para obter 4.
- Use multiplicação explícita: `K*(t+b)`, não `K(t+b)` ou `Kt`.
- Funções de um argumento: `ln`, `log` (ambas naturais), `log10`, `log1p`, `exp`, `sqrt`, `abs`.
- Funções de dois argumentos: `pow`, `min`, `max`.
- Constantes: `pi` (ou `π`) e `e`.
- Decimais usam ponto, como `0.2`; vírgula separa argumentos, como `pow(T,0.2)`.
- Símbolos de coeficientes: letra inicial e até 32 caracteres com letras, números e sublinhado. Entradas, funções e constantes são reservadas.
- Até 24 coeficientes, 500 caracteres, 200 tokens, 128 nós na expressão e 32 níveis de aninhamento. Os limites de coeficientes podem chegar a ±10¹²; os padrões iniciais são ±10⁷.

O interpretador constrói e percorre uma árvore aritmética. Não usa `eval`, `Function`, geração de JavaScript, acesso a propriedades, atribuições, comandos, arrays ou funções externas. Divisão por zero, raízes/logaritmos fora do domínio, resultados não finitos e intensidades não positivas geram erro. Famílias com necessidades além dessa linguagem exigem ampliação explícita do interpretador e testes.

Uma família sintaticamente válida pode não ser adequada a todos os coeficientes e domínios. A verificação da prévia não é homologação de engenharia; a publicação municipal mantém suas verificações próprias.

## Versões e histórico

Editar uma família cria outra versão. Cada trecho municipal referencia `family_version_id`, e sua leitura inclui `family_definition` com a expressão e as variáveis dessa versão. Uma edição posterior não muda resultados nem históricos de equações já vinculadas. Para adotar a nova fórmula, selecione sua versão e salve outra versão da equação municipal.

Desativar uma família bloqueia novos vínculos e novas versões da definição. Equações existentes continuam usando seus snapshots. Editores podem cadastrar/revisar famílias; apenas administradores podem desativá-las ou reativá-las. As operações registram auditoria.

As famílias iniciais `GUMBEL` e `GENERAL` foram cadastradas na versão 1 com expressões equivalentes aos avaliadores anteriores. A expressão de Gumbel usa `ln(log1p(1/(T-1)))` para preservar a estabilidade numérica. Os 6.120 pontos das equações ativas foram comparados entre o avaliador anterior e as definições versionadas, sem diferenças materiais.

## Banco, migração e execução

A migration `003_equation_families.js` usa `db/families.sql` e cria:

- `equation_families`: código, disponibilidade e identificação das famílias iniciais;
- `equation_family_versions`: expressão, descritores de variáveis, unidade padrão, notas e autoria de cada versão;
- `idf_segments.family_version_id`: vínculo à versão exata, com chave estrangeira composta que também confere o código da família;
- triggers para preencher a versão 1 em inserts legados, conferir coeficientes/limites e impedir atualização direta de uma definição já gravada.

A conferência de coeficientes contra outra tabela ocorre em trigger, além da validação da API. As restrições `CHECK` locais continuam verificando apenas dados da própria linha, seguindo a [orientação do PostgreSQL](https://www.postgresql.org/docs/current/ddl-constraints.html).

```bash
npm run db:migrate
npm run dev
```

A migration já foi aplicada no ambiente local desta implementação. Em outro ambiente, aplique-a antes de iniciar a API nova. Para Docker, a rotina `migrate` já aplica as migrations antes da API. Não modifique migrations aplicadas; a reversão da migration 003 é bloqueada enquanto houver trechos usando versões adicionais.

## Contrato da API

Todos os endpoints abaixo usam `/chuvas_intensas/api`, exigem JWT e estão documentados no Swagger:

| Método | Caminho | Operação |
|---|---|---|
| GET | `/admin/equation-families` | Catálogo, histórico e contagens de vínculos |
| POST | `/admin/equation-families` | Cadastrar família |
| PUT | `/admin/equation-families/:code` | Criar versão da definição |
| POST | `/admin/equation-families/preview` | Testar expressão sem salvar |
| PATCH | `/admin/equation-families/:code/status` | Disponibilidade para novos vínculos; admin |

Em novos trechos, envie `family`, `family_version_id`, unidade, duração e `parameters`. Não envie `family_definition`: esse snapshot é resolvido pelo servidor. O frontend gera os campos a partir dos descritores da versão escolhida. Cálculo direto, inversão, curvas, SIBH e IDW utilizam o mesmo motor.

Por compatibilidade, clientes antigos que enviem apenas `GUMBEL` ou `GENERAL`, sem `family_version_id`, continuam vinculando a **versão 1**, nunca uma versão nova por inferência. Para famílias cadastradas, a versão é obrigatória.
