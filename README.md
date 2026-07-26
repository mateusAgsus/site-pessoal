# 💍 Site de Casamento Personalizável

Recriação do site de casamento (estilo Casar.com) com **painel de administração completo** — tudo editável sem tocar em código.

## Como rodar

```
npm install   (só na primeira vez)
npm start
```

- **Site:** http://localhost:3001
- **Painel de edição:** http://localhost:3001/admin

```
npm test      (roda a suíte de testes)
```

## O que dá pra personalizar no painel

| Aba | O que faz |
|---|---|
| **Geral & Tema** | Nomes do casal, data/hora (contagem regressiva), frase e imagem de fundo do topo, cores do site, fontes e rodapé |
| **Seções do Site** | Ativar/desativar e **reordenar** qualquer seção; editar textos, fotos do casal, padrinhos, locais/horários da cerimônia e recepção (com link do Google Maps) |
| **Presentes** | Adicionar presente colando o **link da loja** — nome, foto e preço são buscados automaticamente quando o site permite; senão, preencha o valor e envie a foto manualmente. Cada presente pode ser ocultado sem excluir. Mostra **quem presenteou** cada item e permite **liberar** o presente de volta para a lista |
| **Confirmações** | Lista de quem confirmou presença (com total de convidados) |
| **Recados** | Mensagens dos convidados, com opção de excluir |

Depois de editar, clique em **💾 Salvar alterações** — o site é atualizado na hora.

## Reserva de presentes pelos convidados

No site, cada presente tem o botão **Presentear**: o convidado vê o link da loja, informa o nome e confirma — o presente fica marcado como **"Presenteado ❤"** e indisponível para os demais. Quem preferir pode marcar *"Prefiro não mostrar meu nome no site"*: o público vê apenas "um convidado", mas o painel mostra o nome real. Se duas pessoas tentarem o mesmo presente ao mesmo tempo, a segunda recebe um aviso amigável. No painel, a aba Presentes mostra quem presenteou e o botão **↩ Liberar** devolve o item à lista.

## Estrutura do projeto

```
server.js               ponto de entrada (só sobe o app na porta)
data-defaults.json      conteúdo inicial do site (primeira execução)
src/
  app.js                monta o Express: middlewares, static, rotas
  storage.js            persistência em JSON com escrita atômica
  scraper.js            leitura de links de presentes (og tags, JSON-LD, preço)
  net-guard.js          proteção anti-SSRF (bloqueia IPs privados/localhost)
  middleware.js         Basic Auth opcional + rate limit em memória
  routes/               uma rota por recurso (site, upload, preview, rsvp, messages)
public/
  index.html + css/js   site público (renderizado a partir de /api/site)
  admin.html + css/js   painel de administração
  img/                  imagens padrão que acompanham o projeto
  uploads/              imagens enviadas pelo painel e baixadas de links
test/
  scraper.test.js       unitários do parser de produtos e do anti-SSRF
  api.test.js           integração: todas as APIs, upload, auth e rate limit
```

## Onde ficam os dados e as imagens

- **Conteúdo do site:** `data/site.json` (criado de `data-defaults.json` na primeira execução)
- **Confirmações e recados:** `data/rsvps.json` e `data/messages.json`
- **Imagens:** ficam **no próprio servidor** — uploads do painel e fotos baixadas de links vão para `public/uploads/`; as imagens padrão do projeto ficam em `public/img/`. Faça backup da pasta `data/` e da `public/uploads/` e você tem o site inteiro.

Para **resetar o site ao padrão**, apague `data/site.json` e reinicie o servidor.

## Segurança

- **Senha do painel (opcional):** sem configuração nenhuma o painel é aberto (uso local). Para proteger, defina a variável de ambiente `ADMIN_PASSWORD` antes de iniciar — o `/admin` e todas as APIs de escrita/administração passam a exigir a senha (usuário pode ser qualquer um):
  ```powershell
  $env:ADMIN_PASSWORD = "sua-senha"; npm start
  ```
- **Anti-SSRF:** a busca de dados de presentes só aceita endereços públicos http/https — IPs privados, localhost e redirecionamentos para redes internas são bloqueados.
- **Uploads:** só imagens (JPG/PNG/WebP/GIF, até 10 MB), gravadas com nome aleatório; o nome original do arquivo nunca chega ao disco.
- **Rate limit:** os formulários públicos (presença e recados) aceitam no máximo 10 envios por minuto por IP.
- **Escrita atômica:** os JSONs são gravados em arquivo temporário e renomeados, evitando corrupção se o processo cair no meio.

## Performance

- Respostas comprimidas com gzip (`compression`).
- Imagens servidas com cache de 1 dia no navegador.
- Fotos do site carregam com `loading="lazy"`.
