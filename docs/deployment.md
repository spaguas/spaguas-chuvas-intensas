# Implantação e operação

## 1. Configuração de rede

A rede deste projeto tem subnet explícita `10.200.80.0/24`, configurável por `APP_SUBNET`. Isso evita depender dos pools automáticos do daemon para esta aplicação. A seleção precisa ser confrontada com as rotas efetivas da VPN e das redes Docker do servidor de destino; nenhuma faixa RFC1918 garante ausência de conflito sem essa conferência.

```bash
ip -4 route show table all
docker network ls
# Inspecione as redes existentes necessárias à análise:
docker network inspect NOME_DA_REDE
```

No host local de validação, o Compose criou somente a rede dedicada do projeto. Não foram alterados os pools globais nem reiniciados os serviços existentes.

Para configurar também os pools de novas redes do daemon, use [`../infra/daemon.json.example`](../infra/daemon.json.example):

```json
{
  "default-address-pools": [
    {"base": "10.200.0.0/16", "size": 24}
  ]
}
```

Procedimento no servidor, em janela de manutenção:

1. Confirme que a faixa não pertence à VPN ou às rotas corporativas, inclusive quando a VPN estiver conectada. Escolha outra faixa se necessário e ajuste `APP_SUBNET`.
2. Leia `/etc/docker/daemon.json`, se existir, e faça uma cópia de segurança. Mescle apenas `default-address-pools`, preservando `data-root`, logging, registries e demais opções existentes. Não substitua o arquivo inteiro pelo exemplo.
3. Valide a sintaxe e as opções antes da aplicação:

```bash
sudo dockerd --validate --config-file=/etc/docker/daemon.json
```

4. Aplique a mudança do daemon durante a manutenção planejada. Reiniciar Docker pode interromper containers de outros projetos; não é necessário fazê-lo para a subnet explícita deste Compose.
5. Os novos pools servem a redes criadas posteriormente e não renumeram redes existentes. Recriar redes antigas exige um plano separado.

Referências oficiais: [pools e alocação de subnets](https://docs.docker.com/engine/network/), [configuração dockerd](https://docs.docker.com/reference/cli/dockerd/).

## 2. PostgreSQL externo

O `docker-compose.yml` base não cria um banco de dados. Prepare um banco e um usuário próprios, com permissão de DDL necessária às migrations. Restrinja o acesso de rede aos containers desta aplicação. As versões PostgreSQL 17 e Node 24 foram usadas na validação local.

Crie o `.env` com `python3 scripts/init-env.py` e ajuste `DATABASE_URL`. Dentro do container, `127.0.0.1` aponta para o próprio container, portanto não use o endereço local do exemplo de desenvolvimento no Compose base. Opções:

- hostname privado do servidor PostgreSQL acessível pela rede do container;
- `host.docker.internal`, mapeado ao gateway Docker pelo Compose, se o PostgreSQL estiver no host e aceitar conexões desse endereço;
- uma rede Docker externa explicitamente adicionada ao serviço, se o banco já estiver em outro projeto.

Use senha codificada para URL quando houver caracteres especiais, e TLS com verificação de certificado quando exigido pelo servidor. O gerador local usa senha hexadecimal para evitar caracteres reservados.

O projeto define uma rede dedicada. Qualquer rede externa adicionada deve ser preservada e documentada; não remova redes compartilhadas.

## 3. Construir e iniciar

```bash
docker compose config --quiet
docker compose up -d --build --wait
```

O frontend fica em `127.0.0.1:8089`. A API não expõe porta no host em produção. Os containers de aplicação rodam sem root, com filesystem somente leitura, `/tmp` temporário, sem capacidades Linux e sem aquisição de novos privilégios. O volume do PostgreSQL local é separado e persistente.

A condição `service_completed_successfully` impede a API de iniciar caso a migration ou importação falhe. O worker depende da saúde da API/banco. A verificação de saúde do worker exige uma execução recente bem-sucedida ou parcial. Se o SIBH estiver indisponível, o frontend e a calculadora continuam funcionando, e o worker fica não saudável até recuperar uma sincronização.

```bash
docker compose exec api node apps/api/src/create-admin.js
```

A CLI pede dados de cadastro e oculta a senha. Para automação, aceita um objeto JSON por stdin (`name`, `email`, `password`); passe-o por um gerenciador de segredos, não por argumentos de shell ou arquivo versionado.

## 4. Nginx da infraestrutura

O arquivo [`../infra/nginx.conf`](../infra/nginx.conf) pertence ao Nginx interno do container frontend. Ele serve assets e SPA e encaminha API, Swagger e PDF preservando `/chuvas_intensas`. Não deve substituir a configuração global de um Nginx que já publica outros sistemas.

Inspecione os server blocks existentes:

```bash
sudo ls -l /etc/nginx/sites-enabled
sudo nginx -T
```

Copie os dois `location` de [`../infra/nginx-external.location.conf`](../infra/nginx-external.location.conf) para o server block HTTPS apropriado, preservando os outros caminhos e o certificado existente:

```nginx
location = /chuvas_intensas { return 308 /chuvas_intensas/; }
location /chuvas_intensas/ {
    client_max_body_size 2m;
    proxy_pass http://127.0.0.1:8089;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_http_version 1.1;
    proxy_read_timeout 40s;
}
```

O `proxy_pass` preserva o caminho completo. Evite regras que removam o prefixo na primeira camada. O limite de 2 MB acomoda o envio das imagens da identidade visual em JSON/base64; o Nginx interno mantém o limite comum de 256 KB para as demais rotas. Ao atualizar uma instalação existente, ajuste esse limite também no proxy externo para permitir logotipos de até 1 MB.

O Nginx interno descarta cabeçalhos de IP fornecidos pelo cliente. Se houver múltiplas camadas de proxy e for necessário preservar o IP original para auditoria/rate limit, configure `real_ip` com os endereços exatos dos proxies confiáveis; não confie em `X-Forwarded-For` arbitrário.

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Valide usando o domínio real:

```bash
curl -I https://SEU_DOMINIO/chuvas_intensas
curl -fsS https://SEU_DOMINIO/chuvas_intensas/api/health
curl -fsS https://SEU_DOMINIO/chuvas_intensas/api/integration/status
```

Abra a calculadora, a área operacional, o Swagger e o PDF. Confirme que scripts e chamadas de API continuam em `/chuvas_intensas/`.

## 5. Atualizações e backups

Antes de uma implantação com nova migration, faça backup consistente pelo procedimento institucional. Para o banco local:

```bash
mkdir -p backups
chmod 700 backups
docker compose -f docker-compose.yml -f compose.local.yml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backups/chuvas.dump
chmod 600 backups/chuvas.dump
```

Guarde backups fora do host e teste a restauração em banco isolado. O dump contém usuários com hashes, histórico e dados de integração. `.env`, volumes e backups não fazem parte da imagem nem devem ser versionados.

A execução de migrations é explícita no serviço `migrate`. Em atualizações, construa as imagens, suspenda os processos antigos durante alterações incompatíveis e execute a migration com a nova imagem antes da API:

```bash
docker compose build
docker compose stop worker api
docker compose run --rm migrate
docker compose up -d --wait
```

Não execute rollback de esquema com aplicações novas escrevendo no banco. Prefira migrations aditivas e correção progressiva. Mudar `JWT_SECRET` invalida as sessões existentes. Usuários e equações editadas não são sobrescritos pelo seed.

## 6. Diagnóstico

```bash
docker compose ps
docker compose logs --tail 100 api worker migrate
docker compose exec web nginx -t
```

- `/api/health` prova conexão com PostgreSQL; não prova sucesso de polling.
- `/api/integration/status` mostra última execução, última sincronização e estados `waiting`, `current`, `stale` ou `offline`.
- A área operacional apresenta execuções com contagens e erros.
- A tabela pública distingue ausência de equação, revisão pendente, janela incompleta e leitura antiga.
- O worker mantém uma trava no PostgreSQL durante cada importação. A operação é sequencial; múltiplas réplicas não devem importar simultaneamente.
- A retomada após interrupção registra execuções anteriores abandonadas como falhas, preservando o histórico.

Os registros de observação e auditoria não têm expurgo automático. Dimensione o armazenamento com a frequência de atualização real das estações e estabeleça uma política institucional de retenção/arquivamento antes de operação prolongada.

## 7. Limites da implantação entregue

A aplicação foi executada e conferida neste host local com Docker. Não houve publicação remota, mudança do daemon global, ajuste de VPN ou alteração do Nginx institucional. As sete equações pendentes exigem revisão técnica da fonte, e os agregados de 1 hora do SIBH não permitem garantir continuidade de todas as leituras. A aplicação apresenta essas limitações na interface e no contrato da API.
